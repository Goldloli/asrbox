// Keep release builds GUI-only on Windows (no stray console window); debug
// builds retain the console for logs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

mod update;

const SERVER_PORT: u16 = 17494;
const SERVER_URL: &str = "http://127.0.0.1:17494";
const SERVER_CONNECT_TIMEOUT: Duration = Duration::from_secs(1);
const SERVER_REQUEST_TIMEOUT: Duration = Duration::from_secs(3);

struct ServerState {
    child: Mutex<Option<CommandChild>>,
    api_token: String,
}

#[derive(serde::Serialize)]
struct ServerConnection {
    url: String,
    api_token: String,
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(ServerState {
            child: Mutex::new(None),
            api_token: generate_api_token(),
        })
        .manage(update::AppUpdateState::default())
        .invoke_handler(tauri::generate_handler![
            start_server,
            stop_server,
            restart_server,
            open_file_location,
            pick_executable_file,
            pick_export_directory,
            pick_media_files,
            pick_model_storage_directory,
            reveal_logs,
            save_text_file,
            update::get_app_version,
            update::check_app_update,
            update::get_app_update_download_state,
            update::start_app_update_download,
            update::cancel_app_update_download,
            update::open_downloaded_update,
            update::open_update_file_location,
            update::open_about_link
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let app = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let _ = shutdown_server(&app).await;
                });
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build ASRbox Tauri shell");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
            if code.is_none() {
                api.prevent_exit();
                let app = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = shutdown_server(&app).await;
                    app.exit(0);
                });
            }
        }
    });
}

