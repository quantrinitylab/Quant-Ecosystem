import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyError } from 'fastify';
import { ZodError } from 'zod';

export interface AppError extends Error {
  statusCode: number;
  code: string;
  /**
   * Optional machine-readable context (e.g. VERSION_CONFLICT carries
   * { resource, id, expectedVersion, currentVersion } so the client can
   * re-read and retry). Serialized into the error response when present.
   */
  details?: Record<string, unknown>;
}

export function isAppError(err: unknown): err is AppError {
  return (
    err instanceof Error &&
    'statusCode' in err &&
    'code' in err &&
    typeof (err as AppError).statusCode === 'number' &&
    typeof (err as AppError).code === 'string'
  );
}

export function createAppError(
  message: string,
  statusCode: number,
  code: string,
  details?: Record<string, unknown>,
): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError | Error, _request, reply) => {
    // Zod validation errors
    if (error instanceof ZodError) {
      const details = error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          statusCode: 400,
          details,
        },
      });
    }

    // Fastify validation errors (from schema validation)
    if ('validation' in error && error.validation) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          statusCode: 400,
          details: error.validation,
        },
      });
    }

    // Known app errors
    if (isAppError(error)) {
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      });
    }

    // Unknown errors
    const isDev = process.env['NODE_ENV'] !== 'production';
    const statusCode = 'statusCode' in error ? ((error as FastifyError).statusCode ?? 500) : 500;

    return reply.status(statusCode).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: isDev ? error.message : 'An internal error occurred',
        statusCode,
      },
    });
  });
}

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
});
