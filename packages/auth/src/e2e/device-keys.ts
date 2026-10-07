// ============================================================================
// E2E - Device Key Service
// Per-device key generation and linking
// ============================================================================

import * as crypto from 'node:crypto';
import type { IdentityKeyPair } from './identity-key';

export interface DeviceKeyPair {
  publicKey: crypto.KeyObject;
  privateKey: crypto.KeyObject;
  deviceId: string;
}

export interface DeviceLink {
  deviceId: string;
  devicePublicKey: crypto.KeyObject;
  signature: Buffer;
  timestamp: number;
}

export class DeviceKeyService {
  /**
   * Generate a device keypair (X25519 for DH)
   */
  generateDeviceKeyPair(): DeviceKeyPair {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
    const deviceId = crypto.randomBytes(16).toString('hex');
    return { publicKey, privateKey, deviceId };
  }

  /**
   * Link a device to the master identity by signing the device public key
   */
  linkDevice(masterIdentity: IdentityKeyPair, deviceKey: DeviceKeyPair): DeviceLink {
    const devicePublicDer = deviceKey.publicKey.export({ type: 'spki', format: 'der' });
    const timestamp = Date.now();
    const dataToSign = Buffer.concat([
      Buffer.from(devicePublicDer),
      Buffer.from(deviceKey.deviceId, 'utf8'),
      Buffer.from(timestamp.toString(), 'utf8'),
    ]);
    const signature = crypto.sign(null, dataToSign, masterIdentity.privateKey);

    return {
      deviceId: deviceKey.deviceId,
      devicePublicKey: deviceKey.publicKey,
      signature,
      timestamp,
    };
  }

  /**
   * Verify a device link against the master identity public key
   */
  verifyDeviceLink(masterPublicKey: crypto.KeyObject, link: DeviceLink): boolean {
    const devicePublicDer = link.devicePublicKey.export({ type: 'spki', format: 'der' });
    const dataToVerify = Buffer.concat([
      Buffer.from(devicePublicDer),
      Buffer.from(link.deviceId, 'utf8'),
      Buffer.from(link.timestamp.toString(), 'utf8'),
    ]);
    return crypto.verify(null, dataToVerify, masterPublicKey, link.signature);
  }

  /**
   * Compute a shared secret between two device keys using ECDH
   */
  computeSharedSecret(ownPrivateKey: crypto.KeyObject, otherPublicKey: crypto.KeyObject): Buffer {
    return crypto.diffieHellman({
      privateKey: ownPrivateKey,
      publicKey: otherPublicKey,
    });
  }
}
