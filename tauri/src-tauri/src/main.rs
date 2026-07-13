use std::env;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const SERVER_PORT: u16 = 17494;
const SERVER_URL: &str = "http://127.0.0.1:17494";

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
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(ServerState {
            child: Mutex::new(None),
            api_token: generate_api_token(),
        })
        .invoke_handler(tauri::generate_handler![
            start_server,
            stop_server,
            restart_server,
            open_file_location,
            pick_executable_file,
            pick_export_directory,
            reveal_logs,
            save_text_file
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
    server_envs.push(("ASRBOX_API_TOKEN".to_string(), api_token.clone()));

    #[cfg(debug_assertions)]
    let spawn_result = {
        let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|path| path.parent())
            .map(PathBuf::from);
        let python = project_root
            .as_ref()
            .map(|root| root.join(".venv").join("bin").join("python"));

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
    let open_target = if target.is_file() {
        target.parent().map(PathBuf::from).unwrap_or(target)
    } else {
        target
    };
    app.shell()
        .open(open_target.to_string_lossy().to_string(), None)
        .map_err(|e| format!("Failed to open file location: {e}"))
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
    rx.await
        .map_err(|_| "Folder picker was closed before returning a result".to_string())?
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
    let export_dir = match directory.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => PathBuf::from(value),
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
    match reqwest::get(format!("{SERVER_URL}/health")).await {
        Ok(response) if response.status().is_success() => {
            let body = response.text().await.map_err(|e| e.to_string())?;
            Ok(is_asrbox_health_response(&body))
        }
        Ok(_) => Ok(false),
        Err(error) if error.is_connect() || error.is_timeout() => Ok(false),
        Err(error) => Err(format!("Failed to check ASRbox server health: {error}")),
    }
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
    let client = reqwest::Client::new();
    let token = app.state::<ServerState>().api_token.clone();
    let _ = client
        .post(format!("{SERVER_URL}/shutdown"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("Failed to request ASRbox shutdown: {e}"))?;
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
}
