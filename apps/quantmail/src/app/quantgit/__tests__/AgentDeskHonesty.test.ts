import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describeDeployedAgentDesk } from '../agentDesk';

// AgentLab desk-number honesty: a deploy_agent result with no deskNumber must
// never render "Desk #1" (or any invented desk). The desk reference is shown
// only when the result actually carries a desk number.

function srcPath(rel: string): string {
  return fileURLToPath(new URL(rel, import.meta.url));
}

describe('describeDeployedAgentDesk', () => {
  it('shows the real desk number when the result carries one', () => {
    expect(describeDeployedAgentDesk(3)).toBe('Stationed at Desk #3');
    expect(describeDeployedAgentDesk('12')).toBe('Stationed at Desk #12');
    // A genuinely assigned Desk #1 still renders — the fix targets only
    // the invented fallback, not real desk numbers.
    expect(describeDeployedAgentDesk(1)).toBe('Stationed at Desk #1');
  });

  it('omits the desk reference entirely when the desk is unknown', () => {
    for (const unknown of [undefined, null, 0, '', '   ', NaN, Infinity]) {
      const label = describeDeployedAgentDesk(unknown);
      expect(label).toBe('Stationed in the swarm');
      expect(label).not.toContain('Desk #');
    }
  });

  it('never fabricates a desk number for a non-numeric desk value', () => {
    for (const bad of [{}, [], true, false]) {
      expect(describeDeployedAgentDesk(bad)).not.toContain('Desk #');
    }
  });
});

describe('page.tsx deploy_agent construction', () => {
  it('no longer falls back to an invented Desk #1', () => {
    const page = readFileSync(srcPath('../page.tsx'), 'utf8');
    expect(page).not.toContain('deskNumber || 1');
    expect(page).not.toContain('Stationed at Desk #${');
    expect(page).toContain('describeDeployedAgentDesk(res.deskNumber)');
  });
});
