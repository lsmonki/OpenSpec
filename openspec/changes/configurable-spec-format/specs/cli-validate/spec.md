## MODIFIED Requirements

### Requirement: Validation SHALL provide actionable remediation steps
Validation output SHALL include specific guidance to fix each error, including expected structure, example headers, and suggested commands to verify fixes. Error messages SHALL use schema-configured values instead of hardcoded patterns.

#### Scenario: No deltas found in change
- **WHEN** validating a change with zero parsed deltas
- **THEN** show error "No deltas found" with guidance:
  - Explain that change specs must include delta operation headers derived from the schema's `sections.requirement.section` (e.g., `## ADDED Requirements`, `## ADDED Functional Requirements`)
  - Remind authors that files must live under `openspec/changes/{id}/specs/<capability>/spec.md`
  - Include an explicit note: "Spec delta files cannot start with titles before the operation headers"
  - Suggest running `openspec change show {id} --json --deltas-only` for debugging

#### Scenario: Missing required sections
- **WHEN** a required section is missing
- **THEN** include expected header names from the schema's `sections.required` configuration:
  - For Spec: headers from the specs artifact's `sections.required` (default: `## Purpose`, `## Requirements`)
  - For Change: `## Why`, `## What Changes`
  - Provide an example snippet of the missing section with placeholder prose ready to copy
  - Mention the quick-reference section in `openspec/AGENTS.md` as the authoritative template

