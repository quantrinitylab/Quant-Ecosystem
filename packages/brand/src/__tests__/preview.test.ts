import { describe, expect, it } from 'vitest';
import { generateFoundationPreviewDocument } from '../index';

describe('foundation preview document', () => {
  it('renders all modes and the approved endorsed hierarchy', () => {
    const html = generateFoundationPreviewDocument();

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('data-quant-theme="dark"');
    expect(html).toContain('data-quant-theme="light"');
    expect(html).toContain('data-quant-theme="highContrast"');
    expect(html).toContain('<div class="product-name">QuantMail</div>');
    expect(html).toContain('<span>by</span> <strong>QUANTRINITY</strong>');
    expect(html).toContain('aria-label="QuantMail by Quantrinity"');
  });

  it('exercises every semantic role in an isolated surface', () => {
    const html = generateFoundationPreviewDocument();

    expect(html).toContain('--qt-canvas:');
    expect(html).toContain('--qt-surface-3:');
    expect(html).toContain('--qt-text-muted:');
    expect(html).toContain('--qt-action-primary:');
    expect(html).toContain('--qt-focus-ring:');
    expect(html).toContain('--qt-success:');
    expect(html).toContain('--qt-warning:');
    expect(html).toContain('--qt-danger:');
    expect(html).toContain('--qt-info:');
    expect(html).toContain('--qt-ai-context:');
  });

  it('escapes product content before inserting it into HTML', () => {
    const hostileName = '<img src=x onerror="alert(1)">';
    const html = generateFoundationPreviewDocument(hostileName);

    expect(html).not.toContain(hostileName);
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('does not imply that unreviewed mastermark geometry is final', () => {
    const html = generateFoundationPreviewDocument();

    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<script');
    expect(html).toContain('mastermark is intentionally absent');
  });
});
