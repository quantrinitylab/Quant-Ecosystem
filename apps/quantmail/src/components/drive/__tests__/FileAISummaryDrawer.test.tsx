import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FileAISummaryDrawer } from '../FileAISummaryDrawer';

const FILE = { id: 'file-1', name: 'contract.pdf', mimeType: 'application/pdf', size: 2048 };

describe('FileAISummaryDrawer footer engine badge (fake-claim removal)', () => {
  it('names the real server-side engine — never the invented ONNX local-inference claim', () => {
    const html = renderToStaticMarkup(
      <FileAISummaryDrawer isOpen onClose={() => {}} file={FILE} autoFetch={false} />,
    );
    // Honest: the summary manager generates via POST /api/drive/ai/summarize (server-side backend AI)
    expect(html).toContain('server-side summary');
    // No trace of the invented on-device inference capability
    expect(html).not.toContain('ONNX');
    expect(html).not.toContain('Inference Ready');
  });

  it('renders nothing when closed — badge only exists on the open drawer', () => {
    const html = renderToStaticMarkup(
      <FileAISummaryDrawer isOpen={false} onClose={() => {}} file={FILE} autoFetch={false} />,
    );
    expect(html).not.toContain('server-side summary');
    expect(html).not.toContain('ONNX');
  });
});
