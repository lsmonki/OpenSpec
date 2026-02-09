## ADDED Requirements

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

### Requirement: Path resolution utility provides three representations

The system SHALL provide a `resolveSpecsPaths` function that returns three path representations from a configured `specsPath` value:
- `absolute`: Full OS-native path for file I/O operations
- `relative`: Path relative to project root with OS-native separators
- `relativePosix`: Path relative to project root with forward slashes (for prompts)

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

### Requirement: Cross-platform path normalization

The system SHALL normalize path separators in the `specsPath` config value, accepting both forward slashes and backslashes as input.

#### Scenario: Forward slash input
- **WHEN** `specsPath` is configured as `docs/specs`
- **THEN** the system SHALL parse it correctly on all platforms

#### Scenario: Backslash input
- **WHEN** `specsPath` is configured as `docs\specs`
- **THEN** the system SHALL parse it correctly on all platforms

#### Scenario: Mixed separator input
- **WHEN** `specsPath` is configured as `docs/api\specs`
- **THEN** the system SHALL parse it as three segments: `docs`, `api`, `specs`

### Requirement: Placeholder replacement in instructions

The system SHALL replace `{{specsPath}}` placeholders with the configured specs path (using `relativePosix` format) when loading instructions from schemas.

#### Scenario: Placeholder in schema instruction
- **WHEN** a schema instruction contains `Check {{specsPath}}/ for specs`
- **AND** `specsPath` is configured as `docs/specs`
- **THEN** the loaded instruction SHALL contain `Check docs/specs/ for specs`

#### Scenario: Multiple placeholders
- **WHEN** a schema instruction contains `{{specsPath}}` multiple times
- **THEN** all occurrences SHALL be replaced

#### Scenario: No placeholder
- **WHEN** a schema instruction does not contain `{{specsPath}}`
- **THEN** the instruction SHALL be returned unchanged

### Requirement: Legacy path auto-replacement with warning

The system SHALL automatically replace hardcoded `openspec/specs` strings with the configured `specsPath` value in custom schema instructions, and emit a warning suggesting migration to `{{specsPath}}`.

#### Scenario: Legacy path in custom schema
- **WHEN** a custom schema instruction contains hardcoded `openspec/specs`
- **AND** `specsPath` is configured as `docs/specs`
- **THEN** the system SHALL replace `openspec/specs` with `docs/specs`
- **AND** the system SHALL emit a warning naming the affected file

#### Scenario: No legacy replacement for placeholder
- **WHEN** a schema instruction uses `{{specsPath}}`
- **THEN** no legacy replacement warning SHALL be emitted

#### Scenario: Built-in schema with legacy path
- **WHEN** a built-in schema instruction contains hardcoded `openspec/specs`
- **THEN** the system SHALL replace it without emitting a warning
