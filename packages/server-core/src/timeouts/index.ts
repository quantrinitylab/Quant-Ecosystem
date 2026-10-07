// K13 remote-call timeout policy — public surface.
export {
  RemoteCallTimeoutError,
  REMOTE_CALL_TIMEOUTS,
  getTimeoutMs,
  withTimeout,
  withDependencyTimeout,
  fetchWithTimeout,
} from './timeouts';
export type { RemoteDependencyKey, TimeoutLogger, WithTimeoutOptions, FetchWithTimeoutOptions } from './timeouts';
