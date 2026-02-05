## Why

Specs are project contracts, not OpenSpec artifacts. They should be independent of the tool used to create or manage them. Currently, the path `openspec/specs` is hardcoded throughout the codebase (CLI commands, schema templates, skill templates), making it impossible to store specs in a location of the project's choosing. Adding a configurable `specsPath` decouples project specifications from OpenSpec's directory structure.

## What Changes

- Add `specsPath` field to `openspec/config.yaml` project configuration, relative to projectRoot, defaulting to `openspec/specs`
- Create a centralized path resolution utility that normalizes `specsPath` into three representations:
  - **absolute**: OS-native full path for file I/O (e.g., `/home/user/project/openspec/specs` or `C:\Users\user\project\openspec\specs`)
  - **relativePosix**: relative to projectRoot, always with `/` separators (e.g., `openspec/specs`) — used in prompts and LLM instructions, identical on all platforms
  - **relative**: relative to projectRoot, OS-native separators (e.g., `openspec/specs` on Linux/Mac, `openspec\specs` on Windows) — used in console output messages
- Replace all hardcoded `openspec/specs` references in CLI commands (~9 source files) with calls to the centralized resolver
- Add `{{specsPath}}` placeholder support in schema instruction templates (schema.yaml, proposal.md), replaced by the instruction loader before returning prompts
- Replace hardcoded paths in skill templates (skill-templates.ts) with `{{specsPath}}` placeholders — same syntax as schema templates, replaced via `transformInstructions` at `openspec update` time when generating files
- Add cross-platform path normalization: config values may use `/` or `\` separators; internal resolution splits on both and reconstructs per target format (POSIX for prompts, OS-native for file I/O)
- Document that changing `specsPath` requires running `openspec update` to regenerate skill files with the new path
- Document the new `specsPath` option in `docs/customization.md` (where project config is documented), including usage examples, default behavior, cross-platform path conventions, and the `openspec update` requirement
- The `{{specsPath}}` placeholder is replaced by the instruction loader for all schemas (built-in, project-local, user-level). Built-in schemas are updated as part of this change
- **Legacy path handling**: For backward compatibility, automatically replace hardcoded `openspec/specs` with the configured `specsPath` value in schemas and templates. Show warning when this occurs in custom schemas, indicating the file affected, suggesting migration to `{{specsPath}}`, and advising to run `openspec update` to regenerate skill files

## Capabilities

### New Capabilities
- `configurable-specs-path`: Defines the `specsPath` configuration option, path resolution utility, cross-platform normalization, and placeholder replacement mechanism
- `docs-specs-path`: Documentation for `specsPath` in `docs/customization.md` including usage examples, path format conventions, cross-platform behavior, `openspec update` requirement after config changes, and `{{specsPath}}` placeholder guidance for custom schema authors

### Modified Capabilities
- `instruction-loader`: Add placeholder replacement support (`{{specsPath}}` and extensible via a key-value map) during instruction generation
- `cli-update`: Generated skill and command files must bake the resolved `specsPath` into their content instead of hardcoded `openspec/specs`
- `specs-sync-skill`: Skill instructions must reference the configured specs path instead of hardcoded `openspec/specs`

## Examples

### Config schema (project-config.ts)

Before:
```typescript
export const ProjectConfigSchema = z.object({
  schema: z.string().min(1),
  context: z.string().optional(),
  rules: z.record(z.string(), z.array(z.string())).optional(),
});
```

After:
```typescript
export const ProjectConfigSchema = z.object({
  schema: z.string().min(1),
  specsPath: z.string().optional()
    .describe('Path to specs directory, relative to projectRoot. Default: openspec/specs'),
  context: z.string().optional(),
  rules: z.record(z.string(), z.array(z.string())).optional(),
});
```

Config example (`openspec/config.yaml`):
```yaml
schema: spec-driven
specsPath: docs/specs      # relative to projectRoot, default: openspec/specs
context: |
  Tech stack: TypeScript, Node.js
```

### Path resolution utility (new)

```typescript
interface SpecsPaths {
  absolute: string;       // OS-native full path for file I/O
  relativePosix: string;  // relative to projectRoot, always '/' — for prompts
  relative: string;       // relative to projectRoot, OS-native — for console
}

