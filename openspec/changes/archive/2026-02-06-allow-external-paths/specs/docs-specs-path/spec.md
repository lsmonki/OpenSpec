## ADDED Requirements

### Requirement: allowExternalPaths documentation in customization guide

The documentation SHALL include an `allowExternalPaths` subsection within the "Custom Specs Directory" section of `docs/customization.md` that explains how to enable external paths, the security restrictions, and monorepo usage patterns.

#### Scenario: User reads about allowExternalPaths flag
- **WHEN** a user wants to point specs outside the project root
- **THEN** the documentation SHALL explain the `allowExternalPaths: true` config option
- **AND** provide a YAML example showing `specsPath` with `allowExternalPaths` together

#### Scenario: Documentation explains security behavior
- **WHEN** a user reads the allowExternalPaths documentation
- **THEN** the documentation SHALL explain:
- **AND** that external paths are blocked by default (error with suggestion)
- **AND** that allowed external paths emit a one-time warning
- **AND** that system directories are always blocked regardless of the flag
- **AND** that paths with more than 3 `..` segments are always blocked

#### Scenario: Documentation shows monorepo use case
- **WHEN** a user reads the allowExternalPaths documentation
- **THEN** it SHALL include a monorepo example showing shared specs across projects
- **AND** show the directory structure with the external specs path

### Requirement: Security restrictions documentation

The documentation SHALL explain the security restrictions that apply to `specsPath` regardless of `allowExternalPaths`.

#### Scenario: User reads about system directory restrictions
- **WHEN** a user reads the security restrictions
- **THEN** the documentation SHALL list the categories of protected directories per platform (Linux, macOS, Windows)
- **AND** explain that these paths are always blocked

#### Scenario: User reads about depth limit
- **WHEN** a user reads the security restrictions
- **THEN** the documentation SHALL explain the maximum of 3 `..` segments
- **AND** provide examples of valid and invalid depths