#[tauri::command]
async fn start_server(
    app: tauri::AppHandle,
    state: State<'_, ServerState>,
) -> Result<ServerConnection, String> {
    let api_token = state.api_token.clone();
    if state.child.lock().map_err(|e| e.to_string())?.is_some() {
        if !check_health().await? {
            let server_exited = AtomicBool::new(false);
            wait_for_health(&server_exited).await?;
        }
        return Ok(server_connection(api_token));
    }

    if check_health().await? {
        let token_is_accepted = check_server_token(&api_token).await?;
        if let Some(error) =
            existing_server_conflict(cfg!(not(debug_assertions)), token_is_accepted)
        {
            return Err(error);
        }
        return Ok(server_connection(api_token));
    }
    if port_is_open() {
        return Err(format!(
            "Port {SERVER_PORT} is already in use by a non-ASRbox service. Stop that process and restart ASRbox."
        ));
    }

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create app data dir {}: {e}", data_dir.display()))?;

    let data_dir_str = data_dir
        .to_str()
        .ok_or_else(|| "Invalid app data dir path".to_string())?
        .to_string();
    let port = SERVER_PORT.to_string();
    let parent_pid = std::process::id().to_string();

    let server_args = [
        "--host",
        "127.0.0.1",
        "--port",
        &port,
        "--data-dir",
        &data_dir_str,
        "--parent-pid",
        &parent_pid,
    ];
    let mut server_envs = ffmpeg_env(&app);
    server_envs.extend(cuda_kit_env(&app));
    server_envs.push(("ASRBOX_API_TOKEN".to_string(), api_token.clone()));
    server_envs.push(("ASRBOX_DESKTOP_MODE".to_string(), "1".to_string()));

    #[cfg(debug_assertions)]
    let spawn_result = {
        let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|path| path.parent())
            .map(PathBuf::from);
        let python = project_root.as_ref().map(|root| {
            if cfg!(windows) {
                root.join(".venv").join("Scripts").join("python.exe")
            } else {
                root.join(".venv").join("bin").join("python")
            }
        });

        if let (Some(root), Some(python)) = (project_root, python) {
            if python.exists() {
                let mut args = vec!["-m", "backend.server"];
                args.extend(server_args);
                app.shell()
                    .command(python.to_string_lossy().to_string())
                    .current_dir(root)
                    .args(args)
                    .envs(server_envs.clone())
                    .spawn()
                    .map_err(|e| e.to_string())
            } else {
                app.shell()
                    .sidecar("asrbox-server")
                    .map_err(|e| e.to_string())
                    .and_then(|sidecar| {
                        sidecar
                            .args(server_args)
                            .envs(server_envs.clone())
                            .spawn()
                            .map_err(|e| e.to_string())
                    })
            }
        } else {
            app.shell()
                .sidecar("asrbox-server")
                .map_err(|e| e.to_string())
                .and_then(|sidecar| {
                    sidecar
                        .args(server_args)
                        .envs(server_envs.clone())
                        .spawn()
                        .map_err(|e| e.to_string())
                })
        }
    };

    #[cfg(not(debug_assertions))]
    let spawn_result = {
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to resolve resources dir: {e}"))?;
        let server_name = if cfg!(windows) {
            "asrbox-server.exe"
        } else {
            "asrbox-server"
        };
        let candidates = [
            resource_dir.join("asrbox-server"),
            resource_dir.join("binaries").join("asrbox-server"),
        ];
        let server_dir = candidates
            .iter()
            .find(|dir| dir.join(server_name).is_file())
            .cloned()
            .ok_or_else(|| {
                let paths = candidates
                    .iter()
                    .map(|dir| dir.join(server_name).display().to_string())
                    .collect::<Vec<_>>()
                    .join(", ");
                format!("Bundled ASRbox server not found. Checked: {paths}")
            });
        let server_dir = match server_dir {
            Ok(server_dir) => server_dir,
            Err(error) => return Err(error),
        };
        let server_path = server_dir.join(server_name);
        app.shell()
            .command(server_path.to_string_lossy().to_string())
            .current_dir(server_dir)
            .args(server_args)
            .envs(server_envs.clone())
            .spawn()
            .map_err(|e| e.to_string())
    };

    let (mut rx, child) =
        spawn_result.map_err(|e| format!("Failed to spawn ASRbox server: {e}"))?;
    *state.child.lock().map_err(|e| e.to_string())? = Some(child);

    let app_for_logs = app.clone();
    let server_exited = Arc::new(AtomicBool::new(false));
    let server_exited_for_logs = server_exited.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => emit_server_log(&app_for_logs, "stdout", line),
                CommandEvent::Stderr(line) => emit_server_log(&app_for_logs, "stderr", line),
                CommandEvent::Terminated(payload) => {
                    server_exited_for_logs.store(true, Ordering::SeqCst);
                    let line = format!("ASRbox server exited with code {:?}", payload.code);
                    let _ = app_for_logs.emit(
                        "server-log",
                        serde_json::json!({ "stream": "system", "line": line }),
                    );
                }
                _ => {}
            }
        }
    });

    if let Err(error) = wait_for_health(&server_exited).await {
        if let Some(child) = state.child.lock().map_err(|e| e.to_string())?.take() {
            let _ = child.kill();
        }
        return Err(error);
    }
    Ok(server_connection(api_token))
}

#[tauri::command]
async fn stop_server(app: tauri::AppHandle, state: State<'_, ServerState>) -> Result<(), String> {
    shutdown_server(&app).await?;
    if let Some(child) = state.child.lock().map_err(|e| e.to_string())?.take() {
        let _ = child.kill();
    }
    // Killing the child returns before the OS tears its listening socket down.
    // start_server treats a backend that still answers /health as a foreign
    // instance and refuses to start (unconditionally in packaged builds), so a
    // restart must not race the release of port 17494.
    wait_for_port_release().await;
    Ok(())
}

#[tauri::command]
async fn restart_server(
    app: tauri::AppHandle,
    state: State<'_, ServerState>,
) -> Result<ServerConnection, String> {
    let _ = stop_server(app.clone(), state.clone()).await;
    start_server(app, state).await
}

#[tauri::command]
#[allow(deprecated)]
fn open_file_location(app: tauri::AppHandle, path: Option<String>) -> Result<(), String> {
    let target = path
        .map(PathBuf::from)
        .unwrap_or(app.path().app_data_dir().map_err(|e| e.to_string())?);
    let open_target = resolve_open_target(&target)?;
    app.shell()
        .open(open_target.to_string_lossy().to_string(), None)
        .map_err(|e| format!("Failed to open file location: {e}"))
}

