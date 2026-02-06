## ADDED Requirements

### Requirement: specsPath documentation in customization guide

The documentation SHALL include a `specsPath` configuration section in `docs/customization.md` that explains how to configure a custom specs directory.

#### Scenario: User reads documentation to configure custom path
- **WHEN** a user wants to store specs in a custom location
- **THEN** the documentation SHALL explain the `specsPath` config option
- **AND** provide a YAML example showing the configuration

#### Scenario: Documentation explains default behavior
- **WHEN** a user reads the specsPath documentation
- **THEN** the documentation SHALL state that the default is `openspec/specs`
- **AND** explain that the path is relative to the project root

### Requirement: Cross-platform path format documentation

The documentation SHALL explain cross-platform path conventions for `specsPath`.

#### Scenario: User configures path on Windows
- **WHEN** a Windows user reads the documentation
- **THEN** it SHALL explain that both `/` and `\` separators are accepted
- **AND** the same config works on all platforms

#### Scenario: Documentation shows path format examples
- **WHEN** a user reads the specsPath documentation
- **THEN** it SHALL include examples like `docs/specs` and `contracts/api`

### Requirement: openspec update requirement documentation

The documentation SHALL explain that `openspec update` must be run after changing `specsPath`.

#### Scenario: User changes specsPath
- **WHEN** a user reads about changing the specsPath
- **THEN** the documentation SHALL instruct them to run `openspec update`
- **AND** explain that this regenerates skill files with the new path

### Requirement: Placeholder guidance for schema authors

The documentation SHALL include guidance for custom schema authors on using `{{specsPath}}` placeholder.

#### Scenario: Schema author reads documentation
- **WHEN** a custom schema author reads the documentation
- **THEN** it SHALL explain the `{{specsPath}}` placeholder syntax
- **AND** provide a YAML example showing usage in schema instructions
- **AND** recommend using the placeholder instead of hardcoding paths
