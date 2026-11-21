// ============================================================================
// QC-F-117 — web client no longer sends WS `chat_message` frames
//
// The backend `chat_message` relay was a phantom-message injection path
// (no persistence, no schema, no rate-limit) and is deleted server-side.
// The web client must not send that frame type anymore: sends go through
// REST (`useSendMessage`); live delivery is the persisted
// `chat.message.created.v1` fan-out.
//
// NOTE (honest scope): this package has no @testing-library/react
// devDependency (see realtime-chat.test.ts's TODO), so the hook cannot be
// render-tested here. This suite pins the contract statically — the same
// readFileSync pattern other suites use — and the TypeScript build pins it
// structurally: page.tsx no longer destructures `sendRealtimeChat`'s
// removed helper, so any remaining caller fails typecheck.
// Negative control: on the pre-fix sources every assertion below FAILS
// (the hook built and returned `sendRealtimeMessage`; page.tsx called it
// in three send flows).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const hookSrc = readFileSync(resolve(here, '../hooks/useRealtimeChat.ts'), 'utf8');
const pageSrc = readFileSync(resolve(here, '../app/chat/[id]/page.tsx'), 'utf8');

describe('QC-F-117 — no WS chat_message frame leaves the web client', () => {
  it('the hook builds no chat_message frame', () => {
    // Match an actual frame construction (not a comment mentioning the
    // removed frame type): `type:` followed by the literal on a code line.
    const codeLines = hookSrc
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'));
    const hits = codeLines.filter((line) => line.includes("'chat_message'"));
    expect(hits, `hook still constructs a chat_message frame: ${hits.join(' | ')}`).toHaveLength(0);
  });

  it('the hook exposes no sendRealtimeMessage helper', () => {
    expect(hookSrc, 'hook still defines sendRealtimeMessage').not.toMatch(
      /const sendRealtimeMessage|sendRealtimeMessage,/,
    );
    // The return object must not contain the removed helper.
    const returnBlock = hookSrc.slice(hookSrc.indexOf('return {'));
    expect(returnBlock).not.toContain('sendRealtimeMessage');
  });

  it('the hook documents the removal (no silent protocol drift)', () => {
    expect(hookSrc).toContain('QC-F-117');
  });

  it('chat thread page calls no sendRealtimeMessage in any send flow', () => {
    const hits = pageSrc.match(/sendRealtimeMessage/g) ?? [];
    expect(hits, `page.tsx still references sendRealtimeMessage (${hits.length}x)`).toHaveLength(0);
  });

  it('chat thread page still sends via REST in all three flows', () => {
    // handleSendSnap, handleSend, handlePostSystemMessage — REST is the only
    // send path now; the failure-tracked mutation must remain.
    const restSends = pageSrc.match(/sendWithFailureTracking\(/g) ?? [];
    expect(restSends.length).toBeGreaterThanOrEqual(3);
  });
});
