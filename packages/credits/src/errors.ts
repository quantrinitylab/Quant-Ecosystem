// ============================================================================
// @quant/credits — structured application errors
// ============================================================================
//
// A tiny, dependency-free error helper so the credits subsystem stays
// app-agnostic (no Fastify / server-core import). The shape is structurally
// identical to `@quant/server-core`'s `AppError` (an `Error` carrying a numeric
// `statusCode` and a string `code`), so a host Fastify error handler reads the
// same fields regardless of where the error was created.

export interface AppError extends Error {
  statusCode: number;
  code: string;
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

export function createAppError(message: string, statusCode: number, code: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  return err;
}
