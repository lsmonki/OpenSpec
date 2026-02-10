## Context

The `configurable-spec-format` change made parsers, validators, and generators read format configuration from the schema instead of hardcoded values. It introduced:

- **Schema-level**: `specValidation` (artifact, pattern, required, shallMustPattern) and `changeValidation` (artifact) — `specValidation` is now eliminated, `changeValidation` is renamed to `changeVerify` and enriched with extraction patterns only (normative validation moved to `validations[]`)
- **Artifact-level**: `sections` (required, optional, requirement: { section, pattern }) — replaced by `deltas[]` and `validations[]`

Current state of the code:

- **`types.ts`**: Zod schemas for `ChangeValidationSchema`, `SpecValidationSchema`, `ArtifactSectionsSchema`, `RequirementConfigSchema`. The `ArtifactSchema` has an optional `sections` field.
- **`schema.ts`**: `parseSchema()` validates, detects cycles, validates `{name}` placeholders, and applies defaults (specs artifact gets default `sections` if omitted).
- **`validator.ts`**: `SpecValidationConfig` interface bridges schema config to validation. `validateSpec()` and `validateChangeDeltaSpecs()` accept this config. Normative keyword check and scenario count use the config.
- **`requirement-blocks.ts`**: `RequirementFormatConfig` with `sectionName` and `requirementPattern`. Used by `extractRequirementsSection()` and `parseDeltaSpec()`.
- **`specs-apply.ts`**: `findSpecUpdates()` hardcodes `spec.md` path. `buildUpdatedSpec()` calls `parseDeltaSpec()` with default config. `buildSpecSkeleton()` hardcodes `## Requirements`.
- **`validate.ts`**: `buildValidationConfig()` reads `schema.specValidation` and `specsArtifact.sections` to build `SpecValidationConfig`.
- **`item-discovery.ts`**: `getSpecIds()` checks for `spec.md` existence only.

The limitation: `sections.requirement` is singular and requirement-specific. A `verify.md` artifact with `### Verification: {name}` blocks can't define its own delta merge. Validation rules are not per-artifact.

## Goals / Non-Goals

**Goals:**
- Replace `sections` with `deltas[]` and `validations[]` on artifact definitions
- Eliminate `specVerify` (replaced by `validations[]` eachBlock rules), rename `changeValidation` → `changeVerify` (enriched with `requirementPattern`/`scenarioPattern`), add `requiredSpecArtifacts`
- Enable any output artifact (not just specs) to define its own mergeable block types via `deltas[]`
- Enable per-artifact structural validation rules via `validations[]` with scope/eachBlock granularity
- Support multi-file spec sync: iterate all output artifacts during sync/archive, delta merge or direct copy per config
- Maintain full backward compatibility: existing schemas without new fields work unchanged

**Non-Goals:**
- Changing the delta operation semantics (ADDED/MODIFIED/REMOVED/RENAMED stay the same)
- Supporting nested sections deeper than `##` → `###` (two-level model stays)
- Auto-detecting format from file content (configuration is explicit)
- Adding new delta operation types beyond ADDED/MODIFIED/REMOVED/RENAMED

## Decisions

### 1. Replace `ArtifactSectionsSchema` with `DeltaConfigSchema` and `ValidationRuleSchema`

**Decision**: Remove the `sections` field from `ArtifactSchema`. Add two new optional arrays: `deltas` and `validations`.

**Current types.ts:**
```typescript
// Remove these:
export const RequirementConfigSchema = z.object({
  section: z.string().default('Requirements'),
  pattern: z.string().default('### Requirement: {name}'),
});

export const ArtifactSectionsSchema = z.object({
  required: z.array(z.string()).optional(),
  optional: z.array(z.string()).optional(),
  requirement: RequirementConfigSchema.optional(),
});

// ArtifactSchema.sections → remove
```

