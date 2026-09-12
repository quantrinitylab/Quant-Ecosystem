export { createApp } from './app';
export { default as errorHandlerPlugin, createAppError, isAppError } from './plugins/error-handler';
export type { AppError } from './plugins/error-handler';
export { default as authPlugin } from './plugins/auth';
export type { RequireAuthOptions } from './plugins/auth';
export { default as prismaPlugin } from './plugins/prisma';
export { default as healthPlugin } from './plugins/health';
export type { HealthStatus, HealthComponentResult, HealthContributor } from './plugins/health';
export { default as metricsPlugin } from './plugins/metrics';
export { default as requestIdPlugin } from './plugins/request-id';
export { default as requestLoggerPlugin } from './plugins/request-logger';
export { default as gracefulShutdownPlugin } from './plugins/graceful-shutdown';
export type { AppConfig, AuthenticatedRequest } from './types';
export { default as observabilityPlugin } from './plugins/observability';
export { default as errorMonitoringPlugin } from './plugins/error-monitoring';
export type { ErrorMonitoringService } from './plugins/error-monitoring';
export { default as featureFlagsPlugin } from './plugins/feature-flags';
export { default as organizationsPlugin } from './plugins/organizations';
export { default as auditPlugin } from './plugins/audit';
export { default as notificationsPlugin } from './plugins/notifications';
export type { NotificationsService } from './plugins/notifications';
export { default as identityPermissionsPlugin } from './plugins/identity-permissions';
export { default as teamsPlugin } from './plugins/teams';
export { ScopeEvaluator } from './permissions/scope-evaluator';
export type { ScopeEvaluatorFn } from './permissions/scope-evaluator';
export type {
  RepositoryBlobContent,
  RepositoryCommitSummary,
  RepositoryInspectionPort,
  RepositoryProvisioningPort,
  RepositoryTreeEntry,
} from './ports/repository.port';
