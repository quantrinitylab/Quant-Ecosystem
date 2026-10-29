// ============================================================================
// QuantCooks CP-1 — shared definition helpers (consent gates, §4/§8).
// ============================================================================
//
// The consent gate is OURS even when the engine is theirs: for the two
// training tools (create_chef_persona, clone_voice) consent validation
// runs inside the invoke pipeline BEFORE any configuration check — a
// consent-less call gets 400 CONSENT_REQUIRED even on a deployment where
// training is not configured at all, so no surface (UI, MCP, CLI,
// QuantAI) can route around it.
// ============================================================================

import { z } from 'zod';
import { createAppError } from '@quant/server-core';

/** The consent payload both training tools carry (§4.1/§4.2 shape). */
export function consentSchema(field: 'ownLikeness' | 'ownVoice') {
  return z.object({
    [field]: z.boolean(),
    confirmedAt: z.string().min(1),
  });
}

export function requireConsent(field: 'ownLikeness' | 'ownVoice', subject: string) {
  return (input: { consent?: Record<string, unknown> }): void => {
    const consent = input.consent;
    if (
      !consent ||
      consent[field] !== true ||
      typeof consent['confirmedAt'] !== 'string' ||
      !consent['confirmedAt']
    ) {
      throw createAppError(
        `${subject} requires the owner's explicit consent: consent.${field} must be true with a confirmedAt timestamp`,
        400,
        'CONSENT_REQUIRED',
      );
    }
  };
}

/** Loose output schema: documented keys, service-shaped payloads as
 *  unknowns (their shapes are the services' own contracts). */
export function out(fields: Record<string, z.ZodTypeAny>) {
  return z.object(fields).passthrough();
}

export const jobOut = out({ job: z.unknown() });