**New types.ts:**
```typescript
// Add these:
export const DeltaConfigSchema = z.object({
  section: z.string(),    // e.g., "Requirements"
  pattern: z.string(),    // e.g., "### Requirement: {name}"
});

export const ValidationRuleSchema = z.object({
  pattern: z.string(),    // pattern to search for
  required: z.boolean(),  // whether presence is required
  scope: z.string().optional(),     // validate within a ## section
  eachBlock: z.string().optional(), // validate in each ### block of a ## section
});

// Replace ChangeValidation with enriched ChangeVerify (specVerify eliminated)
export const ChangeVerifySchema = z.object({
  artifact: z.string().default('specs'),
  requirementPattern: z.string().default('### Requirement: {name}'),
  scenarioPattern: z.string().default('#### Scenario: {name}'),
});

// Update ArtifactSchema
export const ArtifactSchema = z.object({
  id: z.string().min(1),
  generates: z.string().min(1),
  description: z.string(),
  template: z.string().min(1),
  instruction: z.string().optional(),
  requires: z.array(z.string()).default([]),
  deltas: z.array(DeltaConfigSchema).optional(),
  validations: z.array(ValidationRuleSchema).optional(),
});

// Update SchemaYamlSchema
export const SchemaYamlSchema = z.object({
  name: z.string().min(1),
  version: z.number().int().positive(),
  description: z.string().optional(),
  changeVerify: ChangeVerifySchema.optional(),
  requiredSpecArtifacts: z.array(z.string()).optional(),
  artifacts: z.array(ArtifactSchema).min(1),
  apply: ApplyPhaseSchema.optional(),
});
```

**Rationale**: Clean break from the singular `sections.requirement` model. `deltas[]` is an array — each entry is an independent mergeable block type. `validations[]` replaces `sections.required`/`sections.optional` with a more expressive model.

**Alternatives considered**:
- Keep `sections` and add `deltas` alongside: More confusing, two overlapping mechanisms for similar purpose

### 2. `validations[]` Implements Three Granularity Levels

**Decision**: Each validation rule can operate at file, section, or block level:

```
┌───────────────────────────────────────────────┐
│ File Level (no scope, no eachBlock)           │
│   "Does ## Purpose exist anywhere in file?"   │
├───────────────────────────────────────────────┤
│ Section Level (scope: "Requirements")         │
│   "Does ### Requirement: {name} exist         │
│    within ## Requirements?"                    │
├───────────────────────────────────────────────┤
│ Block Level (eachBlock: "Requirements")       │
│   "Does #### Scenario: {name} exist in EACH  │
│    ### block within ## Requirements?"          │
└───────────────────────────────────────────────┘
```

**Implementation approach**: The validator extracts file content → splits by `##` sections → for each `##` section, splits by `###` blocks. Then applies rules:

1. **File-level** (`pattern` only): search entire file content
2. **Section-level** (`scope`): find the `## {scope}` section, search within it
3. **Block-level** (`eachBlock`): find the `## {eachBlock}` section, split into `###` blocks, check each block

The `required` field determines the severity level:
- `required: true` → **ERROR** (blocks validation, message says "missing required pattern")
- `required: false` → **WARNING** (informational, message says "missing recommended pattern")

This allows schemas to declare soft guidelines (e.g., "a Glossary section is recommended") alongside hard constraints (e.g., "each requirement must have scenarios").

**Rationale**: Maps directly to the three natural scopes of markdown spec structure. The `eachBlock` level replaces the current per-requirement scenario/SHALL checks in `applySpecRules()`. The required/recommended distinction lets schemas express best practices without blocking authors.

**Alternatives considered**:
- Arbitrary CSS-like selectors: Over-engineered, markdown has a simple heading hierarchy
- Only file-level validation: Insufficient — can't enforce "each requirement has scenarios"
- Binary required (skip non-required): No value in declaring a rule that's silently ignored

### 3. Bridge Interface: `SpecValidationConfig` Adapts to New Fields

**Decision**: Keep the `SpecValidationConfig` interface in `validator.ts` as a bridge, but update `buildValidationConfig()` in `validate.ts` to read from `deltas[]` and `validations[]` instead of `sections`.

The bridge computes values from the new structure:

