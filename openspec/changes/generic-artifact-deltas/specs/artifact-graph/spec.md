# Specification (Delta)

## MODIFIED Requirements

### Requirement: Schema-Level Configuration
The system SHALL support optional schema-level configuration for `changeVerify` and `requiredSpecArtifacts`.

#### Scenario: Load changeVerify config
- **WHEN** a schema.yaml contains a `changeVerify` block with `artifact`, `requirementPattern`, and `scenarioPattern` fields
- **THEN** the loaded schema includes the complete `changeVerify` object

#### Scenario: Apply changeVerify defaults
- **WHEN** a schema.yaml omits the `changeVerify` block
- **THEN** the system defaults to `{ artifact: "specs", requirementPattern: "### Requirement: {name}", scenarioPattern: "#### Scenario: {name}" }`

#### Scenario: Load requiredSpecArtifacts config
- **WHEN** a schema.yaml contains a `requiredSpecArtifacts` array
- **THEN** the loaded schema includes the specified artifact IDs

#### Scenario: Apply requiredSpecArtifacts defaults
- **WHEN** a schema.yaml omits the `requiredSpecArtifacts` field
- **THEN** the system defaults to `["specs"]`

### Requirement: Artifact Sections Configuration
The system SHALL support optional `deltas[]` and `validations[]` configuration on artifact definitions to specify delta merge behavior and structural validation rules.

#### Scenario: Load deltas[] config
- **WHEN** an artifact definition includes a `deltas` array with entries containing `section` and `pattern`
- **THEN** the loaded artifact includes the delta merge configuration for each entry

#### Scenario: Load validations[] config
- **WHEN** an artifact definition includes a `validations` array with entries containing `pattern`, `required`, and optionally `scope` or `eachBlock`
- **THEN** the loaded artifact includes the structural validation rules

#### Scenario: Apply deltas defaults for specs artifact
- **WHEN** an artifact with id "specs" omits the `deltas` configuration
- **THEN** the system defaults to `[{ section: "Requirements", pattern: "### Requirement: {name}" }]`

#### Scenario: Apply validations defaults for specs artifact
- **WHEN** an artifact with id "specs" omits the `validations` configuration
- **THEN** the system defaults to validations requiring `## Purpose`, `## Requirements`, requirement blocks within Requirements, scenarios in each requirement block, and normative keywords in each requirement block

#### Scenario: Non-spec artifacts without deltas
- **WHEN** an artifact definition omits `deltas` and is not the specs artifact
- **THEN** the loaded artifact has `deltas` as undefined (no defaults applied)

#### Scenario: Multiple delta sections per artifact
- **WHEN** an artifact defines `deltas` with two entries (e.g., Requirements and Constraints)
- **THEN** both delta sections are loaded and available for delta merge operations

### Requirement: Schema Validation for New Fields
The system SHALL validate the structure of new schema fields during schema loading.

#### Scenario: Invalid changeVerify type
- **WHEN** `changeVerify` is present but not an object
- **THEN** the system throws an error describing the expected structure

#### Scenario: Invalid deltas entry
- **WHEN** a `deltas[]` entry is missing `section` or `pattern`
- **THEN** the system throws an error describing the required fields

#### Scenario: Invalid validations entry
- **WHEN** a `validations[]` entry has both `scope` and `eachBlock` set
- **THEN** the system throws an error explaining they are mutually exclusive

#### Scenario: Pattern missing placeholder
- **WHEN** a `deltas[].pattern` string does not contain `{name}` placeholder
- **THEN** the system throws an error explaining that patterns must include `{name}`

## ADDED Requirements

### Requirement: Artifact Filename Resolution
The system SHALL resolve each artifact's output filename from `generates` (last path segment if concrete) or `template` (fallback when generates has wildcards).

#### Scenario: Resolve filename from concrete generates path
- **WHEN** an artifact has `generates: "specs/**/verify.md"`
- **THEN** the resolved filename is `verify.md`

#### Scenario: Resolve filename fallback to template
- **WHEN** an artifact has `generates: "specs/**/*.md"` and `template: spec.md`
- **THEN** the resolved filename is `spec.md`

#### Scenario: Resolve requiredSpecArtifacts to file list
- **WHEN** `requiredSpecArtifacts` is `['specs', 'spec-verify']`
- **AND** `specs` artifact resolves to `spec.md` with `deltas[]`
- **AND** `spec-verify` artifact resolves to `verify.md` with `deltas[]`
- **THEN** the resolved list is `[{ filename: 'spec.md', deltas: [...] }, { filename: 'verify.md', deltas: [...] }]`

## REMOVED Requirements

- `### Requirement: Schema with validation config loaded`
- `### Requirement: Schema with artifact sections loaded`
