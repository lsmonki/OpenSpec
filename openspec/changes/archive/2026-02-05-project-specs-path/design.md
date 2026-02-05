## Context

OpenSpec currently hardcodes `openspec/specs` as the specs directory path in ~9 CLI source files, schema templates, and skill templates. This coupling prevents projects from storing specifications in custom locations (e.g., `docs/specs`, `contracts/api`).

The codebase already has patterns for:
- Project configuration via `openspec/config.yaml` (schema, context, rules)
- Placeholder replacement in skill generation (`transformInstructions` callback)
- Cross-platform path handling via Node.js `path` module

## Goals / Non-Goals

**Goals:**
- Allow projects to configure specs location via `specsPath` in `config.yaml`
- Maintain full backward compatibility (default to `openspec/specs`)
- Support cross-platform paths (Windows backslashes, POSIX forward slashes)
- Provide consistent placeholder syntax (`{{specsPath}}`) across schemas and skills
- Warn users with legacy hardcoded paths in custom schemas

**Non-Goals:**
- Supporting multiple specs directories per project
- Runtime path changes without `openspec update`
- Migrating existing specs to new locations (user responsibility)
- Supporting absolute paths in config (always relative to projectRoot)

## Decisions

### 1. Single path resolution utility

**Decision**: Create `resolveSpecsPaths()` returning three representations (absolute, relative, relativePosix).

**Rationale**: Different contexts need different formats:
- File I/O needs absolute OS-native paths
- Console output needs relative OS-native paths
- LLM prompts need consistent POSIX paths (avoid confusing agents with backslashes)

**Alternatives considered**:
- Single path format everywhere → Would require escaping backslashes in prompts or break Windows file I/O
- Lazy resolution per call site → Would duplicate normalization logic

### 2. Placeholder syntax `{{specsPath}}`

**Decision**: Use double-brace Mustache-style placeholders, replaced at instruction load time for schemas and at `openspec update` time for skills.

**Rationale**:
- Consistent syntax across all template types
- Non-ambiguous (unlikely to conflict with markdown or code)
- Extensible to future placeholders via key-value map

**Alternatives considered**:
- `$specsPath` or `${specsPath}` → Could conflict with shell variables in instructions
- Different syntax per layer → Confusing for schema authors

### 3. Legacy path auto-replacement with warning

**Decision**: Automatically replace literal `openspec/specs` with configured path, but emit a warning for custom schemas suggesting migration to `{{specsPath}}`.

**Rationale**: Ensures custom schemas work immediately while guiding authors toward the canonical approach.

**Alternatives considered**:
- Hard fail on hardcoded paths → Would break existing custom schemas
- Silent replacement → Authors wouldn't know to update their schemas

### 4. Skill placeholder replacement at update time

**Decision**: Replace `{{specsPath}}` in skill templates during `openspec update`, not at runtime.

**Rationale**:
- Skills are generated files, not templates interpreted at runtime
- Baking the path avoids runtime config lookup in skill execution
- Consistent with how OpenCode transformations already work

### 5. Path normalization on input

**Decision**: Split config `specsPath` on both `/` and `\`, then reconstruct per target format.

**Rationale**: Users may copy-paste paths from Windows Explorer or Unix terminals. Accepting either separator improves DX.

## Risks / Trade-offs

**[Risk]** User changes `specsPath` but forgets `openspec update`
→ Skills will reference old path. Mitigated by documenting requirement and showing reminder in CLI output when config changes detected.

**[Risk]** Legacy replacement masks schema authoring errors
→ Warning message explicitly names the file and suggests `{{specsPath}}`. Authors who ignore warnings accept the behavior.

**[Risk]** Placeholder collision with user content containing `{{specsPath}}`
→ Extremely unlikely in spec/design documentation. No mitigation needed for v1.

**[Trade-off]** Three path representations add complexity
→ Accepted because each serves a distinct, documented purpose. Utility function encapsulates the logic.

## Documentation

Documentation updates required in `docs/customization.md`:

### specsPath Configuration Section

```markdown
## Specs Directory Location

By default, OpenSpec stores specifications in `openspec/specs/`. You can customize this location using the `specsPath` option in your project configuration.

### Configuration

Add `specsPath` to your `openspec/config.yaml`:

\`\`\`yaml
schema: spec-driven
specsPath: docs/specs  # relative to project root
\`\`\`

### Path Format

- Paths are always relative to the project root
- Both forward slashes (`/`) and backslashes (`\`) are accepted
- Cross-platform: same config works on Windows, macOS, and Linux

### After Changing specsPath

Run `openspec update` to regenerate skill files with the new path:

\`\`\`bash
openspec update
\`\`\`

This ensures AI agent instructions reference the correct specs location.

### For Custom Schema Authors

Use the `{{specsPath}}` placeholder in your schema instructions instead of hardcoding `openspec/specs`:

\`\`\`yaml
# schema.yaml
artifacts:
  specs:
    instruction: |
      Check `{{specsPath}}/` for existing spec names.
\`\`\`

The placeholder is automatically replaced with the project's configured path.
```

### TSDoc for resolveSpecsPaths

```typescript
/**
 * Resolves specs path into three representations for different contexts.
 *
 * @param projectRoot - Absolute path to project root
 * @param specsPath - Optional relative path from config (default: 'openspec/specs')
 * @returns Object with absolute, relative, and relativePosix paths
 *
 * @example
 * // Unix
 * resolveSpecsPaths('/home/user/project', 'docs/specs')
 * // Returns: { absolute: '/home/user/project/docs/specs', relative: 'docs/specs', relativePosix: 'docs/specs' }
 *
 * @example
 * // Windows
 * resolveSpecsPaths('C:\\Users\\user\\project', 'docs/specs')
 * // Returns: { absolute: 'C:\\Users\\user\\project\\docs\\specs', relative: 'docs\\specs', relativePosix: 'docs/specs' }
 */
```

## Migration Plan

1. Add `specsPath` to config schema with default `openspec/specs`
2. Implement `resolveSpecsPaths()` utility
3. Update CLI commands to use resolver
4. Update built-in schema templates to use `{{specsPath}}`
5. Update skill templates to use `{{specsPath}}`
6. Add placeholder replacement to instruction loader and update command
7. Add legacy path warning for custom schemas
8. Update `docs/customization.md` with specsPath section
9. Add tests for custom path scenarios

Rollback: Revert commits. No data migration involved—config field is optional and defaults preserve current behavior.
