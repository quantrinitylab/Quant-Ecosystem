import { describe, it, expect } from 'vitest';
import { InboxProcessor } from './inbox.js';
import { FederationModeration } from '../moderation.js';

describe('InboxProcessor', () => {
  it('Follow creates relationship and returns Accept', () => {
    const processor = new InboxProcessor();
    const result = processor.process(
      {
        type: 'Follow',
        actor: 'https://remote.example/users/bob',
        object: 'https://local.example/users/alice',
      },
      'remote.example',
    );

    expect(result.accepted).toBe(true);
    expect(result.response).toBeDefined();
    expect(result.response!.type).toBe('Accept');
    expect(result.response!.actor).toBe('https://local.example/users/alice');
    expect(
      processor
        .getFollowers('https://local.example/users/alice')
        .has('https://remote.example/users/bob'),
    ).toBe(true);
  });

  it('Like records correctly', () => {
    const processor = new InboxProcessor();
    const result = processor.process(
      {
        type: 'Like',
        actor: 'https://remote.example/users/bob',
        object: 'https://local.example/posts/1',
      },
      'remote.example',
    );

    expect(result.accepted).toBe(true);
    expect(processor.getLikes('https://local.example/posts/1')).toContain(
      'https://remote.example/users/bob',
    );
  });

  it('Create stores object', () => {
    const processor = new InboxProcessor();
    const noteObject = {
      id: 'https://remote.example/notes/42',
      type: 'Note',
      content: 'Hello world',
    };
    const result = processor.process(
      { type: 'Create', actor: 'https://remote.example/users/bob', object: noteObject },
      'remote.example',
    );

    expect(result.accepted).toBe(true);
    expect(processor.getContent('https://remote.example/notes/42')).toEqual(noteObject);
  });

  it('Announce records boost', () => {
    const processor = new InboxProcessor();
    const result = processor.process(
      {
        type: 'Announce',
        actor: 'https://remote.example/users/bob',
        object: 'https://local.example/posts/5',
      },
      'remote.example',
    );

    expect(result.accepted).toBe(true);
    expect(processor.getBoosts('https://local.example/posts/5')).toContain(
      'https://remote.example/users/bob',
    );
  });

  it('Delete marks tombstone', () => {
    const processor = new InboxProcessor();
    processor.process(
      {
        type: 'Create',
        actor: 'https://remote.example/users/bob',
        object: { id: 'https://remote.example/notes/99', type: 'Note', content: 'temp' },
      },
      'remote.example',
    );
    const result = processor.process(
      {
        type: 'Delete',
        actor: 'https://remote.example/users/bob',
        object: 'https://remote.example/notes/99',
      },
      'remote.example',
    );

    expect(result.accepted).toBe(true);
    expect(processor.isTombstone('https://remote.example/notes/99')).toBe(true);
    expect(processor.getContent('https://remote.example/notes/99')).toBeUndefined();
  });

  it('blocked instance is rejected', () => {
    const moderation = new FederationModeration();
    moderation.blockInstance('evil.example');
    const processor = new InboxProcessor(moderation);

    const result = processor.process(
      {
        type: 'Follow',
        actor: 'https://evil.example/users/badactor',
        object: 'https://local.example/users/alice',
      },
      'evil.example',
    );

    expect(result.accepted).toBe(false);
    expect(result.error).toContain('Blocked');
  });

  it('rejects activity with invalid signature when verifier is configured', () => {
    const verifier = () => false;
    const processor = new InboxProcessor(undefined, verifier);

    const result = processor.process(
      {
        type: 'Follow',
        actor: 'https://remote.example/users/bob',
        object: 'https://local.example/users/alice',
      },
      'remote.example',
      {
        headers: { signature: 'bad-sig' },
        method: 'POST',
        url: 'https://local.example/users/alice/inbox',
        body: '{}',
      },
    );

    expect(result.accepted).toBe(false);
    expect(result.error).toBe('Invalid signature');
  });

  it('accepts activity with valid signature when verifier is configured', () => {
    const verifier = () => true;
    const processor = new InboxProcessor(undefined, verifier);

    const result = processor.process(
      {
        type: 'Follow',
        actor: 'https://remote.example/users/bob',
        object: 'https://local.example/users/alice',
      },
      'remote.example',
      {
        headers: { signature: 'valid-sig' },
        method: 'POST',
        url: 'https://local.example/users/alice/inbox',
        body: '{}',
      },
    );

    expect(result.accepted).toBe(true);
  });
});