```typescript
function buildValidationConfig(schema: SchemaYaml): SpecValidationConfig {
  const specsArtifact = schema.artifacts.find(a => a.id === 'specs');
  const firstDelta = specsArtifact?.deltas?.[0]; // primary delta section

  return {
    requiredSections: extractRequiredSections(specsArtifact?.validations),
    requirementSection: firstDelta?.section,
    requirementPattern: firstDelta?.pattern,
    deltaConfigs: specsArtifact?.deltas,
    validationRules: specsArtifact?.validations,
  };
}

function extractRequiredSections(validations?: ValidationRule[]): string[] | undefined {
  if (!validations) return undefined;
  // Find file-level validations that match "## SectionName" pattern
  return validations
    .filter(v => v.required && !v.scope && !v.eachBlock && v.pattern.startsWith('## '))
    .map(v => v.pattern.replace(/^## /, ''));
}
```

`SpecValidationConfig` no longer carries `scenarioPattern`, `scenariosRequired`, or `scenarioArtifact` — those concerns moved to `changeVerify` fields (`changeScenarioPattern`, `changeShallMustPattern`) for change validation, and `validationRules` eachBlock rules for spec validation. Scenarios are always required in change deltas. `SpecFormatConfig` (parser config) was simplified to only `requiredSections` and `requirementSection` — the parser finds requirements and scenarios by section hierarchy, not by pattern matching.

**Rationale**: Minimizes changes to downstream code (`validator.ts`, `requirement-blocks.ts`). These consumers already accept `SpecValidationConfig` — they don't need to know the schema structure changed. The bridge translates the new schema model into the existing interface.

**Alternatives considered**:
- Pass the full schema to every consumer: Invasive, couples validators to schema structure
- Rewrite all consumers to read `deltas[]`/`validations[]` directly: Large scope, unnecessary since the bridge works

### 4. Schema Defaults Apply `deltas[]` and `validations[]` for Specs Artifact

**Decision**: In `applySchemaDefaults()`, when the specs artifact has no `deltas` or `validations`, apply the backward-compatible defaults:

```typescript
function applySchemaDefaults(schema: SchemaYaml): SchemaYaml {
  const changeVerify = schema.changeVerify
    ? ChangeVerifySchema.parse(schema.changeVerify)
    : ChangeVerifySchema.parse({});

  const requiredSpecArtifacts = schema.requiredSpecArtifacts ?? ['specs'];

  const artifacts = schema.artifacts.map(artifact => {
    if (artifact.id === 'specs') {
      return {
        ...artifact,
        deltas: artifact.deltas ?? [
          { section: 'Requirements', pattern: '### Requirement: {name}' },
        ],
        validations: artifact.validations ?? [
          { pattern: '## Purpose', required: true },
          { pattern: '## Requirements', required: true },
          { pattern: '### Requirement: {name}', required: true, scope: 'Requirements' },
          { pattern: '#### Scenario: {name}', required: true, eachBlock: 'Requirements' },
          { pattern: 'SHALL|MUST', required: true, eachBlock: 'Requirements' },
        ],
      };
    }
    return artifact;
  });

  return { ...schema, changeVerify, requiredSpecArtifacts, artifacts };
}
```

**Rationale**: Centralizes defaults. Downstream code always receives populated arrays. Backward compatibility: schemas without new fields get the same behavior as today.

### 5. Artifact Filename Resolution from `generates` / `template`

**Decision**: Each artifact's output filename is derived from the `generates` field first, falling back to `template`:

```
resolveFilename(artifact):
  lastSegment = last path component of artifact.generates
  if lastSegment has no wildcard (*, ?) → use it
  else → use artifact.template
```

Examples:
```
generates: "specs/**/verify.md"  → "verify.md"   (concrete last segment)
generates: "specs/**/*.md"       → template name  (wildcard → fallback)
generates: "design.md"           → "design.md"    (concrete, but not a spec artifact)
```

**Rationale**: The `generates` field already implicitly encodes the filename in most cases. Falling back to `template` handles the glob case (`specs/**/*.md` → `spec.md` from the template). No new field needed.

### 6. `requiredSpecArtifacts` Drives Runtime File Discovery

**Decision**: All runtime code that needs to know which files exist in a spec folder uses `requiredSpecArtifacts` (artifact IDs) resolved to filenames via Decision #5. No hardcoded `spec.md` references remain.

