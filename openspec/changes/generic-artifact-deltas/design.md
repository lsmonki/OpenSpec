## Context

The `configurable-spec-format` change made parsers, validators, and generators read format configuration from the schema instead of hardcoded values. It introduced:

- **Schema-level**: `specValidation` (artifact, pattern, required, shallMustPattern) and `changeValidation` (artifact)
- **Artifact-level**: `sections` (required, optional, requirement: { section, pattern })

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
- Rename `specValidation` → `specVerify`, `changeValidation` → `changeVerify` at schema level
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

// Replace SpecValidation/ChangeValidation with SpecVerify/ChangeVerify
export const SpecVerifySchema = z.object({
  artifact: z.string().default('specs'),
  pattern: z.string().default('#### Scenario: {name}'),
  required: z.boolean().default(true),
  shallMustPattern: z.string().nullable().default('SHALL|MUST'),
});

export const ChangeVerifySchema = z.object({
  artifact: z.string().default('verify'),
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
  specVerify: SpecVerifySchema.optional(),
  changeVerify: ChangeVerifySchema.optional(),
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

**Rationale**: Maps directly to the three natural scopes of markdown spec structure. The `eachBlock` level replaces the current per-requirement scenario/SHALL checks in `applySpecRules()`.

**Alternatives considered**:
- Arbitrary CSS-like selectors: Over-engineered, markdown has a simple heading hierarchy
- Only file-level validation: Insufficient — can't enforce "each requirement has scenarios"

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
    scenarioPattern: schema.specVerify?.pattern,
    scenariosRequired: schema.specVerify?.required,
    scenarioArtifact: schema.specVerify?.artifact,
    shallMustPattern: schema.specVerify?.shallMustPattern,
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

**Rationale**: Minimizes changes to downstream code (`validator.ts`, `requirement-blocks.ts`). These consumers already accept `SpecValidationConfig` — they don't need to know the schema structure changed. The bridge translates the new schema model into the existing interface.

**Alternatives considered**:
- Pass the full schema to every consumer: Invasive, couples validators to schema structure
- Rewrite all consumers to read `deltas[]`/`validations[]` directly: Large scope, unnecessary since the bridge works

### 4. Schema Defaults Apply `deltas[]` and `validations[]` for Specs Artifact

**Decision**: In `applySchemaDefaults()`, when the specs artifact has no `deltas` or `validations`, apply the backward-compatible defaults:

```typescript
function applySchemaDefaults(schema: SchemaYaml): SchemaYaml {
  const specVerify = schema.specVerify
    ? SpecVerifySchema.parse(schema.specVerify)
    : SpecVerifySchema.parse({});

  const changeVerify = schema.changeVerify
    ? ChangeVerifySchema.parse(schema.changeVerify)
    : ChangeVerifySchema.parse({});

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

  return { ...schema, specVerify, changeVerify, artifacts };
}
```

**Rationale**: Centralizes defaults. Downstream code always receives populated arrays. Backward compatibility: schemas without new fields get the same behavior as today.

### 5. Multi-File Sync: Iterate Output Artifacts with `deltas[]`

**Decision**: `findSpecUpdates()` in `specs-apply.ts` changes from hardcoding `spec.md` to discovering all output artifact files per capability:

```
Current:
  changeDir/specs/<cap>/spec.md → mainSpecs/<cap>/spec.md

After:
  For each artifact where generates starts with "specs/":
    changeDir/specs/<cap>/<filename> → mainSpecs/<cap>/<filename>

  If artifact has deltas[] → delta merge (parseDeltaSpec + buildUpdatedSpec)
  If artifact has no deltas[] → direct file copy
```

**Implementation**:

1. `findSpecUpdates()` accepts the schema's artifacts list
2. For each output artifact (`generates` starts with `specs/`), extract the filename from the `generates` pattern (e.g., `specs/**/*.md` → `spec.md`, `specs/**/verify.md` → `verify.md`)
3. For each capability directory, check for matching files
4. Return `SpecUpdate` objects annotated with the artifact's `deltas[]` config (or undefined for direct copy)

**Where the schema comes from**: `applySpecs()` loads the change's `.openspec.yaml` to get the schema name, then resolves the schema. This is the same pattern used in `validate.ts`.

```typescript
export async function applySpecs(
  projectRoot: string,
  changeName: string,
  options: { dryRun?: boolean; skipValidation?: boolean; silent?: boolean } = {}
): Promise<SpecsApplyOutput> {
  const changeDir = path.join(projectRoot, 'openspec', 'changes', changeName);

  // Load change's schema for artifact configuration
  const metadata = loadChangeMetadata(changeDir);
  const schema = resolveSchema(metadata.schema, projectRoot);
  const outputArtifacts = schema.artifacts.filter(a => a.generates.startsWith('specs/'));

  // Find all spec updates across all output artifacts
  const specUpdates = await findSpecUpdates(changeDir, mainSpecsDir, outputArtifacts);
  // ...
}
```

**Rationale**: The schema already defines which artifacts produce spec files. Using that information makes sync schema-aware without adding configuration elsewhere.

**Alternatives considered**:
- Scan all files in the change's specs directory: Doesn't know which parser/merge strategy to use per file
- Add a separate sync config: Redundant — the artifact's `generates` pattern + `deltas[]` presence already determines behavior

### 6. `RequirementFormatConfig` Accepts Multiple Delta Sections

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

### 7. Pattern Placeholder Validation Covers `deltas[].pattern`

**Decision**: `validatePatternPlaceholders()` in `schema.ts` is updated to check `deltas[].pattern` instead of `sections.requirement.pattern`:

```typescript
function validatePatternPlaceholders(schema: SchemaYaml): void {
  // Check specVerify.pattern
  if (schema.specVerify?.pattern !== undefined && !schema.specVerify.pattern.includes('{name}')) {
    throw new SchemaValidationError(
      `specVerify.pattern must include {name} placeholder, got: "${schema.specVerify.pattern}"`
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

### 8. Validation Rules with `eachBlock` Replace Hardcoded `applySpecRules()`

**Decision**: The current `applySpecRules()` method hardcodes per-requirement checks (normative keywords, scenario count). With `validations[]`, these become configurable rules. However, for the bridge period, `applySpecRules()` continues to work using `SpecValidationConfig` — the config values are now derived from `validations[]` via the bridge.

Long-term, the `validations[]` rules could be evaluated generically by the validator. But for this change, the bridge approach avoids rewriting the validation engine entirely.

**Rationale**: Pragmatic approach — the bridge translates the new config model into the existing validation interface. Full generic validation engine is a future change if needed.

### 9. Skill Prompt Updates Reference `deltas[]` and `specVerify`

**Decision**: Update `skill-templates.ts` prompts to instruct the AI to read `deltas[].section` and `deltas[].pattern` instead of `sections.requirement.section`/`.pattern`, and `specVerify` instead of `specValidation`.

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
→ Accepted: The bridge provides backward compatibility now. Full generic validation is additive — can be done later without breaking changes.

**Trade-off: Removing `sections` is a pre-release breaking change**
Custom schemas that adopted `sections` (from the unreleased `configurable-spec-format`) need to migrate to `deltas[]`/`validations[]`.
→ Accepted: Not yet released. No external migration needed.

**Trade-off: Schema loading adds `resolveSchema` call to `specs-apply.ts`**
The sync path now needs to load the schema to know which artifacts have `deltas[]`.
→ Accepted: One additional file read per sync operation. Negligible performance impact.
