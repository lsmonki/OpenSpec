## ADDED Requirements

### Requirement: Placeholder Replacement in Instructions

The system SHALL replace placeholders in instruction text with configured values before returning instructions.

#### Scenario: Replace specsPath placeholder
- **WHEN** loading instructions containing `{{specsPath}}`
- **AND** project config has `specsPath: docs/specs`
- **THEN** the instruction text SHALL contain `docs/specs` instead of `{{specsPath}}`

#### Scenario: Default specsPath when not configured
- **WHEN** loading instructions containing `{{specsPath}}`
- **AND** project config does not have `specsPath`
- **THEN** the instruction text SHALL contain `openspec/specs` instead of `{{specsPath}}`

#### Scenario: Multiple placeholders in same instruction
- **WHEN** an instruction contains `{{specsPath}}` multiple times
- **THEN** all occurrences SHALL be replaced

#### Scenario: Extensible placeholder map
- **WHEN** the placeholder replacement system is invoked
- **THEN** it SHALL accept a key-value map of placeholders
- **AND** replace all matching `{{key}}` patterns with their values

### Requirement: Legacy Path Migration Warning

The system SHALL detect and warn about hardcoded `openspec/specs` paths in custom schemas.

#### Scenario: Hardcoded path in custom schema instruction
- **WHEN** loading instructions from a custom schema
- **AND** the instruction contains hardcoded `openspec/specs`
- **AND** project config has a different `specsPath`
- **THEN** the system SHALL replace `openspec/specs` with the configured path
- **AND** emit a warning suggesting migration to `{{specsPath}}`

#### Scenario: Hardcoded path in built-in schema
- **WHEN** loading instructions from a built-in schema
- **AND** the instruction contains hardcoded `openspec/specs`
- **THEN** the system SHALL replace it silently without warning
