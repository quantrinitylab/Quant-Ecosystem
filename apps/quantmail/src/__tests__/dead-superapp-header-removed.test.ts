// ============================================================================
// Dead-component removal guard (finding: QuantMailSuperAppHeader "Priority
// Mail" tile, 2026-10-11).
//
// QuantMailSuperAppHeader was dead UI: the only production references to it
// were the file itself and its own barrel (components/Navigation/index.ts) —
// no page, shell, or drawer ever mounted it — so its "Priority Mail" tile
// pushing `/?view=inbox&lens=important` could never be clicked by a user.
// The removal option from the finding was taken: the component, its barrel,
// and its unit tests are deleted, and the live header (QuantPillarTopBar,
// rendered by AppShell) already carries the mail "Important" lens while the
// classic inbox honors `lens=important` (page.tsx predicate).
//
// This suite guards the removal: if the component ever comes back without a
// production mount, the scan below fails loudly instead of silently
// re-accumulating dead code. Test files are excluded from the scan on
// purpose — historical comments may still name the deleted component.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

function productionFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...productionFiles(full));
    } else if (
      (entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
      !entry.includes('.test.')
    ) {
      out.push(full);
    }
  }
  return out;
}

describe('dead QuantMailSuperAppHeader stays removed', () => {
  it('the component file, its barrel, and the whole Navigation dir are gone', () => {
    expect(
      existsSync(join(SRC, 'components/Navigation/QuantMailSuperAppHeader.tsx')),
    ).toBe(false);
    expect(existsSync(join(SRC, 'components/Navigation/index.ts'))).toBe(false);
    expect(existsSync(join(SRC, 'components/Navigation'))).toBe(false);
  });

  it('no production source file references the deleted component', () => {
    const offenders = productionFiles(SRC).filter((file) =>
      readFileSync(file, 'utf8').includes('QuantMailSuperAppHeader'),
    );
    expect(offenders).toEqual([]);
  });

  it('the Priority path survives on live surfaces, not the dead tile', () => {
    // Live header: QuantPillarTopBar's mail lens list still offers Important.
    const topBar = readFileSync(
      join(SRC, 'components/QuantPillarTopBar.tsx'),
      'utf8',
    );
    expect(topBar).toContain(
      "{ id: 'important', label: 'Important', queryParam: { key: 'lens', value: 'important' } }",
    );
    // Classic inbox: the important predicate still honors the lens.
    const page = readFileSync(join(SRC, 'app/page.tsx'), 'utf8');
    expect(page).toContain(
      "if (lens === 'important') return isImportantThread(t);",
    );
  });
});
