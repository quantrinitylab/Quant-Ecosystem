// ============================================================================
// Validators - Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  validatePhone,
  validateUrl,
  validateUsername,
  validatePassword,
  validateDisplayName,
  validateFileUpload,
  validatePagination,
  validateSearchQuery,
  validateOAuthScope,
  validateDateRange,
  composeValidators,
} from '../validators';

describe('validateEmail', () => {
  it('accepts a valid email', () => {
    const result = validateEmail('user@example.com');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts email with subdomain', () => {
    const result = validateEmail('user@mail.example.co.uk');
    expect(result.valid).toBe(true);
  });

  it('accepts email with plus addressing', () => {
    const result = validateEmail('user+tag@example.com');
    expect(result.valid).toBe(true);
  });

  it('rejects empty string', () => {
    const result = validateEmail('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Email is required');
  });

  it('rejects whitespace-only string', () => {
    const result = validateEmail('   ');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Email is required');
  });

  it('rejects email without @ symbol', () => {
    const result = validateEmail('userexample.com');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid email format');
  });

  it('rejects email without domain', () => {
    const result = validateEmail('user@');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid email format');
  });

  it('rejects email exceeding 254 characters', () => {
    const longEmail = 'a'.repeat(246) + '@test.com';
    const result = validateEmail(longEmail);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Email must be 254 characters or fewer');
  });
});

describe('validatePhone', () => {
  it('accepts valid international phone number', () => {
    const result = validatePhone('+14155551234');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts phone with spaces/dashes (they are stripped)', () => {
    const result = validatePhone('+1 415-555-1234');
    expect(result.valid).toBe(true);
  });

  it('rejects empty string', () => {
    const result = validatePhone('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Phone number is required');
  });

  it('rejects phone without + prefix', () => {
    const result = validatePhone('14155551234');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Invalid phone number format. Use international format: +1234567890',
    );
  });

  it('rejects phone starting with +0', () => {
    const result = validatePhone('+0123456789');
    expect(result.valid).toBe(false);
  });

  it('rejects phone that is too short', () => {
    const result = validatePhone('+12345');
    expect(result.valid).toBe(false);
  });
});

describe('validateUrl', () => {
  it('accepts valid http URL', () => {
    const result = validateUrl('http://example.com');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts valid https URL', () => {
    const result = validateUrl('https://www.example.com/path?q=1');
    expect(result.valid).toBe(true);
  });

  it('rejects empty string', () => {
    const result = validateUrl('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('URL is required');
  });

  it('rejects URL with ftp protocol', () => {
    const result = validateUrl('ftp://files.example.com');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('URL must use http or https protocol');
  });

  it('rejects invalid URL format', () => {
    const result = validateUrl('not-a-url');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid URL format');
  });

  it('rejects URL exceeding 2048 characters', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2040);
    const result = validateUrl(longUrl);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('URL must be 2048 characters or fewer');
  });
});

describe('validateUsername', () => {
  it('accepts valid username', () => {
    const result = validateUsername('john_doe');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts username with dots and hyphens', () => {
    const result = validateUsername('john.doe-123');
    expect(result.valid).toBe(true);
  });

  it('rejects empty string', () => {
    const result = validateUsername('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Username is required');
  });

  it('rejects username shorter than 3 characters', () => {
    const result = validateUsername('ab');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Username must be at least 3 characters');
  });

  it('rejects username longer than 30 characters', () => {
    const result = validateUsername('a'.repeat(31));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Username must be 30 characters or fewer');
  });

  it('rejects username with invalid characters', () => {
    const result = validateUsername('user@name!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Username can only contain letters, numbers, underscores, dots, and hyphens',
    );
  });

  it('rejects username starting with special character', () => {
    const result = validateUsername('_username');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Username cannot start or end with special characters');
  });

  it('rejects username ending with special character', () => {
    const result = validateUsername('username.');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Username cannot start or end with special characters');
  });
});

describe('validatePassword', () => {
  it('accepts a strong password', () => {
    const result = validatePassword('MyP@ssw0rd!');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects empty password', () => {
    const result = validatePassword('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password is required');
  });

  it('rejects password shorter than 8 characters', () => {
    const result = validatePassword('Ab1!xyz');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be at least 8 characters');
  });

  it('rejects password exceeding 128 characters', () => {
    const result = validatePassword('Aa1!' + 'x'.repeat(126));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be 128 characters or fewer');
  });

  it('rejects password without uppercase letter', () => {
    const result = validatePassword('mypassw0rd!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one uppercase letter');
  });

  it('rejects password without lowercase letter', () => {
    const result = validatePassword('MYPASSW0RD!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one lowercase letter');
  });

  it('rejects password without number', () => {
    const result = validatePassword('MyPassword!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one number');
  });

  it('rejects password without special character', () => {
    const result = validatePassword('MyPassw0rd');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one special character');
  });
});

