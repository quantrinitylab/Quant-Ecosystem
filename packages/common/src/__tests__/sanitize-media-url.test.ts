import { describe, it, expect } from 'vitest';
import { sanitizeMediaUrl } from '../utils';

describe('sanitizeMediaUrl', () => {
  it('returns empty string for null/undefined/empty input', () => {
    expect(sanitizeMediaUrl(null)).toBe('');
    expect(sanitizeMediaUrl(undefined)).toBe('');
    expect(sanitizeMediaUrl('')).toBe('');
    expect(sanitizeMediaUrl('   ')).toBe('');
  });

  it('allows https URLs', () => {
    expect(sanitizeMediaUrl('https://example.com/image.png')).toBe('https://example.com/image.png');
    expect(sanitizeMediaUrl('https://cdn.quant.app/avatars/user123.jpg')).toBe(
      'https://cdn.quant.app/avatars/user123.jpg',
    );
  });

  it('allows http URLs', () => {
    expect(sanitizeMediaUrl('http://example.com/video.mp4')).toBe('http://example.com/video.mp4');
  });

  it('allows relative URLs', () => {
    expect(sanitizeMediaUrl('/images/avatar.png')).toBe('/images/avatar.png');
    expect(sanitizeMediaUrl('./media/photo.jpg')).toBe('./media/photo.jpg');
    expect(sanitizeMediaUrl('../assets/icon.svg')).toBe('../assets/icon.svg');
  });

  it('allows data:image/ URLs', () => {
    expect(sanitizeMediaUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(
      'data:image/png;base64,iVBORw0KGgo=',
    );
    expect(sanitizeMediaUrl('data:image/jpeg;base64,/9j/4AAQ=')).toBe(
      'data:image/jpeg;base64,/9j/4AAQ=',
    );
  });

  it('blocks javascript: protocol', () => {
    expect(sanitizeMediaUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeMediaUrl('javascript:void(0)')).toBe('');
  });

  it('blocks obfuscated javascript: protocol', () => {
    expect(sanitizeMediaUrl('j a v a s c r i p t:alert(1)')).toBe('');
    expect(sanitizeMediaUrl('Java\tScript:alert(1)')).toBe('');
    expect(sanitizeMediaUrl('JAVASCRIPT:alert(document.cookie)')).toBe('');
  });

  it('blocks vbscript: protocol', () => {
    expect(sanitizeMediaUrl('vbscript:MsgBox("XSS")')).toBe('');
    expect(sanitizeMediaUrl('VBScript:Execute("cmd")')).toBe('');
  });

  it('blocks obfuscated vbscript: protocol', () => {
    expect(sanitizeMediaUrl('v b s c r i p t:alert(1)')).toBe('');
  });

  it('blocks data:text/html', () => {
    expect(sanitizeMediaUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(sanitizeMediaUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe('');
  });

  it('blocks unknown protocols', () => {
    expect(sanitizeMediaUrl('ftp://example.com/file')).toBe('');
    expect(sanitizeMediaUrl('file:///etc/passwd')).toBe('');
    expect(sanitizeMediaUrl('custom://payload')).toBe('');
  });
});
