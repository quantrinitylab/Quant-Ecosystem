import {
  createClickAction,
  createTypeAction,
  createScrollAction,
  createNavigateAction,
  createExtractAction,
  createScreenshotAction,
  createWaitAction,
  createSelectAction,
  validateAction,
  classifyAction,
} from '../actions/browser-actions.js';
import { ActionTier } from '../types.js';

describe('BrowserActions', () => {
  it('creates click action with selector', () => {
    const a = createClickAction('#btn');
    expect(a.type).toBe('click');
    if (a.type === 'click') expect(a.selector).toBe('#btn');
    expect(a.id).toBeDefined();
    expect(typeof a.id).toBe('string');
  });

  it('creates type action with text', () => {
    const a = createTypeAction('#input', 'hello');
    expect(a.type).toBe('type');
    if (a.type === 'type') expect(a.text).toBe('hello');
    expect(a.id).toBeDefined();
  });

  it('creates scroll action', () => {
    const a = createScrollAction('down', 100);
    expect(a.type).toBe('scroll');
    if (a.type === 'scroll') expect(a.direction).toBe('down');
    expect(a.id).toBeDefined();
  });

  it('creates navigate action', () => {
    const a = createNavigateAction('https://example.com');
    expect(a.type).toBe('navigate');
    expect(a.id).toBeDefined();
  });

  it('creates extract, screenshot, wait, select actions', () => {
    expect(createExtractAction('.data').type).toBe('extract');
    expect(createScreenshotAction().type).toBe('screenshot');
    expect(createWaitAction(1000).type).toBe('wait');
    expect(createSelectAction('#sel', 'opt1').type).toBe('select');
  });

  it('generates unique IDs for each action', () => {
    const a1 = createClickAction('#btn1');
    const a2 = createClickAction('#btn2');
    expect(a1.id).not.toBe(a2.id);
  });

  it('validateAction accepts valid actions', () => {
    expect(validateAction({ type: 'click', selector: '#x' })).toBe(true);
    expect(validateAction({ type: 'screenshot' })).toBe(true);
    expect(validateAction({ type: 'wait', ms: 100 })).toBe(true);
  });

  it('validateAction rejects malformed actions', () => {
    expect(validateAction(null)).toBe(false);
    expect(validateAction({})).toBe(false);
    expect(validateAction({ type: 'click' })).toBe(false);
    expect(validateAction({ type: 'unknown' })).toBe(false);
  });

  it('classifyAction identifies read_only actions', () => {
    expect(classifyAction({ type: 'navigate', url: '/' })).toBe(ActionTier.read_only);
    expect(classifyAction({ type: 'extract', selector: '.x' })).toBe(ActionTier.read_only);
    expect(classifyAction({ type: 'screenshot' })).toBe(ActionTier.read_only);
  });

  it('classifyAction identifies write actions', () => {
    expect(classifyAction({ type: 'click', selector: '#save' })).toBe(ActionTier.write);
    expect(classifyAction({ type: 'type', selector: '#name', text: 'hi' })).toBe(ActionTier.write);
  });

  it('classifyAction identifies purchase actions', () => {
    expect(classifyAction({ type: 'click', selector: '#buy-now' })).toBe(ActionTier.purchase);
    expect(classifyAction({ type: 'click', selector: '.checkout-btn' })).toBe(ActionTier.purchase);
    expect(classifyAction({ type: 'click', selector: '#confirm-payment' })).toBe(
      ActionTier.purchase,
    );
  });
});
