import { z } from 'zod';

export const AppRegistrationSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  name: z.string(),
  description: z.string().optional(),
  redirectUris: z.array(z.string().url()),
  scopes: z.array(z.string()),
  grantTypes: z.array(z.enum(['authorization_code', 'client_credentials', 'refresh_token'])),
  createdAt: z.string().datetime(),
  ownerId: z.string(),
});

export type AppRegistration = z.infer<typeof AppRegistrationSchema>;

export const APIEndpointSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  path: z.string(),
  summary: z.string(),
  description: z.string().optional(),
  scopes: z.array(z.string()),
  parameters: z
    .array(
      z.object({
        name: z.string(),
        in: z.enum(['path', 'query', 'header', 'body']),
        required: z.boolean(),
        type: z.string(),
        description: z.string().optional(),
      }),
    )
    .optional(),
  responses: z
    .record(
      z.object({
        description: z.string(),
        schema: z.string().optional(),
      }),
    )
    .optional(),
});

export type APIEndpoint = z.infer<typeof APIEndpointSchema>;

export const APIDocSchema = z.object({
  title: z.string(),
  version: z.string(),
  baseUrl: z.string().url(),
  endpoints: z.array(APIEndpointSchema),
});

export type APIDoc = z.infer<typeof APIDocSchema>;

export const DeveloperProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  apps: z.array(z.string()),
  createdAt: z.string().datetime(),
  verified: z.boolean(),
});

export type DeveloperProfile = z.infer<typeof DeveloperProfileSchema>;
