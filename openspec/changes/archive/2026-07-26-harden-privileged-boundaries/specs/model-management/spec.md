# model-management Specification Delta

## MODIFIED Requirements

### Requirement: Controlled model download lifecycle

Managed model downloads SHALL expose progress and supported pause, resume, stop, retry, redownload, and deletion actions with truthful process-local, storage-location, and on-disk state. Deletion SHALL validate that the model name is registered in the maintained catalog and that the resolved target directory remains inside the configured models root before removing any data; an unregistered or path-escaping name SHALL fail without touching the filesystem.

#### Scenario: User stops a download

- **WHEN** a user stops an active managed download
- **THEN** the worker is cancelled while reusable completed or partial files remain available to the documented retry or cleanup actions

#### Scenario: Configured storage is unavailable

- **WHEN** a download, retry, resume, redownload, deletion, or cleanup action targets an unavailable configured root
- **THEN** the action fails with a storage-unavailable state without creating or using a fallback model directory

#### Scenario: Deletion rejects an unregistered or escaping model name

- **WHEN** a deletion request carries a model name that is not in the registered catalog, or whose resolved directory would fall outside the models root
- **THEN** the request fails with a not-found state and no directory is removed
