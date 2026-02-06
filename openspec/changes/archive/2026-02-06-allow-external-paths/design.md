## Context

`resolveSpecsPaths` in `src/utils/specs-path.ts` takes a `projectRoot` and optional `specsPath` string, splits on separators, and resolves an absolute path. It performs no validation — any value including `../../etc` is accepted. This function is called from 7+ call sites across `init.ts`, `update.ts`, `instruction-loader.ts`, `spec.ts`, `validate.ts`, `item-discovery.ts`, `list.ts`, `view.ts`, and `archive.ts`.

The config schema in `project-config.ts` validates `specsPath` as `z.string().min(1).optional()` — no path safety checks.

Empty string `specsPath` currently passes through and produces empty segments (`relativePosix: ''`), which is a bug since config validation rejects it but the function doesn't guard against it.

## Goals / Non-Goals

**Goals:**
- Prevent path traversal outside project root by default
- Allow legitimate external paths (monorepo shared specs) with explicit opt-in
- Hard-block dangerous system directories on all platforms
- Cap `..` traversal depth as defense-in-depth
- Normalize empty/whitespace `specsPath` to default
- No API change to `resolveSpecsPaths` — zero caller updates needed
- Generic validation function reusable for future configurable paths (`changesPath`, `schemasPath`, `archivePath`, etc.)
- Update user-facing documentation (`docs/customization.md`) and its spec (`docs-specs-path`)

**Non-Goals:**
- Symlink resolution or validation (out of scope — would need `fs.realpathSync`)
- Validating that the target directory exists (already handled elsewhere)
- Caching or memoizing `resolveSpecsPaths` results
- Changes to other commands (`spec.ts` static init, `validate.ts` duplicate reads — separate changes)

## Decisions

### 1. Generic `validateConfigPath` function

**Decision**: Extract validation into a standalone `validateConfigPath` in a new `src/utils/path-validation.ts` module. `resolveSpecsPaths` calls it internally after resolving the absolute path.

```typescript
// src/utils/path-validation.ts
export function validateConfigPath(
  resolvedAbsolute: string,
  projectRoot: string,
  options: {
    fieldName: string;        // for error messages: 'specsPath', 'changesPath', etc.
    rawSegments: string[];    // pre-split segments for .. counting
    allowExternal?: boolean;  // optional override — reads from config if omitted
  }
): void  // throws on violation
```

**Why**: The three security layers (depth limit, denylist, root containment) are path-agnostic — they don't know about specs. When future configurable paths are added (`changesPath`, `schemasPath`, `archivePath`), each resolver just calls `validateConfigPath` with its own `fieldName`. No duplication, consistent security behavior across all paths.

`validateConfigPath` reads `allowExternalPaths` from the project config (`readProjectConfig(projectRoot)`) by default. The optional `allowExternal` parameter overrides this for testing and special cases. This means `resolveSpecsPaths` doesn't need a new `options` parameter and **zero callers need to change**.

**Alternative considered**: Requiring every caller to pass `allowExternal` explicitly. Rejected — all 7+ callers would need identical boilerplate (`{ allowExternal: projectConfig?.allowExternalPaths }`), and forgetting it at a new call site would silently skip validation.

### 2. No signature change to `resolveSpecsPaths`

**Decision**: `resolveSpecsPaths` keeps its current signature — no new `options` parameter.

```typescript
resolveSpecsPaths(projectRoot: string, specsPath?: string): SpecsPaths
```

**Why**: Since `validateConfigPath` reads the config internally via `readProjectConfig(projectRoot)`, there's no need to thread `allowExternal` through. All 7+ callers remain unchanged. The extra config read is negligible (~0.5ms per the existing perf note in `project-config.ts`).

**Alternative considered**: Adding `options?: { allowExternal?: boolean }` to `resolveSpecsPaths`. Rejected — all callers would need identical boilerplate to pass the flag from config.

### 3. Denylist approach for system directories

**Decision**: Platform-aware denylist using `process.platform` to select which prefixes to check. Lives in `path-validation.ts` as exported constants (testable, reusable).

```typescript
// src/utils/path-validation.ts
export const DENIED_PREFIXES: Record<string, string[]> = {
  linux: ['/etc', '/usr', '/bin', '/sbin', '/boot', '/proc', '/sys', '/dev', '/root'],
  darwin: ['/System', '/Library', '/Applications', '/etc', '/usr', '/bin', '/sbin'],
  win32: ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData'],
};
```

Check runs after `path.resolve()` against the resolved absolute path using `startsWith(prefix + path.sep)` or exact match.

**Why**: `process.platform` is reliable at runtime. Using resolved absolute paths prevents tricks with relative segments. Prefix list covers the most dangerous OS directories without being overly broad.

