## ADDED Requirements

### Requirement: About information is available across runtimes
ASRbox SHALL provide a localized About tab in Settings that shows the application identity, current application or Web build version, runtime and maintained-platform status, public-beta status, author `Goldloli 小卡塔克`, copyright, and links to the author GitHub and Bilibili profiles, project repository, documentation, GitHub Issues, privacy information, open-source license, troubleshooting, and Releases.

#### Scenario: Desktop user opens About
- **WHEN** a packaged desktop user selects the About tab
- **THEN** the page shows the packaged application version and desktop platform together with the maintained public-beta and unsigned/unnotarized disclosures

#### Scenario: Web user opens About
- **WHEN** a Web runtime user selects the About tab
- **THEN** the page shows the Web build version and project links without offering to download an installer into the Web backend

#### Scenario: User opens a support link
- **WHEN** the user activates the Issues, author, documentation, privacy, license, troubleshooting, or Releases link
- **THEN** ASRbox opens the corresponding fixed HTTPS destination without rendering remote HTML inside the application

### Requirement: Update preferences are explicit and portable
ASRbox SHALL provide persisted `stable` / `prerelease` channel selection, automatic update-check, and in-app update-notification preferences in the About tab; the defaults SHALL be stable channel with automatic checks and notifications enabled, except that a prerelease build SHALL initially select the prerelease channel until the user saves another choice.

#### Scenario: User disables automatic checks
- **WHEN** the user turns off automatic update checks
- **THEN** ASRbox stops scheduled GitHub update requests, preserves the notification preference, disables its control while automatic checks are off, and continues to allow manual checks

#### Scenario: User disables update notifications
- **WHEN** automatic checks remain enabled and the user turns off update notifications
- **THEN** scheduled checks may continue but no update Toast or navigation badge is shown, while the About tab still displays the latest check result

#### Scenario: Settings are exported and imported
- **WHEN** the user exports and later imports frontend settings containing update preferences
- **THEN** ASRbox restores valid channel, automatic-check, and notification values and safely defaults missing or invalid values from older files

### Requirement: Desktop update checks respect channel and frequency
The desktop runtime SHALL check only the fixed HTTPS GitHub Releases source for `Goldloli/asrbox`, SHALL ignore draft releases, SHALL use Semantic Versioning for comparison, SHALL check at most once per 24 hours approximately 10 seconds after desktop startup when automatic checks are enabled, and SHALL allow a manual check to bypass the schedule.

#### Scenario: Stable channel checks releases
- **WHEN** the selected channel is stable and GitHub contains stable and prerelease versions
- **THEN** ASRbox compares the current version only with the highest non-draft, non-prerelease Semantic Version

#### Scenario: Prerelease channel checks releases
- **WHEN** the selected channel is prerelease
- **THEN** ASRbox compares the current version with the highest non-draft Semantic Version across stable and prerelease releases

#### Scenario: Automatic check is still fresh
- **WHEN** desktop startup occurs less than 24 hours after the last completed automatic check
- **THEN** ASRbox does not issue another scheduled GitHub request

#### Scenario: User manually checks
- **WHEN** the user activates Check Now
- **THEN** ASRbox requests current release metadata regardless of the last automatic-check timestamp and shows checking, up-to-date, update-available, or recoverable-error state in the About tab

#### Scenario: Update notification is enabled
- **WHEN** an automatic check finds a newer release and in-app notifications are enabled
- **THEN** ASRbox shows an in-app Toast and a new-version badge without starting a download

### Requirement: Desktop package download is user initiated and globally observable
When a newer release contains an installer for the maintained desktop target, ASRbox SHALL allow the user to start one application-update download, SHALL continue it across in-app navigation, and SHALL expose its progress in the About tab and global task center with downloaded and total bytes, percentage when known, transfer speed, estimated remaining time, cancellation, failure retry, and completion state.

#### Scenario: User downloads the macOS package
- **WHEN** a macOS Apple Silicon user starts a download for a matching newer release
- **THEN** ASRbox streams the versioned DMG to the system download directory through a `.part` file and reports progress without blocking transcription or model downloads

#### Scenario: User navigates away
- **WHEN** an update package download is active and the user leaves the About tab
- **THEN** the download continues and remains visible in the global task center

#### Scenario: User cancels the download
- **WHEN** the user cancels an active update download
- **THEN** ASRbox stops the transfer, removes the incomplete `.part` file, and offers a clean retry without pause or resume state

#### Scenario: A verified package already exists
- **WHEN** the expected versioned installer already exists and matches the release checksum
- **THEN** ASRbox reuses the verified file and reports completion without downloading it again

### Requirement: Downloaded installers are verified before use
ASRbox MUST resolve release metadata and assets inside the trusted desktop boundary, MUST accept only expected HTTPS resources for the fixed project and supported platform, and MUST verify the completed installer against the matching entry in the same Release's `SHA256SUMS.txt` before exposing it as a completed file.

#### Scenario: Download and checksum succeed
- **WHEN** the complete `.part` file hash matches the expected release checksum
- **THEN** ASRbox atomically renames it to the versioned installer filename and enables Open Installer and Open File Location

#### Scenario: Checksum is missing or mismatched
- **WHEN** `SHA256SUMS.txt` lacks the expected asset or the downloaded hash does not match
- **THEN** ASRbox removes the invalid temporary file, does not open or promote it, reports a verification error, and provides a browser Releases fallback

#### Scenario: An untrusted download target is presented
- **WHEN** release metadata resolves to a non-HTTPS, unexpected-repository, unexpected-platform, or malformed installer target
- **THEN** ASRbox rejects the application download before writing a completed installer

### Requirement: Installation remains manual and disclosures remain honest
ASRbox SHALL require an explicit user action to download and open an installer, SHALL provide Open Installer and the cross-platform Open File Location action after verification, SHALL instruct the user to finish active work, quit normally, and manually replace the application, and SHALL NOT claim or perform automatic installation, automatic replacement, automatic exit, automatic restart, Apple Developer ID signing, or notarization.

#### Scenario: Verified DMG is ready
- **WHEN** a macOS update download completes and passes verification
- **THEN** the user can open the DMG or its file location and sees manual replacement and Gatekeeper guidance while ASRbox remains running

#### Scenario: User has active work
- **WHEN** a verified installer is ready while transcription or model-download work remains active
- **THEN** ASRbox does not terminate itself and leaves the timing of normal application exit to the user

### Requirement: Update failures are isolated
Update checking, notification, download, cancellation, verification, file opening, and GitHub rate-limit failures SHALL remain local to the update capability and SHALL NOT make successful transcription, model download, storage, backend startup, or Web use depend on GitHub availability.

#### Scenario: GitHub is unavailable
- **WHEN** an automatic or manual update request fails because of connectivity, rate limiting, malformed metadata, or missing assets
- **THEN** ASRbox presents a recoverable update error and Releases browser fallback while all unrelated application workflows remain available

#### Scenario: Desktop capability is unavailable
- **WHEN** update download functionality is requested in a Web runtime
- **THEN** ASRbox offers the Releases link instead of invoking a desktop command or writing to the backend filesystem
