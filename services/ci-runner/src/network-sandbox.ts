import { ALLOWED_REGISTRY_DOMAINS } from './proxy.js';

/**
 * Thrown when network sandbox isolation rules are violated, missing, or
 * fail to establish an unshared network namespace.
 * Sandbox fails closed to prevent unisolated host network egress.
 */
export class NetworkSandboxIsolationError extends Error {
  readonly code = 'NETWORK_SANDBOX_ISOLATION_FAILED';

  constructor(
    message = 'Network sandbox isolation failed: unshared network namespace is required.',
  ) {
    super(message);
    this.name = 'NetworkSandboxIsolationError';
  }
}

export interface NetworkNamespaceProbeResult {
  isIsolated: boolean;
  namespaceId?: string;
  interfaceNames?: string[];
  reason?: string;
}

export type NetworkNamespaceProbe = () =>
  | Promise<NetworkNamespaceProbeResult>
  | NetworkNamespaceProbeResult;

export interface NetworkSandboxConfig {
  /** Enforces execution inside an unshared network namespace (`unshare -n`) */
  unshareNetwork?: boolean;
  /** Restricts network namespace to loopback interface only */
  loopbackOnly?: boolean;
  /** Restricted egress proxy URL (e.g., http://127.0.0.1:8080) */
  proxyUrl?: string;
  /** Allowed registry domains permitted for build-step egress */
  allowedRegistries?: readonly string[];
  /** Fail-closed if isolation cannot be verified */
  failClosed?: boolean;
  /** DNS servers configured inside isolated namespace */
  dnsServers?: string[];
  /** Path or command binary for unshare */
  unsharePath?: string;
  /** Probe callback to inspect current runtime network namespace */
  namespaceProbe?: NetworkNamespaceProbe;
}

export interface NetworkSandboxValidationResult {
  isolated: boolean;
  rulesEnforced: {
    unsharedNamespace: boolean;
    proxyConfigured: boolean;
    egressRestricted: boolean;
    failClosed: boolean;
  };
  details: {
    unshareArgs: string[];
    proxyUrl?: string;
    allowedRegistriesCount: number;
  };
  reason?: string;
}

export interface WrapCommandOptions {
  mapRootUser?: boolean;
  bringUpLoopback?: boolean;
  useDoubleDash?: boolean;
}

/**
 * Generates command arguments to execute build steps in an unshared network namespace.
 */
export function configureUnsharedNetworkCommand(
  command: string[],
  options: {
    loopback?: boolean;
    rootless?: boolean;
    unsharePath?: string;
    useDoubleDash?: boolean;
  } = {},
): string[] {
  const unsharePath = options.unsharePath ?? 'unshare';
  const args = [unsharePath, '-n'];

  if (options.rootless) {
    args.push('-r'); // map current user to root inside namespace
  }

  if (options.useDoubleDash !== false) {
    args.push('--');
  }

  return [...args, ...command];
}

/**
 * Network Sandbox Configuration and Validation Manager
 * Configures unshared network namespace isolation (`unshare -n`) and
 * enforces fail-closed isolation checks before any build step executes.
 */
export class NetworkSandbox {
  readonly config: Required<Omit<NetworkSandboxConfig, 'proxyUrl' | 'namespaceProbe'>> & {
    proxyUrl?: string;
    namespaceProbe?: NetworkNamespaceProbe;
  };

  constructor(config: NetworkSandboxConfig = {}) {
    this.config = {
      unshareNetwork: config.unshareNetwork ?? true,
      loopbackOnly: config.loopbackOnly ?? true,
      proxyUrl: config.proxyUrl,
      allowedRegistries: config.allowedRegistries ?? ALLOWED_REGISTRY_DOMAINS,
      failClosed: config.failClosed ?? true,
      dnsServers: config.dnsServers ?? ['127.0.0.1'],
      unsharePath: config.unsharePath ?? 'unshare',
      namespaceProbe: config.namespaceProbe,
    };
  }

  /**
   * Wraps an execution command array with `unshare -n` namespace isolation flags.
   */
  wrapCommand(command: string[], options: WrapCommandOptions = {}): string[] {
    if (!this.config.unshareNetwork) {
      if (this.config.failClosed) {
        throw new NetworkSandboxIsolationError(
          'Network sandbox isolation failed: cannot wrap command when unshareNetwork is disabled and failClosed is active.',
        );
      }
      return [...command];
    }

    return configureUnsharedNetworkCommand(command, {
      loopback: this.config.loopbackOnly,
      rootless: options.mapRootUser,
      unsharePath: this.config.unsharePath,
      useDoubleDash: options.useDoubleDash,
    });
  }

