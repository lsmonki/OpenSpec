# Generic Artifact Deltas

## Why

The `configurable-spec-format` change introduced schema-driven spec format configuration (`sections.requirement`, `specValidation`, `changeValidation`), but the model is limited: `sections.requirement` is singular and named after "requirement", so artifacts like `verify.md` with `### Verification: {name}` blocks can't define their own mergeable sections. Structural validation is also not per-artifact — there's no way for each artifact to declare its own validation rules. A real use case exists now: a schema with a separate `verify.md` file alongside `spec.md`, where verification blocks need their own delta merge and validation.

## What Changes

- **`deltas[]` replaces `sections.requirement`**: An array of block definitions per artifact. Each entry defines a mergeable section with its own pattern. Delta operations (ADDED/MODIFIED/REMOVED/RENAMED) are derived from the section name. Artifacts without `deltas` get copied as-is during sync.
- **`validations[]` replaces `sections.required`/`sections.optional`**: Per-artifact structural validation rules with three granularity levels: file-level (pattern exists in file), section-level (`scope`), and block-level (`eachBlock`). Required sections become validation rules.
- **`sections` field removed**: Absorbed entirely by `deltas[]` and `validations[]`.
- **Rename `specValidation` → `specVerify`**: Avoids naming confusion with the new `validations[]` array.
- **Rename `changeValidation` → `changeVerify`**: Same reason.
- **Multi-file delta merge in sync/archive**: Any artifact whose `generates` starts with `specs/` can define its own `deltas[]`, enabling delta merge for `verify.md`, `constraints.md`, etc. — not just `spec.md`.

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
  artifact: "verify"

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
specVerify:
  artifact: "specs"
  pattern: "#### Scenario: {name}"
  required: true
  shallMustPattern: "SHALL|MUST"

changeVerify:
  artifact: "verify"

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

### 4. Naming: `specVerify`/`changeVerify`

Renaming avoids confusion between:
- `specVerify` / `changeVerify` — schema-level compliance configuration
- `validations[]` — artifact-level structural rules

---

## Multi-File Spec Example

A schema with separate verification files:

```yaml
specVerify:
  artifact: "spec-verify"              # scenarios live in verify.md, not spec.md
  pattern: "### Scenario: {name}"
  required: true

changeVerify:
  artifact: "verify"

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
  artifact: "verify"

specVerify:
  artifact: "specs"
  pattern: "#### Scenario: {name}"
  required: true
  shallMustPattern: "SHALL|MUST"

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
specVerify:
  artifact: string              # which artifact contains verification criteria
  pattern: string               # pattern to identify verification blocks
  required: boolean             # whether verification is mandatory
  shallMustPattern: string|null # regex for normative keywords, null to disable

changeVerify:
  artifact: string              # which artifact verifies change implementation
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
| `changeVerify.artifact` | `string` | `"verify"` | Artifact that verifies change implementation |
| `specVerify.artifact` | `string` | `"specs"` | Artifact containing scenarios (`"specs"` = inline) |
| `specVerify.pattern` | `string` | `"#### Scenario: {name}"` | Pattern to identify scenario blocks |
| `specVerify.required` | `boolean` | `true` | Whether validation fails if no scenarios found |
| `specVerify.shallMustPattern` | `string \| null` | `"SHALL\|MUST"` | Regex for normative keywords; `null` to disable |
| `deltas[].section` | `string` | — | Section name for delta operations |
| `deltas[].pattern` | `string` | — | Block identification pattern |
| `validations[].pattern` | `string` | — | Pattern to search for |
| `validations[].required` | `boolean` | — | Whether presence is required |
| `validations[].scope` | `string` | _(none)_ | Limit search to within a `##` section |
| `validations[].eachBlock` | `string` | _(none)_ | Validate within each `###` block of a `##` section |

---

## Dynamic Prompts

Skills read format configuration from the schema at runtime. Before generating specs or deltas, the AI reads:

1. `deltas[].section` → delta section headers (e.g., `## ADDED Requirements`)
2. `deltas[].pattern` → block format (e.g., `### Requirement: {name}`)
3. `validations[]` → structural rules to follow
4. `specVerify` → where verification criteria live

This approach requires no code changes to the skill loading system — prompts instruct the AI to read the schema and adapt.

---

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `artifact-graph`: Replace `sections` with `deltas[]` and `validations[]` on artifact definitions. Rename schema-level `specValidation`/`changeValidation` to `specVerify`/`changeVerify`. Update schema loading, type definitions, and default application.
- `cli-validate`: Validation reads `validations[]` from artifact config instead of `sections.required`. Support scope/eachBlock granularity. Use renamed `specVerify`/`changeVerify` fields. Validate all output artifacts per schema (multi-file).
- `specs-sync-skill`: Sync reads `deltas[]` from each output artifact to determine merge behavior. Artifacts with `deltas` get delta-merged; artifacts without get copied directly.
- `docs-configurable-spec-format`: Update documentation to reflect new field names and structure (`deltas[]`, `validations[]`, `specVerify`, `changeVerify`).

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
- `src/core/specs-apply.ts` — iterate output artifacts, delta merge or direct copy per `deltas[]` config
- `src/core/archive.ts` — sync all output artifacts, not just spec.md

**Skill prompts** (medium impact):
- `src/core/templates/skill-templates.ts` — update dynamic prompt instructions to reference `deltas[]`, `validations[]`, `specVerify`

**Schema templates** (low impact):
- `schemas/spec-driven/schema.yaml` — update defaults to use new field structure
- Documentation files

### Breaking Changes

**Schema field renames** (breaking for custom schemas that adopted the v1 fields):
- `specValidation` → `specVerify`
- `changeValidation` → `changeVerify`
- `sections.requirement` → `deltas[]`
- `sections.required`/`sections.optional` → `validations[]`

Since the v1 fields were introduced in `configurable-spec-format` (not yet released), this is a pre-release breaking change with no migration needed for external users.
