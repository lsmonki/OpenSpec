## Context

OpenSpec currently hardcodes spec format expectations in parsers, validators, and generators. This prevents adoption by projects with pre-existing specs in different formats. The proposal defines new schema fields (`changeValidation`, `specValidation`, artifact-level `sections`) that allow schemas to specify their own format conventions.

Current architecture:
- **Parsers** (`markdown-parser.ts`, `requirement-blocks.ts`) use hardcoded patterns like `## Requirements`, `### Requirement: {name}`, `#### Scenario: {name}`
- **Validators** (`validator.ts`, `validate.ts`) expect inline scenarios in spec.md
- **Generators** (`specs-apply.ts`, `skill-templates.ts`) emit fixed delta format (`## ADDED Requirements`, etc.)
- **Discovery** (`item-discovery.ts`) only looks for `spec.md` files

The system needs to read format configuration from the schema and pass it through the parsing/validation/generation pipeline.

## Goals / Non-Goals

**Goals:**
- Allow schemas to define custom requirement section headers (e.g., `## Functional Requirements`)
- Allow schemas to define custom requirement patterns (e.g., `### Req: {name}`, `## RF-001: {name}`)
- Allow schemas to specify whether scenarios are inline, in separate files, or not required
- Allow schemas to define scenario patterns (e.g., `### Scenario:`, Given/When/Then)
- Maintain full backward compatibility - existing schemas work without modification
- Make LLM prompts schema-aware so generated specs match the configured format

**Non-Goals:**
- Changing the internal canonical format (parsers still produce the same internal representation)
- Supporting arbitrary markdown structures (we support configurable headers, not arbitrary nesting)
- Multi-language section headers in a single schema (one format per schema)
- Runtime format detection (format is explicitly configured in schema)

## Decisions

### 1. Format Configuration at Schema Level, Not Change Level

**Decision**: Format configuration lives in `schema.yaml`, not in individual change configs.

**Rationale**: A schema represents a workflow pattern that a team or project adopts. Format conventions are part of that pattern - they shouldn't vary between changes using the same schema.

**Alternatives considered**:
- Per-change configuration: More flexible but adds complexity and inconsistency risk
- Global OpenSpec config: Doesn't support multi-schema projects

### 2. Single Parse Pipeline with Format Parameters

**Decision**: Keep the existing parse pipeline but add format parameters. Parsers accept configuration objects that specify patterns to look for.

```typescript
// Before
function extractRequirements(content: string): Requirement[] {
  const pattern = /^### Requirement: (.+)$/gm;  // hardcoded
  ...
}

// After
interface RequirementFormat {
  sectionHeader: string;      // e.g., "Functional Requirements"
  pattern: string;            // e.g., "### Requirement: {name}"
}

function extractRequirements(content: string, format: RequirementFormat): Requirement[] {
  const regex = buildPatternRegex(format.pattern);
  ...
}
```

**Rationale**: Minimizes changes to existing architecture. Format becomes a parameter, not a structural change.

**Alternatives considered**:
- Pluggable parser system: Over-engineered for the problem; we're just changing patterns, not parsing logic
- Template-based parsing: Would require a templating DSL; regex patterns are sufficient

### 3. Schema Loading Provides Format Defaults

**Decision**: The schema loading layer (`artifact-graph/schema.ts`) applies defaults when loading a schema. Consumers receive a fully-populated format configuration.

```typescript
// Schema loader fills in defaults
const loadedSchema = {
  specValidation: {
    artifact: schema.specValidation?.artifact ?? 'specs',
    pattern: schema.specValidation?.pattern ?? '#### Scenario: {name}',
    required: schema.specValidation?.required ?? true,
  },
  // ... artifacts with populated sections
};
```

**Rationale**: Centralizes default logic. Downstream code doesn't need to handle missing values.

**Alternatives considered**:
- Defaults at point of use: Scatters default values across codebase, harder to maintain

### 4. LLM Prompts Read Schema at Runtime

**Decision**: Skill templates instruct the AI to read the schema file and extract format configuration. Prompts are generic; the AI adapts to the schema.

**Rationale**:
- No code changes to skill loading system
- Works with any future schema without prompt updates
- AI already reads files as part of the workflow

**Alternatives considered**:
- Code-based prompt templating: Would require exposing schema config to skill system, more invasive
- Pre-processing prompts: Adds complexity to skill loading

### 5. Spec Discovery Reads All Files per Schema

**Decision**: `getSpecIds()` and related functions read the schema to understand which files constitute a "spec". Instead of hardcoding `spec.md`, they match files against the schema's artifact patterns.

**Rationale**: Different schemas may have different file compositions. Discovery must be schema-aware.

