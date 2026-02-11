# Specification (Delta)

## MODIFIED Requirements

### Requirement: Delta Reconciliation Logic
The agent SHALL reconcile main specs with delta specs using delta operation headers derived from the artifact's `deltas[]` configuration. The sync system SHALL support multi-file specs where each output artifact can define its own merge behavior.

#### Scenario: ADDED requirements
- **WHEN** delta contains `## ADDED {section}` (where section comes from `deltas[].section`) with a requirement
- **AND** the requirement does not exist in main spec
- **THEN** add the requirement to main spec

#### Scenario: ADDED requirement already exists
- **WHEN** delta contains `## ADDED {section}` with a requirement
- **AND** a requirement with the same name already exists in main spec
- **THEN** the system throws an error indicating the requirement already exists

#### Scenario: MODIFIED requirements
- **WHEN** delta contains `## MODIFIED {section}` with a requirement
- **AND** the requirement exists in main spec
- **THEN** replace the requirement in main spec with the delta version

#### Scenario: REMOVED requirements
- **WHEN** delta contains `## REMOVED {section}` with a requirement name
- **AND** the requirement exists in main spec
- **THEN** remove the requirement from main spec

#### Scenario: RENAMED requirements
- **WHEN** delta contains `## RENAMED {section}` with FROM:/TO: format
- **AND** the FROM requirement exists in main spec
- **THEN** rename the requirement to the TO name

#### Scenario: New capability spec
- **WHEN** delta spec exists for a capability not in main specs
- **THEN** create new main spec files for all artifacts defined in `requiredSpecArtifacts`

### Requirement: Multi-File Spec Sync
The sync system SHALL discover and handle all markdown files in each spec folder using `requiredSpecArtifacts` to resolve artifact IDs to filenames. Files whose artifact has `deltas[]` are delta-merged; files without `deltas[]` or not matching any artifact are direct-copied.

#### Scenario: Resolve artifact filename from generates
- **WHEN** an artifact has `generates: "specs/**/verify.md"`
- **THEN** the resolved filename is `verify.md` (last path segment, no wildcard)

#### Scenario: Resolve artifact filename fallback to template
- **WHEN** an artifact has `generates: "specs/**/*.md"` and `template: spec.md`
- **THEN** the resolved filename is `spec.md` (wildcard in last segment, fallback to template)

#### Scenario: Discover all markdown files in change spec folder
- **WHEN** a change spec folder contains spec.md and verify.md
- **THEN** the sync discovers both files as updates

#### Scenario: Delta-merge files with deltas[] config
- **WHEN** a discovered file matches an artifact that has `deltas[]` configuration
- **THEN** the sync applies delta merge operations (ADDED/MODIFIED/REMOVED/RENAMED) using that artifact's delta config

#### Scenario: Direct-copy files without deltas[] config
- **WHEN** a discovered file matches an artifact without `deltas[]` or does not match any artifact
- **THEN** the sync copies the file directly to the target location without delta parsing

#### Scenario: Skip non-markdown files
- **WHEN** a change spec folder contains non-markdown files (e.g., .txt, .json)
- **THEN** the sync ignores those files

#### Scenario: Create target directory for new capabilities
- **WHEN** syncing files for a capability that does not exist in main specs
- **THEN** the sync creates the target directory and writes all files

### Requirement: Multi-Delta Section Merge
The sync system SHALL support artifacts with multiple `deltas[]` entries, applying delta merge for each section independently.

#### Scenario: Merge multiple delta sections
- **WHEN** an artifact defines `deltas: [{ section: "Requirements", ... }, { section: "Constraints", ... }]`
- **AND** the change spec contains `## ADDED Requirements` and `## ADDED Constraints`
- **THEN** the sync applies delta merge for both sections in the same target file

#### Scenario: Partial delta sections
- **WHEN** an artifact defines two delta sections but the change spec only contains operations for one
- **THEN** the sync applies the operations for the present section and leaves the other unchanged
