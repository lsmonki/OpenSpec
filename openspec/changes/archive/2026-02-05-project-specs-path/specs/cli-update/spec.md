## MODIFIED Requirements

### Requirement: Tool-Agnostic Updates
The update command SHALL refresh OpenSpec-managed files in a predictable manner while respecting each team's chosen tooling and configured specs path.

#### Scenario: Updating files
- **WHEN** updating files
- **THEN** completely replace `openspec/AGENTS.md` with the latest template
- **AND** create or refresh the root-level `AGENTS.md` stub using the managed marker block, even if the file was previously absent
- **AND** update only the OpenSpec-managed sections inside existing AI tool files, leaving user-authored content untouched
- **AND** avoid creating new native-tool configuration files (slash commands, CLAUDE.md, etc.) unless they already exist

#### Scenario: Placeholder replacement in skill files
- **WHEN** generating skill files during update
- **AND** project config has `specsPath: docs/specs`
- **THEN** replace `{{specsPath}}` placeholders with `docs/specs` in all generated content

#### Scenario: Default specsPath in skill files
- **WHEN** generating skill files during update
- **AND** project config does not have `specsPath`
- **THEN** replace `{{specsPath}}` placeholders with `openspec/specs`

## ADDED Requirements

### Requirement: Specs Path Placeholder Replacement

The update command SHALL replace `{{specsPath}}` placeholders in skill templates with the configured specs path.

#### Scenario: Transform skill instructions with specsPath
- **WHEN** generating skill content from templates
- **THEN** the system SHALL compose placeholder replacement with any existing transformers
- **AND** use the `relativePosix` format for the specsPath value

#### Scenario: Placeholder in proposal skill
- **WHEN** the proposal skill template contains `{{specsPath}}`
- **AND** project config has `specsPath: contracts/api`
- **THEN** the generated skill file SHALL contain `contracts/api`

#### Scenario: Placeholder in archive skill
- **WHEN** the archive skill template contains `{{specsPath}}`
- **AND** project config has `specsPath: docs/specs`
- **THEN** the generated skill file SHALL contain `docs/specs`
