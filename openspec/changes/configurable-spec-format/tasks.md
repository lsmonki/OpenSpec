## 1. Schema Types and Loading

- [x] 1.1 Extend `ArtifactSchema` type in `src/core/artifact-graph/types.ts` with `changeValidation` and `specValidation` fields
- [x] 1.2 Extend artifact definition type with `sections` field (`required`, `optional`, `requirement`)
- [x] 1.3 Update schema loader in `src/core/artifact-graph/schema.ts` to parse new fields
- [x] 1.4 Implement default value application during schema loading (changeValidation, specValidation, sections defaults for specs artifact)
- [x] 1.5 Add validation for new schema fields (type checking, pattern placeholder validation)
- [x] 1.6 Write unit tests for schema loading with new fields

## 2. Pattern Conversion Utilities

- [x] 2.1 Create `patternToRegex()` utility function that converts `{name}` placeholder to capture group
- [x] 2.2 Handle regex special character escaping in patterns (e.g., `[`, `]`, `(`, `)`)
- [x] 2.3 Write unit tests for pattern conversion including edge cases

## 3. Parser Updates

- [x] 3.1 Update `markdown-parser.ts` to accept format configuration for section headers
- [x] 3.2 Update `requirement-blocks.ts` to accept configurable requirement pattern
- [x] 3.3 Update `requirement-blocks.ts` to accept configurable scenario pattern
- [x] 3.4 Update delta parsing to use configurable requirement section name (e.g., `ADDED Functional Requirements`)
- [x] 3.5 Write unit tests for parsers with custom format configurations

## 4. Validator Updates

- [x] 4.1 Update `validator.ts` to receive spec format configuration from schema
- [x] 4.2 Implement schema-aware section validation using `sections.required`
- [x] 4.3 Implement schema-aware requirement pattern matching using `sections.requirement.pattern`
- [x] 4.4 Implement schema-aware scenario validation using `specValidation` config
- [x] 4.5 Support scenarios in separate files when `specValidation.artifact` points to different artifact
- [x] 4.6 Skip scenario validation when `specValidation.required: false`
- [x] 4.7 Update delta validation to use configurable requirement section name
- [x] 4.8 Update error messages to show schema-configured expected formats
- [x] 4.9 Write unit tests for validator with custom format configurations
- [x] 4.10 Implement `shallMustPattern` option to make SHALL/MUST validation configurable
- [x] 4.11 Move hardcoded Zod validations (SHALL/MUST, min scenarios) to Validator class for configurability

## 5. Discovery Updates

- [x] 5.1 Update `item-discovery.ts` `getSpecIds()` to read all files per schema artifacts
- [x] 5.2 Match spec files against schema artifact `generates` patterns
- [x] 5.3 Validate presence of required files per artifact configuration
- [x] 5.4 Write unit tests for schema-aware spec discovery

## 6. Skill Prompt Updates

- [x] 6.1 Update spec generation prompts in `skill-templates.ts` to instruct AI to read schema format config
- [x] 6.2 Update delta format instructions to use schema-derived section names
- [x] 6.3 Update scenario format instructions to use `specValidation.pattern`
- [x] 6.4 Document default values clearly in prompts for when schema fields are omitted

## 7. Schema Templates

- [x] 7.1 Update `schemas/spec-driven/schema.yaml` with explicit default values for new fields
- [x] 7.2 Update `schemas/spec-driven/templates/spec.md` template comments to reference schema config
- [x] 7.3 Update `src/commands/validate.ts` to load project schema and build validation config from it

## 8. Integration and Testing

- [x] 8.1 Create integration test with custom schema using different format (e.g., `## Functional Requirements`, `### Scenario:`)
- [x] 8.2 Verify backward compatibility: existing schemas work without modification
- [x] 8.3 Test cross-platform path handling in spec discovery (Windows CI verification)
- [x] 8.4 Test validation error messages show correct schema-configured formats

## 9. Documentation

- [x] 9.1 Add "Custom Spec Formats" section to `docs/customization.md` documenting schema validation fields
- [x] 9.2 Document `specValidation` fields: `pattern`, `required`, `artifact`, `shallMustPattern`
- [x] 9.3 Document `sections` configuration: `required`, `optional`, `requirement.section`, `requirement.pattern`
- [x] 9.4 Add examples for common customizations (custom patterns, Spanish keywords, disabled validation)
- [x] 9.5 Add CHANGELOG entry under "Unreleased" section
