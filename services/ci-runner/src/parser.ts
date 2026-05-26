import { z } from 'zod';
import YAML from 'yaml';

export const CIJobConfigSchema = z.object({
  name: z.string(),
  image: z.string().optional().default('node:22'),
  stage: z.string().optional().default('default'),
  script: z.array(z.string()),
  artifacts: z
    .object({
      paths: z.array(z.string()),
      expireIn: z.string().optional(),
    })
    .optional(),
  dependencies: z.array(z.string()).optional(),
  only: z.array(z.string()).optional(),
  except: z.array(z.string()).optional(),
  environment: z.record(z.string()).optional(),
  timeout: z.string().optional().default('30m'),
  allowFailure: z.boolean().optional().default(false),
});

export const CIConfigSchema = z.object({
  version: z.string().optional().default('1'),
  stages: z.array(z.string()).optional().default(['build', 'test', 'deploy']),
  variables: z.record(z.string()).optional(),
  jobs: z.record(CIJobConfigSchema),
});

export type CIConfig = z.infer<typeof CIConfigSchema>;
export type CIJobConfig = z.infer<typeof CIJobConfigSchema>;

export class CIConfigParser {
  parseConfig(yamlContent: string): CIConfig {
    const raw = YAML.parse(yamlContent) as unknown;
    return CIConfigSchema.parse(raw);
  }

  getJobsForStage(config: CIConfig, stage: string): CIJobConfig[] {
    return Object.values(config.jobs).filter((job) => job.stage === stage);
  }

  getExecutionOrder(config: CIConfig): string[][] {
    const stages = config.stages;
    const result: string[][] = [];

    for (const stage of stages) {
      const jobNames = Object.entries(config.jobs)
        .filter(([_, job]) => job.stage === stage)
        .map(([name]) => name);

      if (jobNames.length > 0) {
        result.push(jobNames);
      }
    }

    // Include jobs in 'default' stage if not already included
    const defaultJobs = Object.entries(config.jobs)
      .filter(([_, job]) => job.stage === 'default' && !stages.includes('default'))
      .map(([name]) => name);

    if (defaultJobs.length > 0) {
      result.push(defaultJobs);
    }

    return result;
  }
}
