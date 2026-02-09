## ADDED Requirements

### Requirement: Schema-Level Validation Configuration
The system SHALL support optional schema-level configuration blocks for validation behavior.

#### Scenario: Load changeValidation config
- **WHEN** a schema.yaml contains a `changeValidation` block with `artifact` field
- **THEN** the loaded schema includes `changeValidation.artifact` with the specified value

#### Scenario: Load specValidation config
- **WHEN** a schema.yaml contains a `specValidation` block with `artifact`, `pattern`, and `required` fields
- **THEN** the loaded schema includes the complete `specValidation` object

#### Scenario: Apply changeValidation defaults
- **WHEN** a schema.yaml omits the `changeValidation` block
- **THEN** the system defaults to `{ artifact: "verify" }`

#### Scenario: Apply specValidation defaults
- **WHEN** a schema.yaml omits the `specValidation` block
- **THEN** the system defaults to `{ artifact: "specs", pattern: "#### Scenario: {name}", required: true, shallMustPattern: "SHALL|MUST" }`

#### Scenario: Load specValidation.shallMustPattern
- **WHEN** a schema.yaml contains `specValidation.shallMustPattern: null`
- **THEN** the loaded schema includes `specValidation.shallMustPattern` as null (validation disabled)

#### Scenario: Load custom shallMustPattern
- **WHEN** a schema.yaml contains `specValidation.shallMustPattern: "(?i)shall|must|should"`
- **THEN** the loaded schema includes the custom regex pattern for normative keyword validation

#### Scenario: Apply shallMustPattern default
- **WHEN** a schema.yaml has `specValidation` without `shallMustPattern`
- **THEN** the system defaults `shallMustPattern` to "SHALL|MUST"

### Requirement: Artifact Sections Configuration
The system SHALL support optional `sections` configuration on artifact definitions to specify structure expectations.

#### Scenario: Load sections.required
- **WHEN** an artifact definition includes `sections.required` array
- **THEN** the loaded artifact includes the required section names

#### Scenario: Load sections.optional
- **WHEN** an artifact definition includes `sections.optional` array
- **THEN** the loaded artifact includes the optional section names

#### Scenario: Load sections.requirement config
- **WHEN** an artifact definition includes `sections.requirement` with `section` and `pattern` fields
- **THEN** the loaded artifact includes the requirement identification configuration

#### Scenario: Apply sections defaults for specs artifact
- **WHEN** an artifact with id "specs" omits the `sections` configuration
- **THEN** the system defaults to `{ required: ["Purpose", "Requirements"], requirement: { section: "Requirements", pattern: "### Requirement: {name}" } }`

#### Scenario: Non-spec artifacts without sections
- **WHEN** an artifact definition omits `sections` and is not the specs artifact
- **THEN** the loaded artifact has `sections` as undefined (no defaults applied)

### Requirement: Pattern Placeholder Conversion
The system SHALL convert `{name}` placeholders in patterns to regex capture groups.

#### Scenario: Convert requirement pattern to regex
- **WHEN** the requirement pattern is `### Requirement: {name}`
- **THEN** the system provides a regex that matches `### Requirement: ` followed by any text and captures the name

#### Scenario: Convert scenario pattern to regex
- **WHEN** the scenario pattern is `#### Scenario: {name}`
- **THEN** the system provides a regex that matches `#### Scenario: ` followed by any text and captures the name

#### Scenario: Convert custom pattern to regex
- **WHEN** the pattern is `## RF-{name}:`
- **THEN** the system provides a regex that matches `## RF-` followed by any text, then `:`, and captures the name

#### Scenario: Pattern conversion handles regex special characters
- **WHEN** a pattern contains regex special characters (e.g., `### [Req]: {name}`)
- **THEN** the system escapes the special characters before converting `{name}` to a capture group

### Requirement: Schema Validation for New Fields
The system SHALL validate the structure of new schema fields during schema loading.

#### Scenario: Invalid changeValidation type
- **WHEN** `changeValidation` is present but not an object
- **THEN** the system throws an error describing the expected structure

#### Scenario: Invalid specValidation.pattern
- **WHEN** `specValidation.pattern` is present but not a string
- **THEN** the system throws an error describing the expected type

#### Scenario: Invalid sections.required type
- **WHEN** `sections.required` is present but not an array of strings
- **THEN** the system throws an error describing the expected structure

#### Scenario: Pattern missing placeholder
- **WHEN** a pattern string does not contain `{name}` placeholder
- **THEN** the system throws an error explaining that patterns must include `{name}`

## MODIFIED Requirements

### Requirement: Schema Loading
The system SHALL load artifact graph definitions from YAML schema files within schema directories.

#### Scenario: Valid schema loaded
- **WHEN** a schema directory contains a valid `schema.yaml` file
- **THEN** the system returns an ArtifactGraph with all artifacts and dependencies

#### Scenario: Invalid schema rejected
- **WHEN** a schema YAML file is missing required fields
- **THEN** the system throws an error with a descriptive message

#### Scenario: Cyclic dependencies detected
- **WHEN** a schema contains cyclic artifact dependencies
- **THEN** the system throws an error listing the artifact IDs in the cycle

#### Scenario: Invalid dependency reference
- **WHEN** an artifact's `requires` array references a non-existent artifact ID
- **THEN** the system throws an error identifying the invalid reference

#### Scenario: Duplicate artifact IDs rejected
- **WHEN** a schema contains multiple artifacts with the same ID
- **THEN** the system throws an error identifying the duplicate

#### Scenario: Schema directory not found
- **WHEN** resolving a schema name that has no corresponding directory
- **THEN** the system throws an error listing available schemas

#### Scenario: Schema with validation config loaded
- **WHEN** a schema.yaml contains `changeValidation` and `specValidation` blocks
- **THEN** the system returns an ArtifactGraph that includes these configuration objects

#### Scenario: Schema with artifact sections loaded
- **WHEN** a schema.yaml contains artifacts with `sections` configuration
- **THEN** the system returns artifacts that include their sections configuration
