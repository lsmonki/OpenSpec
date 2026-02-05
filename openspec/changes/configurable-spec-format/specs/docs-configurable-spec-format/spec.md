## ADDED Requirements

### Requirement: Document schema validation fields

The documentation SHALL include a "Custom Spec Formats" section in `docs/customization.md` that explains how to configure spec validation in custom schemas.

#### Scenario: User reads validation configuration docs

- **WHEN** user opens docs/customization.md
- **THEN** they find a "Custom Spec Formats" section
- **AND** the section explains `specValidation` and `sections` schema fields

### Requirement: Document specValidation options

The documentation SHALL explain all `specValidation` configuration options with examples.

#### Scenario: User configures custom scenario pattern

- **WHEN** user reads the `specValidation.pattern` documentation
- **THEN** they understand how to set a custom scenario header pattern
- **AND** an example shows syntax like `#### Scenario: {name}`

#### Scenario: User disables normative keyword validation

- **WHEN** user reads the `specValidation.shallMustPattern` documentation
- **THEN** they understand how to disable SHALL/MUST validation with `null`
- **AND** an example shows custom patterns like `DEBE|DEBERÁ` for Spanish

### Requirement: Document sections configuration

The documentation SHALL explain the `sections` artifact configuration for customizing spec structure.

#### Scenario: User configures required sections

- **WHEN** user reads the `sections.required` documentation
- **THEN** they understand how to specify which sections are mandatory
- **AND** an example shows `["Purpose", "Requirements"]`

#### Scenario: User configures custom requirement pattern

- **WHEN** user reads the `sections.requirement.pattern` documentation
- **THEN** they understand how to change the requirement header format
- **AND** examples show patterns like `### Req: {name}` or `## RF-{name}`

### Requirement: CHANGELOG documents feature

The CHANGELOG SHALL have an entry for configurable spec formats.

#### Scenario: User checks what's new

- **WHEN** user reads CHANGELOG.md
- **THEN** they find an entry describing configurable spec formats
- **AND** the entry mentions `specValidation`, `sections`, and `shallMustPattern`
