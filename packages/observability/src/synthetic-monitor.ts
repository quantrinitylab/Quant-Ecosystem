// ============================================================================
// Synthetic Monitor - Health Check Probes and User Journeys
// ============================================================================

import { ProbeConfig, ProbeResult, JourneyStep, JourneyResult } from './types';

interface RegisteredProbe {
  name: string;
  config: ProbeConfig;
  results: ProbeResult[];
}

interface RegisteredJourney {
  name: string;
  steps: JourneyStep[];
}

export class SyntheticMonitor {
  private probes: Map<string, RegisteredProbe> = new Map();
  private journeys: Map<string, RegisteredJourney> = new Map();

  /**
   * Register a probe for health checking.
   */
  addProbe(name: string, config: ProbeConfig): void {
    this.probes.set(name, {
      name,
      config,
      results: [],
    });
  }

  /**
   * Execute a specific probe by name. Simulates an HTTP check by invoking a check function.
   */
  async runProbe(name: string): Promise<ProbeResult> {
    const probe = this.probes.get(name);
    if (!probe) {
      return {
        name,
        success: false,
        latency: 0,
        statusCode: 0,
        timestamp: Date.now(),
        error: `Probe "${name}" not found`,
      };
    }

    const startTime = Date.now();
    const expectedStatus = probe.config.expectedStatus ?? 200;

    try {
      // Simulate HTTP check with timeout
      const result = await Promise.race([
        this.executeCheck(probe.config),
        this.timeoutPromise(probe.config.timeout),
      ]);

      const latency = Date.now() - startTime;
      const success = result.statusCode === expectedStatus;

      const probeResult: ProbeResult = {
        name,
        success,
        latency,
        statusCode: result.statusCode,
        timestamp: Date.now(),
        error: success ? undefined : `Expected status ${expectedStatus}, got ${result.statusCode}`,
      };

      probe.results.push(probeResult);
      return probeResult;
    } catch (error: unknown) {
      const latency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const probeResult: ProbeResult = {
        name,
        success: false,
        latency,
        statusCode: 0,
        timestamp: Date.now(),
        error: errorMessage,
      };

      probe.results.push(probeResult);
      return probeResult;
    }
  }

  /**
   * Run all registered probes.
   */
  async runAllProbes(): Promise<ProbeResult[]> {
    const results: ProbeResult[] = [];
    for (const [name] of this.probes) {
      const result = await this.runProbe(name);
      results.push(result);
    }
    return results;
  }

  /**
   * Get all probe results.
   */
  getProbeResults(): Map<string, ProbeResult[]> {
    const results = new Map<string, ProbeResult[]>();
    for (const [name, probe] of this.probes) {
      results.set(name, [...probe.results]);
    }
    return results;
  }

  /**
   * Define a multi-step user journey.
   */
  defineJourney(name: string, steps: JourneyStep[]): void {
    this.journeys.set(name, { name, steps });
  }

  /**
   * Execute a user journey by name. Steps run in sequence.
   */
  async runJourney(name: string): Promise<JourneyResult> {
    const journey = this.journeys.get(name);
    if (!journey) {
      return {
        name,
        steps: [],
        totalLatency: 0,
        success: false,
      };
    }

    const stepResults: Array<{ name: string; success: boolean; latency: number; error?: string }> =
      [];
    let totalLatency = 0;
    let overallSuccess = true;

    for (const step of journey.steps) {
      const stepStart = Date.now();
      const timeout = step.timeout ?? 30000;

      try {
        const success = await Promise.race([
          step.execute(),
          this.timeoutPromise(timeout).then(() => {
            throw new Error(`Step "${step.name}" timed out after ${timeout}ms`);
          }),
        ]);

        const latency = Date.now() - stepStart;
        totalLatency += latency;

        stepResults.push({
          name: step.name,
          success: success as boolean,
          latency,
          error: success ? undefined : `Step "${step.name}" returned false`,
        });

        if (!success) {
          overallSuccess = false;
          break;
        }
      } catch (error: unknown) {
        const latency = Date.now() - stepStart;
        totalLatency += latency;
        const errorMessage = error instanceof Error ? error.message : String(error);

        stepResults.push({
          name: step.name,
          success: false,
          latency,
          error: errorMessage,
        });

        overallSuccess = false;
        break;
      }
    }

    return {
      name,
      steps: stepResults,
      totalLatency,
      success: overallSuccess,
    };
  }

  /**
   * Get registered probe names.
   */
  getProbeNames(): string[] {
    return Array.from(this.probes.keys());
  }

  /**
   * Get registered journey names.
   */
  getJourneyNames(): string[] {
    return Array.from(this.journeys.keys());
  }

  private async executeCheck(config: ProbeConfig): Promise<{ statusCode: number }> {
    // Simulated HTTP check - in production this would make real HTTP calls.
    // Returns 200 as the simulated response for the configured URL.
    void config;
    return { statusCode: 200 };
  }

  private timeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }
}
