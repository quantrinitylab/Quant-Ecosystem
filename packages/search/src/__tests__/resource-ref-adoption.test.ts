/**
 * EC-02 adoption tests — cross-app search results carry typed resource refs
 * (doc 22 §2). Unknown producers keep their results; refs are absent, never
 * fabricated.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CrossAppSearchService, searchResultToResourceRef } from '../cross-app-search';

describe('EC-02 resource ref adoption in cross-app search', () => {
  let service: CrossAppSearchService;

  beforeEach(() => {
    service = new CrossAppSearchService();
  });

  it('attaches a typed ref for canonical app/type/id', () => {
    service.indexDocument('quantmail', {
      id: 't-1',
      type: 'mail.thread',
      title: 'Quarterly planning',
      content: 'planning the quarterly roadmap',
      url: '/mail/thread/t-1',
    });
    const res = service.search('quarterly');
    expect(res.results.length).toBeGreaterThan(0);
    const first = res.results[0]!;
    expect(first.resourceRef).toBeDefined();
    expect(first.resourceRef?.appId).toBe('quantmail');
    expect(first.resourceRef?.resourceType).toBe('mail.thread');
    expect(first.resourceRef?.resourceId).toBe('t-1');
    expect(first.resourceRef?.deepLink).toBe('quant://mail/thread/t-1');
  });

  it('leaves results without ref for unknown producers (never drops)', () => {
    service.indexDocument('mysteryapp', {
      id: 'x-1',
      type: 'weird.thing',
      title: 'Mystery content here',
      content: 'mystery content body',
      url: '/x/1',
    });
    const res = service.search('mystery');
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0]!.resourceRef).toBeUndefined();
  });

  it('searchResultToResourceRef is lenient on unknown vocabulary', () => {
    expect(searchResultToResourceRef('quantchat', 'chat.message', 'm-1')).not.toBeNull();
    expect(searchResultToResourceRef('nope', 'x', 'y')).toBeNull();
  });
});
