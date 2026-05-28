import { LaunchChecklistManager } from '../checklist/launch-checklist.js';
import { StatusPageService } from '../status/status-page.js';
import { QuantCoach } from '../support/support-agent.js';
import { AppStoreTracker } from '../store/app-store-tracker.js';
import { SubmissionTracker } from '../submissions/submission-tracker.js';
import { MarketingIntegration } from '../marketing/marketing-integration.js';
import { PressKitManager } from '../press/press-kit-manager.js';
import { LaunchMetrics } from '../metrics/launch-metrics.js';

describe('LaunchChecklistManager', () => {
  it('tracks gates and ready status', () => {
    const m = new LaunchChecklistManager();
    expect(m.isReadyToLaunch()).toBe(false);
    m.passGate('pen-test-clean');
    m.passGate('nps-gte-40');
    m.passGate('d30-gte-25');
    m.passGate('zero-p0-incidents');
    m.passGate('app-store-approved');
    expect(m.isReadyToLaunch()).toBe(true);
    const s = m.getStatus();
    expect(s.allHardGatesPassed).toBe(true);
    expect(s.gates).toHaveLength(5);
  });
  it('fail gate blocks launch', () => {
    const m = new LaunchChecklistManager();
    m.passGate('pen-test-clean');
    m.passGate('nps-gte-40');
    m.passGate('d30-gte-25');
    m.passGate('zero-p0-incidents');
    m.passGate('app-store-approved');
    m.failGate('pen-test-clean');
    expect(m.isReadyToLaunch()).toBe(false);
  });
  it('addGate works', () => {
    const m = new LaunchChecklistManager();
    m.addGate('custom', false);
    expect(m.getStatus().gates).toHaveLength(6);
  });
  it('supports templates', () => {
    const ios = new LaunchChecklistManager('ios');
    expect(ios.getStatus().gates).toHaveLength(5);
    expect(ios.getGate('app-store-approved')).not.toBeNull();
    const web = new LaunchChecklistManager('web');
    expect(web.getGate('ssl-configured')).not.toBeNull();
    expect(web.getGate('cdn-ready')).not.toBeNull();
  });
  it('gate dependencies block passing', () => {
    const m = new LaunchChecklistManager();
    m.addGate('deploy', true, ['pen-test-clean']);
    expect(m.passGate('deploy')).toBe(false);
    m.passGate('pen-test-clean');
    expect(m.passGate('deploy')).toBe(true);
  });
  it('deadline tracking detects overdue', () => {
    const m = new LaunchChecklistManager();
    m.setDeadline('pen-test-clean', Date.now() - 1000);
    expect(m.isOverdue('pen-test-clean')).toBe(true);
    expect(m.getOverdueGates()).toContain('pen-test-clean');
    m.passGate('pen-test-clean');
    expect(m.isOverdue('pen-test-clean')).toBe(false);
  });
});

describe('StatusPageService', () => {
  it('creates and resolves incidents', () => {
    const s = new StatusPageService();
    const inc = s.createIncident('DB down', 1);
    expect(inc.status).toBe('investigating');
    expect(s.getActiveIncidents()).toHaveLength(1);
    s.updateIncident(inc.id, 'identified');
    s.resolveIncident(inc.id);
    expect(s.getActiveIncidents()).toHaveLength(0);
  });
  it('calculates uptime', () => {
    const s = new StatusPageService();
    expect(s.calculateUptime(1000000, 500)).toBeCloseTo(99.95);
    expect(s.meetsTarget(99.95)).toBe(true);
    expect(s.meetsTarget(99.8)).toBe(false);
  });
});

describe('QuantCoach', () => {
  it('auto-answers matching FAQ', () => {
    const c = new QuantCoach();
    c.addFAQ('how to reset password', 'Go to settings > security');
    const t = c.askQuestion('u1', 'how to reset password');
    expect(t.confidence).toBeGreaterThanOrEqual(0.6);
    expect(t.escalated).toBe(false);
    expect(t.answer).toBe('Go to settings > security');
  });
  it('escalates low confidence', () => {
    const c = new QuantCoach();
    c.addFAQ('how to reset password', 'Go to settings');
    const t = c.askQuestion('u1', 'what is quantum physics');
    expect(t.escalated).toBe(true);
    expect(t.status).toBe('escalated');
    expect(c.getEscalated()).toHaveLength(1);
  });
  it('resolves ticket', () => {
    const c = new QuantCoach();
    c.addFAQ('help', 'yes');
    const t = c.askQuestion('u1', 'random question xyz');
    c.resolveTicket(t.id, 'Done');
    expect(c.getEscalated()).toHaveLength(0);
    expect(c.getOpenTickets()).toHaveLength(0);
  });
});

describe('AppStoreTracker', () => {
  it('submits and tracks status', () => {
    const a = new AppStoreTracker();
    a.submitApp('ios');
    expect(a.getStatus('ios')).toBe('submitted');
    a.updateStatus('ios', 'approved');
    expect(a.getStatus('ios')).toBe('approved');
  });
  it('tracks ratings', () => {
    const a = new AppStoreTracker();
    a.addRating('android', 5);
    a.addRating('android', 4);
    a.addRating('android', 5);
    expect(a.getAverageRating('android')).toBeCloseTo(4.67);
    expect(a.meetsRatingTarget('android')).toBe(true);
    expect(a.getReviewCount('android')).toBe(3);
  });
  it('fails rating target', () => {
    const a = new AppStoreTracker();
    a.addRating('ios', 3);
    a.addRating('ios', 4);
    expect(a.meetsRatingTarget('ios')).toBe(false);
  });
});

