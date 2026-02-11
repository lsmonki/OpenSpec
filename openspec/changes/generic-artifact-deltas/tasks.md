## 1. Schema Types and Loading

- [x] 1.1 Replace `ChangeValidationSchema`/`SpecValidationSchema` with enriched `ChangeVerifySchema` (eliminate `SpecVerifySchema`) in `src/core/artifact-graph/types.ts`
- [x] 1.2 Replace `ArtifactSectionsSchema`/`RequirementConfigSchema` with `DeltaConfigSchema` and `ValidationRuleSchema` in types
- [x] 1.3 Update `ArtifactSchema` to use `deltas` (array) and `validations` (array) instead of `sections`
- [x] 1.4 Update `SchemaYamlSchema` to eliminate `specVerify`, use enriched `changeVerify` and `requiredSpecArtifacts`
- [x] 1.5 Update `applySchemaDefaults()` in `src/core/artifact-graph/schema.ts` to apply defaults for `deltas[]` and `validations[]` on specs artifact
- [x] 1.6 Update `validatePatternPlaceholders()` to check `deltas[].pattern` instead of `sections.requirement.pattern`
- [x] 1.7 Update schema tests in `test/core/artifact-graph/schema.test.ts` for renamed fields and new array structures

## 2. Parser Updates

- [x] 2.1 Add `SectionDeltaPlan` and `MultiDeltaPlan` interfaces to `src/core/parsers/requirement-blocks.ts`
- [x] 2.2 Implement `parseDeltaSpecMulti()` function that iterates over `DeltaConfig[]` array
- [x] 2.3 Write unit tests for multi-delta parsing in `test/core/parsers/requirement-blocks.test.ts`

## 3. Validator Updates

- [x] 3.1 Remove `specVerify` fields from `SpecValidationConfig`, update `changeValidation` → `changeVerify` references in `src/core/validation/validator.ts`
- [x] 3.2 Add `deltaConfigs` and `validationRules` fields to `SpecValidationConfig` interface
- [x] 3.3 Refactor `validateChangeDeltaSpecs()` to iterate over `deltaConfigsList` array instead of single config
- [x] 3.4 Implement `validateContentRules()` method with file-level, scope-level, and eachBlock-level granularity
- [x] 3.5 Implement `extractSectionContent()` utility for splitting content by `##` sections
- [x] 3.6 Implement `splitIntoBlocks()` utility for splitting `##` sections into `###` blocks
- [x] 3.7 Implement `crossFileVerify()` method for cross-file requirement/scenario verification
- [x] 3.8 Update `enrichTopLevelError()` to build error messages from `deltaConfigsList`
- [x] 3.9 Create `test/core/validation-rules.test.ts` with tests for extractSectionContent, splitIntoBlocks, file/scope/eachBlock validation, and crossFileVerify
- [x] 3.10 Wire `validateContentRules()` into `applySpecRules()` as single source of truth; backward-compat defaults when no validationRules provided

## 4. Validate Command Updates

- [x] 4.1 Update `buildValidationConfig()` in `src/commands/validate.ts` to pass `deltaConfigs` and `validationRules` from schema
- [x] 4.2 Remove `specVerify` fields from bridge, update `changeValidation` → `changeVerify`

## 5. Specs Apply / Sync Updates

