# cli-validate Specification

## Purpose
TBD - created by archiving change improve-validate-error-messages. Update Purpose after archive.
## Requirements
### Requirement: Validation SHALL provide actionable remediation steps
Validation output SHALL include specific guidance to fix each error, including expected structure, example headers, and suggested commands to verify fixes. Error messages SHALL use schema-configured values instead of hardcoded patterns.

#### Scenario: No deltas found in change
- **WHEN** validating a change with zero parsed deltas
- **THEN** show error "No deltas found" with guidance:
  - Explain that change specs must include delta operation headers derived from the schema's `deltas[].section` (e.g., `## ADDED Requirements`, `## ADDED Functional Requirements`)
  - Remind authors that files must live under `openspec/changes/{id}/specs/<capability-path>/spec.md`
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

### Requirement: All issues SHALL include file paths and structured locations
Error, warning, and info messages SHALL include:
- Source file path (`openspec/changes/{id}/proposal.md`, `.../specs/{cap}/spec.md`)
- Structured path (e.g., `deltas[0].requirements[0].scenarios`)

#### Scenario: Zod validation error
- **WHEN** a schema validation fails
- **THEN** the message SHALL include `file`, `path`, and a remediation hint if applicable

### Requirement: Invalid results SHALL include a Next steps footer in human-readable output
The CLI SHALL append a Next steps footer when the item is invalid and not using `--json`, including:
- Summary line with counts
- Top-3 guidance bullets (contextual to the most frequent or blocking errors)
- A suggestion to re-run with `--json` and/or the debug command

#### Scenario: Change invalid summary
- **WHEN** a change validation fails
- **THEN** print "Next steps" with 2-3 targeted bullets and suggest `openspec change show <id> --json --deltas-only`

### Requirement: Top-level validate command

The CLI SHALL provide a top-level `validate` command for validating changes and specs with flexible selection options.

#### Scenario: Interactive validation selection

- **WHEN** executing `openspec validate` without arguments
- **THEN** prompt user to select what to validate (all, changes, specs, or specific item)
- **AND** perform validation based on selection
- **AND** display results with appropriate formatting

#### Scenario: Non-interactive environments do not prompt

- **GIVEN** stdin is not a TTY or `--no-interactive` is provided or environment variable `OPEN_SPEC_INTERACTIVE=0`
- **WHEN** executing `openspec validate` without arguments
- **THEN** do not prompt interactively
- **AND** print a helpful hint listing available commands/flags and exit with code 1

#### Scenario: Direct item validation

- **WHEN** executing `openspec validate <item-name>`
- **THEN** automatically detect if item is a change or spec
- **AND** validate the specified item
- **AND** display validation results

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

### Requirement: Validation options and progress indication

The validate command SHALL support standard validation options (--strict, --json) and display progress during bulk operations.

#### Scenario: Strict validation

- **WHEN** executing `openspec validate --all --strict`
- **THEN** apply strict validation to all items
- **AND** treat warnings as errors
- **AND** fail if any item has warnings or errors

#### Scenario: JSON output

- **WHEN** executing `openspec validate --all --json`
- **THEN** output validation results as JSON
- **AND** include detailed issues for each item
- **AND** include summary statistics

#### Scenario: JSON output schema for bulk validation

- **WHEN** executing `openspec validate --all --json` (or `--changes` / `--specs`)
- **THEN** output a JSON object with the following shape:
  - `items`: Array of objects with fields `{ id: string, type: "change"|"spec", valid: boolean, issues: Issue[], durationMs: number }`
  - `summary`: Object `{ totals: { items: number, passed: number, failed: number }, byType: { change?: { items: number, passed: number, failed: number }, spec?: { items: number, passed: number, failed: number } } }`
  - `version`: String identifier for the schema (e.g., `"1.0"`)
- **AND** exit with code 1 if any `items[].valid === false`

Where `Issue` follows the existing per-item validation report shape `{ level: "ERROR"|"WARNING"|"INFO", path: string, message: string }`.

#### Scenario: Show validation progress

