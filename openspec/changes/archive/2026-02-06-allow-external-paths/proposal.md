## Why

Code review of `feature/project-specs-path` found a path traversal vulnerability in `resolveSpecsPaths` — a `specsPath: ../../etc` config value allows reading outside the project root with no validation. This needs to be fixed before merge, with an explicit opt-in mechanism for legitimate external path use cases (e.g., shared specs across projects in a monorepo).

## What Changes

### Generic path validation function

New `validateConfigPath` utility that encapsulates the three security layers (depth limit, denylist, root containment). Used by `resolveSpecsPaths` today, designed to be reusable by future configurable paths (`changesPath`, `schemasPath`, `archivePath`, etc.).

```typescript
validateConfigPath(resolvedAbsolute: string, projectRoot: string, options: {
  fieldName: string;        // e.g., 'specsPath' — for error messages
  allowExternal?: boolean;  // optional override — reads from config if omitted
}): void  // throws on violation
```

The function is path-agnostic — it doesn't know about specs, just about validating a resolved absolute path against a project root. By default it reads `allowExternalPaths` from the project config (`readProjectConfig(projectRoot)`), but accepts an optional override for testing and special cases. This means callers of `resolveSpecsPaths` don't need to change — the validation is fully self-contained.

### `allowExternalPaths` config flag

New optional boolean field in `openspec/config.yaml`:

```yaml
specsPath: ../shared-specs
allowExternalPaths: true  # required when specsPath points outside project root
```

**Behavior matrix:**

| specsPath resolves to | allowExternalPaths | Result |
|---|---|---|
| Inside project root | `false` (default) | OK — no warning |
| Inside project root | `true` | OK — no warning |
| Outside project root | `false` (default) | **Error** with message suggesting the flag |
| Outside project root | `true` | **Warning** on first use, then proceeds normally |
| Outside project root, >3 `..` segments | any | **Error** always — too deep |
| Protected system directory | any | **Error** always — cannot be overridden |

The error message guides the user: `"specsPath '../../etc' resolves outside project root. Set 'allowExternalPaths: true' in openspec/config.yaml to allow this."`.

The warning (when allowed) fires once per process to avoid noise: `"specsPath resolves to '/home/shared-specs' which is outside the project root."`.

**Parent traversal depth limit:**

Paths with more than 3 `..` segments are always rejected, regardless of `allowExternalPaths`. This covers most real-world multi-team structures while preventing unbounded traversal. Examples:
- `../shared-specs` → OK (1 level up, needs `allowExternalPaths`)
- `../../team-b/specs` → OK (2 levels up, needs `allowExternalPaths`)
- `../../../infra/specs` → OK (3 levels up, needs `allowExternalPaths`)
- `../../../../specs` → **Error** always — `"specsPath contains 4 '..' segments, maximum is 3."`

**Protected system directories (denylist):**

Even with `allowExternalPaths: true`, paths that resolve into protected OS directories are always rejected with an error. This is a hard safety net that cannot be overridden.

- **Linux**: `/etc`, `/usr`, `/bin`, `/sbin`, `/boot`, `/proc`, `/sys`, `/dev`, `/root`
- **macOS**: `/System`, `/Library`, `/Applications`
- **Windows**: `C:\Windows`, `C:\Program Files`, `C:\Program Files (x86)`, `C:\ProgramData`

The check uses `path.resolve()` and verifies the resolved absolute path does not start with any denied prefix. Error message: `"specsPath resolves to a protected system directory ('/etc'). This is not allowed regardless of allowExternalPaths."`.

### Empty/whitespace `specsPath` normalization

Currently, `specsPath: ""` produces empty path segments. After this change:
- Empty string (`""`) → falls back to default `openspec/specs`
- Whitespace-only (`"   "`) → falls back to default `openspec/specs`
- `undefined`/missing → falls back to default (no change)

## Capabilities

### New Capabilities

- `path-traversal-guard`: Generic configurable path validation. Enforces three security layers: max 3 `..` segments, platform-aware system directory denylist, and project root containment (configurable via `allowExternal`). Designed as a reusable function (`validateConfigPath`) for any configurable path — used by `resolveSpecsPaths` now, ready for future paths like `changesPath`, `schemasPath`, `archivePath`.

### Modified Capabilities

- `configurable-specs-path`: Add `allowExternalPaths` boolean field to config schema (default: `false`). Change empty/whitespace `specsPath` to fall back to default `openspec/specs` instead of producing empty/broken paths.
- `docs-specs-path`: Update `docs/customization.md` to document the `allowExternalPaths` flag, security behavior, and external path usage for monorepos.

## Impact

- **Config schema** (`src/core/project-config.ts`): New optional `allowExternalPaths: boolean` field in `ProjectConfigSchema`
- **Path validation** (`src/utils/path-validation.ts`): New generic `validateConfigPath` function with denylist, depth limit, and root containment — reusable for future configurable paths
- **Path resolution** (`src/utils/specs-path.ts`): Calls `validateConfigPath` internally, empty string normalization. No signature change — existing callers are unaffected
- **Documentation** (`docs/customization.md`): New section documenting `allowExternalPaths`, security restrictions, and monorepo usage patterns
- **Spec** (`openspec/specs/docs-specs-path/spec.md`): Updated spec for the documentation requirements
- **Tests**: New path traversal security tests, updated empty string behavior test, denylist tests, depth limit tests
- **No breaking changes**: Default behavior (no `allowExternalPaths` in config) is stricter but previously-valid internal paths continue to work. Only external paths that weren't validated before will now error.