The resolution chain:
```
requiredSpecArtifacts: ['specs', 'spec-verify']
        │
        ├─ artifacts.find(id === 'specs')
        │   generates: "specs/**/*.md" → wildcard → template: "spec.md"
        │   deltas: [...] → isDelta: true
        │   → { filename: 'spec.md', deltas: [...] }
        │
        └─ artifacts.find(id === 'spec-verify')
            generates: "specs/**/verify.md" → concrete
            deltas: [...] → isDelta: true
            → { filename: 'verify.md', deltas: [...] }
```

**Consumers that need this resolution:**

| Consumer | Currently | After |
|----------|-----------|-------|
| `specs-apply.ts:findSpecUpdates()` | `isDelta: file.name === 'spec.md'` | `isDelta: artifact has deltas[]` |
| `validator.ts:validateChangeDeltaSpecs()` | reads only `spec.md` per capability | reads all resolved artifact files |
| `archive.ts` (validation) | checks only `spec.md` for delta detection | checks all artifacts with `deltas[]` |
| `archive.ts` (spec sync) | calls `findSpecUpdates()` without config | passes `specArtifactFiles` for schema-aware sync |
| `item-discovery.ts:getSpecIds()` | checks `spec.md` existence | checks all `requiredSpecArtifacts` filenames |
| `validate.ts` (bulk) | validates only `spec.md` per spec | validates all artifact files per spec |

Note: The schema is loaded once at the top of the archive command (outside the validation block) so `specArtifactFiles` is available to both the validation and spec sync sections.

**Without schema (backward compat):** Default `requiredSpecArtifacts: ['specs']`, resolved to `[{ filename: 'spec.md', deltas: [{ section: 'Requirements', pattern: '### Requirement: {name}' }] }]`.

**Bridge approach**: `SpecValidationConfig` is enriched with `specArtifactFiles` — the resolved list of `{ filename, deltas }` objects. Each consumer reads from this instead of hardcoding filenames.

### 7. Multi-File Sync: Schema-Aware Delta Merge

**Decision**: `findSpecUpdates()` in `specs-apply.ts` changes from hardcoding `spec.md` to using resolved artifact files:

```
Current:
  changeDir/specs/<cap>/spec.md → mainSpecs/<cap>/spec.md  (always delta merge)
  changeDir/specs/<cap>/*.md    → mainSpecs/<cap>/*.md      (always direct copy)

After:
  For each file in changeDir/specs/<cap>/:
    Look up matching artifact from resolved specArtifactFiles
    If artifact has deltas[] → delta merge with that artifact's config
    If no matching artifact or no deltas[] → direct file copy
```

**Rationale**: The schema already defines which artifacts produce spec files and how they merge. Using that information makes sync schema-aware.

**Alternatives considered**:
- Scan all files in the change's specs directory: Doesn't know which parser/merge strategy to use per file
- Add a separate sync config: Redundant — the artifact's `generates` pattern + `deltas[]` presence already determines behavior

### 8. `RequirementFormatConfig` Accepts Multiple Delta Sections

**Decision**: Extend `RequirementFormatConfig` to support an array of delta definitions, but keep the current single-section interface as the primary path. For multi-delta artifacts, `parseDeltaSpec()` is called once per delta entry.

```typescript
// Keep existing interface for backward compat
export interface RequirementFormatConfig {
  sectionName?: string;
  requirementPattern?: string;
}

// In specs-apply.ts, for each delta entry:
for (const delta of artifact.deltas ?? []) {
  const config: RequirementFormatConfig = {
    sectionName: delta.section,
    requirementPattern: delta.pattern,
  };
  const plan = parseDeltaSpec(content, config);
  // merge plan into the target file
}
```

**Rationale**: Avoids a large refactor of `parseDeltaSpec`. Each delta entry maps cleanly to one call. Multiple delta sections in the same file (e.g., `## ADDED Requirements` + `## ADDED Constraints`) are independent merge operations on the same content.

### 9. Pattern Placeholder Validation Covers `deltas[].pattern` and `changeVerify` patterns

**Decision**: `validatePatternPlaceholders()` in `schema.ts` is updated to check `deltas[].pattern`, `changeVerify.requirementPattern`, and `changeVerify.scenarioPattern`:

