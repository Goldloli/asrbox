# frontend-quality Delta: remove-keyboard-shortcuts

## REMOVED Requirements

### Requirement: Non-destructive settings and shortcuts

**Reason**: 全局快捷键（mod+n/mod+f/mod+,/mod+k）与命令面板从产品移除，该 requirement 的快捷键条款与「User types inside an editor」scenario 随之失效。

**Migration**: 服务器地址暂存与版本对比内存上限两个条款行为不变，由新 requirement「Non-destructive settings and bounded comparison」原样承接；无用户数据或配置迁移。

原内容：

Editing the server address SHALL not clear or replace the active connection token until the user explicitly applies the staged connection values. Global application shortcuts SHALL ignore editable controls, contenteditable targets, and IME composition. Version comparison SHALL bound memory use for large transcripts and provide a truthful truncated summary when a full line LCS would exceed that bound.

## ADDED Requirements

### Requirement: Non-destructive settings and bounded comparison

Editing the server address SHALL not clear or replace the active connection token until the user explicitly applies the staged connection values. Version comparison SHALL bound memory use for large transcripts and provide a truthful truncated summary when a full line LCS would exceed that bound.

#### Scenario: User types a server address

- **WHEN** the user changes one or more characters in the server address field without applying
- **THEN** the active server URL, API token, queries, and event connection remain unchanged

#### Scenario: Very large versions are compared

- **WHEN** the product of previous and current transcript line counts exceeds the maintained diff-cell limit
- **THEN** the UI avoids allocating the full LCS matrix and labels or renders a bounded comparison summary
