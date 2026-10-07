import { describe, it, expect } from 'vitest';
import { FederationServer } from './server.js';
import { Actor } from './actor.js';
import type { InboxSignatureVerifier } from './inbox.js';

describe('FederationServer', () => {
  it('GET actor route returns valid actor', () => {
    const server = new FederationServer();
    const actor = new Actor('alice', 'local.example');
    server.registerActor(actor);

    const response = server.handle('GET', '/users/alice');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/activity+json');
    const body = response.body as Record<string, unknown>;
    expect(body['type']).toBe('Person');
    expect(body['preferredUsername']).toBe('alice');
  });

  it('POST inbox calls processor', () => {
    const server = new FederationServer();
    const actor = new Actor('bob', 'local.example');
    server.registerActor(actor);

    const response = server.handle('POST', '/users/bob/inbox', {
      type: 'Follow',
      actor: 'https://remote.example/users/carol',
      object: 'https://local.example/users/bob',
    });

    expect(response.status).toBe(202);
    const body = response.body as Record<string, unknown>;
    expect(body['type']).toBe('Accept');
  });

  it('GET outbox returns collection', () => {
    const server = new FederationServer();
    const actor = new Actor('dave', 'local.example');
    server.registerActor(actor);

    const response = server.handle('GET', '/users/dave/outbox');

    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(body['type']).toBe('OrderedCollection');
    expect(body['totalItems']).toBe(0);
  });

  it('GET followers returns collection', () => {
    const server = new FederationServer();
    const actor = new Actor('eve', 'local.example');
    server.registerActor(actor);

    const response = server.handle('GET', '/users/eve/followers');

    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(body['type']).toBe('OrderedCollection');
  });

  it('rejects inbox POST with invalid signature when verifier is configured', () => {
    const verifier: InboxSignatureVerifier = () => false;
    const server = new FederationServer(undefined, verifier);
    const actor = new Actor('frank', 'local.example');
    server.registerActor(actor);

    const response = server.handle(
      'POST',
      '/users/frank/inbox',
      {
        type: 'Follow',
        actor: 'https://remote.example/users/mallory',
        object: 'https://local.example/users/frank',
      },
      {
        headers: { signature: 'invalid-sig' },
        method: 'POST',
        url: '/users/frank/inbox',
        body: '{"type":"Follow","actor":"https://remote.example/users/mallory","object":"https://local.example/users/frank"}',
      },
    );

    expect(response.status).toBe(403);
    const body = response.body as Record<string, unknown>;
    expect(body['error']).toBe('Invalid signature');
  });

  it('accepts inbox POST with valid signature when verifier is configured', () => {
    const verifier: InboxSignatureVerifier = () => true;
    const server = new FederationServer(undefined, verifier);
    const actor = new Actor('grace', 'local.example');
    server.registerActor(actor);

    const response = server.handle(
      'POST',
      '/users/grace/inbox',
      {
        type: 'Follow',
        actor: 'https://remote.example/users/heidi',
        object: 'https://local.example/users/grace',
      },
      {
        headers: { signature: 'valid-sig' },
        method: 'POST',
        url: '/users/grace/inbox',
        body: '{"type":"Follow","actor":"https://remote.example/users/heidi","object":"https://local.example/users/grace"}',
      },
    );

    expect(response.status).toBe(202);
    const body = response.body as Record<string, unknown>;
    expect(body['type']).toBe('Accept');
  });

  it('processes inbox POST without verification when no verifier is configured', () => {
    const server = new FederationServer();
    const actor = new Actor('ivan', 'local.example');
    server.registerActor(actor);

    const response = server.handle('POST', '/users/ivan/inbox', {
      type: 'Follow',
      actor: 'https://remote.example/users/judy',
      object: 'https://local.example/users/ivan',
    });

    expect(response.status).toBe(202);
    const body = response.body as Record<string, unknown>;
    expect(body['type']).toBe('Accept');
  });

  it('processes inbox POST without verification when verifier is configured but no request metadata', () => {
    const verifier: InboxSignatureVerifier = () => false;
    const server = new FederationServer(undefined, verifier);
    const actor = new Actor('kate', 'local.example');
    server.registerActor(actor);

    // No requestMeta passed, so verifier should not be invoked
    const response = server.handle('POST', '/users/kate/inbox', {
      type: 'Follow',
      actor: 'https://remote.example/users/larry',
      object: 'https://local.example/users/kate',
    });

    expect(response.status).toBe(202);
    const body = response.body as Record<string, unknown>;
    expect(body['type']).toBe('Accept');
  });
});
