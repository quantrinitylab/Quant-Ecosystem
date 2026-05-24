// ============================================================================
// Quant Ecosystem - Validation Helpers
// ============================================================================

/** Validation result type */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate an email address
 */
export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];
  if (!email || email.trim().length === 0) {
    errors.push('Email is required');
    return { valid: false, errors };
  }
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    errors.push('Invalid email format');
  }
  if (email.length > 254) {
    errors.push('Email must be 254 characters or fewer');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a phone number (international format)
 */
export function validatePhone(phone: string): ValidationResult {
  const errors: string[] = [];
  if (!phone || phone.trim().length === 0) {
    errors.push('Phone number is required');
    return { valid: false, errors };
  }
  const phoneRegex = /^\+[1-9]\d{6,14}$/;
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (!phoneRegex.test(cleaned)) {
    errors.push('Invalid phone number format. Use international format: +1234567890');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a URL
 */
export function validateUrl(url: string): ValidationResult {
  const errors: string[] = [];
  if (!url || url.trim().length === 0) {
    errors.push('URL is required');
    return { valid: false, errors };
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      errors.push('URL must use http or https protocol');
    }
  } catch {
    errors.push('Invalid URL format');
  }
  if (url.length > 2048) {
    errors.push('URL must be 2048 characters or fewer');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a username
 */
export function validateUsername(username: string): ValidationResult {
  const errors: string[] = [];
  if (!username || username.trim().length === 0) {
    errors.push('Username is required');
    return { valid: false, errors };
  }
  if (username.length < 3) {
    errors.push('Username must be at least 3 characters');
  }
  if (username.length > 30) {
    errors.push('Username must be 30 characters or fewer');
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    errors.push('Username can only contain letters, numbers, underscores, dots, and hyphens');
  }
  if (/^[._-]/.test(username) || /[._-]$/.test(username)) {
    errors.push('Username cannot start or end with special characters');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a password
 */
export function validatePassword(password: string): ValidationResult {
  const errors: string[] = [];
  if (!password) {
    errors.push('Password is required');
    return { valid: false, errors };
  }
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (password.length > 128) {
    errors.push('Password must be 128 characters or fewer');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a display name
 */
export function validateDisplayName(name: string): ValidationResult {
  const errors: string[] = [];
  if (!name || name.trim().length === 0) {
    errors.push('Display name is required');
    return { valid: false, errors };
  }
  if (name.trim().length < 1) {
    errors.push('Display name must be at least 1 character');
  }
  if (name.length > 50) {
    errors.push('Display name must be 50 characters or fewer');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate file upload
 */
export function validateFileUpload(
  file: { size: number; mimeType: string },
  options: { maxSize: number; allowedTypes: string[] }
): ValidationResult {
  const errors: string[] = [];
  if (file.size > options.maxSize) {
    const maxMB = (options.maxSize / (1024 * 1024)).toFixed(0);
    errors.push(`File size exceeds maximum of ${maxMB}MB`);
  }
  if (!options.allowedTypes.includes(file.mimeType)) {
    errors.push(`File type '${file.mimeType}' is not allowed`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate pagination parameters
 */
export function validatePagination(page: number, pageSize: number): ValidationResult {
  const errors: string[] = [];
  if (!Number.isInteger(page) || page < 1) {
    errors.push('Page must be a positive integer');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    errors.push('Page size must be a positive integer');
  }
  if (pageSize > 100) {
    errors.push('Page size must be 100 or fewer');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a search query
 */
export function validateSearchQuery(query: string): ValidationResult {
  const errors: string[] = [];
  if (!query || query.trim().length === 0) {
    errors.push('Search query is required');
    return { valid: false, errors };
  }
  if (query.trim().length < 2) {
    errors.push('Search query must be at least 2 characters');
  }
  if (query.length > 200) {
    errors.push('Search query must be 200 characters or fewer');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate an OAuth scope string
 */
export function validateOAuthScope(scope: string): ValidationResult {
  const errors: string[] = [];
  const validScopes = [
    'profile:read', 'profile:write', 'email:read', 'email:send',
    'messages:read', 'messages:write', 'posts:read', 'posts:write',
    'media:read', 'media:upload', 'contacts:read', 'contacts:write',
    'ai:use', 'realtime:connect', 'ads:manage', 'analytics:read',
  ];
  const scopes = scope.split(' ').filter(Boolean);
  if (scopes.length === 0) {
    errors.push('At least one scope is required');
  }
  for (const s of scopes) {
    if (!validScopes.includes(s)) {
      errors.push(`Invalid scope: '${s}'`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a date range
 */
export function validateDateRange(startDate: Date, endDate: Date): ValidationResult {
  const errors: string[] = [];
  if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
    errors.push('Invalid start date');
  }
  if (!(endDate instanceof Date) || isNaN(endDate.getTime())) {
    errors.push('Invalid end date');
  }
  if (startDate >= endDate) {
    errors.push('Start date must be before end date');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Compose multiple validators and collect all errors
 */
export function composeValidators(
  ...results: ValidationResult[]
): ValidationResult {
  const allErrors = results.flatMap((r) => r.errors);
  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}
