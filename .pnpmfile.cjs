// Pin vite to the patched 8.1.6 for vitest's vite peer dependency.
//
// Background: vitest 4.1.11 declares vite as a peer (^6||^7||^8) and
// @vitest/mocker 4.1.11 likewise. No workspace package depends on vite
// directly, so pnpm auto-installs the peer; the previous bare
// `vite: ^6.4.3` pnpm override only rewrote the peer spec text in the
// lockfile without pinning peer resolution, which still landed on the
// vulnerable vite@8.0.16. A range-key vite 8.x override was tested and
// rejected (peer conflict drops vite, vitest fails to start), so the pin
// lives here instead: readPackage runs after parsing and prior to
// resolution, and the dead `vite: ^6.4.3` override has been removed from
// package.json so nothing rewrites this pin back.
// Scope is deliberately narrow (vitest + @vitest/mocker only) — no other
// package in the tree declares vite.
function readPackage(pkg) {
  if (pkg.name === 'vitest' || pkg.name === '@vitest/mocker') {
    if (pkg.peerDependencies && pkg.peerDependencies.vite) {
      pkg.peerDependencies.vite = '8.1.6';
    }
  }
  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};

// Note: the vite@8.0.16 package/snapshot entries were removed from
// pnpm-lock.yaml so this pin re-resolves to 8.1.6 instead of reusing
// the stale 8.0.16 snapshot (lockfile-only mode otherwise reuses it).
