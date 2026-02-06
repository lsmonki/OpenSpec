## ADDED Requirements

### Requirement: Project config supports allowExternalPaths field

The system SHALL accept an optional `allowExternalPaths` boolean field in `openspec/config.yaml` that controls whether `specsPath` may resolve outside the project root. The default value SHALL be `false`.

#### Scenario: Config with allowExternalPaths true
- **WHEN** `openspec/config.yaml` contains `allowExternalPaths: true`
- **THEN** the system SHALL permit `specsPath` values that resolve outside the project root

#### Scenario: Config without allowExternalPaths
- **WHEN** `openspec/config.yaml` does not contain an `allowExternalPaths` field
- **THEN** the system SHALL default to `false` (reject external paths)

#### Scenario: Config with invalid allowExternalPaths
- **WHEN** `openspec/config.yaml` contains `allowExternalPaths: "yes"`
- **THEN** the system SHALL emit a warning and ignore the field (treating it as `false`)

### Requirement: resolveSpecsPaths validates path security

The system SHALL call `validateConfigPath` from within `resolveSpecsPaths` after resolving the absolute path. `validateConfigPath` SHALL read `allowExternalPaths` from the project config internally. The `resolveSpecsPaths` function signature SHALL NOT change.

#### Scenario: External specsPath without allowExternalPaths in config
- **WHEN** `resolveSpecsPaths` is called with specsPath `../../outside`
- **AND** the project config does not contain `allowExternalPaths: true`
- **THEN** the function SHALL throw an error suggesting `allowExternalPaths: true` in config

#### Scenario: External specsPath with allowExternalPaths in config
- **WHEN** `resolveSpecsPaths` is called with specsPath `../shared-specs`
- **AND** the project config contains `allowExternalPaths: true`
- **THEN** the function SHALL return the resolved paths and emit a one-time warning

#### Scenario: Internal specsPath passes validation
- **WHEN** `resolveSpecsPaths` is called with specsPath `docs/specs`
- **THEN** the function SHALL return the resolved paths without error or warning regardless of config

## MODIFIED Requirements

### Requirement: Project config supports specsPath field

The system SHALL accept an optional `specsPath` field in `openspec/config.yaml` that specifies the directory path for specifications, relative to the project root.

#### Scenario: Config with custom specsPath
- **WHEN** `openspec/config.yaml` contains `specsPath: docs/specs`
- **THEN** the system SHALL use `docs/specs` as the specs directory

#### Scenario: Config without specsPath
- **WHEN** `openspec/config.yaml` does not contain a `specsPath` field
- **THEN** the system SHALL default to `openspec/specs`

#### Scenario: Config with empty specsPath
- **WHEN** `openspec/config.yaml` contains `specsPath: ""`
- **THEN** the system SHALL reject the configuration with a validation error

#### Scenario: Config with whitespace-only specsPath
- **WHEN** `openspec/config.yaml` contains `specsPath: "   "`
- **THEN** the system SHALL treat it as unset and default to `openspec/specs`

### Requirement: Path resolution utility provides three representations

The system SHALL provide a `resolveSpecsPaths` function that returns three path representations from a configured `specsPath` value:
- `absolute`: Full OS-native path for file I/O operations
- `relative`: Path relative to project root with OS-native separators
- `relativePosix`: Path relative to project root with forward slashes (for prompts)

The function signature SHALL remain unchanged — security validation is handled internally by `validateConfigPath`.

#### Scenario: Path resolution on Unix
- **WHEN** `resolveSpecsPaths` is called with projectRoot `/home/user/project` and specsPath `docs/specs`
- **THEN** `absolute` SHALL be `/home/user/project/docs/specs`
- **AND** `relative` SHALL be `docs/specs`
- **AND** `relativePosix` SHALL be `docs/specs`

#### Scenario: Path resolution on Windows
- **WHEN** `resolveSpecsPaths` is called with projectRoot `C:\Users\user\project` and specsPath `docs/specs`
- **THEN** `absolute` SHALL be `C:\Users\user\project\docs\specs`
- **AND** `relative` SHALL be `docs\specs`
- **AND** `relativePosix` SHALL be `docs/specs`

#### Scenario: Default path when specsPath is undefined
- **WHEN** `resolveSpecsPaths` is called with specsPath undefined
- **THEN** the function SHALL use `openspec/specs` as the default value

#### Scenario: Empty string specsPath falls back to default
- **WHEN** `resolveSpecsPaths` is called with specsPath `""`
- **THEN** the function SHALL use `openspec/specs` as the default value

#### Scenario: Whitespace-only specsPath falls back to default
- **WHEN** `resolveSpecsPaths` is called with specsPath `"   "`
- **THEN** the function SHALL use `openspec/specs` as the default value
