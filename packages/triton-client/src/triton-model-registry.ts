// ============================================================================
// Triton Model Registry - Track available models and their schemas
// ============================================================================

import type { TensorMetadata } from './types';

/** Registered model entry */
export interface RegisteredModel {
  name: string;
  version: string;
  platform: string;
  inputs: TensorMetadata[];
  outputs: TensorMetadata[];
  registeredAt: number;
}

/** Options for registering a model */
export interface RegisterModelOptions {
  name: string;
  version: string;
  platform: string;
  inputs: TensorMetadata[];
  outputs: TensorMetadata[];
}

/** Simple model registry that tracks available models and their I/O schemas */
export class ModelRegistry {
  private models: Map<string, RegisteredModel> = new Map();

  /** Register a model with its metadata */
  registerModel(options: RegisterModelOptions): void {
    const key = `${options.name}:${options.version}`;
    this.models.set(key, {
      ...options,
      registeredAt: Date.now(),
    });
  }

  /** Get a registered model by name and optional version */
  getModel(name: string, version?: string): RegisteredModel | undefined {
    if (version) {
      return this.models.get(`${name}:${version}`);
    }

    // Return the latest version if no version specified
    let latest: RegisteredModel | undefined;
    for (const [key, model] of this.models) {
      if (key.startsWith(`${name}:`)) {
        if (!latest || model.registeredAt > latest.registeredAt) {
          latest = model;
        }
      }
    }
    return latest;
  }

  /** List all registered models */
  listModels(): RegisteredModel[] {
    return Array.from(this.models.values());
  }

  /** Remove a model from the registry */
  removeModel(name: string, version: string): boolean {
    return this.models.delete(`${name}:${version}`);
  }

  /** Check if a model is registered */
  hasModel(name: string, version?: string): boolean {
    if (version) {
      return this.models.has(`${name}:${version}`);
    }
    for (const key of this.models.keys()) {
      if (key.startsWith(`${name}:`)) {
        return true;
      }
    }
    return false;
  }

  /** Clear all registered models */
  clear(): void {
    this.models.clear();
  }
}
