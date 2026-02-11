# Customization

OpenSpec provides three levels of customization:

| Level | What it does | Best for |
|-------|--------------|----------|
| **Project Config** | Set defaults, inject context/rules | Most teams |
| **Custom Schemas** | Define your own workflow artifacts | Teams with unique processes |
| **Global Overrides** | Share schemas across all projects | Power users |

---

## Project Configuration

The `openspec/config.yaml` file is the easiest way to customize OpenSpec for your team. It lets you:

- **Set a default schema** - Skip `--schema` on every command
- **Inject project context** - AI sees your tech stack, conventions, etc.
- **Add per-artifact rules** - Custom rules for specific artifacts

### Quick Setup

```bash
openspec init
```

This walks you through creating a config interactively. Or create one manually:

```yaml
# openspec/config.yaml
schema: spec-driven

context: |
  Tech stack: TypeScript, React, Node.js, PostgreSQL
  API style: RESTful, documented in docs/api.md
  Testing: Jest + React Testing Library
  We value backwards compatibility for all public APIs

rules:
  proposal:
    - Include rollback plan
    - Identify affected teams
  specs:
    - Use Given/When/Then format
    - Reference existing patterns before inventing new ones
```

### How It Works

**Default schema:**

```bash
# Without config
openspec new change my-feature --schema spec-driven

# With config - schema is automatic
openspec new change my-feature
```

**Context and rules injection:**

When generating any artifact, your context and rules are injected into the AI prompt:

```xml
<context>
Tech stack: TypeScript, React, Node.js, PostgreSQL
...
</context>

<rules>
- Include rollback plan
- Identify affected teams
</rules>

<template>
[Schema's built-in template]
</template>
```

- **Context** appears in ALL artifacts
- **Rules** ONLY appear for the matching artifact

### Schema Resolution Order

When OpenSpec needs a schema, it checks in this order:

1. CLI flag: `--schema <name>`
2. Change metadata (`.openspec.yaml` in the change folder)
3. Project config (`openspec/config.yaml`)
4. Default (`spec-driven`)

---

## Custom Schemas

When project config isn't enough, create your own schema with a completely custom workflow. Custom schemas live in your project's `openspec/schemas/` directory and are version-controlled with your code.

```text
your-project/
├── openspec/
│   ├── config.yaml        # Project config
│   ├── schemas/           # Custom schemas live here
│   │   └── my-workflow/
│   │       ├── schema.yaml
│   │       └── templates/
│   └── changes/           # Your changes
└── src/
```

### Fork an Existing Schema

The fastest way to customize is to fork a built-in schema:

```bash
openspec schema fork spec-driven my-workflow
```

This copies the entire `spec-driven` schema to `openspec/schemas/my-workflow/` where you can edit it freely.

**What you get:**

```text
openspec/schemas/my-workflow/
├── schema.yaml           # Workflow definition
└── templates/
    ├── proposal.md       # Template for proposal artifact
    ├── spec.md           # Template for specs
    ├── design.md         # Template for design
    └── tasks.md          # Template for tasks
```

Now edit `schema.yaml` to change the workflow, or edit templates to change what AI generates.

### Create a Schema from Scratch

For a completely fresh workflow:

```bash
# Interactive
openspec schema init research-first

# Non-interactive
openspec schema init rapid \
  --description "Rapid iteration workflow" \
  --artifacts "proposal,tasks" \
  --default
```

### Schema Structure

A schema defines the artifacts in your workflow and how they depend on each other:

```yaml
# openspec/schemas/my-workflow/schema.yaml
name: my-workflow
version: 1
description: My team's custom workflow

artifacts:
  - id: proposal
    generates: proposal.md
    description: Initial proposal document
    template: proposal.md
    instruction: |
      Create a proposal that explains WHY this change is needed.
      Focus on the problem, not the solution.
    requires: []

  - id: design
    generates: design.md
    description: Technical design
    template: design.md
    instruction: |
      Create a design document explaining HOW to implement.
    requires:
      - proposal    # Can't create design until proposal exists

  - id: tasks
    generates: tasks.md
    description: Implementation checklist
    template: tasks.md
    requires:
      - design

apply:
  requires: [tasks]
  tracks: tasks.md
```

**Key fields:**

| Field | Purpose |
|-------|---------|
| `id` | Unique identifier, used in commands and rules |
| `generates` | Output filename (supports globs like `specs/**/*.md`) |
| `template` | Template file in `templates/` directory |
| `instruction` | AI instructions for creating this artifact |
| `requires` | Dependencies - which artifacts must exist first |

### Custom Spec Formats