/// Directory name suffixes that macOS treats as executable bundles: handing
/// them to `shell.open` launches the bundle instead of revealing it.
const EXECUTABLE_BUNDLE_EXTENSIONS: [&str; 4] = ["app", "framework", "bundle", "plugin"];

fn resolve_open_target(target: &Path) -> Result<PathBuf, String> {
    if !target.exists() {
        return Err(format!("Path does not exist: {}", target.display()));
    }
    let resolved = target
        .canonicalize()
        .map_err(|error| format!("Failed to resolve {}: {error}", target.display()))?;
    if resolved.is_file() {
        return Ok(resolved.parent().map(PathBuf::from).unwrap_or(resolved));
    }
    if resolved.is_dir() {
        if let Some(extension) = resolved.extension().and_then(|value| value.to_str()) {
            if EXECUTABLE_BUNDLE_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str()) {
                return Err(format!(
                    "Refusing to open {} because it is an executable bundle",
                    resolved.display()
                ));
            }
        }
        return Ok(resolved);
    }
    Err(format!(
        "Path is not a regular file or directory: {}",
        target.display()
    ))
}

#[tauri::command]
async fn pick_export_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let result = folder
            .map(|path| {
                path.into_path()
                    .map(|path| path.to_string_lossy().to_string())
                    .map_err(|e| format!("Failed to read selected directory: {e}"))
            })
            .transpose();
        let _ = tx.send(result);
    });
    let selected = rx
        .await
        .map_err(|_| "Folder picker was closed before returning a result".to_string())??;
    if let Some(directory) = selected.as_deref() {
        // Recording is best-effort: a failure only means save_text_file will
        // reject this directory until it is picked and recorded successfully.
        match app.path().app_config_dir() {
            Ok(config_dir) => {
                if let Err(error) = record_allowed_save_dir(&config_dir, Path::new(directory)) {
                    eprintln!("Failed to record allowed save directory {directory}: {error}");
                }
            }
            Err(error) => {
                eprintln!("Failed to resolve app config dir while recording {directory}: {error}");
            }
        }
    }
    Ok(selected)
}

#[tauri::command]
async fn pick_model_storage_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    pick_export_directory(app).await
}

#[derive(serde::Serialize)]
struct SelectedMediaFile {
    path: String,
    name: String,
    size: u64,
}

#[tauri::command]
async fn pick_media_files(app: tauri::AppHandle) -> Result<Vec<SelectedMediaFile>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter(
            "Audio and video",
            &[
                "aac", "aif", "aiff", "flac", "m4a", "mkv", "mov", "mp3", "mp4", "ogg", "opus",
                "wav", "webm", "wma",
            ],
        )
        .pick_files(move |files| {
            let result = files
                .unwrap_or_default()
                .into_iter()
                .map(|file| {
                    let path = file
                        .into_path()
                        .map_err(|error| format!("Failed to read selected media path: {error}"))?;
                    let metadata = std::fs::metadata(&path).map_err(|error| {
                        format!(
                            "Failed to inspect selected media {}: {error}",
                            path.display()
                        )
                    })?;
                    Ok(SelectedMediaFile {
                        name: path
                            .file_name()
                            .map(|name| name.to_string_lossy().to_string())
                            .unwrap_or_else(|| "media".to_string()),
                        path: path.to_string_lossy().to_string(),
                        size: metadata.len(),
                    })
                })
                .collect::<Result<Vec<_>, String>>();
            let _ = tx.send(result);
        });
    rx.await
        .map_err(|_| "Media picker was closed before returning a result".to_string())?
}

#[tauri::command]
async fn pick_executable_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_file(move |file| {
        let result = file
            .map(|path| {
                path.into_path()
                    .map(|path| path.to_string_lossy().to_string())
                    .map_err(|e| format!("Failed to read selected file: {e}"))
            })
            .transpose();
        let _ = tx.send(result);
    });
    rx.await
        .map_err(|_| "File picker was closed before returning a result".to_string())?
}

