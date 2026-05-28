import type { OAuthClient, OAuthToken } from '../types.js';

export class OAuthClientManager {
  private clients = new Map<string, OAuthClient>();
  private tokens = new Map<string, OAuthToken>();

  createClient(name: string, redirectUris: string[], scopes: string[]): OAuthClient {
    const client: OAuthClient = {
      id: crypto.randomUUID(),
      clientId: `client_${crypto.randomUUID().replace(/-/g, '')}`,
      clientSecret: `secret_${crypto.randomUUID().replace(/-/g, '')}`,
      name,
      redirectUris,
      scopes,
      createdAt: Date.now(),
    };
    this.clients.set(client.id, client);
    return client;
  }

  getClient(id: string): OAuthClient | null {
    return this.clients.get(id) ?? null;
  }

  validateRedirectUri(clientId: string, uri: string): boolean {
    const client = this.findByClientId(clientId);
    if (!client) return false;
    return client.redirectUris.includes(uri);
  }

  validateScopes(clientId: string, requestedScopes: string[]): boolean {
    const client = this.findByClientId(clientId);
    if (!client) return false;
    return requestedScopes.every((s) => client.scopes.includes(s));
  }

  generateToken(clientId: string, scopes: string[], ttlMs: number): OAuthToken | null {
    const client = this.findByClientId(clientId);
    if (!client) return null;
    if (!scopes.every((s) => client.scopes.includes(s))) return null;
    const token: OAuthToken = {
      id: crypto.randomUUID(),
      clientId,
      accessToken: `at_${crypto.randomUUID().replace(/-/g, '')}`,
      refreshToken: `rt_${crypto.randomUUID().replace(/-/g, '')}`,
      scopes,
      expiresAt: Date.now() + ttlMs,
      revokedAt: null,
    };
    this.tokens.set(token.id, token);
    return token;
  }

  revokeToken(tokenId: string): boolean {
    const token = this.tokens.get(tokenId);
    if (!token || token.revokedAt) return false;
    token.revokedAt = Date.now();
    return true;
  }

  isTokenValid(tokenId: string): boolean {
    const token = this.tokens.get(tokenId);
    if (!token || token.revokedAt) return false;
    return Date.now() < token.expiresAt;
  }

  getToken(tokenId: string): OAuthToken | null {
    return this.tokens.get(tokenId) ?? null;
  }

  private findByClientId(clientId: string): OAuthClient | null {
    for (const client of this.clients.values()) {
      if (client.clientId === clientId) return client;
    }
    return null;
  }
}
