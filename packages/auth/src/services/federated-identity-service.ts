// ============================================================================
// Auth - Federated Identity Service (Sign in with Quant)
// ============================================================================

import type { FederatedClient } from '../types';
import { generateSecureToken, generateId } from '../crypto/secure-random';

/** Configuration for registering a federated client */
export interface FederatedClientConfig {
  name: string;
  logo?: string;
  website: string;
  redirectUris: string[];
  allowedScopes: string[];
}

/**
 * Federated Identity Service
 *
 * Powers the "Sign in with Quant" button for external websites and apps.
 * Manages third-party OAuth2 client registration and credential lifecycle.
 */
export class FederatedIdentityService {
  private clients: Map<string, FederatedClient> = new Map();
  private ownerClients: Map<string, Set<string>> = new Map();

  /**
   * Register a new third-party client
   */
  registerClient(owner: string, config: FederatedClientConfig): FederatedClient {
    const { clientId, clientSecret } = this.generateClientCredentials();

    const client: FederatedClient = {
      clientId,
      clientSecret,
      name: config.name,
      logo: config.logo,
      website: config.website,
      redirectUris: config.redirectUris,
      allowedScopes: config.allowedScopes,
      createdBy: owner,
      createdAt: new Date(),
    };

    this.clients.set(clientId, client);

    // Track ownership
    if (!this.ownerClients.has(owner)) {
      this.ownerClients.set(owner, new Set());
    }
    this.ownerClients.get(owner)!.add(clientId);

    return client;
  }

  /**
   * Generate a new client ID and secret pair
   */
  generateClientCredentials(): { clientId: string; clientSecret: string } {
    return {
      clientId: generateId('qfc'),
      clientSecret: `qfs_${generateSecureToken(32)}`,
    };
  }

  /**
   * Validate a client's redirect URI
   */
  validateClientRedirectUri(clientId: string, redirectUri: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;
    return client.redirectUris.includes(redirectUri);
  }

  /**
   * Get client info (without secret)
   */
  getClientInfo(clientId: string): Omit<FederatedClient, 'clientSecret'> | null {
    const client = this.clients.get(clientId);
    if (!client) return null;
    const { clientSecret: _secret, ...info } = client;
    return info;
  }

  /**
   * List all clients owned by a user
   */
  listUserClients(userId: string): FederatedClient[] {
    const clientIds = this.ownerClients.get(userId);
    if (!clientIds) return [];

    const result: FederatedClient[] = [];
    for (const id of clientIds) {
      const client = this.clients.get(id);
      if (client) {
        result.push(client);
      }
    }
    return result;
  }

  /**
   * Revoke a client registration
   */
  revokeClient(clientId: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    this.clients.delete(clientId);

    // Remove from owner tracking
    const ownerSet = this.ownerClients.get(client.createdBy);
    if (ownerSet) {
      ownerSet.delete(clientId);
      if (ownerSet.size === 0) {
        this.ownerClients.delete(client.createdBy);
      }
    }

    return true;
  }
}