#[tauri::command]
#[allow(deprecated)]
fn reveal_logs(app: tauri::AppHandle) -> Result<(), String> {
    let logs_dir = app
        .path()
        .app_log_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("Failed to resolve logs directory: {e}"))?;
    std::fs::create_dir_all(&logs_dir).map_err(|e| {
        format!(
            "Failed to create logs directory {}: {e}",
            logs_dir.display()
        )
    })?;
    app.shell()
        .open(logs_dir.to_string_lossy().to_string(), None)
        .map_err(|e| format!("Failed to reveal logs: {e}"))
}

#[tauri::command]
fn save_text_file(
    app: tauri::AppHandle,
    filename: String,
    contents: String,
    directory: Option<String>,
) -> Result<String, String> {
    let export_dir = match directory
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(value) => {
            let requested = PathBuf::from(value);
            if !is_allowed_save_dir(&requested, &allowed_save_dir_roots(&app)) {
                return Err(format!(
                    "Export directory {} is not an allowed save location. Pick the directory again with the native folder picker to allow it.",
                    requested.display()
                ));
            }
            requested
        }
        None => app
            .path()
            .download_dir()
            .or_else(|_| app.path().document_dir())
            .map_err(|e| format!("Failed to resolve downloads directory: {e}"))?
            .join("ASRbox Exports"),
    };
    std::fs::create_dir_all(&export_dir).map_err(|e| {
        format!(
            "Failed to create export directory {}: {e}",
            export_dir.display()
        )
    })?;
    let path = unique_download_path(export_dir.join(safe_filename(&filename)));
    std::fs::write(&path, contents)
        .map_err(|e| format!("Failed to write export {}: {e}", path.display()))?;
    Ok(path.to_string_lossy().to_string())
}

const ALLOWED_SAVE_DIRS_FILENAME: &str = "allowed-save-dirs.json";

/// Roots an explicit `save_text_file` directory must resolve into: the system
/// downloads directory (the default when no directory is given), the app data
/// directory (which is also the backend sidecar `--data-dir`, see
/// `start_server`), and directories previously picked via the native folder
/// picker and recorded under the app config directory.
fn allowed_save_dir_roots(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(dir) = app.path().download_dir() {
        roots.push(dir);
    } else if let Ok(dir) = app.path().document_dir() {
        roots.push(dir);
    }
    if let Ok(dir) = app.path().app_data_dir() {
        roots.push(dir);
    }
    if let Ok(config_dir) = app.path().app_config_dir() {
        roots.extend(load_allowed_save_dirs(&config_dir));
    }
    roots
}

fn is_allowed_save_dir(dir: &Path, roots: &[PathBuf]) -> bool {
    let Some(resolved) = resolve_existing_path(dir) else {
        return false;
    };
    roots
        .iter()
        .filter_map(|root| resolve_existing_path(root))
        .any(|root| resolved == root || resolved.starts_with(&root))
}

/// Resolves a path like `canonicalize`, but tolerates a non-existent tail by
/// canonicalizing the longest existing ancestor and re-joining the rest.
fn resolve_existing_path(path: &Path) -> Option<PathBuf> {
    let mut normalized = if path.is_absolute() {
        PathBuf::new()
    } else {
        env::current_dir().ok()?
    };
    for component in path.components() {
        match component {
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            std::path::Component::CurDir => {}
            other => normalized.push(other.as_os_str()),
        }
    }
    let mut ancestor = normalized.clone();
    let mut tail = Vec::new();
    loop {
        if ancestor.exists() {
            break;
        }
        tail.push(ancestor.file_name()?.to_os_string());
        ancestor = ancestor.parent()?.to_path_buf();
    }
    let mut resolved = ancestor.canonicalize().ok()?;
    for component in tail.iter().rev() {
        resolved.push(component);
    }
    Some(resolved)
}

fn load_allowed_save_dirs(config_dir: &Path) -> Vec<PathBuf> {
    let Ok(contents) = std::fs::read_to_string(config_dir.join(ALLOWED_SAVE_DIRS_FILENAME)) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<String>>(&contents)
        .map(|dirs| dirs.into_iter().map(PathBuf::from).collect())
        .unwrap_or_default()
}

