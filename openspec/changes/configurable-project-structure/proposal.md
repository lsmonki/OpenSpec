# Configurable Project Structure

## Why

OpenSpec currently hardcodes its directory structure, forcing all projects to use `openspec/` with fixed subdirectories for specs, changes, archive, and schemas. This creates friction for:

- **Existing projects** with established `specs/` directories predating OpenSpec adoption
- **Monorepos** wanting custom organization at the repo root (per-package configs have limitations, see below)
- **Teams with conventions** preferring `.openspec/`, `docs/openspec/`, or tool-agnostic names
- **Separation of concerns** wanting archive history in a separate repository to keep the main repo clean
- **Multi-repo setups** sharing a common archive location across projects

OpenSpec is a tool; it should adapt to project structure, not impose its own.

Related: [#581](https://github.com/Fission-AI/OpenSpec/issues/581)

## What Changes

This effectively makes the `openspec/` directory optional — you can have everything wherever you want.

### 1. Config Location

Move configuration from `openspec/config.yaml` to project root (as suggested in #581):

```text
BEFORE                          AFTER
──────                          ─────
repo/                           repo/
├── openspec/                   ├── openspec.config.yaml       ← main config
│   ├── config.yaml             ├── openspec.config.local.yaml ← local override
│   ├── specs/                  ├── specs/                     ← configurable
│   ├── changes/                ├── dev/
│   │   └── archive/            │   ├── changes/               ← configurable
│   └── schemas/                │   ├── archive/               ← configurable
└── src/                        │   └── schemas/               ← configurable
                                └── src/
```

- `openspec.config.yaml` — Main config, committed to repo
- `openspec.config.local.yaml` — Local overrides, gitignored (for developer-specific paths, testing schemas, etc.)

### 2. New Config Fields

All paths relative to project root (where config lives). All optional with backwards-compatible defaults:

```yaml
# openspec.config.yaml
schema: spec-driven

# Directory paths (all optional, shown with defaults)
specsPath: openspec/specs              # already implemented
changesPath: openspec/changes          # new
archivePath: openspec/changes/archive  # new
schemasPath: openspec/schemas          # new
```

Example custom configuration:

```yaml
# openspec.config.yaml
schema: spec-driven
specsPath: specs
changesPath: dev/changes
archivePath: ../archive-repo/my-project  # external repo
schemasPath: dev/sdd-schemas
```

### 3. Placeholder Expansion

Extend the existing `{{specsPath}}` pattern to all configurable paths:

| Placeholder | Replaced With | Used In |
|-------------|---------------|---------|
| `{{specsPath}}` | Configured specs path | Schema instructions, skill templates |
| `{{changesPath}}` | Configured changes path | Skill templates |
| `{{archivePath}}` | Configured archive path | Skill templates, archive instructions |
| `{{schemasPath}}` | Configured schemas path | Schema resolution hints |

### 4. Config Loading with Local Override

```text
Priority (highest to lowest):
1. openspec.config.local.yaml  (developer overrides, gitignored)
2. openspec.config.yaml        (project config, committed)
3. openspec/config.yaml        (legacy location, for backwards compat)
4. Built-in defaults
```

Local config merges with main config (shallow merge at top level).

### 5. External Path Handling

When a configured path is outside the repository:

```yaml
archivePath: ../shared-archive/my-project
```

- Path resolution works normally (relative to project root)
- Warning on archive: "Archive path is outside repository. Remember to commit changes manually."
- No automatic git operations on external paths

## Capabilities

### New Capabilities

- `root-config-loading`: Load config from project root with local override support
- `configurable-paths`: Support changesPath, archivePath, schemasPath config fields
- `path-placeholder-expansion`: Expand {{changesPath}}, {{archivePath}}, {{schemasPath}} in templates
- `docs-project-structure`: Document configurable project structure and all path options

### Modified Capabilities

- `cli-init`: Create config at root, respect configured paths for directory creation
- `cli-archive`: Use archivePath instead of hardcoded location
- `cli-list`: Use changesPath for change discovery
- `schema-resolution`: Use schemasPath for local schema lookup

## Impact

### Code Areas

**Config Loading** (high impact):
- `src/core/project-config.ts` — New root config location, local override merge
- `src/core/config.ts` — Update OPENSPEC_DIR_NAME usage

**Path Resolution** (high impact):
- `src/utils/specs-path.ts` — Generalize to handle all configurable paths
- Create `src/utils/project-paths.ts` — Unified path resolution for all directories

**CLI Commands** (medium impact):
- `src/core/init.ts` — Create config at root, use configured paths
- `src/core/archive.ts` — Use archivePath, warn if external
- `src/core/list.ts` — Use changesPath
- `src/commands/schema.ts` — Use schemasPath

**Discovery** (medium impact):
- `src/utils/item-discovery.ts` — Use changesPath for changes, schemasPath for schemas

**Templates** (low impact):
- `src/core/templates/skill-templates.ts` — Add new placeholders
- `src/core/artifact-graph/instruction-loader.ts` — Expand new placeholders

**Documentation** (medium impact):
- `docs/customization.md` — Add "Project Structure" section explaining all configurable paths
- `docs/getting-started.md` — Update init instructions for new config location
- `docs/concepts.md` — Update directory structure diagrams
- `CHANGELOG.md` — Document feature in Unreleased section

### Backwards Compatibility

- **No breaking changes** — All new fields optional with current defaults
- **Legacy config location** — `openspec/config.yaml` still works if root config doesn't exist
- **No migration required** — Existing projects work unchanged

### External Path Considerations

- Paths outside repo are allowed (for archive especially)
- No automatic git operations on external paths
- Warning message when archiving to external location
- Developer responsible for committing external changes

### Monorepo Considerations

**Single config at root (supported):**

```text
monorepo/
├── openspec.config.yaml      ← Single config
├── .claude/skills/           ← Skills here
├── specs/
├── changes/
└── packages/
    ├── api/
    └── web/
```

This works because AI tools find skills at the git root.

**Per-package configs (NOT supported in this proposal):**

```text
monorepo/
├── packages/
│   ├── api/
│   │   └── openspec.config.yaml   ← Config here
│   │   └── .claude/skills/        ← Skills here, but IGNORED
```

AI tools (Claude, Codex, etc.) look for the git root to find their skills directory. Running `openspec update` in a package creates skills that won't be used — the AI will use skills at the monorepo root instead.

Per-package support would require future work:
- Smarter skill prompts that discover configs dynamically
- A root-level monorepo config listing package paths
- A new command to query project config at runtime (e.g., `openspec project --json`)

This proposal provides the foundation for that future work.
