import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const APPS_DIR = path.join(ROOT, 'apps');

// Apps that legitimately have no standard Next.js app-router routes.
// - marketing: uses pages/ directory pattern
// - quant-mobile: React Native app (no web routes)
// - status: standalone status service (no frontend routes)
const EXCLUDED_APPS = new Set(['marketing', 'quant-mobile', 'status']);

function findFilesRecursive(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFilesRecursive(fullPath, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function getAppDirs(): string[] {
  if (!fs.existsSync(APPS_DIR)) return [];
  return fs
    .readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(APPS_DIR, d.name));
}

function discoverFrontendRoutes(appDir: string): string[] {
  const appRouterDir = path.join(appDir, 'src', 'app');
  const pages = findFilesRecursive(appRouterDir, /^page\.(tsx|ts|jsx|js)$/);
  return pages.map((p) => {
    const relative = path.relative(appRouterDir, path.dirname(p));
    return '/' + relative.replace(/\\/g, '/');
  });
}

function discoverApiRoutes(appDir: string): string[] {
  const routesDir = path.join(appDir, 'backend', 'routes');
  const routeFiles = findFilesRecursive(routesDir, /\.(ts|js)$/);
  return routeFiles.map((f) => path.relative(routesDir, f).replace(/\\/g, '/'));
}

function main() {
  const appDirs = getAppDirs();
  if (appDirs.length === 0) {
    process.stderr.write('ERROR: No apps found in apps/ directory\n');
    process.exit(1);
  }

  let totalFrontendRoutes = 0;
  let totalApiRoutes = 0;
  let hasError = false;

  process.stdout.write('\n=== Route Validation Report ===\n\n');

  for (const appDir of appDirs) {
    const appName = path.basename(appDir);
    const frontendRoutes = discoverFrontendRoutes(appDir);
    const apiRoutes = discoverApiRoutes(appDir);

    totalFrontendRoutes += frontendRoutes.length;
    totalApiRoutes += apiRoutes.length;

    const routeCount = frontendRoutes.length + apiRoutes.length;
    if (routeCount === 0 && EXCLUDED_APPS.has(appName)) {
      process.stdout.write(`[SKIP] ${appName}: excluded (no standard routes expected)\n`);
    } else if (routeCount === 0) {
      process.stdout.write(`[WARN] ${appName}: 0 routes detected (potential misconfiguration)\n`);
      hasError = true;
    } else {
      process.stdout.write(
        `[OK]   ${appName}: ${frontendRoutes.length} frontend routes, ${apiRoutes.length} API routes\n`,
      );
    }

    if (frontendRoutes.length > 0) {
      for (const route of frontendRoutes.slice(0, 5)) {
        process.stdout.write(`         page: ${route}\n`);
      }
      if (frontendRoutes.length > 5) {
        process.stdout.write(`         ... and ${frontendRoutes.length - 5} more\n`);
      }
    }
  }

  process.stdout.write('\n--- Summary ---\n');
  process.stdout.write(`Apps scanned:     ${appDirs.length}\n`);
  process.stdout.write(`Frontend routes:  ${totalFrontendRoutes}\n`);
  process.stdout.write(`API routes:       ${totalApiRoutes}\n`);
  process.stdout.write(`Total routes:     ${totalFrontendRoutes + totalApiRoutes}\n`);

  if (hasError) {
    process.stderr.write(
      '\nERROR: One or more apps have zero routes detected. Check app structure.\n',
    );
    process.exit(1);
  }

  process.stdout.write('\nAll apps have routes configured.\n');
  process.exit(0);
}

main();
