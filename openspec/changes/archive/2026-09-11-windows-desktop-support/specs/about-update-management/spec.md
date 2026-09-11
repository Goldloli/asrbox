# about-update-management Delta（windows-desktop-support）

## MODIFIED Requirements

### Requirement: Desktop package download is user initiated and globally observable
When a newer release contains an installer for the maintained desktop target, ASRbox SHALL allow the user to start one application-update download, SHALL continue it across in-app navigation, and SHALL expose its progress in the About tab and global task center with downloaded and total bytes, percentage when known, transfer speed, estimated remaining time, cancellation, failure retry, and completion state.

#### Scenario: User downloads the macOS package
- **WHEN** a macOS Apple Silicon user starts a download for a matching newer release
- **THEN** ASRbox streams the versioned DMG to the system download directory through a `.part` file and reports progress without blocking transcription or model downloads

#### Scenario: User downloads the Windows package
- **WHEN** a Windows x64 user starts a download for a matching newer release
- **THEN** ASRbox streams the versioned NSIS installer to the system download directory through a `.part` file and reports progress without blocking transcription or model downloads

#### Scenario: User navigates away
- **WHEN** an update package download is active and the user leaves the About tab
- **THEN** the download continues and remains visible in the global task center

#### Scenario: User cancels the download
- **WHEN** the user cancels an active update download
- **THEN** ASRbox stops the transfer, removes the incomplete `.part` file, and offers a clean retry without pause or resume state

#### Scenario: A verified package already exists
- **WHEN** the expected versioned installer already exists and matches the release checksum
- **THEN** ASRbox reuses the verified file and reports completion without downloading it again

### Requirement: Installation remains manual and disclosures remain honest
ASRbox SHALL require an explicit user action to download and open an installer, SHALL provide Open Installer and the cross-platform Open File Location action after verification, SHALL instruct the user to finish active work, quit normally, and manually replace the application, and SHALL NOT claim or perform automatic installation, automatic replacement, automatic exit, automatic restart, Apple Developer ID signing, notarization, or Windows Authenticode signing.

#### Scenario: Verified DMG is ready
- **WHEN** a macOS update download completes and passes verification
- **THEN** the user can open the DMG or its file location and sees manual replacement and Gatekeeper guidance while ASRbox remains running

#### Scenario: Verified NSIS installer is ready
- **WHEN** a Windows update download completes and passes verification
- **THEN** the user can open the NSIS installer or its file location and sees manual installation and unsigned SmartScreen guidance while ASRbox remains running

#### Scenario: User has active work
- **WHEN** a verified installer is ready while transcription or model-download work remains active
- **THEN** ASRbox does not terminate itself and leaves the timing of normal application exit to the user