- **WHEN** validating multiple items (--all, --changes, or --specs)
- **THEN** show progress indicator or status updates
- **AND** indicate which item is currently being validated
- **AND** display running count of passed/failed items

#### Scenario: Concurrency limits for performance

- **WHEN** validating multiple items
- **THEN** run validations with a bounded concurrency (e.g., 4–8 in parallel)
- **AND** ensure progress indicators remain responsive

### Requirement: Item type detection and ambiguity handling

The validate command SHALL handle ambiguous names and explicit type overrides to ensure clear, deterministic behavior.

#### Scenario: Direct item validation with automatic type detection

- **WHEN** executing `openspec validate <item-name>`
- **THEN** if `<item-name>` uniquely matches a change or a spec, validate that item

#### Scenario: Ambiguity between change and spec names

- **GIVEN** `<item-name>` exists both as a change and as a spec
- **WHEN** executing `openspec validate <item-name>`
- **THEN** print an ambiguity error explaining both matches
- **AND** suggest passing `--type change` or `--type spec`, or using `openspec change validate` / `openspec spec validate`
- **AND** exit with code 1 without performing validation

#### Scenario: Unknown item name

- **WHEN** the `<item-name>` matches neither a change nor a spec
- **THEN** print a not-found error
- **AND** show nearest-match suggestions when available
- **AND** exit with code 1

#### Scenario: Explicit type override

- **WHEN** executing `openspec validate --type change <item>`
- **THEN** treat `<item>` as a change ID and validate it (skipping auto-detection)

- **WHEN** executing `openspec validate --type spec <item>`
- **THEN** treat `<item>` as a spec ID and validate it (skipping auto-detection)

### Requirement: Interactivity controls

- The CLI SHALL respect `--no-interactive` to disable prompts.
- The CLI SHALL respect `OPEN_SPEC_INTERACTIVE=0` to disable prompts globally.
- Interactive prompts SHALL only be shown when stdin is a TTY and interactivity is not disabled.

#### Scenario: Disabling prompts via flags or environment

- **WHEN** `openspec validate` is executed with `--no-interactive` or with environment `OPEN_SPEC_INTERACTIVE=0`
- **THEN** the CLI SHALL not display interactive prompts
- **AND** SHALL print non-interactive hints or chosen outputs as appropriate

### Requirement: Parser SHALL handle cross-platform line endings
The markdown parser SHALL correctly identify sections regardless of line ending format (LF, CRLF, CR).

#### Scenario: Required sections parsed with CRLF line endings
- **GIVEN** a change proposal markdown saved with CRLF line endings
- **AND** the document contains `## Why` and `## What Changes`
- **WHEN** running `openspec validate <change-id>`
- **THEN** validation SHALL recognize the sections and NOT raise parsing errors

### Requirement: Spec structure validation reads project-level config

When performing spec structure validation during bulk validation (`--all` or `--specs`), the validate command SHALL read `specStructure` from the project-level config (`openspec/config.yaml`) and pass it as overrides to `getSpecStructureConfig()`.

#### Scenario: Project config specStructure overrides global for validation

- **WHEN** executing `openspec validate --specs`
- **AND** `openspec/config.yaml` contains `specStructure: { structure: 'flat' }`
- **AND** global config has `specStructure: { structure: 'auto' }`
- **THEN** spec structure validation SHALL use `structure: 'flat'`

#### Scenario: No project config specStructure falls back to global

- **WHEN** executing `openspec validate --specs`
- **AND** `openspec/config.yaml` exists but has no `specStructure` field
- **THEN** spec structure validation SHALL use global config values (unchanged behavior)

#### Scenario: No project config file falls back to global

- **WHEN** executing `openspec validate --specs`
- **AND** no `openspec/config.yaml` exists
- **THEN** spec structure validation SHALL use global config values (unchanged behavior)

### Requirement: Project config specStructure uses resilient sub-field parsing

The project config parser SHALL validate each `specStructure` sub-field independently. Invalid sub-fields are warned and skipped; valid sub-fields are kept.

