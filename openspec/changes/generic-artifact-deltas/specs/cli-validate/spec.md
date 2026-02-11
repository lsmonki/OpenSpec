# Specification (Delta)

## MODIFIED Requirements

### Requirement: Validation SHALL provide actionable remediation steps
Validation output SHALL include specific guidance to fix each error, including expected structure, example headers, and suggested commands to verify fixes. Error messages SHALL use schema-configured values from `deltas[]` and `validations[]` instead of hardcoded patterns.

#### Scenario: No deltas found in change
- **WHEN** validating a change with zero parsed deltas
- **THEN** show error "No deltas found" with guidance:
  - Explain that change specs must include delta operation headers derived from the artifact's `deltas[].section` (e.g., `## ADDED Requirements`, `## ADDED Functional Requirements`)
  - Remind authors that delta files must live under `openspec/changes/{id}/specs/<capability>/` with filenames matching the schema's artifact configuration
  - Include an explicit note: "Spec delta files cannot start with titles before the operation headers"
  - Suggest running `openspec change show {id} --json --deltas-only` for debugging

#### Scenario: Missing required sections
- **WHEN** a required section is missing
- **THEN** include expected header names derived from the artifact's `validations[]` rules:
  - For Spec: patterns from file-level validation rules (e.g., `## Purpose`, `## Requirements`)
  - For Change: `## Why`, `## What Changes`
  - Provide an example snippet of the missing section with placeholder prose ready to copy
  - Mention the quick-reference section in `openspec/AGENTS.md` as the authoritative template

