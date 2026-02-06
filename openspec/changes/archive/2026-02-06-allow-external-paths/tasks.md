## 1. Generic path validation module

- [x] 1.1 Create `src/utils/path-validation.ts` with `validateConfigPath` function, `DENIED_PREFIXES` constant, `MAX_PARENT_TRAVERSAL` constant, `warnedFields` set, and `_resetWarnings()` test helper
- [x] 1.2 Implement depth limit check: count `..` in raw segments, throw if > `MAX_PARENT_TRAVERSAL` (3) with `fieldName` in error message
- [x] 1.3 Implement platform-aware denylist check: use `process.platform` to select prefixes, compare resolved absolute path with `startsWith(prefix + path.sep)`, case-insensitive on `win32`
- [x] 1.4 Implement root containment check: read `allowExternalPaths` from config via `readProjectConfig(projectRoot)` (accept optional `allowExternal` override for tests), throw if outside root and not allowed, warn once per `fieldName` if allowed

## 2. Config schema update

- [x] 2.1 Add `allowExternalPaths` boolean field to `ProjectConfigSchema` in `src/core/project-config.ts` (optional, default `false`)
- [x] 2.2 Add resilient field-by-field parsing for `allowExternalPaths` in `readProjectConfig` (same pattern as other fields, warn on invalid type)

## 3. Update `resolveSpecsPaths`

- [x] 3.1 Add empty/whitespace normalization: trim input, fall back to `DEFAULT_SPECS_PATH` if empty or whitespace-only
- [x] 3.2 Call `validateConfigPath` after resolving absolute path, passing `fieldName: 'specsPath'` and raw segments. No signature change — `validateConfigPath` reads config internally

## 4. Tests

- [x] 4.1 Create `test/utils/path-validation.test.ts` with tests for depth limit (3 ok, 4 error, scattered `..` counting)
- [x] 4.2 Add denylist tests: Linux/macOS paths blocked, Windows paths blocked with case-insensitive match, cross-platform isolation (Linux ignores Windows prefixes)
- [x] 4.3 Add root containment tests: error when outside + config `false`, warning when outside + config `true`, no error/warning when inside, warning-once-per-fieldName behavior, `allowExternal` override parameter
- [x] 4.4 Add validation order tests: depth error before denylist, denylist error before containment
- [x] 4.5 Update `test/utils/specs-path.test.ts`: fix empty string test to expect `DEFAULT_SPECS_PATH`, add whitespace-only test, add integration test verifying `validateConfigPath` is called
- [x] 4.6 Add `allowExternalPaths` config parsing tests in existing config test file (valid boolean, invalid type warning, missing defaults to `false`)

## 5. Documentation

- [x] 5.1 Update `docs/customization.md` "Custom Specs Directory" section: add `allowExternalPaths` subsection with config example, security behavior explanation, and monorepo use case with directory structure
- [x] 5.2 Add security restrictions subsection: system directory denylist (per platform), `..` depth limit (max 3) with valid/invalid examples

## 6. Verification

- [x] 6.1 Run full test suite (`pnpm test`) and verify all tests pass
- [x] 6.2 Run build (`pnpm build`) and verify no TypeScript errors
- [x] 6.3 Manual test: set `specsPath: ../../etc` without flag → verify error with helpful message
- [x] 6.4 Manual test: set `specsPath: ../shared` with `allowExternalPaths: true` → verify warning on first command, no warning on second
