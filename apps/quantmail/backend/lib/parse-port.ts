// ============================================================================
// QuantMail backend — safe PORT parsing.
// ============================================================================
//
// `Number(process.env['PORT'])` returns NaN for non-numeric values (e.g.
// PORT='abc'), and `app.listen({ port: NaN })` throws
// `RangeError [ERR_SOCKET_BAD_PORT]`, crashing the backend at startup.
// parsePort() guarantees a valid TCP port (integer 1–65535) and falls back to
// the pre-existing default 3010 with a clear warning for anything else.

export const DEFAULT_PORT = 3010;

/**
 * Parses a raw PORT value into a valid TCP port.
 *
 * @param raw - the raw value; defaults to `process.env['PORT']`. Kept as an
 *   explicit parameter so tests can exercise every branch deterministically.
 * @returns the parsed port when it is an integer in 1–65535; otherwise
 *   DEFAULT_PORT (3010) after logging a warning naming the offending value.
 */
export function parsePort(raw?: string): number {
  const value = raw ?? process.env['PORT'];
  const port = value === undefined || value.trim() === '' ? NaN : Number(value);
  if (Number.isInteger(port) && port >= 1 && port <= 65535) {
    return port;
  }
  // getConfig() runs before the Fastify instance exists, so there is no
  // app.log here yet — console.warn is the only log available at this point.
  // eslint-disable-next-line no-console
  console.warn(`Invalid PORT="${value}" — falling back to ${DEFAULT_PORT}.`);
  return DEFAULT_PORT;
}
