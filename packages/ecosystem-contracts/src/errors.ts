export class QuantContractError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'QuantContractError';
    this.code = code;
    this.details = details;
  }
}

export const CONTRACT_ERROR_CODES = {
  INVALID_REFERENCE: 'INVALID_REFERENCE',
  UNKNOWN_APP: 'UNKNOWN_APP',
  UNKNOWN_RESOURCE_TYPE: 'UNKNOWN_RESOURCE_TYPE',
  INVALID_CONTEXT: 'INVALID_CONTEXT',
  INVALID_VERSION: 'INVALID_VERSION',
} as const;
