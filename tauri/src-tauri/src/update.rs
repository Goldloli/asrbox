use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::ffi::OsStr;
use std::future::Future;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::ShellExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const RELEASES_API: &str = "https://api.github.com/repos/Goldloli/asrbox/releases?per_page=30";
const RELEASES_PAGE: &str = "https://github.com/Goldloli/asrbox/releases";
const DOWNLOAD_EVENT: &str = "app-update-download-progress";
const USER_AGENT: &str = "ASRbox desktop update checker";
const CANCELLED: &str = "__ASRBOX_UPDATE_CANCELLED__";
const MAX_CHECKSUM_BYTES: usize = 1024 * 1024;
const MAX_INSTALLER_BYTES: u64 = 5 * 1024 * 1024 * 1024;
const RESPONSE_IDLE_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Clone, Serialize)]
pub struct AppVersionInfo {
    version: String,
    target: String,
    installer_kind: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct UpdateRelease {
    version: String,
    tag_name: String,
    name: String,
    notes: String,
    published_at: Option<String>,
    html_url: String,
    asset_name: Option<String>,
    asset_size: Option<u64>,
}

#[derive(Clone, Serialize)]
pub struct UpdateCheckResult {
    current_version: String,
    update_available: bool,
    checked_at_ms: u64,
    release: Option<UpdateRelease>,
    releases_url: String,
}

#[derive(Clone, Serialize)]
pub struct UpdateDownloadState {
    status: String,
    version: Option<String>,
    filename: Option<String>,
    path: Option<String>,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    progress: Option<f64>,
    bytes_per_second: Option<f64>,
    eta_seconds: Option<u64>,
    error: Option<String>,
}

impl Default for UpdateDownloadState {
    fn default() -> Self {
        Self {
            status: "idle".to_string(),
            version: None,
            filename: None,
            path: None,
            downloaded_bytes: 0,
            total_bytes: None,
            progress: None,
            bytes_per_second: None,
            eta_seconds: None,
            error: None,
        }
    }
}

pub struct AppUpdateState {
    cancel: AtomicBool,
    snapshot: Mutex<UpdateDownloadState>,
}

impl Default for AppUpdateState {
    fn default() -> Self {
        Self {
            cancel: AtomicBool::new(false),
            snapshot: Mutex::new(UpdateDownloadState::default()),
        }
    }
}

#[derive(Clone, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Clone, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    draft: bool,
    prerelease: bool,
    published_at: Option<String>,
    html_url: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Clone)]
