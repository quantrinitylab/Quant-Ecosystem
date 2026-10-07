// ============================================================================
// Performance Package - Code Splitter
// Dynamic import graph, route-based splitting, shared chunk extraction,
// preload generation, waterfall prevention
// ============================================================================

import type { CodeSplitConfig, ChunkInfo, PreloadStrategy } from '../types';

/** Module dependency graph node */
interface ModuleNode {
  id: string;
  path: string;
  size: number;
  imports: Set<string>;
  importedBy: Set<string>;
  isEntry: boolean;
  isDynamic: boolean;
  chunkId: string | null;
}

/** Route definition for splitting */
interface RouteDefinition {
  path: string;
  component: string;
  modules: string[];
  priority: number;
  prefetch: boolean;
}

/** Chunk generation result */
interface SplitResult {
  chunks: ChunkInfo[];
  entryChunks: ChunkInfo[];
  sharedChunks: ChunkInfo[];
  preloadMap: Map<string, string[]>;
  totalSize: number;
  savings: number;
}

/**
 * CodeSplitter analyzes module dependency graphs to create optimal code
 * splitting strategies with route-based splitting, shared chunk extraction,
 * preload graph generation, and waterfall prevention.
 */
export class CodeSplitter {
  private readonly config: CodeSplitConfig;
  private readonly modules: Map<string, ModuleNode>;
  private readonly routes: Map<string, RouteDefinition>;
  private readonly chunks: Map<string, ChunkInfo>;
  private chunkCounter: number;

  constructor(config: Partial<CodeSplitConfig> = {}) {
    this.config = {
      entryPoints: config.entryPoints ?? ['src/index.ts'],
      maxChunkSize: config.maxChunkSize ?? 250000,
      minChunkSize: config.minChunkSize ?? 20000,
      sharedThreshold: config.sharedThreshold ?? 2,
      preloadStrategy: config.preloadStrategy ?? 'VIEWPORT',
    };

    this.modules = new Map();
    this.routes = new Map();
    this.chunks = new Map();
    this.chunkCounter = 0;
  }

  /**
   * Register a module in the dependency graph.
   */
  addModule(id: string, path: string, size: number, isDynamic: boolean = false): void {
    const isEntry = this.config.entryPoints.includes(path);
    this.modules.set(id, {
      id,
      path,
      size,
      imports: new Set(),
      importedBy: new Set(),
      isEntry,
      isDynamic,
      chunkId: null,
    });
  }

  /**
   * Add a dependency relationship between modules.
   */
  addDependency(fromId: string, toId: string): void {
    const from = this.modules.get(fromId);
    const to = this.modules.get(toId);
    if (from && to) {
      from.imports.add(toId);
      to.importedBy.add(fromId);
    }
  }

  /**
   * Register a route for route-based code splitting.
   */
  addRoute(path: string, component: string, modules: string[], priority?: number): void {
    this.routes.set(path, {
      path,
      component,
      modules,
      priority: priority ?? 0,
      prefetch: priority !== undefined && priority > 0,
    });
  }

  /**
   * Perform code splitting analysis and generate optimal chunks.
   */
  split(): SplitResult {
    // Step 1: Identify shared modules (imported by multiple chunks)
    const sharedModules = this.findSharedModules();

    // Step 2: Create chunks
    const entryChunks = this.createEntryChunks();
    const routeChunks = this.createRouteChunks();
    const sharedChunks = this.createSharedChunks(sharedModules);

    // Step 3: Enforce size limits (split large chunks, merge small ones)
    const allChunks = [...entryChunks, ...routeChunks, ...sharedChunks];
    const optimizedChunks = this.optimizeChunkSizes(allChunks);

    // Step 4: Generate preload map
    const preloadMap = this.generatePreloadMap(optimizedChunks);

    // Calculate savings
    const totalSize = optimizedChunks.reduce((sum, c) => sum + c.size, 0);
    const originalSize = [...this.modules.values()].reduce((sum, m) => sum + m.size, 0);
    const savings = originalSize - totalSize;

    return {
      chunks: optimizedChunks,
      entryChunks: optimizedChunks.filter((c) => c.isEntry),
      sharedChunks: optimizedChunks.filter((c) => c.isShared),
      preloadMap,
      totalSize,
      savings: Math.max(0, savings),
    };
  }

