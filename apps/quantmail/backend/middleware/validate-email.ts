import { createAppError } from '@quant/server-core';

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const MAX_SUBJECT_LENGTH = 500;
const MAX_BODY_LENGTH = 1_000_000;
const MAX_RECIPIENTS = 100;
const MAX_ATTACHMENT_COUNT = 25;

export function validateEmailAddress(email: string): boolean {
  if (!email || email.length > 254) return false;
  return EMAIL_REGEX.test(email);
}

export function validateEmailAddresses(emails: string[]): { valid: boolean; invalid: string[] } {
  const invalid = emails.filter((e) => !validateEmailAddress(e));
  return { valid: invalid.length === 0, invalid };
}

export interface EmailValidationInput {
  toAddresses: string[];
  ccAddresses?: string[];
  bccAddresses?: string[];
  subject: string;
  bodyHtml?: string;
  bodyPlain?: string;
  attachments?: unknown[];
}

export function validateComposeEmail(input: EmailValidationInput): void {
  const allRecipients = [
    ...input.toAddresses,
    ...(input.ccAddresses || []),
    ...(input.bccAddresses || []),
  ];

  if (input.toAddresses.length === 0) {
    throw createAppError('At least one recipient is required', 400, 'MISSING_RECIPIENT');
  }

  if (allRecipients.length > MAX_RECIPIENTS) {
    throw createAppError(
      `Maximum ${MAX_RECIPIENTS} recipients allowed (got ${allRecipients.length})`,
      400,
      'TOO_MANY_RECIPIENTS',
    );
  }

  const { valid, invalid } = validateEmailAddresses(allRecipients);
  if (!valid) {
    throw createAppError(
      `Invalid email address(es): ${invalid.join(', ')}`,
      400,
      'INVALID_EMAIL_ADDRESS',
    );
  }

  if (!input.subject || input.subject.trim().length === 0) {
    throw createAppError('Subject is required', 400, 'MISSING_SUBJECT');
  }

  if (input.subject.length > MAX_SUBJECT_LENGTH) {
    throw createAppError(
      `Subject exceeds maximum length of ${MAX_SUBJECT_LENGTH} characters`,
      400,
      'SUBJECT_TOO_LONG',
    );
  }

  const bodyLength = (input.bodyHtml?.length || 0) + (input.bodyPlain?.length || 0);
  if (bodyLength > MAX_BODY_LENGTH) {
    throw createAppError(
      `Email body exceeds maximum size of ${MAX_BODY_LENGTH} characters`,
      400,
      'BODY_TOO_LARGE',
    );
  }

  if (!input.bodyHtml && !input.bodyPlain) {
    throw createAppError('Email body is required (either HTML or plain text)', 400, 'MISSING_BODY');
  }

  if (input.attachments && input.attachments.length > MAX_ATTACHMENT_COUNT) {
    throw createAppError(
      `Maximum ${MAX_ATTACHMENT_COUNT} attachments allowed`,
      400,
      'TOO_MANY_ATTACHMENTS',
    );
  }
}

export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/<iframe\b[^>]*>.*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>.*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '');
}
