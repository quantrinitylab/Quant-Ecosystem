import { z } from 'zod';

export const StorageConfigSchema = z.object({
  endpoint: z.string().default('http://localhost:9000'),
  region: z.string().default('us-east-1'),
  bucket: z.string().default('quant-uploads'),
  accessKeyId: z.string().default('minioadmin'),
  secretAccessKey: z.string().default('minioadmin'),
  forcePathStyle: z.boolean().default(true),
});

export type StorageConfig = z.infer<typeof StorageConfigSchema>;