struct ResolvedRelease {
    version: Version,
    source: GitHubRelease,
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> AppVersionInfo {
    AppVersionInfo {
        version: app.package_info().version.to_string(),
        target: target_label().to_string(),
        installer_kind: installer_kind().map(str::to_string),
    }
}

#[tauri::command]
pub async fn check_app_update(
    app: AppHandle,
    channel: String,
) -> Result<UpdateCheckResult, String> {
    let current_version = app.package_info().version.clone();
    let releases = fetch_releases().await?;
    let selected = select_release(&releases, &channel)?;
    let release = selected.as_ref().map(public_release);
    let update_available = selected
        .as_ref()
        .map(|candidate| candidate.version > current_version)
        .unwrap_or(false);
    Ok(UpdateCheckResult {
        current_version: current_version.to_string(),
        update_available,
        checked_at_ms: now_ms(),
        release,
        releases_url: RELEASES_PAGE.to_string(),
    })
}

#[tauri::command]
pub fn get_app_update_download_state(
    state: State<'_, AppUpdateState>,
) -> Result<UpdateDownloadState, String> {
    state
        .snapshot
        .lock()
        .map(|snapshot| snapshot.clone())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn start_app_update_download(
    app: AppHandle,
    state: State<'_, AppUpdateState>,
    version: String,
    channel: String,
) -> Result<UpdateDownloadState, String> {
    Version::parse(version.trim_start_matches('v'))
        .map_err(|error| format!("Invalid update version: {error}"))?;
    validate_channel(&channel)?;
    let initial = {
        let mut snapshot = state.snapshot.lock().map_err(|error| error.to_string())?;
        if matches!(
            snapshot.status.as_str(),
            "preparing" | "downloading" | "verifying" | "cancelling"
        ) {
            return Err("Another application update download is already active.".to_string());
        }
        *snapshot = UpdateDownloadState {
            status: "preparing".to_string(),
            version: Some(version.clone()),
            ..UpdateDownloadState::default()
        };
        snapshot.clone()
    };
    state.cancel.store(false, Ordering::SeqCst);
    if let Err(error) = app.emit(DOWNLOAD_EVENT, initial.clone()) {
        if let Ok(mut snapshot) = state.snapshot.lock() {
            *snapshot = UpdateDownloadState::default();
        }
        return Err(error.to_string());
    }

    tauri::async_runtime::spawn(async move {
        let result = run_download(&app, &version, &channel).await;
        let update_state = app.state::<AppUpdateState>();
        update_state.cancel.store(false, Ordering::SeqCst);
        match result {
            Ok(()) => {}
            Err(error) if error == CANCELLED => {
                let _ = mutate_snapshot(&app, |snapshot| {
                    snapshot.status = "cancelled".to_string();
                    snapshot.progress = None;
                    snapshot.bytes_per_second = None;
                    snapshot.eta_seconds = None;
                    snapshot.error = None;
                });
            }
            Err(error) => {
                let _ = mutate_snapshot(&app, |snapshot| {
                    snapshot.status = "error".to_string();
                    snapshot.progress = None;
                    snapshot.bytes_per_second = None;
                    snapshot.eta_seconds = None;
                    snapshot.error = Some(error);
                });
            }
        }
    });

    Ok(initial)
}

#[tauri::command]
pub fn cancel_app_update_download(
    app: AppHandle,
    state: State<'_, AppUpdateState>,
) -> Result<UpdateDownloadState, String> {
    let status = state
        .snapshot
        .lock()
        .map_err(|error| error.to_string())?
        .status
        .clone();
    if !matches!(status.as_str(), "preparing" | "downloading" | "verifying") {
        return get_app_update_download_state(state);
    }
    state.cancel.store(true, Ordering::SeqCst);
    mutate_snapshot(&app, |snapshot| {
        snapshot.status = "cancelling".to_string();
        snapshot.bytes_per_second = None;
        snapshot.eta_seconds = None;
    })
}

#[tauri::command]
#[allow(deprecated)]
pub fn open_downloaded_update(
    app: AppHandle,
    state: State<'_, AppUpdateState>,
) -> Result<(), String> {
    let path = completed_path(&state)?;
    app.shell()
        .open(path.to_string_lossy().to_string(), None)
        .map_err(|error| format!("Failed to open installer: {error}"))
}

#[tauri::command]
#[allow(deprecated)]
pub fn open_update_file_location(
    app: AppHandle,
    state: State<'_, AppUpdateState>,
) -> Result<(), String> {
    let path = completed_path(&state)?;
    let parent = path
        .parent()
        .ok_or_else(|| "Downloaded installer has no parent directory.".to_string())?;
    app.shell()
        .open(parent.to_string_lossy().to_string(), None)
        .map_err(|error| format!("Failed to open installer location: {error}"))
}

#[tauri::command]
#[allow(deprecated)]
pub fn open_about_link(app: AppHandle, link: String) -> Result<(), String> {
    let url = about_link_url(&link).ok_or_else(|| "Unknown ASRbox about-page link.".to_string())?;
    app.shell()
        .open(url, None)
        .map_err(|error| format!("Failed to open link: {error}"))
}

fn completed_path(state: &State<'_, AppUpdateState>) -> Result<PathBuf, String> {
    let snapshot = state.snapshot.lock().map_err(|error| error.to_string())?;
    if snapshot.status != "completed" {
        return Err("No verified installer is ready.".to_string());
    }
    let path = snapshot
        .path
        .as_deref()
        .map(PathBuf::from)
        .ok_or_else(|| "Verified installer path is unavailable.".to_string())?;
    let version = snapshot
        .version
        .as_deref()
        .and_then(|value| Version::parse(value.trim_start_matches('v')).ok())
        .ok_or_else(|| "Verified installer version is unavailable.".to_string())?;
    if !is_regular_file_without_symlink(&path)
        || !is_expected_asset_for_version(
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or(""),
            &version,
        )
    {
        return Err("Verified installer is no longer available.".to_string());
    }
    Ok(path)
}

async fn run_download(
    app: &AppHandle,
    requested_version: &str,
    channel: &str,
) -> Result<(), String> {
    let releases = fetch_releases().await?;
    ensure_not_cancelled(app)?;
    let selected = select_release(&releases, channel)?
        .ok_or_else(|| "No supported GitHub Release was found.".to_string())?;
    if selected.version.to_string() != requested_version.trim_start_matches('v') {
        return Err(
            "The requested release is no longer the latest release for this channel.".to_string(),
        );
    }
    let current_version = app.package_info().version.clone();
    if selected.version <= current_version {
        return Err("The requested release is not newer than the current application.".to_string());
    }

    let installer = selected
        .source
        .assets
        .iter()
        .find(|asset| is_expected_asset_for_version(&asset.name, &selected.version))
        .cloned()
        .ok_or_else(|| {
            "This release has no installer for the maintained desktop target.".to_string()
        })?;
    if installer.size == 0 || installer.size > MAX_INSTALLER_BYTES {
        return Err("The release installer has an invalid size.".to_string());
    }
    let checksums = selected
        .source
        .assets
        .iter()
        .find(|asset| asset.name == "SHA256SUMS.txt")
        .cloned()
        .ok_or_else(|| "This release has no SHA256SUMS.txt asset.".to_string())?;
    validate_asset_url(&installer.browser_download_url)?;
    validate_asset_url(&checksums.browser_download_url)?;

    let client = github_client()?;
    let checksum_response = client
        .get(&checksums.browser_download_url)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|error| format!("Failed to download release checksums: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Failed to download release checksums: {error}"))?;
    validate_response_url(checksum_response.url())?;
    let checksum_text = read_bounded_text(checksum_response, MAX_CHECKSUM_BYTES).await?;
    let expected_checksum = parse_checksum(&checksum_text, &installer.name)
        .ok_or_else(|| format!("SHA256SUMS.txt does not contain {}.", installer.name))?;

    let download_dir = app
        .path()
        .download_dir()
        .map_err(|error| format!("Failed to resolve downloads directory: {error}"))?;
    tokio::fs::create_dir_all(&download_dir)
        .await
        .map_err(|error| format!("Failed to create downloads directory: {error}"))?;
    let final_path = download_dir.join(&installer.name);
    let part_path = download_dir.join(format!("{}.part", installer.name));
    remove_file_if_present(&part_path, "previous partial download").await?;

    if is_regular_file_without_symlink(&final_path)
        && hash_file(&final_path).await? == expected_checksum
    {
        mutate_snapshot(app, |snapshot| {
            snapshot.status = "completed".to_string();
            snapshot.version = Some(selected.version.to_string());
            snapshot.filename = Some(installer.name.clone());
            snapshot.path = Some(final_path.to_string_lossy().to_string());
            snapshot.downloaded_bytes = installer.size;
            snapshot.total_bytes = Some(installer.size);
            snapshot.progress = Some(100.0);
            snapshot.bytes_per_second = None;
            snapshot.eta_seconds = Some(0);
            snapshot.error = None;
        })?;
        return Ok(());
    }

    mutate_snapshot(app, |snapshot| {
        snapshot.status = "downloading".to_string();
        snapshot.version = Some(selected.version.to_string());
        snapshot.filename = Some(installer.name.clone());
        snapshot.path = None;
        snapshot.downloaded_bytes = 0;
        snapshot.total_bytes = if installer.size > 0 {
            Some(installer.size)
        } else {
            None
        };
        snapshot.progress = Some(0.0);
        snapshot.bytes_per_second = None;
        snapshot.eta_seconds = None;
        snapshot.error = None;
    })?;

    let download_result =
        download_file(app, &client, &installer, &part_path, &expected_checksum).await;
    if download_result.is_err() {
        let _ = remove_file_if_present(&part_path, "partial download").await;
    }
    download_result?;

    remove_file_if_present(&final_path, "unverified installer").await?;
    tokio::fs::rename(&part_path, &final_path)
        .await
        .map_err(|error| format!("Failed to finalize installer download: {error}"))?;
    let size = tokio::fs::metadata(&final_path)
        .await
        .map(|metadata| metadata.len())
        .unwrap_or(installer.size);
    mutate_snapshot(app, |snapshot| {
        snapshot.status = "completed".to_string();
        snapshot.path = Some(final_path.to_string_lossy().to_string());
        snapshot.downloaded_bytes = size;
        snapshot.total_bytes = Some(size);
        snapshot.progress = Some(100.0);
        snapshot.bytes_per_second = None;
        snapshot.eta_seconds = Some(0);
        snapshot.error = None;
    })?;
    Ok(())
}

async fn download_file(
    app: &AppHandle,
    client: &reqwest::Client,
    asset: &GitHubAsset,
    part_path: &Path,
    expected_checksum: &str,
) -> Result<(), String> {
    let mut response = client
        .get(&asset.browser_download_url)
        .send()
        .await
        .map_err(|error| format!("Failed to download installer: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Failed to download installer: {error}"))?;
    validate_response_url(response.url())?;
    if response
        .content_length()
        .is_some_and(|length| length != asset.size)
    {
        return Err("Installer download size does not match the GitHub Release.".to_string());
    }
    let total = response
        .content_length()
        .or((asset.size > 0).then_some(asset.size));
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(part_path)
        .await
        .map_err(|error| format!("Failed to create partial installer: {error}"))?;
    let mut hasher = Sha256::new();
    let started = Instant::now();
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    let mut downloaded = 0u64;

    while let Some(chunk) = await_with_idle_timeout(
        response.chunk(),
        RESPONSE_IDLE_TIMEOUT,
        "Installer download",
    )
    .await?
    {
        ensure_not_cancelled(app)?;
        file.write_all(&chunk)
            .await
            .map_err(|error| format!("Failed to write installer download: {error}"))?;
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;
        if downloaded > asset.size {
            return Err("Installer download exceeded the GitHub Release size.".to_string());
        }
        if last_emit.elapsed() >= Duration::from_millis(250) {
            emit_download_progress(app, downloaded, total, started.elapsed())?;
            last_emit = Instant::now();
        }
    }
    ensure_not_cancelled(app)?;
    if downloaded != asset.size {
        return Err("Installer download size does not match the GitHub Release.".to_string());
    }
    file.flush()
        .await
        .map_err(|error| format!("Failed to flush installer download: {error}"))?;
    emit_download_progress(app, downloaded, total, started.elapsed())?;
    mutate_snapshot(app, |snapshot| {
        snapshot.status = "verifying".to_string();
        snapshot.bytes_per_second = None;
        snapshot.eta_seconds = None;
    })?;
    ensure_not_cancelled(app)?;
    let actual_checksum = format!("{:x}", hasher.finalize());
    if actual_checksum != expected_checksum {
        return Err(format!(
            "Installer verification failed: expected {expected_checksum}, got {actual_checksum}."
        ));
    }
    Ok(())
}

fn emit_download_progress(
    app: &AppHandle,
    downloaded: u64,
    total: Option<u64>,
    elapsed: Duration,
) -> Result<UpdateDownloadState, String> {
    let seconds = elapsed.as_secs_f64();
    let bytes_per_second = (seconds > 0.0).then_some(downloaded as f64 / seconds);
    let progress = total
        .filter(|value| *value > 0)
        .map(|value| (downloaded as f64 / value as f64 * 100.0).clamp(0.0, 100.0));
    let eta_seconds = match (total, bytes_per_second) {
        (Some(total), Some(speed)) if speed > 0.0 && total > downloaded => {
            Some(((total - downloaded) as f64 / speed).ceil() as u64)
        }
        (Some(_), Some(_)) => Some(0),
        _ => None,
    };
    mutate_snapshot(app, |snapshot| {
        snapshot.status = "downloading".to_string();
        snapshot.downloaded_bytes = downloaded;
        snapshot.total_bytes = total;
        snapshot.progress = progress;
        snapshot.bytes_per_second = bytes_per_second;
        snapshot.eta_seconds = eta_seconds;
    })
}

fn mutate_snapshot(
    app: &AppHandle,
    mutate: impl FnOnce(&mut UpdateDownloadState),
) -> Result<UpdateDownloadState, String> {
    let state = app.state::<AppUpdateState>();
    let snapshot = {
        let mut snapshot = state.snapshot.lock().map_err(|error| error.to_string())?;
        mutate(&mut snapshot);
        snapshot.clone()
    };
    app.emit(DOWNLOAD_EVENT, snapshot.clone())
        .map_err(|error| error.to_string())?;
    Ok(snapshot)
}

fn ensure_not_cancelled(app: &AppHandle) -> Result<(), String> {
    if app.state::<AppUpdateState>().cancel.load(Ordering::SeqCst) {
        Err(CANCELLED.to_string())
    } else {
        Ok(())
    }
}

async fn fetch_releases() -> Result<Vec<GitHubRelease>, String> {
    let response = github_client()?
        .get(RELEASES_API)
        .timeout(Duration::from_secs(30))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|error| format!("Failed to check GitHub Releases: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Failed to check GitHub Releases: {error}"))?;
    if response.url().scheme() != "https" || response.url().host_str() != Some("api.github.com") {
        return Err("GitHub Releases request resolved to an untrusted endpoint.".to_string());
    }
    response
        .json::<Vec<GitHubRelease>>()
        .await
        .map_err(|error| format!("Failed to parse GitHub Releases: {error}"))
}

