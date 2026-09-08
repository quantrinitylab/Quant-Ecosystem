import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const markLabSource = readFileSync(
  new URL('../app/lab/marks/MarkLab.tsx', import.meta.url),
  'utf8',
);
const appShellSource = readFileSync(new URL('../components/AppShell.tsx', import.meta.url), 'utf8');
const mailLogoSource = readFileSync(
  new URL('../components/QuantMailLogo.tsx', import.meta.url),
  'utf8',
);

describe('MarkLab dinosaur candidate', () => {
  it('keeps the candidate in its own lab-only size sweep', () => {
    expect(markLabSource).toContain(
      "import { DinosaurMarkCandidate } from './DinosaurMarkCandidate';",
    );
    expect(markLabSource).toContain('const DINOSAUR_MARK_SIZES = [20, 24, 32, 36, 64, 104];');
    expect(markLabSource).toContain('<DinosaurMarkCandidate');
    expect(markLabSource).toContain('Dinosaur candidate at ${size}px');

    const familyStart = markLabSource.indexOf('const APP_MARKS =');
    const familyEnd = markLabSource.indexOf('const UNREAD_CASES =');
    expect(familyStart).toBeGreaterThan(-1);
    expect(familyEnd).toBeGreaterThan(familyStart);
    expect(markLabSource.slice(familyStart, familyEnd)).not.toContain('DinosaurMarkCandidate');
  });

  it('does not leak the candidate into production surfaces', () => {
    expect(appShellSource).not.toContain('DinosaurMarkCandidate');
    expect(mailLogoSource).not.toContain('DinosaurMarkCandidate');
  });
});
