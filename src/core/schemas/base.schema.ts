import { z } from 'zod';
import { VALIDATION_MESSAGES } from '../validation/constants.js';

export const ScenarioSchema = z.object({
  rawText: z.string().min(1, VALIDATION_MESSAGES.SCENARIO_EMPTY),
});

export const RequirementSchema = z.object({
  text: z.string()
    .min(1, VALIDATION_MESSAGES.REQUIREMENT_EMPTY),
  // Note: SHALL/MUST validation and scenarios.min(1) moved to validator
  // to allow configurable validation based on schema settings
  scenarios: z.array(ScenarioSchema),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;