async fn read_bounded_text(
    mut response: reqwest::Response,
    maximum_bytes: usize,
) -> Result<String, String> {
    if response
        .content_length()
        .is_some_and(|length| length > maximum_bytes as u64)
    {
        return Err("Release checksum file is unexpectedly large.".to_string());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = await_with_idle_timeout(
        response.chunk(),
        RESPONSE_IDLE_TIMEOUT,
        "Release checksum download",
    )
    .await?
    {
        if bytes.len().saturating_add(chunk.len()) > maximum_bytes {
            return Err("Release checksum file is unexpectedly large.".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes).map_err(|_| "Release checksum file is not valid UTF-8.".to_string())
}

async fn await_with_idle_timeout<T>(
    future: impl Future<Output = Result<T, reqwest::Error>>,
    timeout: Duration,
    operation: &str,
) -> Result<T, String> {
    tokio::time::timeout(timeout, future)
        .await
        .map_err(|_| {
            format!(
                "{operation} stalled for more than {} seconds.",
                timeout.as_secs()
            )
        })?
        .map_err(|error| format!("{operation} failed: {error}"))
}

fn github_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|error| format!("Failed to create GitHub client: {error}"))
}

fn select_release(
    releases: &[GitHubRelease],
    channel: &str,
) -> Result<Option<ResolvedRelease>, String> {
    validate_channel(channel)?;
    Ok(releases
        .iter()
        .filter(|release| !release.draft)
        .filter_map(|source| {
            Version::parse(source.tag_name.trim_start_matches('v'))
                .ok()
                .and_then(|version| {
                    let accepted =
                        channel == "prerelease" || (!source.prerelease && version.pre.is_empty());
                    accepted.then_some(ResolvedRelease {
                        version,
                        source: source.clone(),
                    })
                })
        })
        .max_by(|left, right| left.version.cmp(&right.version)))
}

fn validate_channel(channel: &str) -> Result<(), String> {
    if matches!(channel, "stable" | "prerelease") {
        Ok(())
    } else {
        Err("Update channel must be stable or prerelease.".to_string())
    }
}

fn public_release(release: &ResolvedRelease) -> UpdateRelease {
    let asset = release
        .source
        .assets
        .iter()
        .find(|asset| is_expected_asset_for_version(&asset.name, &release.version));
    UpdateRelease {
        version: release.version.to_string(),
        tag_name: release.source.tag_name.clone(),
        name: release
            .source
            .name
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| release.source.tag_name.clone()),
        notes: plain_text_summary(release.source.body.as_deref().unwrap_or("")),
        published_at: release.source.published_at.clone(),
        html_url: trusted_release_page(&release.source.html_url),
        asset_name: asset.map(|item| item.name.clone()),
        asset_size: asset.map(|item| item.size),
    }
}

