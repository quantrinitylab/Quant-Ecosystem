import { QUANT_APP_IDS, type QuantContextEnvelope, type QuantResourceRef } from './types';
import { isResourceTypeForApp } from './resource-types';
import { CONTRACT_ERROR_CODES, QuantContractError } from './errors';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isAppId(value: unknown): value is (typeof QUANT_APP_IDS)[number] {
  return typeof value === 'string' && (QUANT_APP_IDS as readonly string[]).includes(value);
}

export function assertResourceRef(ref: QuantResourceRef): void {
  if (!isAppId(ref.appId)) {
    throw new QuantContractError(CONTRACT_ERROR_CODES.UNKNOWN_APP, 'Unknown Quant application', {
      appId: ref.appId,
    });
  }
  if (!isNonEmptyString(ref.resourceType) || !isResourceTypeForApp(ref.appId, ref.resourceType)) {
    throw new QuantContractError(
      CONTRACT_ERROR_CODES.UNKNOWN_RESOURCE_TYPE,
      'Resource type is not registered for the owning application',
      { appId: ref.appId, resourceType: ref.resourceType },
    );
  }
  if (!isNonEmptyString(ref.resourceId) || !isNonEmptyString(ref.canonicalUrl) || !isNonEmptyString(ref.deepLink)) {
    throw new QuantContractError(
      CONTRACT_ERROR_CODES.INVALID_REFERENCE,
      'Resource reference contains an empty identifier or link',
    );
  }
  if (ref.resourceVersion !== undefined && (!Number.isInteger(ref.resourceVersion) || ref.resourceVersion < 1)) {
    throw new QuantContractError(
      CONTRACT_ERROR_CODES.INVALID_VERSION,
      'resourceVersion must be a positive integer',
    );
  }
}

export function assertContextEnvelope<T>(envelope: QuantContextEnvelope<T>): void {
  if (!isNonEmptyString(envelope.eventId) || !Number.isInteger(envelope.schemaVersion) || envelope.schemaVersion < 1) {
    throw new QuantContractError(CONTRACT_ERROR_CODES.INVALID_CONTEXT, 'Invalid event identity or schema version');
  }
  if (!isNonEmptyString(envelope.correlationId) || !isNonEmptyString(envelope.occurredAt)) {
    throw new QuantContractError(CONTRACT_ERROR_CODES.INVALID_CONTEXT, 'Context envelope is missing correlation or occurrence data');
  }
  if (!isAppId(envelope.sourceApp)) {
    throw new QuantContractError(CONTRACT_ERROR_CODES.UNKNOWN_APP, 'Unknown source application', {
      sourceApp: envelope.sourceApp,
    });
  }
  if (envelope.targetApp !== undefined && !isAppId(envelope.targetApp)) {
    throw new QuantContractError(CONTRACT_ERROR_CODES.UNKNOWN_APP, 'Unknown target application', {
      targetApp: envelope.targetApp,
    });
  }
  if (envelope.resource) assertResourceRef(envelope.resource);
}
