import { describe, it, expect } from 'vitest';
import { QuantSDK } from '../sdk/quant-sdk.js';
import { PermissionGate } from '../sdk/permission-gate.js';
import { Permission, PermissionDeniedError } from '../types.js';
import type { SDKContext } from '../types.js';

describe('PermissionGate', () => {
  it('should return true for granted permissions', () => {
    const gate = new PermissionGate([Permission.Storage, Permission.Network]);
    expect(gate.check(Permission.Storage)).toBe(true);
    expect(gate.check(Permission.Network)).toBe(true);
  });

  it('should return false for non-granted permissions', () => {
    const gate = new PermissionGate([Permission.Storage]);
    expect(gate.check(Permission.Camera)).toBe(false);
  });

  it('should throw PermissionDeniedError on enforce when not granted', () => {
    const gate = new PermissionGate([]);
    expect(() => gate.enforce(Permission.AI)).toThrow(PermissionDeniedError);
  });

  it('should list all granted permissions', () => {
    const gate = new PermissionGate([Permission.Camera, Permission.AI]);
    const granted = gate.listGranted();
    expect(granted).toHaveLength(2);
    expect(granted).toContain(Permission.Camera);
    expect(granted).toContain(Permission.AI);
  });
});

describe('QuantSDK', () => {
  function createContext(permissions: Permission[]): SDKContext {
    return { appId: 'test-app', userId: 'user-123', permissions };
  }

  it('should get user ID with identity permission', () => {
    const sdk = new QuantSDK(createContext([Permission.Identity]));
    expect(sdk.getUserId()).toBe('user-123');
  });

  it('should throw when getting user ID without identity permission', () => {
    const sdk = new QuantSDK(createContext([]));
    expect(() => sdk.getUserId()).toThrow(PermissionDeniedError);
  });

  it('should get profile with identity permission', () => {
    const sdk = new QuantSDK(createContext([Permission.Identity]));
    const profile = sdk.getProfile();
    expect(profile.userId).toBe('user-123');
  });

  it('should submit and retrieve scores with storage permission', () => {
    const sdk = new QuantSDK(createContext([Permission.Storage]));
    sdk.submitScore(100);
    sdk.submitScore(200);
    const leaderboard = sdk.getLeaderboard();
    expect(leaderboard[0]!.score).toBe(200);
  });

  it('should throw when submitting scores without storage permission', () => {
    const sdk = new QuantSDK(createContext([]));
    expect(() => sdk.submitScore(100)).toThrow(PermissionDeniedError);
  });

  it('should create a multiplayer session with network permission', () => {
    const sdk = new QuantSDK(createContext([Permission.Network]));
    const session = sdk.createSession();
    expect(session.hostId).toBe('user-123');
    expect(session.players).toContain('user-123');
  });

  it('should run AI inference with ai permission', () => {
    const sdk = new QuantSDK(createContext([Permission.AI]));
    const result = sdk.infer('hello world');
    expect(result.response).toContain('hello world');
    expect(result.model).toBe('default');
  });

  it('should store and retrieve values with storage permission', () => {
    const sdk = new QuantSDK(createContext([Permission.Storage]));
    sdk.storageSet('key1', 'value1');
    expect(sdk.storageGet('key1')).toBe('value1');
    expect(sdk.storageDelete('key1')).toBe(true);
    expect(sdk.storageGet('key1')).toBeUndefined();
  });

  it('should request tips with payments permission', () => {
    const sdk = new QuantSDK(createContext([Permission.Payments]));
    const tip = sdk.requestTip(5);
    expect(tip.amount).toBe(5);
    const history = sdk.getTipHistory();
    expect(history).toHaveLength(1);
  });

  it('should throw when requesting tips without payments permission', () => {
    const sdk = new QuantSDK(createContext([]));
    expect(() => sdk.requestTip(5)).toThrow(PermissionDeniedError);
  });

  it('should reject invalid tip amounts (zero, negative, non-finite)', () => {
    const sdk = new QuantSDK(createContext([Permission.Payments]));
    expect(() => sdk.requestTip(0)).toThrow(/positive, finite/);
    expect(() => sdk.requestTip(-5)).toThrow(/positive, finite/);
    expect(() => sdk.requestTip(Number.NaN)).toThrow(/positive, finite/);
    expect(() => sdk.requestTip(Number.POSITIVE_INFINITY)).toThrow(/positive, finite/);
    expect(sdk.getTipHistory()).toHaveLength(0);
  });

  it('should reject putFile with path traversal (..)', () => {
    const sdk = new QuantSDK(createContext([Permission.Storage]));
    expect(() => sdk.putFile('../etc/passwd', 'hack')).toThrow('Path traversal');
  });

  it('should reject putFile with absolute paths', () => {
    const sdk = new QuantSDK(createContext([Permission.Storage]));
    expect(() => sdk.putFile('/etc/passwd', 'hack')).toThrow('Absolute paths');
  });

  it('should reject getFile with path traversal (..)', () => {
    const sdk = new QuantSDK(createContext([Permission.Storage]));
    expect(() => sdk.getFile('../../secret')).toThrow('Path traversal');
  });

  it('should reject getFile with absolute paths', () => {
    const sdk = new QuantSDK(createContext([Permission.Storage]));
    expect(() => sdk.getFile('/root/secret')).toThrow('Absolute paths');
  });

  it('should allow valid relative paths in putFile/getFile', () => {
    const sdk = new QuantSDK(createContext([Permission.Storage]));
    sdk.putFile('data/file.txt', 'content');
    expect(sdk.getFile('data/file.txt')).toBe('content');
  });
});
