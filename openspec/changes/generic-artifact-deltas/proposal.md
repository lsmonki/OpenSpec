# Generic Artifact Deltas

## Why

The `configurable-spec-format` change introduced schema-driven spec format configuration (`sections.requirement`, `specValidation`, `changeValidation`), but the model is limited: `sections.requirement` is singular and named after "requirement", so artifacts like `verify.md` with `### Verification: {name}` blocks can't define their own mergeable sections. Structural validation is also not per-artifact — there's no way for each artifact to declare its own validation rules. A real use case exists now: a schema with a separate `verify.md` file alongside `spec.md`, where verification blocks need their own delta merge and validation.

## What Changes

- **`deltas[]` replaces `sections.requirement`**: An array of block definitions per artifact. Each entry defines a mergeable section with its own pattern. Delta operations (ADDED/MODIFIED/REMOVED/RENAMED) are derived from the section name. Artifacts without `deltas` get copied as-is during sync.
- **`validations[]` replaces `sections.required`/`sections.optional`**: Per-artifact structural validation rules with three granularity levels: file-level (pattern exists in file), section-level (`scope`), and block-level (`eachBlock`). Required sections become validation rules.
- **`sections` field removed**: Absorbed entirely by `deltas[]` and `validations[]`.
- **`specVerify` eliminated**: All structural validation (normative keywords, scenario requirements) is expressed via `validations[]` eachBlock rules. `specVerify` was redundant — everything it did is already covered by `validations[]`.
- **`requiredSpecArtifacts` added**: Declares which artifact files must exist in each spec folder (default: `['specs']`).
- **`changeVerify` enriched**: Now includes `requirementPattern` and `scenarioPattern` for `/opsx:verify` extraction.
- **Rename `changeValidation` → `changeVerify`**: Avoids naming confusion.
- **Multi-file delta merge in sync/archive**: Any artifact listed in `requiredSpecArtifacts` can define its own `deltas[]`, enabling delta merge for `verify.md`, `constraints.md`, etc. — not just `spec.md`. Artifact filenames are resolved from `generates` (last concrete segment) or `template` (fallback).
- **Runtime uses `requiredSpecArtifacts`**: All hardcoded `spec.md` references in sync, validation, archive, and item discovery are replaced by schema-driven artifact file resolution.
- **`resolvedOutputPaths` in instructions output**: When an artifact's `generates` pattern is a glob (e.g., `specs/**/verify.md`), `openspec instructions` now resolves it to concrete file paths based on existing spec directories. This lets AI know exactly which files to create instead of interpreting glob patterns.
- **`openspec schema show` command**: New CLI command that outputs the full parsed schema configuration including `specArtifactFiles`, `changeVerify`, artifact definitions with `deltas`/`validations`, and apply config. Name argument is optional — defaults to the project's configured schema or `spec-driven`.
- **Schema-aware skill templates**: All skill/command templates no longer hardcode `spec.md`. They use `openspec schema show --json` to discover the schema configuration and `resolvedOutputPaths` from instructions to know exactly which files to create per capability.

---

## Schema Structure: Before and After

**BEFORE (current, from `configurable-spec-format`)**:

```yaml
specValidation:
  artifact: "specs"
  pattern: "#### Scenario: {name}"
  required: true
  shallMustPattern: "SHALL|MUST"

changeValidation:
  artifact: "specs"

artifacts:
  - id: specs
    generates: "specs/**/*.md"
    template: spec.md
    requires: [proposal]
    sections:
      required: ["Purpose", "Requirements"]
      optional: ["Scope", "Definitions"]
      requirement:
        section: "Requirements"
        pattern: "### Requirement: {name}"
```

**AFTER (this change)**:

