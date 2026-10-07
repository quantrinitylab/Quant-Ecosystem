/**
 * EC-02 adoption tests — universal timeline events carry typed resource refs
 * and convert to purpose-bound context envelopes (doc 22 §2/§4/§8).
 */
import { describe, it, expect } from 'vitest';
import {
  timelineEventToResourceRef,
  attachResourceRef,
  attachProvenance,
  timelineEventToEnvelope,
} from '../resource-adapters';
import { createResourceRef, ResourceContractError } from '@quant/app-registry';
import type { TimelineEvent } from '../types';

const baseEvent: TimelineEvent = {
  id: 't-1',
  userId: 'user-1',
  app: 'quantmail',
  type: 'mail.thread',
  title: 'Planning thread',
  description: 'Q4 planning',
  timestamp: Date.now(),
  importance: 'high',
};

describe('timeline EC-02 resource adapters', () => {
  it('derives a typed ref from a canonical event', () => {
    const ref = timelineEventToResourceRef(baseEvent);
    expect(ref).not.toBeNull();
    expect(ref?.appId).toBe('quantmail');
    expect(ref?.resourceType).toBe('mail.thread');
    expect(ref?.deepLink).toBe('quant://mail/thread/t-1');
  });

  it('returns null for unknown producers without dropping the event', () => {
    const ref = timelineEventToResourceRef({ ...baseEvent, app: 'mystery', type: 'weird' });
    expect(ref).toBeNull();
  });

  it('attachResourceRef attaches a matching ref', () => {
    const ref = createResourceRef({ appId: 'quantmail', resourceType: 'mail.thread', resourceId: 't-1' });
    const attached = attachResourceRef(baseEvent, ref);
    expect(attached.resourceRef?.resourceId).toBe('t-1');
  });

  it('attachResourceRef fails closed on identity mismatch', () => {
    const ref = createResourceRef({ appId: 'quantchat', resourceType: 'chat.message', resourceId: 'm-9' });
    expect(() => attachResourceRef(baseEvent, ref)).toThrowError(ResourceContractError);
  });

  it('attachProvenance records import provenance (§8)', () => {
    const withProv = attachProvenance(
      { ...baseEvent, id: 'imported-1' },
      { appId: 'quantube', resourceType: 'tube.video', resourceId: 'v-7' },
      'imported',
      'user-1',
      'corr-42',
    );
    expect(withProv.provenance?.operation).toBe('imported');
    expect(withProv.provenance?.source.resourceId).toBe('v-7');
    expect(withProv.provenance?.correlationId).toBe('corr-42');
  });

  it('timelineEventToEnvelope builds a valid purpose-bound envelope', () => {
    const env = timelineEventToEnvelope(baseEvent, 'notification', { type: 'service', id: 'timeline' });
    expect(env.sourceApp).toBe('quantmail');
    expect(env.purpose).toBe('notification');
    expect(env.resourceRef?.resourceId).toBe('t-1');
    expect(env.correlationId).toBe('t-1');
    expect(env.payload).toMatchObject({ title: 'Planning thread' });
  });

  it('envelope conversion fails closed on unknown source app', () => {
    expect(() =>
      timelineEventToEnvelope(
        { ...baseEvent, app: 'evilapp' },
        'notification',
        { type: 'service', id: 'timeline' },
      ),
    ).toThrowError(ResourceContractError);
  });
});
