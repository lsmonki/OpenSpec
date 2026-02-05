import { z } from 'zod';

// Schema-level validation configuration for changes
export const ChangeValidationSchema = z.object({
  // Which artifact verifies change implementation
  artifact: z.string().default('verify'),
});

// Schema-level validation configuration for specs
export const SpecValidationSchema = z.object({
  // Which artifact contains scenarios (e.g., "specs" for inline, or "spec-verify" for separate)
  artifact: z.string().default('specs'),
  // Pattern to identify scenario blocks (e.g., "#### Scenario: {name}")
  pattern: z.string().default('#### Scenario: {name}'),
  // Whether scenarios are mandatory
  required: z.boolean().default(true),
  // Regex pattern to match normative keywords in requirement text (e.g., "SHALL|MUST")
  // Set to null or empty string to disable validation
  shallMustPattern: z.string().nullable().default('SHALL|MUST'),
});

// Requirement identification configuration within a section
export const RequirementConfigSchema = z.object({
  // Which section contains requirements (e.g., "Requirements" or "Functional Requirements")
  section: z.string().default('Requirements'),
  // Pattern to identify requirement blocks (e.g., "### Requirement: {name}")
  pattern: z.string().default('### Requirement: {name}'),
});

// Artifact sections configuration for structure validation
export const ArtifactSectionsSchema = z.object({
  // Section headers that MUST exist
  required: z.array(z.string()).optional(),
  // Section headers that MAY exist (for documentation)
  optional: z.array(z.string()).optional(),
  // Requirement block configuration (only for spec artifacts)
  requirement: RequirementConfigSchema.optional(),
});

// Artifact definition schema
export const ArtifactSchema = z.object({
  id: z.string().min(1, { error: 'Artifact ID is required' }),
  generates: z.string().min(1, { error: 'generates field is required' }),
  description: z.string(),
  template: z.string().min(1, { error: 'template field is required' }),
  instruction: z.string().optional(),
  requires: z.array(z.string()).default([]),
  // Section structure configuration for this artifact
  sections: ArtifactSectionsSchema.optional(),
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

// Full schema YAML structure
export const SchemaYamlSchema = z.object({
  name: z.string().min(1, { error: 'Schema name is required' }),
  version: z.number().int().positive({ error: 'Version must be a positive integer' }),
  description: z.string().optional(),
  // Schema-level validation configuration
  changeValidation: ChangeValidationSchema.optional(),
  specValidation: SpecValidationSchema.optional(),
  artifacts: z.array(ArtifactSchema).min(1, { error: 'At least one artifact required' }),
  // Optional apply phase configuration (for schema-aware apply instructions)
  apply: ApplyPhaseSchema.optional(),
});

// Derived TypeScript types
export type Artifact = z.infer<typeof ArtifactSchema>;
export type ApplyPhase = z.infer<typeof ApplyPhaseSchema>;
export type ChangeValidation = z.infer<typeof ChangeValidationSchema>;
export type SpecValidation = z.infer<typeof SpecValidationSchema>;
export type RequirementConfig = z.infer<typeof RequirementConfigSchema>;
export type ArtifactSections = z.infer<typeof ArtifactSectionsSchema>;
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

// Runtime state types (not Zod - internal only)

// Slice 1: Simple completion tracking via filesystem
export type CompletedSet = Set<string>;

// Return type for blocked query
export interface BlockedArtifacts {
  [artifactId: string]: string[];
}