```yaml
changeVerify:
  artifact: "specs"
  requirementPattern: "### Requirement: {name}"
  scenarioPattern: "#### Scenario: {name}"

requiredSpecArtifacts:
  - specs

artifacts:
  - id: specs
    generates: "specs/**/*.md"
    template: spec.md
    requires: [proposal]
    deltas:
      - section: "Requirements"
        pattern: "### Requirement: {name}"
    validations:
      - pattern: "## Purpose"
        required: true
      - pattern: "## Requirements"
        required: true
      - pattern: "### Requirement: {name}"
        required: true
        scope: "Requirements"
      - pattern: "#### Scenario: {name}"
        required: true
        eachBlock: "Requirements"
      - pattern: "SHALL|MUST"
        required: true
        eachBlock: "Requirements"
```

---

## Key Design Decisions

### 1. `deltas[]` replaces `sections.requirement`

**Problem**: `sections.requirement` is singular and named after "requirement". A `verify.md` artifact with `### Verification: {name}` blocks wouldn't fit this model.

**Solution**: `deltas` is an array of block definitions. Each entry defines a mergeable section with its own pattern. Delta operations (ADDED/MODIFIED/REMOVED/RENAMED) are derived from the section name.

```yaml
# Before (singular, hardcoded name)
sections:
  requirement:
    section: "Requirements"
    pattern: "### Requirement: {name}"

# After (array, generic)
deltas:
  - section: "Requirements"
    pattern: "### Requirement: {name}"
  - section: "Constraints"
    pattern: "### Constraint: {name}"
```

An artifact can have multiple delta sections. An artifact without `deltas` (like `design.md`) has no delta merge — it gets copied as-is during sync.

### 2. `validations[]` at artifact level for structural checks

**Problem**: No mechanism for per-artifact structural validation. Structural checks were either hardcoded or absent.

**Solution**: Each artifact can define `validations[]` — pattern-existence rules with three granularity levels:

| Field | Searches in | Use case |
|-------|-------------|----------|
| _(none)_ | Entire file | Required sections: `## Purpose` |
| `scope: "X"` | Within `## X` section | At least one block exists within a section |
| `eachBlock: "X"` | Each `###` block within `## X` | Every block has scenarios, uses SHALL/MUST |

```yaml
validations:
  # File-level: section must exist
  - pattern: "## Purpose"
    required: true

  # Section-level: pattern must exist within ## Requirements
  - pattern: "### Requirement: {name}"
    required: true
    scope: "Requirements"

  # Block-level: pattern in EACH ### block within ## Requirements
  - pattern: "SHALL|MUST"
    required: true
    eachBlock: "Requirements"

  - pattern: "#### Scenario: {name}"
    required: true
    eachBlock: "Requirements"
```

### 3. `sections.required`/`sections.optional` absorbed into `validations`

Required sections are just a validation rule — no need for a separate concept:

```yaml
# Before (separate mechanism)
sections:
  required: ["Purpose", "Requirements"]
  optional: ["Scope", "Definitions"]

# After (unified)
validations:
  - pattern: "## Purpose"
    required: true
  - pattern: "## Requirements"
    required: true
```

### 4. `validations[]` is the single source of truth for structural validation

All structural validation — section presence, normative keywords, scenario requirements — is expressed via `validations[]` eachBlock rules. There is no separate `specVerify` mechanism. `changeVerify` is a separate concern: it configures how `/opsx:verify` extracts requirements and scenarios for code verification, not how specs are structurally validated.

---

## Multi-File Spec Example

A schema with separate verification files:

```yaml
changeVerify:
  artifact: "specs"
  requirementPattern: "### Requirement: {name}"
  scenarioPattern: "### Scenario: {name}"

requiredSpecArtifacts:
  - specs
  - spec-verify

artifacts:
  - id: specs
    generates: "specs/**/*.md"
    template: spec.md
    requires: [proposal]
    deltas:
      - section: "Requirements"
        pattern: "### Requirement: {name}"
    validations:
      - pattern: "## Purpose"
        required: true
      - pattern: "## Requirements"
        required: true
      - pattern: "### Requirement: {name}"
        required: true
        scope: "Requirements"

  - id: spec-verify
    generates: "specs/**/verify.md"    # output artifact: synced to specs/
    template: spec-verify.md
    requires: [specs]
    deltas:
      - section: "Scenarios"
        pattern: "### Scenario: {name}"
    validations:
      - pattern: "## Scenarios"
        required: true
      - pattern: "### Scenario: {name}"
        required: true
        scope: "Scenarios"
```

