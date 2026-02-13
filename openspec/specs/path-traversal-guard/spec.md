# path-traversal-guard Specification

## Purpose
Provide a reusable `validateConfigPath` function that guards any user-configurable path (`specsPath`, and future `changesPath`, `schemasPath`, etc.) against unsafe resolution. Enforces three defense layers in strict order: a parent-traversal depth limit (max 3 `..` segments), a platform-aware system-directory denylist (Linux, macOS, Windows), and project-root containment controlled by the `allowExternalPaths` config flag. The function reads config internally so callers need zero boilerplate, and emits a one-time warning per field name when external paths are explicitly allowed.

## Requirements
### Requirement: Generic path validation rejects protected system directories

The system SHALL provide a `validateConfigPath` function that rejects any resolved absolute path that falls within a protected system directory. This validation SHALL apply regardless of `allowExternalPaths` configuration and SHALL be platform-aware.

Protected directories:
- **Linux**: `/etc`, `/usr`, `/bin`, `/sbin`, `/boot`, `/proc`, `/sys`, `/dev`, `/root`
- **macOS**: `/System`, `/Library`, `/Applications`, `/etc`, `/usr`, `/bin`, `/sbin`
- **Windows**: `C:\Windows`, `C:\Program Files`, `C:\Program Files (x86)`, `C:\ProgramData`

The function SHALL accept a `fieldName` parameter used in error messages, making it reusable for any configurable path (e.g., `specsPath`, `changesPath`, `archivePath`).

#### Scenario: Path resolves to Linux system directory
- **WHEN** `validateConfigPath` is called with a path resolving to `/etc/openspec`
- **AND** the platform is `linux` or `darwin`
- **THEN** the function SHALL throw an error with message containing the field name and the denied directory

#### Scenario: Path resolves to macOS system directory
- **WHEN** `validateConfigPath` is called with a path resolving to `/System/Library/specs`
- **AND** the platform is `darwin`
- **THEN** the function SHALL throw an error regardless of `allowExternal` value

#### Scenario: Path resolves to Windows system directory
- **WHEN** `validateConfigPath` is called with a path resolving to `C:\Windows\specs`
- **AND** the platform is `win32`
- **THEN** the function SHALL throw an error regardless of `allowExternal` value

#### Scenario: Windows denylist is case-insensitive
- **WHEN** `validateConfigPath` is called with a path resolving to `c:\windows\specs`
- **AND** the platform is `win32`
- **THEN** the function SHALL throw an error (case-insensitive match)

#### Scenario: Path does not match any denied prefix
- **WHEN** `validateConfigPath` is called with a path resolving to `/home/user/shared-specs`
- **THEN** the denylist check SHALL pass (other validations may still apply)

#### Scenario: Protected directory check uses only current platform
- **WHEN** `validateConfigPath` is called on `linux` with a path containing `C:\Windows`
- **THEN** the denylist check SHALL pass (Windows prefixes are not checked on Linux)

### Requirement: Generic path validation enforces parent traversal depth limit

The system SHALL reject any configurable path containing more than 3 `..` segments. This limit SHALL apply regardless of `allowExternalPaths` configuration. The count SHALL be performed on raw path segments before resolution.

#### Scenario: Path with 3 parent traversals
- **WHEN** `validateConfigPath` is called with raw segments containing 3 `..` entries
- **THEN** the validation SHALL pass (other validations may still apply)

#### Scenario: Path with 4 parent traversals
- **WHEN** `validateConfigPath` is called with raw segments containing 4 `..` entries
- **THEN** the function SHALL throw an error with message indicating the count and the maximum

#### Scenario: Scattered parent traversals are counted
- **WHEN** `validateConfigPath` is called with raw segments `['a', '..', 'b', '..', 'c', '..', '..']`
- **THEN** the function SHALL count 4 `..` segments and throw an error

### Requirement: Generic path validation enforces project root containment

The system SHALL reject any configurable path that resolves outside the project root when `allowExternalPaths` is `false` in the project config. When `allowExternalPaths` is `true`, the system SHALL emit a one-time warning per field name instead of throwing. The `validateConfigPath` function SHALL read the config via `readProjectConfig(projectRoot)` by default, but accept an optional `allowExternal` parameter to override for testing.

#### Scenario: Path outside root with allowExternal false
- **WHEN** `validateConfigPath` is called with a path resolving outside project root
- **AND** `allowExternal` is `false`
- **THEN** the function SHALL throw an error suggesting the `allowExternalPaths` config flag

#### Scenario: Path outside root with allowExternal true
- **WHEN** `validateConfigPath` is called with a path resolving outside project root
- **AND** `allowExternal` is `true`
- **THEN** the function SHALL emit a warning to stderr with the resolved path
- **AND** the function SHALL NOT throw an error

#### Scenario: Warning fires once per field name
- **WHEN** `validateConfigPath` is called twice with the same `fieldName` and an external path
- **AND** `allowExternal` is `true`
- **THEN** the warning SHALL be emitted only on the first call

#### Scenario: Warnings are independent per field name
- **WHEN** `validateConfigPath` is called with `fieldName: 'specsPath'` and an external path
- **AND** then called with `fieldName: 'changesPath'` and an external path
- **THEN** both calls SHALL emit their respective warnings

#### Scenario: Path inside root with allowExternal false
- **WHEN** `validateConfigPath` is called with a path resolving inside project root
- **AND** `allowExternal` is `false`
- **THEN** the function SHALL NOT throw an error and SHALL NOT emit a warning

#### Scenario: Path inside root with allowExternal true
- **WHEN** `validateConfigPath` is called with a path resolving inside project root
- **AND** `allowExternal` is `true`
- **THEN** the function SHALL NOT throw an error and SHALL NOT emit a warning

### Requirement: Validation order is depth then denylist then containment

The system SHALL validate in this order: parent traversal depth, system directory denylist, project root containment. If an earlier check fails, later checks SHALL NOT run.

#### Scenario: Path with excessive depth targeting system directory
- **WHEN** `validateConfigPath` is called with 4 `..` segments resolving to `/etc`
- **THEN** the error SHALL reference the depth limit, not the system directory

#### Scenario: Path targeting system directory from within depth limit
- **WHEN** `validateConfigPath` is called with 2 `..` segments resolving to `/etc/specs`
- **THEN** the error SHALL reference the system directory denylist
