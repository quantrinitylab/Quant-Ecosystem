import { describe, it, expect, beforeEach } from 'vitest';
import { MessageStore } from '../providers/message-store.js';
import type { SMSMessage } from '../providers/types.js';

function makeMsg(overrides: Partial<SMSMessage> = {}): SMSMessage {
  return {
    id: 'SM1',
    from: '+1111',
    to: '+2222',
    body: 'hello',
    timestamp: 1000,
    status: 'sent',
    direction: 'outbound',
    ...overrides,
  };
}

describe('MessageStore', () => {
  let store: MessageStore;

  beforeEach(() => {
    store = new MessageStore();
  });

  it('store and get', () => {
    store.store(makeMsg());
    expect(store.get('SM1')?.body).toBe('hello');
  });

  it('get returns undefined for missing id', () => {
    expect(store.get('nope')).toBeUndefined();
  });

  it('list returns all messages', () => {
    store.store(makeMsg({ id: 'A' }));
    store.store(makeMsg({ id: 'B' }));
    expect(store.list()).toHaveLength(2);
  });

  it('list with filter', () => {
    store.store(makeMsg({ id: 'A', from: '+1111', status: 'sent' }));
    store.store(makeMsg({ id: 'B', from: '+3333', status: 'delivered' }));
    expect(store.list({ from: '+1111' })).toHaveLength(1);
    expect(store.list({ status: 'delivered' })).toHaveLength(1);
  });

  it('list filters by since', () => {
    store.store(makeMsg({ id: 'A', timestamp: 500 }));
    store.store(makeMsg({ id: 'B', timestamp: 1500 }));
    expect(store.list({ since: 1000 })).toHaveLength(1);
  });

  it('getThread groups messages by contact', () => {
    store.store(makeMsg({ id: 'A', from: '+1111', to: '+2222' }));
    store.store(makeMsg({ id: 'B', from: '+2222', to: '+1111' }));
    store.store(makeMsg({ id: 'C', from: '+3333', to: '+4444' }));
    const thread = store.getThread('+1111');
    expect(thread.contactNumber).toBe('+1111');
    expect(thread.messages).toHaveLength(2);
  });

  it('updateStatus changes message state', () => {
    store.store(makeMsg({ id: 'X', status: 'queued' }));
    store.updateStatus('X', 'delivered');
    expect(store.get('X')?.status).toBe('delivered');
  });

  it('search matches body content', () => {
    store.store(makeMsg({ id: 'A', body: 'Hello world' }));
    store.store(makeMsg({ id: 'B', body: 'Goodbye' }));
    expect(store.search('hello')).toHaveLength(1);
    expect(store.search('hello')[0]!.id).toBe('A');
  });
});