#### Scenario: Partial validity in specStructure

- **WHEN** `openspec/config.yaml` contains:
  ```yaml
  specStructure:
    structure: flat
    maxDepth: "invalid"
    validatePaths: false
  ```
- **THEN** the parser SHALL keep `structure: 'flat'` and `validatePaths: false`
- **AND** warn about the invalid `maxDepth` value
- **AND** `maxDepth` SHALL fall through to global config or default

#### Scenario: Entirely invalid specStructure value

- **WHEN** `openspec/config.yaml` contains `specStructure: 42`
- **THEN** the parser SHALL warn that specStructure must be an object
- **AND** specStructure SHALL be treated as undefined (fall through to global/default)

#### Scenario: Valid complete specStructure

- **WHEN** `openspec/config.yaml` contains:
  ```yaml
  specStructure:
    structure: hierarchical
    maxDepth: 3
    allowMixed: false
    validatePaths: true
  ```
- **THEN** all four fields SHALL be parsed and available as project overrides

#### Scenario: Unknown sub-fields in specStructure

- **WHEN** `openspec/config.yaml` contains `specStructure: { structure: 'flat', unknownField: true }`
- **THEN** the parser SHALL ignore `unknownField` without warning
- **AND** `structure: 'flat'` SHALL be parsed normally

### Requirement: Spec structure validation enforces structure mode

When `specStructure.structure` is set to `'flat'` or `'hierarchical'`, `validateSpecStructure()` SHALL enforce that all specs conform to the chosen mode.

#### Scenario: Flat mode rejects hierarchical specs

- **WHEN** config has `structure: 'flat'`
- **AND** a spec has depth > 1 (e.g., `_global/testing`)
- **THEN** an ERROR SHALL be emitted: spec violates flat structure constraint

#### Scenario: Flat mode accepts flat specs

- **WHEN** config has `structure: 'flat'`
- **AND** all specs have depth 1 (e.g., `auth`, `payments`)
- **THEN** no structure enforcement errors SHALL be emitted

#### Scenario: Hierarchical mode rejects flat specs

- **WHEN** config has `structure: 'hierarchical'`
- **AND** a spec has depth 1 (e.g., `auth`)
- **THEN** an ERROR SHALL be emitted: spec violates hierarchical structure constraint

#### Scenario: Hierarchical mode accepts hierarchical specs

- **WHEN** config has `structure: 'hierarchical'`
- **AND** all specs have depth > 1 (e.g., `_global/testing`, `platform/api`)
- **THEN** no structure enforcement errors SHALL be emitted

#### Scenario: Auto mode does not enforce structure

- **WHEN** config has `structure: 'auto'`
- **THEN** no structure enforcement errors SHALL be emitted regardless of spec depths

### Requirement: Spec structure validation enforces allowMixed

When `specStructure.structure` is `'auto'` and `specStructure.allowMixed` is `false`, `validateSpecStructure()` SHALL detect mixing of flat and hierarchical specs.

#### Scenario: Mixed specs rejected when allowMixed is false

- **WHEN** config has `structure: 'auto'` and `allowMixed: false`
- **AND** specs contain both flat (depth 1) and hierarchical (depth > 1) specs
- **THEN** an ERROR SHALL be emitted indicating mixed structure is not allowed

#### Scenario: Uniform flat specs pass when allowMixed is false

- **WHEN** config has `structure: 'auto'` and `allowMixed: false`
- **AND** all specs have depth 1
- **THEN** no mixed-structure errors SHALL be emitted

#### Scenario: Uniform hierarchical specs pass when allowMixed is false

- **WHEN** config has `structure: 'auto'` and `allowMixed: false`
- **AND** all specs have depth > 1
- **THEN** no mixed-structure errors SHALL be emitted

#### Scenario: allowMixed is ignored when structure is explicit

- **WHEN** config has `structure: 'flat'` and `allowMixed: false`
- **THEN** the `allowMixed` check SHALL NOT run (structure mode already enforces uniformity)

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