  /**
   * Get the preload chain for a given route to prevent waterfalls.
   */
  getPreloadChain(routePath: string): string[] {
    const route = this.routes.get(routePath);
    if (!route) return [];

    const visited = new Set<string>();
    const chain: string[] = [];

    // BFS through dependencies
    const queue = [...route.modules];
    while (queue.length > 0) {
      const moduleId = queue.shift()!;
      if (visited.has(moduleId)) continue;
      visited.add(moduleId);

      const mod = this.modules.get(moduleId);
      if (mod) {
        chain.push(mod.path);
        for (const dep of mod.imports) {
          if (!visited.has(dep)) {
            queue.push(dep);
          }
        }
      }
    }

    return chain;
  }

  /**
   * Generate dynamic import statements for route-based splitting.
   */
  generateDynamicImports(): Map<string, string> {
    const imports = new Map<string, string>();

    for (const [routePath, route] of this.routes) {
      const chunkName = this.routeToChunkName(routePath);
      const importStatement = `const ${chunkName} = () => import(/* webpackChunkName: "${chunkName}" */ '${route.component}');`;
      imports.set(routePath, importStatement);
    }

    return imports;
  }

  /**
   * Detect common vendor modules that should be extracted.
   */
  detectVendorModules(): string[] {
    const vendors: string[] = [];

    for (const [id, mod] of this.modules) {
      if (mod.path.includes('node_modules') || mod.path.includes('vendor')) {
        vendors.push(id);
      }
    }

    return vendors;
  }

  /**
   * Generate prefetch/preload link tags for a route.
   */
  generateLinkTags(routePath: string): string[] {
    const tags: string[] = [];
    const chain = this.getPreloadChain(routePath);

    for (let i = 0; i < chain.length; i++) {
      const path = chain[i];
      const strategy = i === 0 ? 'preload' : this.getRelForStrategy();
      const priority = i === 0 ? 'high' : 'low';
      tags.push(`<link rel="${strategy}" href="${path}" as="script" fetchpriority="${priority}">`);
    }

    return tags;
  }

  /**
   * Get module dependency graph statistics.
   */
  getGraphStats(): {
    moduleCount: number;
    edgeCount: number;
    entryPoints: number;
    dynamicImports: number;
    avgDependencies: number;
  } {
    let edgeCount = 0;
    let dynamicCount = 0;
    let totalDeps = 0;

    for (const mod of this.modules.values()) {
      edgeCount += mod.imports.size;
      totalDeps += mod.imports.size;
      if (mod.isDynamic) dynamicCount++;
    }

    return {
      moduleCount: this.modules.size,
      edgeCount,
      entryPoints: this.config.entryPoints.length,
      dynamicImports: dynamicCount,
      avgDependencies: this.modules.size > 0 ? totalDeps / this.modules.size : 0,
    };
  }

  /**
   * Find circular dependencies in the module graph.
   */
  findCircularDependencies(): string[][] {
    const circles: string[][] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (nodeId: string, path: string[]): void => {
      if (stack.has(nodeId)) {
        const cycleStart = path.indexOf(nodeId);
        if (cycleStart >= 0) {
          circles.push(path.slice(cycleStart));
        }
        return;
      }
      if (visited.has(nodeId)) return;

      visited.add(nodeId);
      stack.add(nodeId);
      path.push(nodeId);

      const node = this.modules.get(nodeId);
      if (node) {
        for (const dep of node.imports) {
          dfs(dep, [...path]);
        }
      }

      stack.delete(nodeId);
    };

    for (const id of this.modules.keys()) {
      if (!visited.has(id)) {
        dfs(id, []);
      }
    }

    return circles;
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Find modules imported by multiple entry points */
  private findSharedModules(): Map<string, Set<string>> {
    const moduleToEntries = new Map<string, Set<string>>();

    for (const [id, mod] of this.modules) {
      const reachableFrom = this.findReachableEntries(id);
      if (reachableFrom.size >= this.config.sharedThreshold) {
        moduleToEntries.set(id, reachableFrom);
      }
    }

    return moduleToEntries;
  }

  /** Find which entry points can reach a module */
  private findReachableEntries(moduleId: string): Set<string> {
    const entries = new Set<string>();
    const visited = new Set<string>();

    const traverse = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);

      const mod = this.modules.get(id);
      if (!mod) return;

      if (mod.isEntry) {
        entries.add(id);
        return;
      }

      for (const parent of mod.importedBy) {
        traverse(parent);
      }
    };