By default, OpenSpec expects specs to follow a specific format with `## Requirements`, `### Requirement: {name}`, and `#### Scenario: {name}` headers. You can customize this format using three schema configuration areas: `changeVerify` (schema-level), `requiredSpecArtifacts` (schema-level), `deltas[]` (per-artifact), and `validations[]` (per-artifact).

#### Change Verification (`changeVerify`)

Schema-level configuration for change compliance and requirement/scenario extraction patterns used by `/opsx:verify`:

```yaml
changeVerify:
  artifact: specs                            # Which artifact has requirements/scenarios
  requirementPattern: "### Requirement: {name}"  # Pattern to extract requirement headers
  scenarioPattern: "#### Scenario: {name}"       # Pattern to extract scenario headers
```

| Field | Default | Description |
|-------|---------|-------------|
| `artifact` | `specs` | Which artifact has requirements and scenarios. |
| `requirementPattern` | `### Requirement: {name}` | Pattern to extract requirement headers from specs. Used by `/opsx:verify`. |
| `scenarioPattern` | `#### Scenario: {name}` | Pattern to extract scenario headers from specs. Used by `/opsx:verify`. |

Normative keyword validation (e.g., `SHALL|MUST`) is configured per-artifact via `validations[]` eachBlock rules, not in `changeVerify`.

#### Required Spec Artifacts (`requiredSpecArtifacts`)

Declares which artifact files must exist in each spec folder:

```yaml
requiredSpecArtifacts:
  - specs        # spec.md must exist
```

| Field | Default | Description |
|-------|---------|-------------|
| `requiredSpecArtifacts` | `['specs']` | Array of artifact IDs whose files must exist in each spec folder. Validated by `openspec validate --specs`. |

#### Delta Configuration (`deltas[]`)

Per-artifact configuration for delta merge operations. Each entry defines a mergeable section:

```yaml
artifacts:
  - id: specs
    generates: "specs/**/*.md"
    deltas:
      - section: Requirements
        pattern: "### Requirement: {name}"
      - section: Constraints              # Multiple delta sections supported
        pattern: "### Constraint: {name}"
```

| Field | Description |
|-------|-------------|
| `section` | Section name (e.g., "Requirements"). Delta operations are derived: `## ADDED Requirements`, `## MODIFIED Requirements`, etc. |
| `pattern` | Block pattern within the section. Must include `{name}` placeholder. |

When a spec artifact has `deltas[]`, change specs can use delta operations (`## ADDED <section>`, `## MODIFIED <section>`, `## REMOVED <section>`, `## RENAMED <section>`) for each configured section.

#### Structural Validations (`validations[]`)

Per-artifact validation rules with three granularity levels:

```yaml
artifacts:
  - id: specs
    generates: "specs/**/*.md"
    validations:
      # File-level: pattern must exist anywhere in file
      - pattern: "## Purpose"
        required: true
      - pattern: "## Requirements"
        required: true

      # Scope-level: pattern must exist within ## section
      - pattern: "### Requirement: {name}"
        required: true
        scope: Requirements

      # eachBlock-level: pattern must exist in EACH ### block within ## section
      - pattern: "#### Scenario: {name}"
        required: true
        eachBlock: Requirements
      - pattern: "SHALL|MUST"
        required: true
        eachBlock: Requirements
```

| Field | Default | Description |
|-------|---------|-------------|
| `pattern` | (required) | Pattern to validate. Can be literal, regex, or use `{name}` placeholder. |
| `required` | `true` | Whether the pattern must be present. |
| `scope` | (none) | Validate within a specific `## Section`. |
| `eachBlock` | (none) | Validate within each `###` block of a `## Section`. |

> **Note:** `scope` and `eachBlock` are mutually exclusive — use one or the other on a given rule, not both.

#### Examples

**Custom requirement pattern:**

```yaml
artifacts:
  - id: specs
    deltas:
      - section: Requirements
        pattern: "### Req: {name}"
    validations:
      - pattern: "## Purpose"
        required: true
      - pattern: "### Req: {name}"
        required: true
        scope: Requirements
```

**Multiple delta sections (Requirements + Constraints):**

```yaml
artifacts:
  - id: specs
    deltas:
      - section: Requirements
        pattern: "### Requirement: {name}"
      - section: Constraints
        pattern: "### Constraint: {name}"
    validations:
      - pattern: "## Purpose"
        required: true
      - pattern: "## Requirements"
        required: true
      - pattern: "## Constraints"
        required: true
      - pattern: "SHALL|MUST"
        required: true
        eachBlock: Requirements
```

**eachBlock validation (pattern in every requirement):**

```yaml
validations:
  - pattern: "#### Scenario: {name}"
    required: true
    eachBlock: Requirements   # Every ### block in ## Requirements must have a scenario
```