fn trusted_release_page(value: &str) -> String {
    let Ok(url) = reqwest::Url::parse(value) else {
        return RELEASES_PAGE.to_string();
    };
    let trusted = url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url.path().starts_with("/Goldloli/asrbox/releases/");
    if trusted {
        value.to_string()
    } else {
        RELEASES_PAGE.to_string()
    }
}

fn validate_asset_url(value: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(value)
        .map_err(|error| format!("Invalid GitHub Release asset URL: {error}"))?;
    if url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url
            .path()
            .starts_with("/Goldloli/asrbox/releases/download/")
    {
        Ok(())
    } else {
        Err("GitHub Release asset URL is outside the trusted project.".to_string())
    }
}

fn validate_response_url(url: &reqwest::Url) -> Result<(), String> {
    let host = url.host_str().unwrap_or_default();
    if url.scheme() == "https"
        && (host == "github.com"
            || host == "objects.githubusercontent.com"
            || host.ends_with(".githubusercontent.com"))
    {
        Ok(())
    } else {
        Err("GitHub Release download resolved to an untrusted endpoint.".to_string())
    }
}

fn parse_checksum(contents: &str, filename: &str) -> Option<String> {
    contents.lines().find_map(|line| {
        let mut parts = line.split_whitespace();
        let digest = parts.next()?;
        let name = parts.next()?.trim_start_matches('*');
        if parts.next().is_none()
            && name == filename
            && digest.len() == 64
            && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            Some(digest.to_ascii_lowercase())
        } else {
            None
        }
    })
}

async fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|error| format!("Failed to inspect existing installer: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .await
            .map_err(|error| format!("Failed to hash existing installer: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

async fn remove_file_if_present(path: &Path, description: &str) -> Result<(), String> {
    match tokio::fs::symlink_metadata(path).await {
        Ok(metadata) if metadata.file_type().is_dir() => {
            Err(format!("The {description} path is a directory."))
        }
        Ok(_) => tokio::fs::remove_file(path)
            .await
            .map_err(|error| format!("Failed to remove {description}: {error}")),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Failed to inspect {description}: {error}")),
    }
}

fn is_regular_file_without_symlink(path: &Path) -> bool {
    std::fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_file())
        .unwrap_or(false)
}

fn plain_text_summary(value: &str) -> String {
    let mut output = value
        .lines()
        .map(|line| line.trim().trim_start_matches(['#', '>', '-', '*']).trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    if output.chars().count() > 600 {
        output = output.chars().take(599).collect::<String>() + "…";
    }
    output
}

fn is_expected_asset(name: &str) -> bool {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        return Path::new(name).file_name() == Some(OsStr::new(name))
            && name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
            && name.starts_with("ASRbox_")
            && name.ends_with("_aarch64.dmg");
    }
    #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
    {
        let _ = name;
        false
    }
}

fn is_expected_asset_for_version(name: &str, version: &Version) -> bool {
    is_expected_asset(name) && name == format!("ASRbox_{version}_aarch64.dmg")
}

fn target_label() -> &'static str {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "macOS Apple Silicon"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "macOS Intel"
    } else if cfg!(target_os = "windows") {
        "Windows"
    } else if cfg!(target_os = "linux") {
        "Linux"
    } else {
        "Desktop"
    }
}