    traverse(moduleId);
    return entries;
  }

  /** Create chunks for entry points */
  private createEntryChunks(): ChunkInfo[] {
    const chunks: ChunkInfo[] = [];

    for (const entryPath of this.config.entryPoints) {
      const entryModule = [...this.modules.values()].find((m) => m.path === entryPath);
      if (!entryModule) continue;

      const modules = this.getModulesForEntry(entryModule.id);
      const size = modules.reduce((sum, id) => {
        const mod = this.modules.get(id);
        return sum + (mod?.size ?? 0);
      }, 0);

      const chunk: ChunkInfo = {
        id: `chunk-${++this.chunkCounter}`,
        name: `entry-${this.pathToName(entryPath)}`,
        modules,
        size,
        isEntry: true,
        isShared: false,
        dependencies: [],
        loadPriority: 10,
      };

      chunks.push(chunk);
    }

    return chunks;
  }

  /** Create chunks for routes */
  private createRouteChunks(): ChunkInfo[] {
    const chunks: ChunkInfo[] = [];

    for (const [routePath, route] of this.routes) {
      const size = route.modules.reduce((sum, id) => {
        const mod = this.modules.get(id);
        return sum + (mod?.size ?? 0);
      }, 0);

      const chunk: ChunkInfo = {
        id: `chunk-${++this.chunkCounter}`,
        name: `route-${this.routeToChunkName(routePath)}`,
        modules: [...route.modules],
        size,
        isEntry: false,
        isShared: false,
        dependencies: [],
        loadPriority: route.priority,
      };

      chunks.push(chunk);
    }

    return chunks;
  }

  /** Create shared chunks for common modules */
  private createSharedChunks(sharedModules: Map<string, Set<string>>): ChunkInfo[] {
    const sharedList = [...sharedModules.keys()];
    if (sharedList.length === 0) return [];

    const totalSize = sharedList.reduce((sum, id) => {
      const mod = this.modules.get(id);
      return sum + (mod?.size ?? 0);
    }, 0);

    const chunk: ChunkInfo = {
      id: `chunk-${++this.chunkCounter}`,
      name: 'shared-common',
      modules: sharedList,
      size: totalSize,
      isEntry: false,
      isShared: true,
      dependencies: [],
      loadPriority: 8,
    };

    return [chunk];
  }

  /** Optimize chunk sizes by splitting large and merging small */
  private optimizeChunkSizes(chunks: ChunkInfo[]): ChunkInfo[] {
    const optimized: ChunkInfo[] = [];

    for (const chunk of chunks) {
      if (chunk.size > this.config.maxChunkSize && chunk.modules.length > 1) {
        // Split large chunk
        const midpoint = Math.floor(chunk.modules.length / 2);
        const firstHalf = chunk.modules.slice(0, midpoint);
        const secondHalf = chunk.modules.slice(midpoint);

        optimized.push({
          ...chunk,
          id: `chunk-${++this.chunkCounter}`,
          name: `${chunk.name}-a`,
          modules: firstHalf,
          size: Math.floor(chunk.size * 0.5),
        });
        optimized.push({
          ...chunk,
          id: `chunk-${++this.chunkCounter}`,
          name: `${chunk.name}-b`,
          modules: secondHalf,
          size: Math.ceil(chunk.size * 0.5),
        });
      } else {
        optimized.push(chunk);
      }
    }

    return optimized;
  }

  /** Generate preload map from route to chunk dependencies */
  private generatePreloadMap(chunks: ChunkInfo[]): Map<string, string[]> {
    const preloadMap = new Map<string, string[]>();

    for (const [routePath, route] of this.routes) {
      const relatedChunks = chunks.filter((c) =>
        c.modules.some((m) => route.modules.includes(m))
      );
      preloadMap.set(routePath, relatedChunks.map((c) => c.name));
    }

    return preloadMap;
  }

  /** Get all modules reachable from an entry (non-dynamic) */
  private getModulesForEntry(entryId: string): string[] {
    const modules: string[] = [];
    const visited = new Set<string>();

    const traverse = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      modules.push(id);

      const mod = this.modules.get(id);
      if (!mod) return;

      for (const dep of mod.imports) {
        const depMod = this.modules.get(dep);
        if (depMod && !depMod.isDynamic) {
          traverse(dep);
        }
      }
    };

    traverse(entryId);
    return modules;
  }

  /** Convert a route path to a chunk name */
  private routeToChunkName(routePath: string): string {
    return routePath.replace(/^\//, '').replace(/\//g, '-') || 'home';
  }

  /** Convert a file path to a name */
  private pathToName(path: string): string {
    return path.replace(/[/\\]/g, '-').replace(/\.(ts|js|tsx|jsx)$/, '');
  }

  /** Get the rel attribute for the configured preload strategy */
  private getRelForStrategy(): string {
    switch (this.config.preloadStrategy) {
      case 'EAGER': return 'preload';
      case 'LAZY': return 'prefetch';
      case 'VIEWPORT': return 'preload';
      case 'INTERACTION': return 'prefetch';
      case 'IDLE': return 'prefetch';
      default: return 'prefetch';
    }
  }
}
