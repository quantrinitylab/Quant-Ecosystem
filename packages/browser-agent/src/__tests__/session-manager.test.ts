import { SessionManager } from '../session/session-manager.js';

describe('SessionManager', () => {
  let mgr: SessionManager;
  beforeEach(() => {
    mgr = new SessionManager();
  });

  it('creates and gets a session', () => {
    const s = mgr.createSession('https://shop.com', 'user1');
    expect(s.status).toBe('active');
    expect(mgr.getSession(s.id)).toEqual(s);
  });

  it('ends a session', () => {
    const s = mgr.createSession('https://x.com', 'u1');
    mgr.endSession(s.id);
    expect(mgr.getSession(s.id).status).toBe('closed');
  });

  it('records an action', () => {
    const s = mgr.createSession('https://x.com', 'u1');
    mgr.recordAction(s.id, { type: 'click', selector: '#btn' }, { success: true });
    expect(mgr.getSession(s.id).actions).toHaveLength(1);
  });

  it('checkTimeout returns false for fresh session', () => {
    const s = mgr.createSession('https://x.com', 'u1');
    expect(mgr.checkTimeout(s.id)).toBe(false);
  });

  it('checkTimeout returns true after inactivity', () => {
    const s = mgr.createSession('https://x.com', 'u1');
    mgr.getSession(s.id).lastActivityAt = Date.now() - 31 * 60 * 1000;
    expect(mgr.checkTimeout(s.id)).toBe(true);
  });

  it('listActiveSessions filters by userId', () => {
    mgr.createSession('https://a.com', 'u1');
    mgr.createSession('https://b.com', 'u2');
    expect(mgr.listActiveSessions('u1')).toHaveLength(1);
  });

  it('throws on non-existent session', () => {
    expect(() => mgr.getSession('fake')).toThrow();
  });
});