fn record_allowed_save_dir(config_dir: &Path, dir: &Path) -> Result<(), String> {
    let mut dirs = load_allowed_save_dirs(config_dir);
    if !dirs.iter().any(|existing| existing == dir) {
        dirs.push(dir.to_path_buf());
    }
    std::fs::create_dir_all(config_dir).map_err(|e| {
        format!(
            "Failed to create config directory {}: {e}",
            config_dir.display()
        )
    })?;
    let serialized = serde_json::to_string_pretty(
        &dirs
            .iter()
            .map(|dir| dir.to_string_lossy().to_string())
            .collect::<Vec<_>>(),
    )
    .map_err(|e| format!("Failed to serialize allowed save directories: {e}"))?;
    std::fs::write(config_dir.join(ALLOWED_SAVE_DIRS_FILENAME), serialized)
        .map_err(|e| format!("Failed to persist allowed save directories: {e}"))
}

fn safe_filename(filename: &str) -> String {
    let value = filename
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            ch if ch.is_control() => '_',
            ch => ch,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string();
    if value.is_empty() {
        "asrbox-export.txt".to_string()
    } else {
        value
    }
}

fn unique_download_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let parent = path.parent().map(PathBuf::from).unwrap_or_default();
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("asrbox-export");
    let extension = path.extension().and_then(|value| value.to_str());
    for index in 1..1000 {
        let filename = match extension {
            Some(extension) if !extension.is_empty() => format!("{stem} ({index}).{extension}"),
            _ => format!("{stem} ({index})"),
        };
        let candidate = parent.join(filename);
        if !candidate.exists() {
            return candidate;
        }
    }
    path
}

fn ffmpeg_env(app: &tauri::AppHandle) -> Vec<(String, String)> {
    let tool_names = if cfg!(windows) {
        ("ffmpeg.exe", "ffprobe.exe")
    } else {
        ("ffmpeg", "ffprobe")
    };
    let mut candidates = Vec::new();

    #[cfg(debug_assertions)]
    if let Some(root) = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|path| path.parent())
        .map(PathBuf::from)
    {
        candidates.push(
            root.join("third_party")
                .join("ffmpeg")
                .join(vendor_platform_dir()),
        );
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("binaries").join("ffmpeg"));
        candidates.push(resource_dir.join("ffmpeg"));
    }

    for dir in candidates {
        let ffmpeg = dir.join(tool_names.0);
        let ffprobe = dir.join(tool_names.1);
        if ffmpeg.is_file() && ffprobe.is_file() {
            let path_value = bundled_path_env(&dir);
            return vec![
                (
                    "ASRBOX_FFMPEG_PATH".to_string(),
                    ffmpeg.to_string_lossy().to_string(),
                ),
                (
                    "ASRBOX_FFPROBE_PATH".to_string(),
                    ffprobe.to_string_lossy().to_string(),
                ),
                ("PATH".to_string(), path_value),
            ];
        }
    }
    Vec::new()
}

fn cuda_kit_env(app: &tauri::AppHandle) -> Vec<(String, String)> {
    // CUDA acceleration is Windows-only; other platforms must never see
    // ASRBOX_CUDA_KIT_DIR so their torch resolution stays untouched.
    if !cfg!(windows) {
        return Vec::new();
    }
    match app.path().app_data_dir() {
        Ok(data_dir) => cuda_kit_env_for(&data_dir),
        Err(_) => Vec::new(),
    }
}