#### Scenario: Missing requirement descriptive text
- **WHEN** a requirement header lacks descriptive text before scenarios
- **THEN** emit an error explaining that requirement headers (using the schema's `sections.requirement.pattern`) must be followed by narrative text before any scenario headers
  - Show compliant example using the configured requirement pattern
  - Suggest adding 1-2 sentences describing the normative behavior prior to listing scenarios
  - Reference the pre-validation checklist in `openspec/AGENTS.md`

### Requirement: Validator SHALL detect likely misformatted scenarios and warn with a fix
The validator SHALL recognize bulleted lines that look like scenarios (e.g., lines beginning with WHEN/THEN/AND) and emit a targeted warning with a conversion example using the schema-configured scenario pattern.

#### Scenario: Bulleted WHEN/THEN under a Requirement
- **WHEN** bullets that start with WHEN/THEN/AND are found under a requirement without any scenario headers matching the schema's `specValidation.pattern`
- **THEN** emit warning: "Scenarios must use the configured scenario header", and show a conversion template using the schema's pattern (e.g., `#### Scenario:` or `### Scenario:` depending on configuration)

### Requirement: Bulk and filtered validation
The validate command SHALL support flags for bulk validation (--all) and filtered validation by type (--changes, --specs).

#### Scenario: Validate everything
- **WHEN** executing `openspec validate --all`
- **THEN** validate all changes in openspec/changes/ (excluding archive)
- **AND** validate all specs in openspec/specs/
- **AND** display a summary showing passed/failed items
- **AND** exit with code 1 if any validation fails

#### Scenario: Scope of bulk validation
- **WHEN** validating with `--all` or `--changes`
- **THEN** include all change proposals under `openspec/changes/`
- **AND** exclude the `openspec/changes/archive/` directory

- **WHEN** validating with `--specs`
- **THEN** include all specs that have files matching the schema's spec artifact patterns under `openspec/specs/<id>/`

#### Scenario: Validate all changes
- **WHEN** executing `openspec validate --changes`
- **THEN** validate all changes in openspec/changes/ (excluding archive)
- **AND** display results for each change
- **AND** show summary statistics

#### Scenario: Validate all specs
- **WHEN** executing `openspec validate --specs`
- **THEN** validate all specs in openspec/specs/
- **AND** display results for each spec
- **AND** show summary statistics

## ADDED Requirements

### Requirement: Schema-Aware Spec File Discovery
The validator SHALL discover spec files based on the schema's artifact configuration rather than hardcoding `spec.md`.

#### Scenario: Discover spec files from schema artifacts
- **WHEN** validating specs with a schema that defines multiple output artifacts (e.g., specs and spec-verify)
- **THEN** the validator discovers all files matching each artifact's `generates` pattern

#### Scenario: Validate spec file presence
- **WHEN** a schema artifact generates `specs/**/verify.md` with no explicit optional flag
- **THEN** the validator reports an error if `verify.md` is missing from a spec directory

#### Scenario: Default spec file discovery
- **WHEN** validating specs with the default `spec-driven` schema
- **THEN** the validator looks for `spec.md` files (maintaining backward compatibility)

### Requirement: Schema-Aware Section Validation
The validator SHALL validate section presence based on the schema's artifact `sections.required` configuration.

#### Scenario: Validate custom required sections
- **WHEN** a schema's specs artifact specifies `sections.required: ["Purpose", "Functional Requirements"]`
- **THEN** the validator reports errors for specs missing either `## Purpose` or `## Functional Requirements`

#### Scenario: Validate default required sections
- **WHEN** validating specs with no explicit `sections.required` configuration
- **THEN** the validator uses the defaults: `## Purpose` and `## Requirements`

#### Scenario: Validate requirement section name
- **WHEN** a schema specifies `sections.requirement.section: "Functional Requirements"`
- **THEN** the validator looks for requirements under `## Functional Requirements` instead of `## Requirements`

### Requirement: Schema-Aware Requirement Pattern Matching
The validator SHALL identify requirements using the schema's configured `sections.requirement.pattern`.

#### Scenario: Match custom requirement pattern
- **WHEN** a schema specifies `sections.requirement.pattern: "## RF-{name}:"`
- **THEN** the validator recognizes `## RF-001: Login` as a valid requirement header

#### Scenario: Match default requirement pattern
- **WHEN** validating with no explicit requirement pattern configuration
- **THEN** the validator uses `### Requirement: {name}` as the pattern

#### Scenario: Report unrecognized requirement format
- **WHEN** a spec contains `### Req: Something` but the schema expects `### Requirement: {name}`
- **THEN** the validator reports a warning suggesting the expected format

### Requirement: Schema-Aware Scenario Validation
The validator SHALL validate scenarios based on the schema's `specValidation` configuration.

#### Scenario: Validate scenarios in separate file
- **WHEN** a schema specifies `specValidation.artifact: "spec-verify"` pointing to a `verify.md` artifact
- **THEN** the validator looks for scenarios in `verify.md` instead of `spec.md`

#### Scenario: Validate inline scenarios
- **WHEN** a schema specifies `specValidation.artifact: "specs"` (or uses the default)
- **THEN** the validator expects scenarios inline in `spec.md`

#### Scenario: Match custom scenario pattern
- **WHEN** a schema specifies `specValidation.pattern: "### Scenario: {name}"`
- **THEN** the validator recognizes `### Scenario: Valid login` as a valid scenario header

#### Scenario: Skip scenario validation when not required
- **WHEN** a schema specifies `specValidation.required: false`
- **THEN** the validator does not report errors for requirements without scenarios

#### Scenario: Require scenarios by default
- **WHEN** validating with no explicit `specValidation.required` configuration
- **THEN** the validator treats scenarios as required and reports errors for missing scenarios

### Requirement: Schema-Aware Normative Keyword Validation
The validator SHALL validate that requirements match the normative keyword pattern based on the schema's `specValidation.shallMustPattern` configuration.

#### Scenario: Validate with default pattern
- **WHEN** validating requirements with no explicit `shallMustPattern` configuration
- **THEN** the validator uses the default pattern "SHALL|MUST" and reports errors for non-matching requirements

#### Scenario: Skip validation when pattern is null
- **WHEN** a schema specifies `specValidation.shallMustPattern: null`
- **THEN** the validator does not report errors for requirements without normative keywords

#### Scenario: Skip validation when pattern is empty
- **WHEN** a schema specifies `specValidation.shallMustPattern: ""`
- **THEN** the validator does not report errors for requirements without normative keywords

#### Scenario: Validate with custom pattern
- **WHEN** a schema specifies a custom pattern like `"[Ss]hould|[Mm]ust"`
- **THEN** the validator uses that regex pattern to validate requirement text
- **AND** "The system should log errors" passes validation
- **AND** "The system MUST authenticate" passes validation

#### Scenario: Validate with Spanish normative keywords
- **WHEN** a schema specifies `shallMustPattern: "DEBE|DEBERÁ|TIENE QUE"`
- **THEN** the validator accepts Spanish normative language
- **AND** "El sistema DEBE validar la entrada" passes validation
- **AND** "The system SHALL validate" fails validation

#### Scenario: Requirement matches pattern
- **WHEN** a requirement's description text matches the configured `shallMustPattern` regex
- **THEN** the validator considers the requirement valid

### Requirement: CLI Loads Project Schema Configuration
The validate command SHALL load the project's schema configuration and use it for validation.

#### Scenario: Load schema from project config
- **WHEN** executing `openspec validate` in a project with `.openspec.yaml` containing a `schema` field
- **THEN** the validator loads the referenced schema and uses its validation configuration

#### Scenario: Use schema-configured validation rules
- **WHEN** the project schema specifies custom `specValidation` or `sections` configuration
- **THEN** the validator applies those rules instead of hardcoded defaults

#### Scenario: Fallback to defaults without project config
- **WHEN** executing `openspec validate` without a project `.openspec.yaml` or without a `schema` field
- **THEN** the validator uses default validation rules (shallMustPattern: "SHALL|MUST", scenariosRequired: true, etc.)

### Requirement: Schema-Aware Delta Validation
The validator SHALL validate delta specs using headers derived from the schema's requirement section configuration.

#### Scenario: Validate delta headers with custom requirement section
- **WHEN** a schema specifies `sections.requirement.section: "Functional Requirements"`
- **THEN** the validator recognizes `## ADDED Functional Requirements`, `## MODIFIED Functional Requirements`, `## REMOVED Functional Requirements`, and `## RENAMED Functional Requirements` as valid delta headers

#### Scenario: Validate delta headers with default requirement section
- **WHEN** validating with no explicit requirement section configuration
- **THEN** the validator recognizes `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, and `## RENAMED Requirements`

#### Scenario: Report unrecognized delta header
- **WHEN** a delta spec uses `## ADDED Requirements` but the schema expects `## ADDED Functional Requirements`
- **THEN** the validator reports an error with the expected format