- [x] 5.1 Add `isDelta` field to `SpecUpdate` interface in `src/core/specs-apply.ts`
- [x] 5.2 Rewrite `findSpecUpdates()` to discover all `.md` files in each spec folder (not just spec.md)
- [x] 5.3 Classify discovered files: spec.md → `isDelta: true`, others → `isDelta: false`
- [x] 5.4 Update `applySpecs()` to separate delta-merge files from direct-copy files
- [x] 5.5 Add direct-copy loop for non-delta files (verify.md, etc.)
- [x] 5.6 Update `buildUpdatedSpec()` to accept optional `RequirementFormatConfig`
- [x] 5.7 Create `test/core/specs-apply.test.ts` with tests for multi-file discovery, existing targets, non-markdown filtering, and custom delta config
- [x] 5.8 Load schema in `applySpecs()` via `readChangeMetadata()` + `resolveSchema()` to get `deltas[]` config (Design Decision #5)
- [x] 5.9 Pass schema's `deltas[]` config to `buildUpdatedSpec()` instead of using defaults
- [x] 5.10 Support multi-delta merge: iterate over `deltas[]` entries, chaining rebuilt content via `targetContent` option
- [x] 5.11 Add `allowEmpty` option to `buildUpdatedSpec()` for partial delta sections (no operations found for one section)
- [x] 5.12 Pass schema validation config to `validateSpecContent()` in `applySpecs()` instead of using defaults
- [x] 5.13 Add tests for multi-delta chaining and `allowEmpty` in `test/core/specs-apply.test.ts`

## 6. Spec Command Updates

- [x] 6.1 Add `printSpecFolderRaw()` function to `src/commands/spec.ts` for showing all `.md` files in a spec folder
- [x] 6.2 Update `show` method to use `printSpecFolderRaw()` instead of single-file output

## 7. Skill Prompt Updates

- [x] 7.1 Update `sections.requirement` references to `deltas[]` in `src/core/templates/skill-templates.ts`
- [x] 7.2 Replace `specVerify` references with `changeVerify` in skill templates
- [x] 7.3 Add spec file loading priority instructions to verify skill templates

## 8. Schema Templates

- [x] 8.1 Update `schemas/spec-driven/schema.yaml` to use enriched `changeVerify`, `requiredSpecArtifacts`, and `deltas[]`/`validations[]`
- [x] 8.2 Update `schemas/spec-driven/templates/spec.md` template comments to reference new schema config

## 9. Documentation

- [x] 9.1 Update `docs/customization.md` to document `deltas[]`, `validations[]`, `changeVerify`, `requiredSpecArtifacts`
- [x] 9.2 Add examples for multi-file specs, multiple delta sections, scope/eachBlock validation
- [x] 9.3 Update CHANGELOG entry to reference new field names

## 10. Integration Testing

- [x] 10.1 Create `test/core/configurable-format.integration.test.ts` with multi-file spec tests (spec.md + verify.md)
- [x] 10.2 Add integration tests for `validations[]` scope and eachBlock granularity
- [x] 10.3 Add integration tests for delta merge with multiple delta sections per artifact
- [x] 10.4 Verify backward compatibility: existing schemas work without modification
- [x] 10.5 Test cross-platform path handling in spec discovery

## 11. Eliminate specVerify

- [x] 11.1 Remove `SpecVerifySchema` and `SpecVerify` type from `src/core/artifact-graph/types.ts`
- [x] 11.2 Remove specVerify defaults and pattern validation from `src/core/artifact-graph/schema.ts`
- [x] 11.3 Remove `scenarioPattern`, `scenariosRequired`, `scenarioArtifact`, `shallMustPattern` from `SpecValidationConfig` in `src/core/validation/validator.ts`
- [x] 11.4 Rewrite `applySpecRules()` to use `validateContentRules()` as single source of truth
- [x] 11.5 Update `validateChangeDeltaSpecs()` to use `changeVerify` fields (`changeScenarioPattern`, `changeShallMustPattern`) via bridge
- [x] 11.6 Update `crossFileVerify()` signature to accept `patterns` object instead of full config
- [x] 11.7 Remove specVerify field reads from bridge code in `validate.ts` and `specs-apply.ts`
- [x] 11.8 Add `requiredSpecArtifacts` to `SchemaYamlSchema` and `applySchemaDefaults()`
- [x] 11.9 Enrich `ChangeVerifySchema` with `requirementPattern` and `scenarioPattern`
- [x] 11.10 Change `changeVerify.artifact` default from `"verify"` to `"specs"`
- [x] 11.11 Update all test files: schema, validation, shallmust, enriched-messages, integration, validation-rules
- [x] 11.12 Update skill templates: replace `specVerify` references with `changeVerify`
- [x] 11.13 Update schema.yaml and spec.md template
- [x] 11.14 Update docs/customization.md and CHANGELOG.md
- [x] 11.15 Update change artifacts: proposal.md, design.md, delta specs, tasks.md

## 12. Dead code cleanup

- [x] 12.1 Remove `changeScenariosRequired` from `SpecValidationConfig` — scenarios always required in changes
- [x] 12.2 Remove unused `z` import from `validator.ts` (only `ZodError` needed)
- [x] 12.3 Remove dead `scenarioPattern` field from `SpecFormatConfig` and `parseScenarios` unused `_config` param
- [x] 12.4 Remove dead `requirementPattern` field from `SpecFormatConfig` and `parseRequirements` unused `config` param
- [x] 12.5 Remove dead `config.scenarioPattern` and `config.requirementPattern` bridge references in `validateSpec`/`validateSpecContent`

## 13. Wire `requiredSpecArtifacts` to runtime (eliminate hardcoded `spec.md`)

- [x] 13.1 Add `resolveArtifactFilename(artifact)` utility in `schema.ts`: last segment of `generates` if concrete, else `template`
- [x] 13.2 Add `resolveSpecArtifactFiles(schema)` utility: maps `requiredSpecArtifacts` IDs → `{ filename, deltas }[]`
- [x] 13.3 Add `specArtifactFiles` field to `SpecValidationConfig` interface: `Array<{ filename: string; deltas?: DeltaConfig[] }>`
- [x] 13.4 Update `buildValidationConfig()` in `validate.ts` to populate `specArtifactFiles` from schema
- [x] 13.5 Update `specs-apply.ts` bridge to populate `specArtifactFiles`
- [x] 13.6 Update `findSpecUpdates()` in `specs-apply.ts`: use `specArtifactFiles` to determine `isDelta` and delta config per file (remove `file.name === 'spec.md'` hardcode)
- [x] 13.7 Update `validateChangeDeltaSpecs()` in `validator.ts`: validate all artifact files per capability, not just `spec.md`
- [x] 13.8 Update `archive.ts`: detect delta specs by checking all artifacts with `deltas[]`, not just `spec.md`
- [x] 13.9 Update `item-discovery.ts:getSpecIds()`: check all `requiredSpecArtifacts` filenames exist (fallback: `spec.md`)
- [x] 13.10 Update `validate.ts` bulk validation: validate all artifact files per spec, not just `spec.md`
- [x] 13.11 Update tests: schema.test.ts (resolveArtifactFilename, resolveSpecArtifactFiles), specs-apply.test.ts (isDelta from config), validation.test.ts (multi-file change validation)
- [x] 13.12 Backward compat: when no schema configured, default to `[{ filename: 'spec.md', deltas: [{ section: 'Requirements', pattern: '### Requirement: {name}' }] }]`

## 14. Validation severity: `required` field semantics

- [x] 14.1 `validateContentRules()`: `required: true` → ERROR, `required: false` → WARNING (not skipped)
- [x] 14.2 Error messages: "missing required pattern" vs "missing recommended pattern"
- [x] 14.3 Update tests: validation-rules.test.ts, configurable-format.integration.test.ts

## 15. Bug fix: archive spec sync uses schema config

- [x] 15.1 Move schema loading (`specArtifactFiles`) out of validation block so it's available for spec sync
- [x] 15.2 Pass `specArtifactFiles` to `findSpecUpdates()` in archive command (was defaulting to spec.md-only)

## 16. Remove `shallMustPattern` from `changeVerify`

- [x] 16.1 Remove `shallMustPattern` from `ChangeVerifySchema` in `types.ts`
- [x] 16.2 Remove `changeShallMustPattern` from `SpecValidationConfig` in `validator.ts`
- [x] 16.3 Derive normative pattern in `validateChangeDeltaSpecs()` from `validationRules` eachBlock rules instead
- [x] 16.4 Remove bridge fields in `validate.ts` and `specs-apply.ts`
- [x] 16.5 Remove from `schema.yaml`
- [x] 16.6 Update tests, docs, CHANGELOG, and change artifacts

## 17. Bug fix: per-artifact validation config

- [x] 17.1 Add `validations` to `SpecArtifactFile` interface
- [x] 17.2 Populate `validations` in `resolveSpecArtifactFiles()`
- [x] 17.3 Build per-artifact config in `validateSpecArtifacts()` using each artifact's own deltas/validations

## 18. Skill template multi-file awareness

- [x] 18.1 Remove 24 hardcoded `spec.md` references across 12 skill/command template functions in `skill-templates.ts`
- [x] 18.2 Update continue/ff templates to follow `openspec status --json` strictly instead of hardcoded `proposal → specs → design → tasks`
- [x] 18.3 Update sync/archive templates to process all `.md` files per capability directory
- [x] 18.4 Update verify/explore templates to load all files from spec folders
- [x] 18.5 Update apply templates to remove hardcoded context file list
## 19. `openspec schema show` command

- [x] 19.1 Implement `schema show [name]` subcommand in `src/commands/schema.ts`
- [x] 19.2 Make name argument optional — default to project config schema or `spec-driven`
- [x] 19.3 Output includes `specArtifactFiles`, `changeVerify`, `artifacts`, `apply`, `source`, `path`
- [x] 19.4 Update all skill templates to use `openspec schema show --json` instead of `schema which`
- [x] 19.5 Omit `instruction` fields by default to save tokens; add `--full` flag to include them
