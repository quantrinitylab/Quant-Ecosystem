export { SearchRouter, SearchAPIRequestSchema, SearchAPIResponseSchema } from './search.router';
export {
  ProactiveRouter,
  ProactiveRequestSchema,
  ProactiveResponseSchema,
} from './proactive.router';
export { registerReindexRoutes } from './reindex';
export {
  UniversalSearchRouter,
  UniversalSearchRequestSchema,
  UniversalSearchResponseSchema,
  SuggestionsRequestSchema,
  SuggestionsResponseSchema,
  FindSimilarRequestSchema,
  FindSimilarResponseSchema,
  HistoryRequestSchema,
  HistoryResponseSchema,
  ClearHistoryRequestSchema,
  DefaultPermissionResolver,
} from './universal-search.router';

export type { SearchAPIRequest, SearchAPIResponse } from './search.router';
export type { ProactiveRequest, ProactiveResponse } from './proactive.router';
export type {
  UniversalSearchRequest as UniversalSearchAPIRequest,
  UniversalSearchAPIResponse,
  SuggestionsRequest,
  SuggestionsResponse,
  FindSimilarRequest,
  FindSimilarResponse,
  HistoryRequest,
  HistoryResponse,
  ClearHistoryRequest,
  PermissionResolver,
  UserPermissions,
} from './universal-search.router';
