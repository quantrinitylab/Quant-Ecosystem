import { BetaCohortManager } from '../cohort/beta-cohort.js';
import { RetentionTracker } from '../metrics/retention-tracker.js';
import { NPSTracker } from '../metrics/nps-tracker.js';
import { FeatureFlagService } from '../flags/feature-flags.js';
import { BugReporter } from '../feedback/bug-reporter.js';
import { InviteSystem } from '../invites/invite-system.js';
import { FeedbackCollector } from '../feedback/feedback-collector.js';
import { RolloutController } from '../rollout/rollout-controller.js';

describe('BetaCohortManager', () => {
  it('add/remove users and track activation', () => {
    const m = new BetaCohortManager();
    const u = m.addUser('a@b.com', 'power');
    expect(u?.cohort).toBe('power');
    expect(m.getActivationRate('power')).toBeCloseTo(1 / 200);
    expect(m.getCohort('power')?.members).toContain('a@b.com');
    m.removeUser('a@b.com');
    expect(m.getActivationRate('power')).toBe(0);
    expect(m.getAllCohorts()).toHaveLength(5);
  });
  it('respects capacity', () => {
    const m = new BetaCohortManager();
    for (let i = 0; i < 100; i++) m.addUser(`u${i}@x.com`, 'self-host');
    expect(m.addUser('extra@x.com', 'self-host')).toBeNull();
  });
});

describe('RetentionTracker', () => {
  it('records logins and calculates retention', () => {
    const t = new RetentionTracker();
    t.recordLogin('u1', 1, 'power');
    t.recordLogin('u1', 7, 'power');
    t.recordLogin('u2', 1, 'power');
    const r = t.calculateRetention('power');
    expect(r.d1).toBe(100);
    expect(r.d7).toBe(50);
    expect(r.d30).toBe(0);
  });
  it('meets targets check', () => {
    const t = new RetentionTracker();
    expect(t.meetsTargets({ d1: 80, d7: 45, d30: 30, cohort: 'x' })).toEqual({
      d7Ok: true,
      d30Ok: true,
    });
    expect(t.meetsTargets({ d1: 80, d7: 30, d30: 20, cohort: 'x' })).toEqual({
      d7Ok: false,
      d30Ok: false,
    });
  });
});

describe('NPSTracker', () => {
  it('calculates NPS correctly', () => {
    const n = new NPSTracker();
    n.submitSurvey('u1', 10, 'great');
    n.submitSurvey('u2', 9, 'good');
    n.submitSurvey('u3', 5, 'meh');
    const s = n.calculateNPS();
    expect(s.promoters).toBe(2);
    expect(s.detractors).toBe(1);
    expect(s.score).toBe(33);
    expect(n.meetsTarget(s.score)).toBe(false);
    expect(n.meetsTarget(40)).toBe(true);
  });
  it('rejects scores outside 0-10', () => {
    const n = new NPSTracker();
    expect(n.submitSurvey('u1', -1, 'bad')).toBeNull();
    expect(n.submitSurvey('u2', 11, 'over')).toBeNull();
    expect(n.submitSurvey('u3', 0, 'low')).not.toBeNull();
    expect(n.submitSurvey('u4', 10, 'high')).not.toBeNull();
    expect(n.calculateNPS().responseCount).toBe(2);
  });
});

describe('FeatureFlagService', () => {
  it('create, enable, killswitch, rollout', () => {
    const f = new FeatureFlagService();
    const flag = f.createFlag('dark-mode', { cohorts: ['power'] });
    expect(f.isEnabled(flag.id, 'u1', 'power')).toBe(true);
    expect(f.isEnabled(flag.id, 'u1', 'elderly')).toBe(false);
    f.toggleKillSwitch(flag.id, true);
    expect(f.isEnabled(flag.id, 'u1', 'power')).toBe(false);
    f.toggleKillSwitch(flag.id, false);
    f.setRollout(flag.id, 50);
    expect(f.getFlag(flag.id)?.rolloutPercent).toBe(50);
  });
});

describe('BugReporter', () => {
  it('returns reports sorted by priority then createdAt', () => {
    const b = new BugReporter();
    const r1 = b.report('u1', 'low bug', 1);
    const r2 = b.report('u1', 'high bug', 5);
    const r3 = b.report('u2', 'high bug old', 5);
    const queue = b.getPriorityQueue();
    expect(queue[0]!.id).toBe(r2.id);
    expect(queue[1]!.id).toBe(r3.id);
    expect(queue[2]!.id).toBe(r1.id);
  });
  it('filters reports by user', () => {
    const b = new BugReporter();
    b.report('u1', 'bug a', 3);
    b.report('u2', 'bug b', 2);
    b.report('u1', 'bug c', 1);
    const u1Reports = b.getReportsByUser('u1');
    expect(u1Reports).toHaveLength(2);
    expect(u1Reports.every((r) => r.userId === 'u1')).toBe(true);
    expect(b.getReportsByUser('u3')).toHaveLength(0);
  });
});