fn cuda_kit_env_for(data_dir: &Path) -> Vec<(String, String)> {
    // The backend owns config.json under its data dir (= app_data_dir in
    // desktop mode); the kit path is derived here exclusively from that root —
    // the WebView never supplies a path.
    let kit_root = data_dir.join("runtime").join("cuda-kit");
    let enabled = std::fs::read_to_string(kit_root.join("config.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|config| config.get("enabled")?.as_bool())
        .unwrap_or(false);
    if !enabled {
        return Vec::new();
    }
    let kit_dir = kit_root.join("kit");
    if !kit_dir.join("torch").join("__init__.py").is_file() {
        return Vec::new();
    }
    vec![(
        "ASRBOX_CUDA_KIT_DIR".to_string(),
        kit_dir.to_string_lossy().to_string(),
    )]
}

fn bundled_path_env(dir: &std::path::Path) -> String {
    let mut paths = vec![dir.to_path_buf()];
    if let Some(existing) = env::var_os("PATH") {
        paths.extend(env::split_paths(&existing));
    }
    env::join_paths(paths)
        .unwrap_or_else(|_| dir.as_os_str().to_os_string())
        .to_string_lossy()
        .to_string()
}

#[cfg(debug_assertions)]
fn vendor_platform_dir() -> &'static str {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "darwin-arm64"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "darwin-x64"
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "win32-x64"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "linux-x64"
    } else {
        "unknown"
    }
}

async fn check_health() -> Result<bool, String> {
    let client = desktop_http_client()?;
    match client.get(format!("{SERVER_URL}/health")).send().await {
        Ok(response) if response.status().is_success() => {
            let body = match response.text().await {
                Ok(body) => body,
                Err(_) => return Ok(false),
            };
            Ok(is_asrbox_health_response(&body))
        }
        Ok(_) => Ok(false),
        // A health probe only answers "is a healthy backend reachable?". Any
        // transport failure - including a request that dies mid-flight while a
        // backend shuts down - means there is none, and must not abort the
        // caller: start_server would otherwise refuse to spawn a replacement.
        Err(_) => Ok(false),
    }
}

async fn check_server_token(api_token: &str) -> Result<bool, String> {
    let response = desktop_http_client()?
        .get(format!("{SERVER_URL}/runtime/status"))
        .bearer_auth(api_token)
        .send()
        .await;
    match response {
        Ok(response) => Ok(response.status().is_success()),
        Err(error) if error.is_connect() || error.is_timeout() => Ok(false),
        Err(error) => Err(format!(
            "Failed to verify the existing ASRbox server: {error}"
        )),
    }
}

fn existing_server_conflict(packaged: bool, token_is_accepted: bool) -> Option<String> {
    if packaged {
        return Some(
            "Another ASRbox backend is already running on port 17494. Close the other ASRbox instance and try again."
                .to_string(),
        );
    }
    if !token_is_accepted {
        return Some(
            "An ASRbox development server is already running but does not accept this desktop process token. Stop it or restart it without a conflicting ASRBOX_API_TOKEN."
                .to_string(),
        );
    }
    None
}

fn desktop_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(SERVER_CONNECT_TIMEOUT)
        .timeout(SERVER_REQUEST_TIMEOUT)
        .build()
        .map_err(|error| format!("Failed to create desktop HTTP client: {error}"))
}