**Alternative considered**: Single combined list for all platforms. Rejected — would check Linux paths on Windows and vice versa, adding noise and potential false positives (e.g., a project folder called `Library` on Linux).

### 4. Depth limit implementation

**Decision**: Count `..` segments in the raw input before resolution. Uses `fieldName` in error messages for generic use.

```typescript
// Inside validateConfigPath:
const dotDotCount = options.rawSegments.filter(s => s === '..').length;
if (dotDotCount > MAX_PARENT_TRAVERSAL) {
  throw new Error(
    `${options.fieldName} contains ${dotDotCount} '..' segments, maximum is ${MAX_PARENT_TRAVERSAL}.`
  );
}
```

`MAX_PARENT_TRAVERSAL = 3` exported as a constant from `path-validation.ts`.

**Why**: Counting raw segments is simple and transparent. Checking after normalization could miss `a/../../b/../../../c` patterns where `path.resolve` collapses segments.

**Alternative considered**: Check resolved path distance from root. Rejected — harder to explain in error messages and less intuitive.

### 5. One-time warning mechanism

**Decision**: Module-level `Set<string>` in `path-validation.ts` tracking which field names have already warned.

```typescript
// src/utils/path-validation.ts
const warnedFields = new Set<string>();

// Inside validateConfigPath, when allowExternal && isOutside:
if (!warnedFields.has(options.fieldName)) {
  console.warn(`Warning: ${options.fieldName} resolves to '${resolvedAbsolute}' which is outside the project root.`);
  warnedFields.add(options.fieldName);
}
```

**Why**: Using a `Set<string>` keyed by `fieldName` means each configurable path warns independently — `specsPath` warns once, a future `changesPath` warns once, etc. The set resets per process which is the right lifetime. Export `_resetWarnings()` for tests.

**Alternative considered**: Simple boolean flag. Rejected — would suppress the warning for a second configurable path if the first already triggered it.

### 6. Validation order

**Decision**: Validation order inside `validateConfigPath` (called by `resolveSpecsPaths` after resolving):

In `resolveSpecsPaths`:
1. Normalize empty/whitespace → default
2. Split segments

In `validateConfigPath` (receives segments + resolved absolute):
3. Count `..` → depth error if >3
4. Check denylist → error if matches
5. Check if outside project root → error if `!allowExternal`, warning if `allowExternal`

Back in `resolveSpecsPaths`:
6. Return paths

**Why**: `resolveSpecsPaths` handles the specs-specific concerns (normalization, segment splitting, path construction). `validateConfigPath` handles the generic security checks. Cheapest checks first within validation. Denylist before the external check because denied paths should error regardless of `allowExternal`.

### 7. Config schema addition

**Decision**: Add to `ProjectConfigSchema` in `project-config.ts`:

```typescript
allowExternalPaths: z
  .boolean()
  .optional()
  .default(false)
  .describe('Allow specsPath to point outside project root. Default: false'),
```

Parse with the same resilient field-by-field approach used for other fields.

### 8. Documentation updates

**Decision**: Update `docs/customization.md` "Custom Specs Directory" section to document:

- The `allowExternalPaths` config flag with usage example
- Security behavior: what happens when paths go outside root (error vs. warning)
- Monorepo use case example with external shared specs
- Restrictions: system directory denylist and `..` depth limit (max 3)

Also create a delta spec for `docs-specs-path` to capture the new documentation requirements.

**Why**: The `customization.md` doc is where users learn about `specsPath` — adding `allowExternalPaths` there keeps all path configuration in one place. Users who hit the error need to find the flag quickly, and the doc is the first place they'll look.

## Risks / Trade-offs

**Denylist maintenance** → The system directory list is hardcoded and may not cover all dangerous paths (e.g., custom mount points). Mitigation: the list covers the most common OS paths; the depth limit and default-deny provide additional layers.

**Symlink bypass** → A path like `../safe-looking-dir` could be a symlink to `/etc`. Mitigation: out of scope for this change — would require `fs.realpathSync` which has its own caveats (TOCTOU, performance). The current threat model is config-level mistakes, not adversarial symlink attacks.

**Module-level warning state** → The `warnedFields` set is module-level, meaning if `validateConfigPath` is called with the same `fieldName` but different project roots in the same process (e.g., tests), the warning only fires for the first call. Mitigation: acceptable trade-off — in production each process handles one project. Tests can reset via exported `_resetWarnings()` helper.

**Windows path case sensitivity** → `C:\windows` vs `C:\Windows` could bypass the denylist on Windows. Mitigation: normalize both the resolved path and denylist prefixes to lowercase on `win32` before comparison.
