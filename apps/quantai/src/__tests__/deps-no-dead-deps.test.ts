import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * F-131: @prisma/client, @quant/auth, @quant/common and @quant/realtime were
 * declared in apps/quantai/package.json but had zero imports anywhere in the
 * QuantAI lane (src, backend, configs, npm scripts) — they were removed from
 * package.json and from the apps/quantai importer entry in pnpm-lock.yaml.
 *
 * Verification done before removal (grep over the whole app dir):
 *  - no static `import ... from '...'` / `export ... from '...'` statements
 *  - no side-effect imports (`import '...'`)
 *  - no dynamic `import('...')` and no `require('...')`
 *  - no mentions in vite/next/tailwind/postcss configs, Dockerfile, openapi.yaml
 *  - only stale reference was `transpilePackages: ['@quant/common']` in
 *    next.config.js — removed as part of the fix (entries must resolve at build).
 *
 * These tests guard against re-introducing the dead dependencies. NOTE: other
 * lanes (apps/quantmail, apps/quantmax, apps/quantube, apps/quantads) still
 * legitimately declare some of these deps, so the pnpm-lock snapshots and the
 * other importers are intentionally NOT touched.
 */
const DEAD_DEPS = [
  "@prisma/client",
  "@quant/auth",
  "@quant/common",
  "@quant/realtime",
] as const;

const APP_DIR = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(APP_DIR, "..", "..");

const IMPORT_PATTERNS = [
  // static + side-effect + re-export: import ... from 'x' | import 'x' | export ... from 'x'
  /(?:^|[\s;])(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]DEPB['"]/m,
  // dynamic import('x') and require('x')
  /(?:^|[\W])(?:import|require)\s*\(\s*['"]DEPB['"]/m,
];

function buildPatterns(dep: string): RegExp[] {
  const esc = dep.replace(/[.*+?^${}()|[\]\\/@]/g, "\\$&");
  return IMPORT_PATTERNS.map(
    (p) => new RegExp(p.source.replaceAll("DEPB", esc), "m"),
  );
}

function* walkTs(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkTs(full);
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      yield full;
    }
  }
}

describe("F-131: no dead dependency candidates in apps/quantai", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, "package.json"), "utf8"));

  for (const dep of DEAD_DEPS) {
    it(`${dep} is not listed in any package.json dependency section`, () => {
      for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        expect(pkg[section] ?? {}, `${dep} must not be in ${section}`).not.toHaveProperty(dep);
      }
    });
  }

  for (const dep of DEAD_DEPS) {
    it(`${dep} is not imported anywhere in src/ or backend/`, () => {
      const patterns = buildPatterns(dep);
      const hits: string[] = [];
      for (const dir of ["src", "backend"]) {
        const abs = path.join(APP_DIR, dir);
        if (!fs.existsSync(abs)) continue;
        for (const file of walkTs(abs)) {
          // Skip this very test file — it only mentions dep names in strings.
          if (file === __filename) continue;
          const content = fs.readFileSync(file, "utf8");
          if (patterns.some((p) => p.test(content))) hits.push(path.relative(REPO_ROOT, file));
        }
      }
      expect(hits, `${dep} must not be imported anywhere in the lane`).toEqual([]);
    });
  }

  for (const dep of DEAD_DEPS) {
    it(`${dep} is not in the apps/quantai importer entry of pnpm-lock.yaml`, () => {
      const lock = fs.readFileSync(path.join(REPO_ROOT, "pnpm-lock.yaml"), "utf8");
      const start = lock.indexOf("  apps/quantai:\n");
      expect(start, "apps/quantai importer must exist in pnpm-lock.yaml").toBeGreaterThan(-1);
      const rest = lock.slice(start);
      const end = rest.search(/\n  [a-z]/);
      const block = end > 0 ? rest.slice(0, end) : rest;
      expect(block, `${dep} must not be in the apps/quantai importer`).not.toContain(`'${dep}':`);
    });
  }

  it("@quant/common is not listed in next.config.js transpilePackages", () => {
    // Parse the transpilePackages array only — comments in the file may still
    // mention the removed dep for documentation purposes.
    const cfg = fs.readFileSync(path.join(APP_DIR, "next.config.js"), "utf8");
    const m = cfg.match(/transpilePackages\s*:\s*\[([\s\S]*?)\]/);
    expect(m, "transpilePackages must be present in next.config.js").not.toBeNull();
    expect(m![1], "@quant/common must not be transpiled anymore").not.toContain("@quant/common");
  });
});
