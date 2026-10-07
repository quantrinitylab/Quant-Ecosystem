import crypto from 'node:crypto';
import type { BrowserAction } from '../types.js';
import { ActionTier } from '../types.js';

const nextId = () => crypto.randomUUID();

export const createClickAction = (selector: string): BrowserAction => ({
  type: 'click',
  selector,
  id: nextId(),
});
export const createTypeAction = (selector: string, text: string): BrowserAction => ({
  type: 'type',
  selector,
  text,
  id: nextId(),
});
export const createScrollAction = (direction: 'up' | 'down', amount?: number): BrowserAction => ({
  type: 'scroll',
  direction,
  amount,
  id: nextId(),
});
export const createNavigateAction = (url: string): BrowserAction => ({
  type: 'navigate',
  url,
  id: nextId(),
});
export const createExtractAction = (selector: string): BrowserAction => ({
  type: 'extract',
  selector,
  id: nextId(),
});
export const createScreenshotAction = (): BrowserAction => ({ type: 'screenshot', id: nextId() });
export const createWaitAction = (ms: number): BrowserAction => ({ type: 'wait', ms, id: nextId() });
export const createSelectAction = (selector: string, value: string): BrowserAction => ({
  type: 'select',
  selector,
  value,
  id: nextId(),
});

export function validateAction(action: unknown): action is BrowserAction {
  if (!action || typeof action !== 'object') return false;
  const a = action as Record<string, unknown>;
  if (typeof a['type'] !== 'string') return false;
  switch (a['type']) {
    case 'click':
      return typeof a['selector'] === 'string';
    case 'type':
      return typeof a['selector'] === 'string' && typeof a['text'] === 'string';
    case 'scroll':
      return a['direction'] === 'up' || a['direction'] === 'down';
    case 'navigate':
      return typeof a['url'] === 'string';
    case 'extract':
      return typeof a['selector'] === 'string';
    case 'screenshot':
      return true;
    case 'wait':
      return typeof a['ms'] === 'number';
    case 'select':
      return typeof a['selector'] === 'string' && typeof a['value'] === 'string';
    default:
      return false;
  }
}

const PURCHASE_PATTERNS = /pay|buy|purchase|checkout|place.?order|confirm.?payment|submit.?order/i;

/**
 * Classifies a browser action into a trust tier based on selector/text regex matching.
 * This is a heuristic check only. Downstream consumers should override with vision-model
 * classification to detect purchase intent from page semantics rather than selector names.
 */
export function classifyAction(action: BrowserAction): ActionTier {
  if (
    action.type === 'navigate' ||
    action.type === 'extract' ||
    action.type === 'screenshot' ||
    action.type === 'wait' ||
    action.type === 'scroll'
  ) {
    return ActionTier.read_only;
  }
  const text = 'selector' in action ? action.selector : '';
  const extra = action.type === 'type' ? action.text : action.type === 'select' ? action.value : '';
  if (PURCHASE_PATTERNS.test(text) || PURCHASE_PATTERNS.test(extra)) {
    return ActionTier.purchase;
  }
  return ActionTier.write;
}