**Implementation approach**:
1. Load the schema for the current context (change or global)
2. Find artifacts that generate to `specs/**/*` patterns
3. For each spec directory, verify required files exist

### 6. Move Configurable Validations from Zod to Validator Class

**Decision**: Validations that need to be configurable (SHALL/MUST requirement, minimum scenarios) are moved from Zod schemas (`base.schema.ts`) to the Validator class (`validator.ts`).

**Rationale**: Zod schemas are static - they validate structure at parse time without access to schema configuration. To make validations configurable:
- Zod validates only structure (non-empty text, array types)
- Validator class applies business rules with config access (normative keywords when `shallMustPattern` is set, scenarios when `specValidation.required: true`)

**Implementation**:
```typescript
// In Zod schema - only structural validation
export const RequirementSchema = z.object({
  text: z.string().min(1, VALIDATION_MESSAGES.REQUIREMENT_EMPTY),
  scenarios: z.array(ScenarioSchema),  // No .min(1) - validator handles this
});

// In Validator - configurable validation with regex pattern
const shallMustPattern = config?.shallMustPattern === undefined ? 'SHALL|MUST' : config.shallMustPattern;
if (shallMustPattern && !new RegExp(`\\b(${shallMustPattern})\\b`).test(req.text)) {
  issues.push({ type: 'error', message: `must match normative pattern: ${shallMustPattern}` });
}
```

**Example patterns:**
- `"SHALL|MUST"` - Default, strict RFC 2119 uppercase
- `"[Ss][Hh][Aa][Ll][Ll]|[Mm][Uu][Ss][Tt]"` - Case-insensitive
- `"DEBE|DEBERÁ"` - Spanish normative keywords
- `null` or `""` - Disable validation entirely

**Alternatives considered**:
- Passing config to Zod refinements: Complex, Zod refinements don't receive external context easily
- Separate validation passes: More code, harder to maintain consistent error messages

### 7. Pattern Syntax Uses `{name}` Placeholder

**Decision**: Patterns use `{name}` as the placeholder for dynamic content. This is converted to a regex capture group at runtime.

```yaml
pattern: "### Requirement: {name}"
# Becomes regex: /^### Requirement: (.+)$/
```

**Rationale**: Simple, readable, sufficient for the use cases. No need for a full templating language.

**Alternatives considered**:
- Raw regex in config: Less readable, error-prone for non-developers
- Full template syntax (Mustache, etc.): Overkill for simple substitution

### 8. CLI Validate Command Reads Project Schema

**Decision**: The `validate` command reads the project's `.openspec.yaml` config, resolves its schema, and builds validation config from the schema.

**Rationale**: Validation must use the schema's configuration to properly validate specs. Without this, hardcoded defaults would be used even when the schema specifies different formats.

**Implementation**:
```typescript
// In validate.ts
function loadProjectValidationConfig(projectRoot: string): SpecValidationConfig | undefined {
  const config = readProjectConfig(projectRoot);
  if (!config?.schema) return undefined;
  const schema = resolveSchema(config.schema, projectRoot);
  return buildValidationConfig(schema);
}

function buildValidationConfig(schema: SchemaYaml): SpecValidationConfig {
  const specsArtifact = schema.artifacts.find(a => a.id === 'specs');
  const sections = specsArtifact?.sections;
  return {
    requiredSections: sections?.required,
    requirementSection: sections?.requirement?.section,
    requirementPattern: sections?.requirement?.pattern,
    scenarioPattern: schema.specValidation?.pattern,
    scenariosRequired: schema.specValidation?.required,
    scenarioArtifact: schema.specValidation?.artifact,
    shallMustPattern: schema.specValidation?.shallMustPattern,
  };
}
```

**Flow**: CLI → project config → resolve schema → build validation config → pass to Validator

## Risks / Trade-offs

**Risk: Pattern matching edge cases**
Patterns like `### Requirement: {name}` may not handle all markdown variations (extra whitespace, inline formatting).
→ Mitigation: Normalize whitespace before matching; document supported patterns.

**Risk: Schema migration complexity**
Existing custom schemas need to add new fields to customize behavior.
→ Mitigation: All fields optional with backward-compatible defaults. Existing schemas work unchanged.

**Risk: LLM prompt reliability**
Relying on AI to read and apply schema configuration adds variability.
→ Mitigation: Provide clear, explicit instructions in prompts. Test with various schemas.

**Trade-off: Configuration complexity vs flexibility**
More configuration options mean more for users to understand.
→ Accepted: Power users who need custom formats will read the docs. Default behavior requires no configuration.

**Trade-off: Performance of schema-aware parsing**
Loading schema for every parse operation adds overhead.
→ Accepted: Schema is loaded once per command invocation, not per file. Cache schema in memory during operations.
