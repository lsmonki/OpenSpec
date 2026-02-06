import * as fs from 'node:fs';
import { parse as parseYaml } from 'yaml';
import {
  SchemaYamlSchema,
  ChangeValidationSchema,
  SpecValidationSchema,
  type SchemaYaml,
  type Artifact,
} from './types.js';

export class SchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaValidationError';
  }
}

/**
 * Loads and validates an artifact schema from a YAML file.
 */
export function loadSchema(filePath: string): SchemaYaml {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseSchema(content);
}

/**
 * Parses and validates an artifact schema from YAML content.
 */
export function parseSchema(yamlContent: string): SchemaYaml {
  const parsed = parseYaml(yamlContent);

  // Validate with Zod
  const result = SchemaYamlSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new SchemaValidationError(`Invalid schema: ${errors}`);
  }

  const schema = result.data;

  // Check for duplicate artifact IDs
  validateNoDuplicateIds(schema.artifacts);

  // Check that all requires references are valid
  validateRequiresReferences(schema.artifacts);

  // Check for cycles
  validateNoCycles(schema.artifacts);

  // Validate pattern placeholders
  validatePatternPlaceholders(schema);

  // Apply defaults for validation config and artifact sections
  return applySchemaDefaults(schema);
}

/**
 * Validates that all pattern strings contain the {name} placeholder.
 */
function validatePatternPlaceholders(schema: SchemaYaml): void {
  // Check specValidation.pattern
  if (schema.specValidation?.pattern !== undefined && !schema.specValidation.pattern.includes('{name}')) {
    throw new SchemaValidationError(
      `specValidation.pattern must include {name} placeholder, got: "${schema.specValidation.pattern}"`
    );
  }

  // Check artifact sections.requirement.pattern
  for (const artifact of schema.artifacts) {
    const pattern = artifact.sections?.requirement?.pattern;
    if (pattern !== undefined && !pattern.includes('{name}')) {
      throw new SchemaValidationError(
        `Artifact '${artifact.id}' sections.requirement.pattern must include {name} placeholder, got: "${pattern}"`
      );
    }
  }
}

/**
 * Applies default values for validation config and artifact sections.
 * Zod handles most defaults, but we need to apply defaults for the specs artifact
 * when sections are not explicitly configured.
 */
function applySchemaDefaults(schema: SchemaYaml): SchemaYaml {
  // Apply defaults for changeValidation and specValidation using Zod's default parsing
  const changeValidation = schema.changeValidation
    ? ChangeValidationSchema.parse(schema.changeValidation)
    : ChangeValidationSchema.parse({});

  const specValidation = schema.specValidation
    ? SpecValidationSchema.parse(schema.specValidation)
    : SpecValidationSchema.parse({});

  // Apply defaults for specs artifact sections if not specified
  const artifacts = schema.artifacts.map(artifact => {
    if (artifact.id === 'specs' && !artifact.sections) {
      return {
        ...artifact,
        sections: {
          required: ['Purpose', 'Requirements'],
          requirement: {
            section: 'Requirements',
            pattern: '### Requirement: {name}',
          },
        },
      };
    }
    return artifact;
  });

  return {
    ...schema,
    changeValidation,
    specValidation,
    artifacts,
  };
}

/**
 * Validates that there are no duplicate artifact IDs.
 */
function validateNoDuplicateIds(artifacts: Artifact[]): void {
  const seen = new Set<string>();
  for (const artifact of artifacts) {
    if (seen.has(artifact.id)) {
      throw new SchemaValidationError(`Duplicate artifact ID: ${artifact.id}`);
    }
    seen.add(artifact.id);
  }
}

/**
 * Validates that all `requires` references point to valid artifact IDs.
 */
function validateRequiresReferences(artifacts: Artifact[]): void {
  const validIds = new Set(artifacts.map(a => a.id));

  for (const artifact of artifacts) {
    for (const req of artifact.requires) {
      if (!validIds.has(req)) {
        throw new SchemaValidationError(
          `Invalid dependency reference in artifact '${artifact.id}': '${req}' does not exist`
        );
      }
    }
  }
}

/**
 * Validates that there are no cyclic dependencies.
 * Uses DFS to detect cycles and reports the full cycle path.
 */
function validateNoCycles(artifacts: Artifact[]): void {
  const artifactMap = new Map(artifacts.map(a => [a.id, a]));
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const parent = new Map<string, string>();

  function dfs(id: string): string | null {
    visited.add(id);
    inStack.add(id);

    const artifact = artifactMap.get(id);
    if (!artifact) return null;

    for (const dep of artifact.requires) {
      if (!visited.has(dep)) {
        parent.set(dep, id);
        const cycle = dfs(dep);
        if (cycle) return cycle;
      } else if (inStack.has(dep)) {
        // Found a cycle - reconstruct the path
        const cyclePath = [dep];
        let current = id;
        while (current !== dep) {
          cyclePath.unshift(current);
          current = parent.get(current)!;
        }
        cyclePath.unshift(dep);
        return cyclePath.join(' → ');
      }
    }

    inStack.delete(id);
    return null;
  }

  for (const artifact of artifacts) {
    if (!visited.has(artifact.id)) {
      const cycle = dfs(artifact.id);
      if (cycle) {
        throw new SchemaValidationError(`Cyclic dependency detected: ${cycle}`);
      }
    }
  }
}