Result on disk:

```
specs/user-auth/
├── spec.md        ← from specs artifact (delta-merged)
└── verify.md      ← from spec-verify artifact (delta-merged)
```

Sync behavior:
- `spec.md` has `deltas` → delta merge (ADDED/MODIFIED/REMOVED/RENAMED Requirements)
- `verify.md` has `deltas` → delta merge (ADDED/MODIFIED/REMOVED/RENAMED Scenarios)
- An artifact without `deltas` (e.g., `notes.md`) → direct file copy

---

## Complete Default Schema (backward compatible)

When all new fields are omitted, OpenSpec behaves exactly as today:

```yaml
name: spec-driven
version: 1
description: Default OpenSpec workflow

# Schema-level (implicit defaults)
changeVerify:
  artifact: "specs"
  requirementPattern: "### Requirement: {name}"
  scenarioPattern: "#### Scenario: {name}"

requiredSpecArtifacts:
  - specs

artifacts:
  - id: proposal
    generates: proposal.md
    template: proposal.md
    requires: []

  - id: specs
    generates: "specs/**/*.md"
    template: spec.md
    requires: [proposal]
    # Implicit defaults:
    deltas:
      - section: "Requirements"
        pattern: "### Requirement: {name}"
    validations:
      - pattern: "## Purpose"
        required: true
      - pattern: "## Requirements"
        required: true
      - pattern: "### Requirement: {name}"
        required: true
        scope: "Requirements"
      - pattern: "#### Scenario: {name}"
        required: true
        eachBlock: "Requirements"
      - pattern: "SHALL|MUST"
        required: true
        eachBlock: "Requirements"

  - id: design
    generates: design.md
    template: design.md
    requires: [proposal]

  - id: tasks
    generates: tasks.md
    template: tasks.md
    requires: [specs, design]

apply:
  requires: [tasks]
  tracks: tasks.md
```

---

## New Schema Fields Specification

### Schema-Level Fields

```yaml
changeVerify:
  artifact: string              # which artifact has requirements/scenarios
  requirementPattern: string    # pattern to extract requirement headers
  scenarioPattern: string       # pattern to extract scenario headers

requiredSpecArtifacts: string[] # which artifact files must exist in each spec folder
```

### Artifact-Level Fields

```yaml
artifacts:
  - id: string                  # existing
    generates: string           # existing
    template: string            # existing
    instruction: string         # existing (optional)
    requires: string[]          # existing

    # NEW: Delta merge configuration (array, optional)
    deltas:
      - section: string         # section name (e.g., "Requirements")
        pattern: string         # block pattern (e.g., "### Requirement: {name}")
                                # Delta ops derived: ## {ADDED|MODIFIED|REMOVED|RENAMED} {section}

    # NEW: Structural validation rules (array, optional)
    validations:
      - pattern: string         # pattern to search for
        required: boolean       # whether it must exist
        scope: string           # (optional) validate within a ## section
        eachBlock: string       # (optional) validate within EACH ### block of a ## section
```

### Field Defaults

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `changeVerify.artifact` | `string` | `"specs"` | Which artifact has requirements/scenarios |
| `changeVerify.requirementPattern` | `string` | `"### Requirement: {name}"` | Pattern to extract requirement headers |
| `changeVerify.scenarioPattern` | `string` | `"#### Scenario: {name}"` | Pattern to extract scenario headers |
| `requiredSpecArtifacts` | `string[]` | `["specs"]` | Artifact files required in each spec folder |
| `deltas[].section` | `string` | — | Section name for delta operations |
| `deltas[].pattern` | `string` | — | Block identification pattern |
| `validations[].pattern` | `string` | — | Pattern to search for |
| `validations[].required` | `boolean` | — | Whether presence is required |
| `validations[].scope` | `string` | _(none)_ | Limit search to within a `##` section |
| `validations[].eachBlock` | `string` | _(none)_ | Validate within each `###` block of a `##` section |