function resolveSpecsPaths(projectRoot: string, specsPath?: string): SpecsPaths {
  const raw = specsPath ?? path.join('openspec', 'specs');
  const segments = raw.split(/[/\\]/);
  return {
    absolute: path.resolve(projectRoot, ...segments),
    relativePosix: segments.join('/'),
    relative: path.join(...segments),
  };
}
```

### CLI commands (e.g., archive.ts)

Before:
```typescript
const mainSpecsDir = path.join(targetPath, 'openspec', 'specs');
```

After:
```typescript
const specsPaths = resolveSpecsPaths(targetPath, projectConfig?.specsPath);
const mainSpecsDir = specsPaths.absolute;
```

### Schema templates (schema.yaml) — placeholder replacement

Before:
```yaml
instruction: |
  Check `openspec/specs/` for existing spec names.
  Modified capabilities: use the existing spec folder name from openspec/specs/<capability>/
```

After:
```yaml
instruction: |
  Check `{{specsPath}}/` for existing spec names.
  Modified capabilities: use the existing spec folder name from {{specsPath}}/<capability>/
```

### Instruction loader (instruction-loader.ts) — placeholder engine

Before (returns instruction as-is):
```typescript
return {
  instruction: artifact.instruction,
  // ...
};
```

After (replaces placeholders from an extensible map):
```typescript
const placeholders = new Map<string, string>([
  ['specsPath', specsPaths.relativePosix],
]);
let instruction = artifact.instruction;
for (const [key, value] of placeholders) {
  instruction = instruction.replaceAll(`{{${key}}}`, value);
}
return {
  instruction,
  // ...
};
```

### Skill templates (skill-templates.ts) — same placeholder, replaced at update time

Templates use `{{specsPath}}` just like schema templates — same syntax everywhere.

Before (hardcoded string):
```typescript
b. **Read the main spec** at \`openspec/specs/<capability>/spec.md\` (may not exist yet)
```

After (placeholder, replaced when `openspec update` generates the files):
```typescript
b. **Read the main spec** at \`{{specsPath}}/<capability>/spec.md\` (may not exist yet)
```

The replacement happens in `update.ts` via `transformInstructions`, using the same placeholder map. This keeps a single mechanism across all layers and avoids confusing AI agents that may edit the templates.

### Update command (update.ts) — reads config, replaces placeholders, generates files

Before:
```typescript
const skillTemplates = getSkillTemplates();
```

After:
```typescript
const projectConfig = readProjectConfig(resolvedProjectPath);
const specsPaths = resolveSpecsPaths(resolvedProjectPath, projectConfig?.specsPath);
const placeholders = new Map<string, string>([
  ['specsPath', specsPaths.relativePosix],
]);
const replacePlaceholders = (text: string) => {
  for (const [key, value] of placeholders) {
    text = text.replaceAll(`{{${key}}}`, value);
  }
  return text;
};

const skillTemplates = getSkillTemplates();

// In the generation loop, replacePlaceholders is composed with any existing
// transformer (e.g., OpenCode's transformToHyphenCommands) and passed as the
// transformInstructions callback to generateSkillContent(). This callback
// already exists in the codebase — it receives the raw instruction text and
// returns the transformed text before writing the SKILL.md file.
// Example composition:
const transformer = (text: string) => {
  let result = replacePlaceholders(text);
  if (tool.value === 'opencode') result = transformToHyphenCommands(result);
  return result;
};
const skillContent = generateSkillContent(template, OPENSPEC_VERSION, transformer);
```

### Proposal template (templates/proposal.md) — placeholder

Before:
```markdown
Use existing spec names from openspec/specs/.
```

After:
```markdown
Use existing spec names from {{specsPath}}/.
```

## Impact

- **Config schema**: `project-config.ts` Zod schema gains `specsPath` optional string field
- **Core source files**: `spec.ts`, `archive.ts`, `specs-apply.ts`, `list.ts`, `item-discovery.ts`, `validate.ts`, `init.ts`, `view.ts`, `validator.ts` — all replace hardcoded path construction
- **Instruction loader**: `instruction-loader.ts` gains placeholder replacement before returning instructions
- **Schema files**: `schemas/spec-driven/schema.yaml`, `schemas/spec-driven/templates/proposal.md` — hardcoded paths become `{{specsPath}}`
- **Skill templates**: `skill-templates.ts` — ~6 references replaced with variable interpolation
- **Update command**: `update.ts` reads project config and passes resolved path to skill/command generation
- **Tests**: ~30 test files need updates for configurable path scenarios
- **Documentation**: `docs/customization.md` gains a section for `specsPath` with usage, defaults, cross-platform conventions, `openspec update` requirement, and guidance for custom schema authors to use `{{specsPath}}` instead of hardcoding paths
- **No breaking changes**: Default behavior is identical to current (falls back to `openspec/specs`)