**Spanish normative keywords (via validations[]):**

```yaml
validations:
  - pattern: "DEBE|DEBERÁ"
    required: true
    eachBlock: Requirements
```

**Disable normative validation:**

Simply omit the normative keyword rule from `validations[]`.

**Case-insensitive normative keywords:**

```yaml
validations:
  - pattern: "[Ss][Hh][Aa][Ll][Ll]|[Mm][Uu][Ss][Tt]"
    required: true
    eachBlock: Requirements
```

**Scenarios in separate file:**

```yaml
requiredSpecArtifacts:
  - specs
  - verify

artifacts:
  - id: specs
    generates: "specs/**/spec.md"
    validations:
      - pattern: "## Purpose"
        required: true
      - pattern: "## Requirements"
        required: true
      # No scenario eachBlock rule here — scenarios live in verify artifact
  - id: verify
    generates: "specs/**/verify.md"
    requires: [specs]
```

**Optional scenarios:**

Simply omit the scenario `eachBlock` rule from `validations[]`.

### Templates

Templates are markdown files that guide the AI. They're injected into the prompt when creating that artifact.

```markdown
<!-- templates/proposal.md -->
## Why

<!-- Explain the motivation for this change. What problem does this solve? -->

## What Changes

<!-- Describe what will change. Be specific about new capabilities or modifications. -->

## Impact

<!-- Affected code, APIs, dependencies, systems -->
```

Templates can include:
- Section headers the AI should fill in
- HTML comments with guidance for the AI
- Example formats showing expected structure

### Validate Your Schema

Before using a custom schema, validate it:

```bash
openspec schema validate my-workflow
```

This checks:
- `schema.yaml` syntax is correct
- All referenced templates exist
- No circular dependencies
- Artifact IDs are valid

### Use Your Custom Schema

Once created, use your schema with:

```bash
# Specify on command
openspec new change feature --schema my-workflow

# Or set as default in config.yaml
schema: my-workflow
```

### Debug Schema Resolution

Not sure which schema is being used? Check with:

```bash
# See where a specific schema resolves from
openspec schema which my-workflow

# List all available schemas
openspec schema which --all
```

Output shows whether it's from your project, user directory, or the package:

```text
Schema: my-workflow
Source: project
Path: /path/to/project/openspec/schemas/my-workflow
```

### Inspect Schema Configuration

To see the full parsed configuration of a schema (including resolved defaults):

```bash
# Show the project's configured schema (or spec-driven if none configured)
openspec schema show --json

# Show a specific schema
openspec schema show my-workflow --json
```

Output includes:
- `specArtifactFiles`: Resolved filenames per required spec artifact (e.g., `spec.md`, `verify.md`)
- `changeVerify`: Patterns for requirement/scenario extraction
- `artifacts`: All artifact definitions with `deltas`, `validations`, and `instruction`
- `apply`: Apply phase configuration
- `source`: Where the schema was resolved from (`project`, `user`, or `package`)

### Inspect Artifact Instructions

To see what instructions the AI receives for a specific artifact (useful for debugging why an artifact isn't being created correctly):

```bash
openspec instructions <artifact-id> --change "<name>" --json
```

---

> **Note:** OpenSpec also supports user-level schemas at `~/.local/share/openspec/schemas/` for sharing across projects, but project-level schemas in `openspec/schemas/` are recommended since they're version-controlled with your code.

---

## Examples

### Rapid Iteration Workflow

A minimal workflow for quick iterations:

```yaml
# openspec/schemas/rapid/schema.yaml
name: rapid
version: 1
description: Fast iteration with minimal overhead

artifacts:
  - id: proposal
    generates: proposal.md
    description: Quick proposal
    template: proposal.md
    instruction: |
      Create a brief proposal for this change.
      Focus on what and why, skip detailed specs.
    requires: []

  - id: tasks
    generates: tasks.md
    description: Implementation checklist
    template: tasks.md
    requires: [proposal]

apply:
  requires: [tasks]
  tracks: tasks.md
```

### Adding a Review Artifact

Fork the default and add a review step:

```bash
openspec schema fork spec-driven with-review
```

Then edit `schema.yaml` to add:

```yaml
  - id: review
    generates: review.md
    description: Pre-implementation review checklist
    template: review.md
    instruction: |
      Create a review checklist based on the design.
      Include security, performance, and testing considerations.
    requires:
      - design

  - id: tasks
    # ... existing tasks config ...
    requires:
      - specs
      - design
      - review    # Now tasks require review too
```

---

## See Also

- [CLI Reference: Schema Commands](cli.md#schema-commands) - Full command documentation
