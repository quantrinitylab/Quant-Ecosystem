// Quanty live integration — route contract test.
//
// The frontend hooks (useQuantyAgent, useQuantyPopupData) call a fixed set of
// endpoints. This test asserts every one of them has a corresponding Next
// route handler exporting the right HTTP method — the wiring this PR adds
// between the QuantyLiveAgent UI and the agent-core backend.
import { describe, it, expect } from 'vitest';

import { GET as popupGET } from '../app/api/quanty/popup/route';
import { POST as tasksPOST } from '../app/api/quanty/tasks/route';
import { GET as taskGET } from '../app/api/quanty/tasks/[id]/route';
import { GET as streamGET } from '../app/api/quanty/tasks/[id]/stream/route';
import { POST as interruptPOST } from '../app/api/quanty/tasks/[id]/interrupt/route';
import { POST as confirmPOST } from '../app/api/quanty/tasks/[id]/steps/[stepId]/confirm/route';
import { POST as cancelPOST } from '../app/api/quanty/tasks/[id]/steps/[stepId]/cancel/route';
import { POST as undoPOST } from '../app/api/quanty/tasks/[id]/undo/route';

describe('quanty Next route contracts (what the hooks call)', () => {
  it('GET /api/quanty/popup serves the popup dashboard', () => {
    expect(typeof popupGET).toBe('function');
  });

  it('POST /api/quanty/tasks submits a command', () => {
    expect(typeof tasksPOST).toBe('function');
  });

  it('GET /api/quanty/tasks/:id returns task status', () => {
    expect(typeof taskGET).toBe('function');
  });

  it('GET /api/quanty/tasks/:id/stream serves the SSE feed', () => {
    expect(typeof streamGET).toBe('function');
  });

  it('POST /api/quanty/tasks/:id/interrupt cancels a task', () => {
    expect(typeof interruptPOST).toBe('function');
  });

  it('step confirm/cancel routes approve or deny the pending destructive step', () => {
    expect(typeof confirmPOST).toBe('function');
    expect(typeof cancelPOST).toBe('function');
  });

  it('POST /api/quanty/tasks/:id/undo reverses reversible steps', () => {
    expect(typeof undoPOST).toBe('function');
  });
});