describe('validateDisplayName', () => {
  it('accepts a valid display name', () => {
    const result = validateDisplayName('John Doe');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects empty string', () => {
    const result = validateDisplayName('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Display name is required');
  });

  it('rejects display name exceeding 50 characters', () => {
    const result = validateDisplayName('a'.repeat(51));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Display name must be 50 characters or fewer');
  });

  it('accepts display name at exactly 50 characters', () => {
    const result = validateDisplayName('a'.repeat(50));
    expect(result.valid).toBe(true);
  });
});

describe('validateFileUpload', () => {
  const options = { maxSize: 5 * 1024 * 1024, allowedTypes: ['image/png', 'image/jpeg'] };

  it('accepts valid file within size and type', () => {
    const result = validateFileUpload({ size: 1024, mimeType: 'image/png' }, options);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects file exceeding max size', () => {
    const result = validateFileUpload({ size: 10 * 1024 * 1024, mimeType: 'image/png' }, options);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('File size exceeds maximum');
  });

  it('rejects file with disallowed mime type', () => {
    const result = validateFileUpload({ size: 1024, mimeType: 'application/pdf' }, options);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("File type 'application/pdf' is not allowed");
  });

  it('rejects file with both size and type violations', () => {
    const result = validateFileUpload({ size: 10 * 1024 * 1024, mimeType: 'text/plain' }, options);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});

describe('validatePagination', () => {
  it('accepts valid page and page size', () => {
    const result = validatePagination(1, 20);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects page less than 1', () => {
    const result = validatePagination(0, 20);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Page must be a positive integer');
  });

  it('rejects non-integer page', () => {
    const result = validatePagination(1.5, 20);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Page must be a positive integer');
  });

  it('rejects page size greater than 100', () => {
    const result = validatePagination(1, 101);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Page size must be 100 or fewer');
  });

  it('rejects page size less than 1', () => {
    const result = validatePagination(1, 0);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Page size must be a positive integer');
  });
});

describe('validateSearchQuery', () => {
  it('accepts valid search query', () => {
    const result = validateSearchQuery('hello world');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects empty string', () => {
    const result = validateSearchQuery('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Search query is required');
  });

  it('rejects query shorter than 2 characters', () => {
    const result = validateSearchQuery('a');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Search query must be at least 2 characters');
  });

  it('rejects query exceeding 200 characters', () => {
    const result = validateSearchQuery('a'.repeat(201));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Search query must be 200 characters or fewer');
  });
});

describe('validateOAuthScope', () => {
  it('accepts a valid single scope', () => {
    const result = validateOAuthScope('profile:read');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts multiple valid scopes', () => {
    const result = validateOAuthScope('profile:read email:read messages:write');
    expect(result.valid).toBe(true);
  });

  it('rejects empty scope string', () => {
    const result = validateOAuthScope('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('At least one scope is required');
  });

  it('rejects invalid scope', () => {
    const result = validateOAuthScope('invalid:scope');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Invalid scope: 'invalid:scope'");
  });

  it('rejects when one scope in list is invalid', () => {
    const result = validateOAuthScope('profile:read bad:scope');
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});

describe('validateDateRange', () => {
  it('accepts valid date range', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-12-31');
    const result = validateDateRange(start, end);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects when start date equals end date', () => {
    const date = new Date('2024-06-15');
    const result = validateDateRange(date, date);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Start date must be before end date');
  });

  it('rejects when start date is after end date', () => {
    const start = new Date('2024-12-31');
    const end = new Date('2024-01-01');
    const result = validateDateRange(start, end);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Start date must be before end date');
  });

  it('rejects invalid start date', () => {
    const result = validateDateRange(new Date('invalid'), new Date('2024-12-31'));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid start date');
  });

  it('rejects invalid end date', () => {
    const result = validateDateRange(new Date('2024-01-01'), new Date('invalid'));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid end date');
  });
});

describe('composeValidators', () => {
  it('returns valid when all results are valid', () => {
    const result = composeValidators({ valid: true, errors: [] }, { valid: true, errors: [] });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns invalid when any result has errors', () => {
    const result = composeValidators(
      { valid: true, errors: [] },
      { valid: false, errors: ['Error 1'] },
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Error 1');
  });

  it('collects errors from multiple results', () => {
    const result = composeValidators(
      { valid: false, errors: ['Error A'] },
      { valid: false, errors: ['Error B', 'Error C'] },
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
    expect(result.errors).toEqual(['Error A', 'Error B', 'Error C']);
  });
});
