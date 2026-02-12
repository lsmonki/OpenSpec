import { z } from 'zod';

// Schema-level compliance configuration for changes
export const ChangeVerifySchema = z.object({
  // Which artifact has requirements/scenarios (default: specs)
  artifact: z.string().default('specs'),
  // Pattern to extract requirement headers from specs (e.g., "### Requirement: {name}")
  requirementPattern: z.string().default('### Requirement: {name}'),
  // Pattern to extract scenario headers from specs (e.g., "#### Scenario: {name}")
  scenarioPattern: z.string().default('#### Scenario: {name}'),
});

// Delta merge configuration: defines a mergeable block section
export const DeltaConfigSchema = z.object({
  // Section name (e.g., "Requirements"). Delta operations derived: ## {ADDED|MODIFIED|REMOVED|RENAMED} {section}
  section: z.string(),
  // Block pattern within the section (e.g., "### Requirement: {name}")
  pattern: z.string(),
});

// Structural validation rule with three granularity levels
export const ValidationRuleSchema = z.object({
  // Pattern to search for
  pattern: z.string(),
  // Whether the pattern must exist (default: true)
  required: z.boolean().default(true),
  // (optional) Validate within a ## section
  scope: z.string().optional(),
  // (optional) Validate within EACH ### block of a ## section
  eachBlock: z.string().optional(),
}).refine(
  (data) => !(data.scope && data.eachBlock),
  { message: 'scope and eachBlock are mutually exclusive — use one or the other, not both' }
);

// Artifact definition schema
export const ArtifactSchema = z.object({
  id: z.string().min(1, { error: 'Artifact ID is required' }),
  generates: z.string().min(1, { error: 'generates field is required' }),
  description: z.string(),
  template: z.string().min(1, { error: 'template field is required' }),
  instruction: z.string().optional(),
  requires: z.array(z.string()).default([]),
  // Delta merge configuration (array, optional)
  deltas: z.array(DeltaConfigSchema).optional(),
  // Structural validation rules (array, optional)
  validations: z.array(ValidationRuleSchema).optional(),
});

// Apply phase configuration for schema-aware apply instructions
export const ApplyPhaseSchema = z.object({
  // Artifact IDs that must exist before apply is available
  requires: z.array(z.string()).min(1, { error: 'At least one required artifact' }),
  // Path to file with checkboxes for progress (relative to change dir), or null if no tracking
  tracks: z.string().nullable().optional(),
  // Custom guidance for the apply phase
  instruction: z.string().optional(),
});

// Single lifecycle hook definition
export const HookSchema = z.object({
  instruction: z.string().min(1, { error: 'Hook instruction is required' }),
});

// Hooks section: record of lifecycle point → hook definition
export const HooksSchema = z.record(z.string(), HookSchema);

// Full schema YAML structure
export const SchemaYamlSchema = z.object({
  name: z.string().min(1, { error: 'Schema name is required' }),
  version: z.number().int().positive({ error: 'Version must be a positive integer' }),
  description: z.string().optional(),
  // Schema-level compliance configuration
  changeVerify: ChangeVerifySchema.optional(),
  // Required artifact files in each spec folder (default: ['specs'])
  requiredSpecArtifacts: z.array(z.string()).optional(),
  artifacts: z.array(ArtifactSchema).min(1, { error: 'At least one artifact required' }),
  // Optional apply phase configuration (for schema-aware apply instructions)
  apply: ApplyPhaseSchema.optional(),
  // Optional lifecycle hooks (LLM instructions at operation boundaries)
  hooks: HooksSchema.optional(),
});

// Derived TypeScript types
export type Artifact = z.infer<typeof ArtifactSchema>;
export type ApplyPhase = z.infer<typeof ApplyPhaseSchema>;
export type ChangeVerify = z.infer<typeof ChangeVerifySchema>;
export type DeltaConfig = z.infer<typeof DeltaConfigSchema>;
export type ValidationRule = z.infer<typeof ValidationRuleSchema>;
export type Hook = z.infer<typeof HookSchema>;
export type Hooks = z.infer<typeof HooksSchema>;
export type SchemaYaml = z.infer<typeof SchemaYamlSchema>;

// Per-change metadata schema
// Note: schema field is validated at parse time against available schemas
// using a lazy import to avoid circular dependencies
export const ChangeMetadataSchema = z.object({
  // Required: which workflow schema this change uses
  schema: z.string().min(1, { message: 'schema is required' }),

  // Optional: creation timestamp (ISO date string)
  created: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: 'created must be YYYY-MM-DD format',
    })
    .optional(),
});

export type ChangeMetadata = z.infer<typeof ChangeMetadataSchema>;

// Valid lifecycle points for hooks
export const VALID_LIFECYCLE_POINTS = [
  'pre-explore', 'post-explore',
  'pre-new', 'post-new',
  'pre-continue', 'post-continue',
  'pre-ff', 'post-ff',
  'pre-apply', 'post-apply',
  'pre-verify', 'post-verify',
  'pre-sync', 'post-sync',
  'pre-archive', 'post-archive',
  'pre-bulk-archive', 'post-bulk-archive',
  'pre-onboard', 'post-onboard',
] as const;

export type LifecyclePoint = typeof VALID_LIFECYCLE_POINTS[number];

// Runtime state types (not Zod - internal only)

// Slice 1: Simple completion tracking via filesystem
export type CompletedSet = Set<string>;

// Return type for blocked query
export interface BlockedArtifacts {
  [artifactId: string]: string[];
}