#### Scenario: Missing requirement descriptive text
- **WHEN** a requirement header lacks descriptive text before scenarios
- **THEN** emit an error explaining that requirement headers (using the artifact's `deltas[].pattern`) must be followed by narrative text before any scenario headers
  - Show compliant example using the configured requirement pattern
  - Suggest adding 1-2 sentences describing the normative behavior prior to listing scenarios
  - Reference the pre-validation checklist in `openspec/AGENTS.md`

### Requirement: Schema-Aware Section Validation
The validator SHALL validate section presence based on the artifact's `validations[]` configuration instead of `sections.required`.

#### Scenario: Validate with file-level validation rules
- **WHEN** a schema's specs artifact specifies `validations` with file-level entries like `{ pattern: "## Purpose", required: true }`
- **THEN** the validator reports errors for specs missing `## Purpose`

#### Scenario: Validate with scope-level validation rules
- **WHEN** a schema's specs artifact specifies `validations` with `{ pattern: "### Requirement: {name}", required: true, scope: "Requirements" }`
- **THEN** the validator reports errors if no requirement blocks exist within `## Requirements`

#### Scenario: Validate with eachBlock-level validation rules
- **WHEN** a schema's specs artifact specifies `validations` with `{ pattern: "SHALL|MUST", required: true, eachBlock: "Requirements" }`
- **THEN** the validator reports errors for any requirement block within `## Requirements` that lacks normative keywords

#### Scenario: Validate default required sections
- **WHEN** validating specs with no explicit `validations` configuration
- **THEN** the validator uses the defaults: `## Purpose` and `## Requirements` as required file-level patterns

### Requirement: Schema-Aware Scenario and Normative Validation via validations[]
The validator SHALL validate scenarios and normative keywords based on the artifact's `validations[]` eachBlock rules. When no `validationRules` are provided, the validator SHALL default to backward-compatible behavior (scenarios required, SHALL|MUST enforced).

#### Scenario: Validate scenarios via eachBlock rule
- **WHEN** a schema's specs artifact specifies `validations` with `{ pattern: "#### Scenario: {name}", required: true, eachBlock: "Requirements" }`
- **THEN** the validator reports errors for any requirement block within `## Requirements` that lacks a scenario

#### Scenario: Skip scenario validation when no eachBlock rule
- **WHEN** a schema's specs artifact has `validations[]` but no scenario eachBlock rule
- **THEN** the validator does not report errors for requirements without scenarios

#### Scenario: Validate normative keywords via eachBlock rule
- **WHEN** a schema's specs artifact specifies `validations` with `{ pattern: "SHALL|MUST", required: true, eachBlock: "Requirements" }`
- **THEN** the validator reports errors for any requirement block within `## Requirements` that lacks normative keywords

#### Scenario: Skip normative validation when no eachBlock rule
- **WHEN** a schema's specs artifact has `validations[]` but no normative keyword eachBlock rule
- **THEN** the validator does not report errors for requirements without normative keywords

#### Scenario: Emit warnings for non-required rules
- **WHEN** a schema's specs artifact specifies `validations` with `{ pattern: "## Glossary", required: false }`
- **AND** the spec file does not contain a `## Glossary` section
- **THEN** the validator emits a WARNING (not ERROR) with message containing "recommended"

#### Scenario: Default backward-compatible behavior
- **WHEN** validating with no explicit `validationRules` configuration
- **THEN** the validator defaults to requiring scenarios and enforcing "SHALL|MUST" normative keywords

### Requirement: CLI Loads Project Schema Configuration
The validate command SHALL load the project's schema configuration and use it for validation.

#### Scenario: Load schema from project config
- **WHEN** executing `openspec validate` in a project with `.openspec.yaml` containing a `schema` field
- **THEN** the validator loads the referenced schema and uses its validation configuration

#### Scenario: Use schema-configured validation rules
- **WHEN** the project schema specifies custom `deltas[]`/`validations[]` configuration
- **THEN** the validator applies those rules instead of hardcoded defaults

#### Scenario: Fallback to defaults without project config
- **WHEN** executing `openspec validate` without a project `.openspec.yaml` or without a `schema` field
- **THEN** the validator uses default validation rules (normative keywords via `validations[]` eachBlock, scenarios required, etc.)

### Requirement: Schema-Aware Delta Validation
The validator SHALL validate delta specs using headers derived from the artifact's `deltas[]` configuration instead of `sections.requirement`.

#### Scenario: Validate delta headers with custom delta section
- **WHEN** a schema's specs artifact specifies `deltas: [{ section: "Functional Requirements", pattern: "### Requirement: {name}" }]`
- **THEN** the validator recognizes `## ADDED Functional Requirements`, `## MODIFIED Functional Requirements`, `## REMOVED Functional Requirements`, and `## RENAMED Functional Requirements` as valid delta headers

#### Scenario: Validate delta headers with default delta section
- **WHEN** validating with no explicit `deltas[]` configuration
- **THEN** the validator recognizes `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, and `## RENAMED Requirements`

#### Scenario: Validate multiple delta sections
- **WHEN** a schema's specs artifact specifies `deltas: [{ section: "Requirements", ... }, { section: "Constraints", ... }]`
- **THEN** the validator recognizes delta headers for both sections and validates each independently

#### Scenario: Report unrecognized delta header
- **WHEN** a delta spec uses `## ADDED Requirements` but the schema expects `## ADDED Functional Requirements`
- **THEN** the validator reports an error with the expected format derived from `deltas[].section`

### Requirement: Cross-File Verification
The validator SHALL support cross-file verification using `changeVerify.requirementPattern` and `changeVerify.scenarioPattern` to extract requirements and scenarios, checking that every requirement in the spec has at least one verification scenario in the verification file.

#### Scenario: Cross-file verification passes
- **WHEN** spec.md contains requirements and verify.md contains matching scenarios
- **THEN** the validator reports no cross-file verification errors

#### Scenario: Cross-file verification fails
- **WHEN** spec.md contains requirements but verify.md has no scenarios
- **THEN** the validator reports an error for each unverified requirement

## ADDED Requirements

### Requirement: Multi-File Spec Validation
The validator SHALL validate all artifact files in each spec folder based on `requiredSpecArtifacts`, not just `spec.md`.

#### Scenario: Validate change deltas across all artifact files
- **WHEN** `requiredSpecArtifacts` includes `['specs', 'spec-verify']`
- **AND** a change spec folder contains both `spec.md` and `verify.md`
- **THEN** the validator validates delta structure in both files using each artifact's `deltas[]` config

#### Scenario: Validate spec folder completeness
- **WHEN** `requiredSpecArtifacts` includes `['specs', 'spec-verify']`
- **AND** a spec folder contains `spec.md` but not `verify.md`
- **THEN** the validator reports that required artifact files are missing

#### Scenario: Default single-file validation
- **WHEN** no schema is configured or `requiredSpecArtifacts` defaults to `['specs']`
- **THEN** the validator validates only `spec.md` (backward compatible behavior)

#### Scenario: Item discovery uses requiredSpecArtifacts
- **WHEN** listing spec IDs via `getSpecIds()`
- **THEN** a directory is considered a valid spec if it contains all files from `requiredSpecArtifacts`

## REMOVED Requirements

- `### Requirement: Schema-Aware Requirement Pattern Matching`