describe('InviteSystem', () => {
  it('generates invites with expiry', () => {
    const sys = new InviteSystem();
    const inv = sys.generateInvite('user@test.com', 'power', 60000);
    expect(inv.status).toBe('sent');
    expect(inv.expiresAt).toBeGreaterThan(Date.now());
    expect(sys.acceptInvite(inv.id)).toBe(true);
    expect(sys.getInvite(inv.id)?.status).toBe('accepted');
  });

  it('rejects expired invites', () => {
    const sys = new InviteSystem();
    const inv = sys.generateInvite('user@test.com', 'power', -1);
    expect(sys.acceptInvite(inv.id)).toBe(false);
    expect(sys.getInvite(inv.id)?.status).toBe('expired');
  });

  it('bulk invite creates multiple invites', () => {
    const sys = new InviteSystem();
    const invites = sys.bulkInvite(['a@b.com', 'c@d.com', 'e@f.com'], 'mainstream', 60000);
    expect(invites).toHaveLength(3);
    expect(invites.every((i) => i.cohort === 'mainstream')).toBe(true);
  });

  it('tracks referrals', () => {
    const sys = new InviteSystem();
    const inv1 = sys.generateInvite('u1@t.com', 'power', 60000, 'referrer1');
    const inv2 = sys.generateInvite('u2@t.com', 'power', 60000, 'referrer1');
    sys.acceptInvite(inv1.id);
    sys.acceptInvite(inv2.id);
    expect(sys.getReferralCount('referrer1')).toBe(2);
  });

  it('manages waitlist', () => {
    const sys = new InviteSystem();
    expect(sys.addToWaitlist('first@t.com')).toBe(1);
    expect(sys.addToWaitlist('second@t.com')).toBe(2);
    expect(sys.getWaitlistPosition('first@t.com')).toBe(1);
    expect(sys.getWaitlistPosition('unknown@t.com')).toBe(-1);
    expect(sys.getWaitlistSize()).toBe(2);
  });
});

describe('FeedbackCollector', () => {
  it('collects feedback with sentiment analysis', () => {
    const fc = new FeedbackCollector();
    const pos = fc.submit('u1', 'ux', 'This is great and amazing');
    expect(pos.sentiment).toBe(1);
    const neg = fc.submit('u2', 'performance', 'Very slow and broken');
    expect(neg.sentiment).toBe(-1);
    const neutral = fc.submit('u3', 'features', 'The button is on the left');
    expect(neutral.sentiment).toBe(0);
  });

  it('prioritizes by votes', () => {
    const fc = new FeedbackCollector();
    const f1 = fc.submit('u1', 'features', 'Add dark mode');
    const f2 = fc.submit('u2', 'features', 'Add export');
    fc.vote(f2.id);
    fc.vote(f2.id);
    fc.vote(f1.id);
    const top = fc.getTopVoted(2);
    expect(top[0]!.id).toBe(f2.id);
    expect(top[0]!.votes).toBe(2);
  });

  it('filters by category and acknowledges', () => {
    const fc = new FeedbackCollector();
    fc.submit('u1', 'bugs', 'App crashes');
    fc.submit('u2', 'ux', 'Button too small');
    const bug = fc.submit('u3', 'bugs', 'Login fails');
    expect(fc.getByCategory('bugs')).toHaveLength(2);
    fc.acknowledge(bug.id);
    expect(fc.getEntry(bug.id)?.acknowledged).toBe(true);
  });
});

describe('RolloutController', () => {
  it('advances through staged rollout', () => {
    const rc = new RolloutController();
    rc.createRollout('feature-a');
    expect(rc.getState('feature-a')?.currentPercentage).toBe(0);
    rc.advanceStage('feature-a');
    expect(rc.getState('feature-a')?.currentPercentage).toBe(1);
    rc.advanceStage('feature-a');
    expect(rc.getState('feature-a')?.currentPercentage).toBe(5);
    rc.advanceStage('feature-a');
    expect(rc.getState('feature-a')?.currentPercentage).toBe(25);
    rc.advanceStage('feature-a');
    expect(rc.getState('feature-a')?.currentPercentage).toBe(50);
    rc.advanceStage('feature-a');
    expect(rc.getState('feature-a')?.currentPercentage).toBe(100);
    expect(rc.advanceStage('feature-a')).toBe(false);
  });

  it('rolls back to zero', () => {
    const rc = new RolloutController();
    rc.createRollout('feature-b');
    rc.advanceStage('feature-b');
    rc.advanceStage('feature-b');
    rc.rollback('feature-b');
    expect(rc.getState('feature-b')?.currentPercentage).toBe(0);
    expect(rc.getState('feature-b')?.rolledBack).toBe(true);
    expect(rc.advanceStage('feature-b')).toBe(false);
  });

  it('consistent hashing determines user in rollout', () => {
    const rc = new RolloutController();
    rc.createRollout('feature-c');
    rc.advanceStage('feature-c');
    rc.advanceStage('feature-c');
    rc.advanceStage('feature-c');
    rc.advanceStage('feature-c');
    rc.advanceStage('feature-c');
    let inCount = 0;
    for (let i = 0; i < 100; i++) {
      if (rc.isUserInRollout('feature-c', `user-${i}`)) inCount++;
    }
    expect(inCount).toBe(100);
  });

  it('canary detection auto-rollback on error spike', () => {
    const rc = new RolloutController();
    rc.createRollout('feature-d');
    rc.advanceStage('feature-d');
    for (let i = 0; i < 100; i++) {
      rc.recordRequest('feature-d', i < 20);
    }
    expect(rc.getErrorRate('feature-d')).toBeCloseTo(0.2);
    const healthy = rc.checkCanary('feature-d', 0.1);
    expect(healthy).toBe(false);
    expect(rc.getState('feature-d')?.rolledBack).toBe(true);
  });

  it('canary passes when error rate is acceptable', () => {
    const rc = new RolloutController();
    rc.createRollout('feature-e');
    rc.advanceStage('feature-e');
    for (let i = 0; i < 100; i++) {
      rc.recordRequest('feature-e', i < 2);
    }
    expect(rc.checkCanary('feature-e', 0.05)).toBe(true);
    expect(rc.getState('feature-e')?.rolledBack).toBe(false);
  });
});