```typescript
function validatePatternPlaceholders(schema: SchemaYaml): void {
  // Check changeVerify patterns
  if (schema.changeVerify?.requirementPattern !== undefined &&
      !schema.changeVerify.requirementPattern.includes('{name}')) {
    throw new SchemaValidationError(
      `changeVerify.requirementPattern must include {name} placeholder`
    );
  }
  if (schema.changeVerify?.scenarioPattern !== undefined &&
      !schema.changeVerify.scenarioPattern.includes('{name}')) {
    throw new SchemaValidationError(
      `changeVerify.scenarioPattern must include {name} placeholder`
    );
  }

  // Check artifact deltas[].pattern
  for (const artifact of schema.artifacts) {
    if (artifact.deltas) {
      for (const delta of artifact.deltas) {
        if (!delta.pattern.includes('{name}')) {
          throw new SchemaValidationError(
            `Artifact '${artifact.id}' deltas[].pattern must include {name} placeholder, got: "${delta.pattern}"`
          );
        }
      }
    }
  }
}
```

### 10. `validations[]` Is the Single Source of Truth for Structural Validation

**Decision**: `specVerify` is eliminated. All structural validation — normative keywords, scenario requirements, section presence — is expressed via `validations[]` eachBlock rules. `applySpecRules()` only runs `validateContentRules()` (from `validationRules`) plus length checks.

When no `validationRules` are provided (backward compat: no schema configured), the validator defaults to the old behavior: scenarios required, `SHALL|MUST` enforced. When `validationRules` are explicitly provided, only the configured rules apply.

```typescript
// Structural validation via generic rules engine (validations[] from schema)
if (config?.validationRules && config.validationRules.length > 0) {
  issues.push(...this.validateContentRules(content, config.validationRules, spec.name));
}

// Length check on requirement text
spec.requirements.forEach((req, index) => {
  if (req.text.trim().length < 20) { ... }
});
```

**Rationale**: `specVerify` was redundant — everything it did (normative keywords, scenario count) is already expressible via `validations[]` eachBlock rules. Having two independent systems checking overlapping concerns was confusing. A single source of truth is simpler. Backward compatibility is preserved by defaulting to the old rules when no `validationRules` are provided.

### 11. Skill Prompt Updates Reference `deltas[]` and `changeVerify`

**Decision**: Update `skill-templates.ts` prompts to instruct the AI to read `deltas[].section` and `deltas[].pattern` instead of `sections.requirement.section`/`.pattern`, and `changeVerify` instead of `specValidation`.

The prompt structure stays the same — "read the schema, extract config, use defaults if missing" — just the field paths change.

## Risks / Trade-offs

**Risk: Multiple deltas on same file produce ordering conflicts**
If an artifact defines `deltas: [{section: "Requirements", ...}, {section: "Constraints", ...}]`, both operate on the same file. The merge operations run independently per section, but rebuilding the file requires careful ordering.
→ Mitigation: Apply delta sections in the order they appear in the config. Each section operates on its own `## X` block — no overlap.

**Risk: Validation rules with `eachBlock` assume two-level heading structure**
The `eachBlock` granularity splits a `##` section into `###` blocks. Non-standard heading hierarchies (e.g., `#` → `###` skipping `##`) would break.
→ Mitigation: Document the two-level assumption. This matches markdown best practice and all existing schemas.

**Risk: Bridge approach delays full generic validation**
Keeping `SpecValidationConfig` as a bridge means validation doesn't fully leverage the `validations[]` expressiveness yet.
→ Mitigated: `validateContentRules()` is now wired into `applySpecRules()` and is the single source of truth for structural validation. `specVerify` has been eliminated. The bridge remains for backward compatibility but the generic engine is active.

**Trade-off: Removing `sections` is a pre-release breaking change**
Custom schemas that adopted `sections` (from the unreleased `configurable-spec-format`) need to migrate to `deltas[]`/`validations[]`.
→ Accepted: Not yet released. No external migration needed.

**Trade-off: Schema loading adds `resolveSchema` call to `specs-apply.ts`**
The sync path now needs to load the schema to know which artifacts have `deltas[]`.
→ Accepted: One additional file read per sync operation. Negligible performance impact.