describe('SubmissionTracker', () => {
  it('follows valid state machine transitions', () => {
    const st = new SubmissionTracker();
    const sub = st.create('ios');
    expect(sub.status).toBe('draft');
    expect(st.transition(sub.id, 'submitted')).toBe(true);
    expect(st.transition(sub.id, 'in_review')).toBe(true);
    expect(st.transition(sub.id, 'approved')).toBe(true);
    expect(st.transition(sub.id, 'live')).toBe(true);
    expect(st.getSubmission(sub.id)?.status).toBe('live');
  });
  it('rejects invalid transitions', () => {
    const st = new SubmissionTracker();
    const sub = st.create('android');
    expect(st.transition(sub.id, 'approved')).toBe(false);
    expect(st.transition(sub.id, 'live')).toBe(false);
    st.transition(sub.id, 'submitted');
    expect(st.transition(sub.id, 'live')).toBe(false);
  });
  it('handles rejection and resubmission', () => {
    const st = new SubmissionTracker();
    const sub = st.create('ios');
    st.transition(sub.id, 'submitted');
    st.transition(sub.id, 'in_review');
    st.reject(sub.id, 'Missing privacy policy');
    expect(st.getSubmission(sub.id)?.rejectionReason).toBe('Missing privacy policy');
    st.resubmit(sub.id);
    expect(st.getSubmission(sub.id)?.status).toBe('draft');
    expect(st.getSubmission(sub.id)?.rejectionReason).toBeUndefined();
  });
});

describe('MarketingIntegration', () => {
  it('tracks visits and conversions for A/B variants', () => {
    const mi = new MarketingIntegration();
    const a = mi.createVariant('landing', 'A');
    const b = mi.createVariant('landing', 'B');
    for (let i = 0; i < 100; i++) mi.recordVisit(a.id);
    for (let i = 0; i < 10; i++) mi.recordConversion(a.id);
    for (let i = 0; i < 100; i++) mi.recordVisit(b.id);
    for (let i = 0; i < 20; i++) mi.recordConversion(b.id);
    expect(mi.getConversionRate(a.id)).toBeCloseTo(0.1);
    expect(mi.getConversionRate(b.id)).toBeCloseTo(0.2);
    const result = mi.compareVariants('landing');
    expect(result.winner).toBe('B');
    expect(result.variants).toHaveLength(2);
  });
});

describe('PressKitManager', () => {
  it('creates kits and manages releases', () => {
    const pk = new PressKitManager();
    const kit = pk.createKit('Quant', 'AI phone OS', ['logo.png'], ['ss1.png'], { users: 10000 });
    expect(pk.getKit(kit.id)?.appName).toBe('Quant');
    const release = pk.scheduleRelease('Launch Day', Date.now() + 60000);
    expect(pk.isUnderEmbargo(release.id)).toBe(true);
    expect(pk.publishRelease(release.id)).toBe(false);
  });
  it('tracks press coverage and reach', () => {
    const pk = new PressKitManager();
    pk.addCoverage('TechCrunch', 'Quant launches AI OS', 'http://tc.com/q', 0.9, 500000);
    pk.addCoverage('Verge', 'New phone OS', 'http://verge.com/q', 0.7, 300000);
    expect(pk.getCoverage()).toHaveLength(2);
    expect(pk.getTotalReach()).toBe(800000);
    expect(pk.getAverageSentiment()).toBeCloseTo(0.8);
    expect(pk.getCoverageByOutlet('TechCrunch')).toHaveLength(1);
  });
});

describe('LaunchMetrics', () => {
  it('tracks download velocity', () => {
    const lm = new LaunchMetrics();
    lm.recordDownloads(100);
    lm.recordDownloads(250);
    lm.recordDownloads(400);
    expect(lm.getDownloadVelocity()).toBe(150);
    expect(lm.getTotalDownloads()).toBe(750);
  });
  it('calculates crash-free rate and health targets', () => {
    const lm = new LaunchMetrics();
    for (let i = 0; i < 1000; i++) lm.recordSession(i < 3);
    expect(lm.getCrashFreeRate()).toBeCloseTo(99.7);
    lm.setStoreRanking(50);
    const health = lm.meetsHealthTargets();
    expect(health.crashFreeOk).toBe(true);
    expect(health.rankOk).toBe(true);
  });
  it('generates full report', () => {
    const lm = new LaunchMetrics();
    lm.recordDownloads(100);
    lm.recordRetention(0.8);
    lm.recordRevenue(500);
    lm.setAcquisitionCost(2.5);
    const report = lm.getReport();
    expect(report.downloads).toEqual([100]);
    expect(report.retention).toEqual([0.8]);
    expect(report.revenue).toEqual([500]);
    expect(report.acquisitionCost).toBe(2.5);
  });
});
