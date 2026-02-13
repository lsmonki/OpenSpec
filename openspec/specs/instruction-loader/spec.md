# instruction-loader Specification

## Purpose
The instruction-loader loads instruction templates from schema directories, validates and enriches them with metadata and parameters (such as change context and dependency status), and exposes them for use by downstream services including template retrieval, parameter substitution, and enrichment.
## Requirements
### Requirement: Template Loading
The system SHALL load templates from schema directories.

#### Scenario: Load template from schema directory
- **WHEN** `loadTemplate(schemaName, templatePath)` is called
- **THEN** the system loads the template from `schemas/<schemaName>/templates/<templatePath>`

#### Scenario: Template file not found
- **WHEN** a template file does not exist in the schema's templates directory
- **THEN** the system throws an error with the template path

### Requirement: Change Context Loading
The system SHALL load change context combining graph and completion state.

#### Scenario: Load context for existing change
- **WHEN** `loadChangeContext(projectRoot, changeName)` is called for an existing change
- **THEN** the system returns a context with graph, completed set, schema name, and change info

#### Scenario: Load context with custom schema
- **WHEN** `loadChangeContext(projectRoot, changeName, schemaName)` is called
- **THEN** the system uses the specified schema instead of default

#### Scenario: Load context for non-existent change directory
- **WHEN** `loadChangeContext` is called for a non-existent change directory
- **THEN** the system returns context with empty completed set

### Requirement: Template Enrichment
The system SHALL enrich templates with change-specific context.

#### Scenario: Include artifact metadata
- **WHEN** instructions are generated for an artifact
- **THEN** the output includes change name, artifact ID, schema name, and output path

#### Scenario: Include dependency status
- **WHEN** an artifact has dependencies
- **THEN** the output shows each dependency with completion status (done/missing)

#### Scenario: Include unlocked artifacts
- **WHEN** instructions are generated
- **THEN** the output includes which artifacts become available after this one

#### Scenario: Root artifact indicator
- **WHEN** an artifact has no dependencies
- **THEN** the dependency section indicates this is a root artifact

### Requirement: Status Formatting
The system SHALL format change status as readable output.

#### Scenario: All artifacts completed
- **WHEN** all artifacts are completed
- **THEN** status shows all artifacts as "done"

#### Scenario: Mixed completion status
- **WHEN** some artifacts are completed
- **THEN** status shows completed as "done", ready as "ready", blocked as "blocked"

#### Scenario: Blocked artifact details
- **WHEN** an artifact is blocked
- **THEN** status shows which dependencies are missing

#### Scenario: Include output paths
- **WHEN** status is formatted
- **THEN** each artifact shows its output path pattern

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

