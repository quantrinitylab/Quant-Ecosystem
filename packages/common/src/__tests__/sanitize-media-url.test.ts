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

  it('allows data:video/ and data:audio/ URLs', () => {
    expect(sanitizeMediaUrl('data:video/mp4;base64,AAAAIGZ0')).toBe(
      'data:video/mp4;base64,AAAAIGZ0',
    );
    expect(sanitizeMediaUrl('data:audio/mpeg;base64,SUQzBAA=')).toBe(
      'data:audio/mpeg;base64,SUQzBAA=',
    );
  });

  it('allows blob: object URLs', () => {
    expect(sanitizeMediaUrl('blob:https://example.com/550e8400-e29b-41d4-a716-446655440000')).toBe(
      'blob:https://example.com/550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('blocks blob: URLs wrapping a script payload', () => {
    expect(sanitizeMediaUrl('blob:javascript:alert(1)')).toBe('');
  });

  it('blocks non-media data: URLs', () => {
    expect(sanitizeMediaUrl('data:application/json,{}')).toBe('');
    expect(sanitizeMediaUrl('data:image')).toBe('');
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