fn installer_kind() -> Option<&'static str> {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Some("dmg")
    } else {
        None
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn about_link_url(link: &str) -> Option<&'static str> {
    match link {
        "author_github" => Some("https://github.com/Goldloli"),
        "author_bilibili" => Some("https://space.bilibili.com/1599822"),
        "repository" => Some("https://github.com/Goldloli/asrbox"),
        "documentation" => Some("https://github.com/Goldloli/asrbox#readme"),
        "issues" => Some("https://github.com/Goldloli/asrbox/issues/new/choose"),
        "privacy" => Some("https://github.com/Goldloli/asrbox/blob/main/docs/privacy.md"),
        "license" => Some("https://github.com/Goldloli/asrbox/blob/main/LICENSE"),
        "troubleshooting" => {
            Some("https://github.com/Goldloli/asrbox/blob/main/docs/troubleshooting.md")
        }
        "releases" => Some(RELEASES_PAGE),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(tag: &str, prerelease: bool, assets: Vec<GitHubAsset>) -> GitHubRelease {
        GitHubRelease {
            tag_name: tag.to_string(),
            name: None,
            body: None,
            draft: false,
            prerelease,
            published_at: None,
            html_url: format!("https://github.com/Goldloli/asrbox/releases/tag/{tag}"),
            assets,
        }
    }

    #[test]
    fn stable_channel_ignores_prereleases() {
        let releases = vec![
            release("v0.2.0-beta.1", true, vec![]),
            release("v0.2.0-rc.1", false, vec![]),
            release("v0.1.3", false, vec![]),
        ];
        assert_eq!(
            select_release(&releases, "stable")
                .unwrap()
                .unwrap()
                .version,
            Version::parse("0.1.3").unwrap()
        );
    }

    #[test]
    fn prerelease_channel_uses_highest_semver() {
        let releases = vec![
            release("v0.2.0-beta.2", true, vec![]),
            release("v0.1.9", false, vec![]),
            release("not-semver", false, vec![]),
        ];
        assert_eq!(
            select_release(&releases, "prerelease")
                .unwrap()
                .unwrap()
                .version,
            Version::parse("0.2.0-beta.2").unwrap()
        );
    }

    #[test]
    fn checksum_parser_requires_exact_filename_and_sha256() {
        let digest = "a".repeat(64);
        let contents = format!(
            "{digest}  ASRbox_0.1.3_aarch64.dmg\n{}  other.dmg\n",
            "b".repeat(64)
        );
        assert_eq!(
            parse_checksum(&contents, "ASRbox_0.1.3_aarch64.dmg"),
            Some(digest)
        );
        assert_eq!(parse_checksum(&contents, "ASRbox_0.1.3.dmg"), None);
    }

    #[test]
    fn asset_urls_are_scoped_to_official_release_downloads() {
        assert!(validate_asset_url(
            "https://github.com/Goldloli/asrbox/releases/download/v0.1.3/ASRbox_0.1.3_aarch64.dmg"
        )
        .is_ok());
        assert!(validate_asset_url(
            "https://example.com/Goldloli/asrbox/releases/download/v0.1.3/file.dmg"
        )
        .is_err());
        assert!(validate_asset_url(
            "http://github.com/Goldloli/asrbox/releases/download/v0.1.3/file.dmg"
        )
        .is_err());
    }

    #[test]
    fn installer_asset_name_rejects_path_traversal() {
        if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
            assert!(is_expected_asset("ASRbox_0.1.3_aarch64.dmg"));
            assert!(is_expected_asset_for_version(
                "ASRbox_0.1.3_aarch64.dmg",
                &Version::parse("0.1.3").unwrap()
            ));
            assert!(!is_expected_asset_for_version(
                "ASRbox_0.1.4_aarch64.dmg",
                &Version::parse("0.1.3").unwrap()
            ));
            assert!(!is_expected_asset("ASRbox_../../escaped_0.1.3_aarch64.dmg"));
            assert!(!is_expected_asset(
                "ASRbox_0.1.3_aarch64.dmg/another_aarch64.dmg"
            ));
        }
    }

    #[test]
    fn release_notes_are_plain_and_bounded() {
        let input = format!("# Heading\n- item\n{}", "x".repeat(700));
        let output = plain_text_summary(&input);
        assert!(output.starts_with("Heading item"));
        assert!(output.chars().count() <= 600);
        assert!(!output.contains('#'));
    }

    #[test]
    fn about_links_are_fixed() {
        assert_eq!(
            about_link_url("issues"),
            Some("https://github.com/Goldloli/asrbox/issues/new/choose")
        );
        assert_eq!(about_link_url("https://example.com"), None);
    }

    #[test]
    fn response_idle_timeout_is_bounded_and_diagnostic() {
        tauri::async_runtime::block_on(async {
            let result: Result<(), String> = await_with_idle_timeout(
                std::future::pending::<Result<(), reqwest::Error>>(),
                Duration::from_millis(5),
                "Test download",
            )
            .await;
            assert!(result.unwrap_err().contains("Test download stalled"));
        });
    }
}
