# Specification (Delta)

## MODIFIED Requirements

### Requirement: Document schema validation fields

The documentation SHALL include a "Custom Spec Formats" section in `docs/customization.md` that explains how to configure spec validation in custom schemas using `changeVerify`, `requiredSpecArtifacts`, `deltas[]`, and `validations[]`.

#### Scenario: User reads validation configuration docs

- **WHEN** user opens docs/customization.md
- **THEN** they find a "Custom Spec Formats" section
- **AND** the section explains `changeVerify`, `requiredSpecArtifacts`, `deltas[]`, and `validations[]` schema fields

### Requirement: Document changeVerify and requiredSpecArtifacts options

The documentation SHALL explain all `changeVerify` configuration options (`requirementPattern`, `scenarioPattern`, `shallMustPattern`) and the `requiredSpecArtifacts` field with examples.

#### Scenario: User configures change verification patterns

- **WHEN** user reads the `changeVerify` documentation
- **THEN** they understand how to set `requirementPattern`, `scenarioPattern`, and `shallMustPattern`
- **AND** an example shows the default patterns and how to disable normative validation with `null`

#### Scenario: User configures required spec artifacts

- **WHEN** user reads the `requiredSpecArtifacts` documentation
- **THEN** they understand how to declare which artifact files must exist in each spec folder
- **AND** an example shows multi-file specs with `[specs, verify]`

### Requirement: Document sections configuration

The documentation SHALL explain the `deltas[]` and `validations[]` artifact configuration (replacing the former `sections` field) for customizing spec structure and delta merge behavior.

#### Scenario: User configures delta merge sections

- **WHEN** user reads the `deltas[]` documentation
- **THEN** they understand how to define mergeable block sections per artifact
- **AND** an example shows `[{ section: "Requirements", pattern: "### Requirement: {name}" }]`

#### Scenario: User configures structural validation rules

- **WHEN** user reads the `validations[]` documentation
- **THEN** they understand the three granularity levels: file-level, scope-level, and eachBlock-level
- **AND** examples show `scope: "Requirements"` and `eachBlock: "Requirements"`

#### Scenario: User configures multiple delta sections

- **WHEN** user reads the multi-delta documentation
- **THEN** they understand how to define multiple delta sections per artifact
- **AND** an example shows Requirements + Constraints deltas in one artifact

### Requirement: CHANGELOG documents feature

The CHANGELOG SHALL have an entry for the generic artifact deltas feature.

#### Scenario: User checks what's new

- **WHEN** user reads CHANGELOG.md
- **THEN** they find an entry describing the elimination of `specVerify`, the enrichment of `changeVerify`, and the new `requiredSpecArtifacts` field
- **AND** the entry mentions `deltas[]`, `validations[]`, multi-file spec sync, and scope/eachBlock validation