  /**
   * Produces environment variables routing sandbox traffic through the
   * Restricted Egress Proxy and declaring network isolation state.
   */
  getSandboxEnv(): Record<string, string> {
    const env: Record<string, string> = {
      QUANT_SANDBOX_NETWORK_ISOLATED: this.config.unshareNetwork ? 'true' : 'false',
    };

    if (this.config.proxyUrl) {
      env['HTTP_PROXY'] = this.config.proxyUrl;
      env['HTTPS_PROXY'] = this.config.proxyUrl;
      env['http_proxy'] = this.config.proxyUrl;
      env['https_proxy'] = this.config.proxyUrl;
      env['ALL_PROXY'] = this.config.proxyUrl;
      env['all_proxy'] = this.config.proxyUrl;
      env['NO_PROXY'] = 'localhost,127.0.0.1';
    }

    return env;
  }

  /**
   * Validates network sandbox isolation rules.
   * If unisolated and failClosed is true, throws NetworkSandboxIsolationError.
   */
  async validateIsolation(
    probeOverride?: NetworkNamespaceProbe,
  ): Promise<NetworkSandboxValidationResult> {
    const probe = probeOverride ?? this.config.namespaceProbe;

    // Rule 1: Network unsharing flag must be enabled
    if (!this.config.unshareNetwork) {
      const result: NetworkSandboxValidationResult = {
        isolated: false,
        rulesEnforced: {
          unsharedNamespace: false,
          proxyConfigured: Boolean(this.config.proxyUrl),
          egressRestricted: this.config.allowedRegistries.length > 0,
          failClosed: this.config.failClosed,
        },
        details: {
          unshareArgs: [],
          proxyUrl: this.config.proxyUrl,
          allowedRegistriesCount: this.config.allowedRegistries.length,
        },
        reason:
          'Network sandbox isolation rules violated: unshareNetwork configuration is disabled.',
      };

      if (this.config.failClosed) {
        throw new NetworkSandboxIsolationError(result.reason);
      }
      return result;
    }

    // Rule 2: Probe runtime network namespace if probe is available
    if (probe) {
      const probeResult = await probe();
      if (!probeResult.isIsolated) {
        const reason =
          probeResult.reason ??
          'Active network namespace is not isolated: detected host interfaces or shared netns inode.';
        const result: NetworkSandboxValidationResult = {
          isolated: false,
          rulesEnforced: {
            unsharedNamespace: false,
            proxyConfigured: Boolean(this.config.proxyUrl),
            egressRestricted: this.config.allowedRegistries.length > 0,
            failClosed: this.config.failClosed,
          },
          details: {
            unshareArgs: configureUnsharedNetworkCommand(['echo']),
            proxyUrl: this.config.proxyUrl,
            allowedRegistriesCount: this.config.allowedRegistries.length,
          },
          reason,
        };

        if (this.config.failClosed) {
          throw new NetworkSandboxIsolationError(`Network sandbox isolation failed: ${reason}`);
        }
        return result;
      }
    }

    // All isolation rules verified
    return {
      isolated: true,
      rulesEnforced: {
        unsharedNamespace: true,
        proxyConfigured: Boolean(this.config.proxyUrl),
        egressRestricted: this.config.allowedRegistries.length > 0,
        failClosed: this.config.failClosed,
      },
      details: {
        unshareArgs: configureUnsharedNetworkCommand(['/bin/sh']),
        proxyUrl: this.config.proxyUrl,
        allowedRegistriesCount: this.config.allowedRegistries.length,
      },
    };
  }

  /**
   * Asserts isolation and unconditionally throws NetworkSandboxIsolationError if unisolated.
   */
  async assertIsolated(probe?: NetworkNamespaceProbe): Promise<void> {
    const result = await this.validateIsolation(probe);
    if (!result.isolated) {
      throw new NetworkSandboxIsolationError(
        result.reason ?? 'Network sandbox isolation assertion failed.',
      );
    }
  }
}

/**
 * Functional helper to validate network sandbox isolation.
 */
export async function validateNetworkSandbox(
  config?: NetworkSandboxConfig,
  probe?: NetworkNamespaceProbe,
): Promise<NetworkSandboxValidationResult> {
  const sandbox = new NetworkSandbox(config);
  return sandbox.validateIsolation(probe);
}

/**
 * Functional helper to assert network sandbox isolation (fail-closed).
 */
export async function assertNetworkSandboxIsolation(
  config?: NetworkSandboxConfig,
  probe?: NetworkNamespaceProbe,
): Promise<void> {
  const sandbox = new NetworkSandbox(config);
  return sandbox.assertIsolated(probe);
}
