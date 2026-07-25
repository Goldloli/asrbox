# documentation-governance Specification

## Purpose
TBD - created by archiving change normalize-project-documentation. Update Purpose after archive.
## Requirements
### Requirement: Behavioral source of truth
Accepted ASRbox product behavior and protected invariants SHALL be maintained in `openspec/specs/`, while proposed behavior SHALL remain in an active OpenSpec change until accepted.

#### Scenario: Developer investigates current behavior
- **WHEN** a developer needs to know what behavior a future change must preserve
- **THEN** the relevant main capability spec is the authoritative prose requirement

### Requirement: Audience-specific documentation
The repository SHALL retain focused user, contributor, security, privacy, release, troubleshooting, legal, licensing, changelog, and release-note documents for their intended audiences rather than replacing them with planning artifacts.

#### Scenario: Product behavior affects users
- **WHEN** an accepted behavior change alters installation, privacy, operation, troubleshooting, or release facts
- **THEN** the owning audience document is updated in the same change as the spec

### Requirement: Executable and generated contracts
Exact commands, API schemas, dependency state, and verification results SHALL be derived from executable configuration, generated output, automated tests, CI, or release evidence rather than duplicated as manually maintained product specifications.

#### Scenario: Backend route changes
- **WHEN** a maintained backend route or response changes
- **THEN** generated OpenAPI, typed consumers, contract tests, and the affected compatibility requirement remain consistent

### Requirement: Historical artifact lifecycle
Completed plans and dated assessments SHALL NOT remain active sources of truth after their current constraints have been migrated; durable history SHALL remain available through Git, OpenSpec archives, release notes, or retained test evidence.

#### Scenario: Legacy planning documents are retired
- **WHEN** every still-current requirement from a completed planning document exists in an accepted spec or owned guide
- **THEN** the superseded planning document may be removed from the working tree

### Requirement: 受维护的媒体摄取与存储文档
用户文档 SHALL 描述桌面端摄取模式、托管 uploads 与派生音频的位置配置、派生音频的自动删除、源缺失 relink、按任务的删除语义，以及可选的 Docker uploads bind mount；在同时维护中英文版本的文档中，两种语言都 SHALL 更新。

#### Scenario: 产品行为影响用户
- **WHEN** 摄取模式、存储位置、relink 或 Docker 挂载行为发布
- **THEN** 受维护的用户文档、`.env.example`、Compose 注释与隐私措辞在同一个 change 中更新