---

## Dynamic Prompts

Skills read format configuration from the schema at runtime via `openspec schema show --json`. Before generating specs or deltas, the AI reads:

1. `specArtifactFiles` → which files each capability needs (e.g., `spec.md` + `verify.md`)
2. `deltas[].section` → delta section headers (e.g., `## ADDED Requirements`)
3. `deltas[].pattern` → block format (e.g., `### Requirement: {name}`)
4. `validations[]` → structural rules to follow
5. `changeVerify` → patterns for requirement/scenario extraction in `/opsx:verify`

When creating spec-like artifacts, the AI uses `resolvedOutputPaths` from `openspec instructions --json` to know exactly which files to create (e.g., `specs/gestion-usuarios/verify.md` instead of the glob `specs/**/verify.md`).

This approach requires no code changes to the skill loading system — prompts instruct the AI to query the CLI for schema config and follow the resolved paths.

---

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `artifact-graph`: Replace `sections` with `deltas[]` and `validations[]` on artifact definitions. Eliminate `specVerify`, rename `changeValidation` → `changeVerify` (enriched with `requirementPattern`/`scenarioPattern`), add `requiredSpecArtifacts`. Update schema loading, type definitions, and default application.
- `cli-validate`: Validation reads `validations[]` from artifact config instead of `sections.required`. Support scope/eachBlock granularity. Use `changeVerify` for cross-file verification. Validate all artifact files per `requiredSpecArtifacts` (multi-file). Item discovery checks all required artifact files, not just `spec.md`.
- `specs-sync-skill`: Sync resolves artifact filenames from `requiredSpecArtifacts` and uses each artifact's `deltas[]` to determine merge behavior. Files with `deltas[]` get delta-merged; files without get copied directly. No hardcoded `spec.md` references.
- `docs-configurable-spec-format`: Update documentation to reflect new field names and structure (`deltas[]`, `validations[]`, `changeVerify`, `requiredSpecArtifacts`).

## Impact

### Code Areas

**Schema system** (high impact):
- `src/core/artifact-graph/types.ts` — replace `sections` types with `deltas[]` and `validations[]`
- `src/core/artifact-graph/schema.ts` — load new fields, apply defaults, remove `sections` loading

**Parsers** (medium impact):
- `src/core/parsers/requirement-blocks.ts` — accept `deltas[]` config instead of `sections.requirement`
- `src/core/parsers/change-parser.ts` — derive delta headers from `deltas[].section`

**Validation** (high impact):
- `src/core/validation/validator.ts` — implement `validations[]` with scope/eachBlock granularity
- `src/commands/validate.ts` — build validation config from `validations[]` instead of `sections`

**Sync/Archive** (high impact):
- `src/core/specs-apply.ts` — resolve artifact filenames from schema, use `requiredSpecArtifacts` to determine delta merge vs direct copy per file
- `src/core/archive.ts` — detect delta specs via resolved artifact files, not hardcoded `spec.md`

**Item Discovery** (medium impact):
- `src/utils/item-discovery.ts` — `getSpecIds()` checks all `requiredSpecArtifacts` filenames, not just `spec.md`

**Skill prompts** (medium impact):
- `src/core/templates/skill-templates.ts` — update dynamic prompt instructions to reference `deltas[]`, `validations[]`, `changeVerify`

**Schema templates** (low impact):
- `schemas/spec-driven/schema.yaml` — update defaults to use new field structure
- Documentation files

### Breaking Changes

**Schema field changes** (breaking for custom schemas that adopted the v1 fields):
- `specValidation` → eliminated (replaced by `validations[]` eachBlock rules)
- `changeValidation` → `changeVerify` (enriched with `requirementPattern`/`scenarioPattern`)
- `sections.requirement` → `deltas[]`
- `sections.required`/`sections.optional` → `validations[]`

Since the v1 fields were introduced in `configurable-spec-format` (not yet released), this is a pre-release breaking change with no migration needed for external users.
