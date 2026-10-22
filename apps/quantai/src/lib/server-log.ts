// Server-side structured logger for route handlers.
// The repo lint rule `no-console` (eslint.config.mjs) bans console.* in app
// source. Route handlers still need an observable log sink on the server:
// this writes single-line structured records to stderr, which is where the
// platform collects server logs. Never use for user-facing output.
export function logServerError(scope: string, message: string): void {
  process.stderr.write(`ERROR ${scope} ${message}\n`);
}
export function logServerWarn(scope: string, message: string): void {
  process.stderr.write(`WARN ${scope} ${message}\n`);
}