async fn wait_for_health(server_exited: &AtomicBool) -> Result<(), String> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(120);
    while std::time::Instant::now() < deadline {
        if check_health().await? {
            return Ok(());
        }
        if server_exited.load(Ordering::SeqCst) {
            return Err(
                "ASRbox server exited before it became healthy. In development, run `bun run dev:server` separately."
                    .to_string(),
            );
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    Err("Timed out waiting for ASRbox server to become healthy".to_string())
}

async fn shutdown_server(app: &tauri::AppHandle) -> Result<(), String> {
    if !check_health().await? {
        return Ok(());
    }
    let client = desktop_http_client()?;
    let token = app.state::<ServerState>().api_token.clone();
    client
        .post(format!("{SERVER_URL}/shutdown"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("Failed to request ASRbox shutdown: {e}"))?
        .error_for_status()
        .map_err(|e| format!("ASRbox shutdown request was rejected: {e}"))?;
    app.emit(
        "server-log",
        serde_json::json!({"stream": "system", "line": "ASRbox server shutdown requested"}),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn generate_api_token() -> String {
    rand::random::<[u8; 32]>()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn server_connection(api_token: String) -> ServerConnection {
    ServerConnection {
        url: SERVER_URL.to_string(),
        api_token,
    }
}

fn emit_server_log(app: &tauri::AppHandle, stream: &str, line: Vec<u8>) {
    let line = String::from_utf8_lossy(&line).trim_end().to_string();
    let _ = app.emit(
        "server-log",
        serde_json::json!({ "stream": stream, "line": line }),
    );
}

fn port_is_open() -> bool {
    let Ok(addr) = format!("127.0.0.1:{SERVER_PORT}").parse() else {
        return false;
    };
    std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(300)).is_ok()
}

async fn wait_for_port_release() {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
    while std::time::Instant::now() < deadline {
        if !port_is_open() {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
}

fn is_asrbox_health_response(body: &str) -> bool {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(body) else {
        return false;
    };
    value.get("status").and_then(|status| status.as_str()) == Some("healthy")
        && value.get("backend_type").and_then(|kind| kind.as_str()) == Some("web-first")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_response_must_identify_asrbox() {
        assert!(is_asrbox_health_response(
            r#"{"status":"healthy","version":"0.1.0","backend_type":"web-first"}"#
        ));
        assert!(!is_asrbox_health_response(
            r#"{"status":"healthy","message":"other service"}"#
        ));
    }

    #[test]
    fn packaged_runtime_never_adopts_an_unowned_healthy_server() {
        assert!(existing_server_conflict(true, true).is_some());
        assert!(existing_server_conflict(true, false).is_some());
        assert!(existing_server_conflict(false, false).is_some());
        assert!(existing_server_conflict(false, true).is_none());
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = env::temp_dir().join(format!(
            "asrbox-main-test-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn save_dir_allowlist_accepts_roots_and_descendants() {
        let base = temp_dir("allow");
        let downloads = base.join("Downloads");
        let nested = downloads.join("ASRbox Exports").join("not-created-yet");
        std::fs::create_dir_all(&downloads).unwrap();
        let roots = vec![downloads.clone()];
        assert!(is_allowed_save_dir(&downloads, &roots));
        assert!(is_allowed_save_dir(&nested, &roots));
        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn save_dir_allowlist_rejects_arbitrary_directories() {
        let base = temp_dir("reject");
        let fake_home = base.join("home");
        let downloads = fake_home.join("Downloads");
        let launch_agents = fake_home.join("Library").join("LaunchAgents");
        std::fs::create_dir_all(&downloads).unwrap();
        std::fs::create_dir_all(&launch_agents).unwrap();
        let roots = vec![downloads];
        assert!(!is_allowed_save_dir(&launch_agents, &roots));
        assert!(!is_allowed_save_dir(&fake_home, &roots));
        // Traversal that escapes the allowed root must not pass either.
        assert!(!is_allowed_save_dir(&roots[0].join(".."), &roots));
        std::fs::remove_dir_all(&base).ok();
    }

    #[cfg(unix)]
    #[test]
    fn open_target_rejects_symlink_alias_to_executable_bundle() {
        use std::os::unix::fs::symlink;

        let base = temp_dir("bundle-symlink");
        let bundle = base.join("Unsafe.app");
        let alias = base.join("innocent-folder");
        std::fs::create_dir_all(&bundle).unwrap();
        symlink(&bundle, &alias).unwrap();

        let error = resolve_open_target(&alias).unwrap_err();
        assert!(error.contains("executable bundle"));
        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn recorded_save_dirs_are_loaded_and_deduplicated() {
        let config_dir = temp_dir("record");
        let picked = temp_dir("picked");
        // Missing file loads as an empty list.
        assert!(load_allowed_save_dirs(&config_dir).is_empty());
        record_allowed_save_dir(&config_dir, &picked).unwrap();
        record_allowed_save_dir(&config_dir, &picked).unwrap();
        let dirs = load_allowed_save_dirs(&config_dir);
        assert_eq!(dirs, vec![picked.clone()]);
        // A recorded directory (and its descendants) passes the allowlist.
        assert!(is_allowed_save_dir(&picked.join("sub"), &dirs));
        std::fs::remove_dir_all(&config_dir).ok();
        std::fs::remove_dir_all(&picked).ok();
    }

    #[test]
    fn corrupt_save_dirs_file_loads_as_empty_list() {
        let config_dir = temp_dir("corrupt");
        std::fs::write(
            config_dir.join(ALLOWED_SAVE_DIRS_FILENAME),
            "not valid json {{",
        )
        .unwrap();
        assert!(load_allowed_save_dirs(&config_dir).is_empty());
        // A wrong shape (not a string array) is tolerated as well.
        std::fs::write(
            config_dir.join(ALLOWED_SAVE_DIRS_FILENAME),
            r#"{"dir":"/tmp"}"#,
        )
        .unwrap();
        assert!(load_allowed_save_dirs(&config_dir).is_empty());
        std::fs::remove_dir_all(&config_dir).ok();
    }

    #[test]
    fn open_target_reveals_files_via_parent_directory() {
        let base = temp_dir("reveal");
        let file = base.join("note.txt");
        std::fs::write(&file, "hello").unwrap();
        assert_eq!(
            resolve_open_target(&file).unwrap(),
            base.canonicalize().unwrap()
        );
        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn open_target_rejects_executable_bundles() {
        let base = temp_dir("bundle");
        for name in [
            "Bad.app",
            "Bad.framework",
            "Bad.bundle",
            "Bad.plugin",
            "Bad.APP",
        ] {
            let bundle = base.join(name);
            std::fs::create_dir_all(&bundle).unwrap();
            let error = resolve_open_target(&bundle).unwrap_err();
            assert!(error.contains("executable bundle"), "{name}: {error}");
        }
        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn open_target_opens_plain_directories_and_rejects_missing_paths() {
        let base = temp_dir("plain");
        let plain = base.join("exports");
        std::fs::create_dir_all(&plain).unwrap();
        assert_eq!(
            resolve_open_target(&plain).unwrap(),
            plain.canonicalize().unwrap()
        );
        let missing = base.join("does-not-exist");
        let error = resolve_open_target(&missing).unwrap_err();
        assert!(error.contains("does not exist"), "{error}");
        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn cuda_kit_env_injects_for_enabled_complete_kit() {
        let base = temp_dir("cuda-kit-allow");
        let kit_root = base.join("runtime").join("cuda-kit");
        let kit_dir = kit_root.join("kit");
        std::fs::create_dir_all(kit_dir.join("torch")).unwrap();
        std::fs::write(kit_dir.join("torch").join("__init__.py"), b"").unwrap();
        std::fs::write(kit_root.join("config.json"), r#"{"enabled": true}"#).unwrap();
        assert_eq!(
            cuda_kit_env_for(&base),
            vec![(
                "ASRBOX_CUDA_KIT_DIR".to_string(),
                kit_dir.to_string_lossy().to_string()
            )]
        );
        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn cuda_kit_env_denies_disabled_or_incomplete_kit() {
        let base = temp_dir("cuda-kit-deny");
        // no config file at all
        assert!(cuda_kit_env_for(&base).is_empty());
        let kit_root = base.join("runtime").join("cuda-kit");
        std::fs::create_dir_all(kit_root.join("kit")).unwrap();
        // explicitly disabled
        std::fs::write(kit_root.join("config.json"), r#"{"enabled": false}"#).unwrap();
        assert!(cuda_kit_env_for(&base).is_empty());
        // malformed config
        std::fs::write(kit_root.join("config.json"), b"not json").unwrap();
        assert!(cuda_kit_env_for(&base).is_empty());
        // enabled but the kit tree is missing entirely
        std::fs::write(kit_root.join("config.json"), r#"{"enabled": true}"#).unwrap();
        assert!(cuda_kit_env_for(&base).is_empty());
        // enabled, torch directory present but __init__.py missing
        std::fs::create_dir_all(kit_root.join("kit").join("torch")).unwrap();
        assert!(cuda_kit_env_for(&base).is_empty());
        std::fs::remove_dir_all(&base).ok();
    }
}
