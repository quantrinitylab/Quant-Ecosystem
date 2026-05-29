import { VoiceFirstMode } from '../mode/voice-first-mode.js';
import { CommandRegistry } from '../commands/command-registry.js';
import { ElderMode } from '../elder/elder-mode.js';
import { WakeWordStateMachine } from '../wake-word/wake-word-state-machine.js';
import { PrivacyController } from '../privacy/privacy-controller.js';
import { PhoneFreeController } from '../phone-free/phone-free-controller.js';

describe('WakeWordStateMachine', () => {
  it('starts in idle state', () => {
    const ww = new WakeWordStateMachine();
    expect(ww.getState()).toBe('idle');
  });

  it('transitions to listening on high confidence trigger', () => {
    const ww = new WakeWordStateMachine();
    const result = ww.trigger(0.9);
    expect(result).toBe(true);
    expect(ww.getState()).toBe('listening');
  });

  it('rejects low confidence triggers', () => {
    const ww = new WakeWordStateMachine();
    const result = ww.trigger(0.3);
    expect(result).toBe(false);
    expect(ww.getState()).toBe('idle');
  });

  it('confirms and transitions to active', () => {
    const ww = new WakeWordStateMachine();
    ww.trigger(0.9);
    const confirmed = ww.confirm(0.85);
    expect(confirmed).toBe(true);
    expect(ww.getState()).toBe('active');
  });

  it('rejects confirm when not in listening state', () => {
    const ww = new WakeWordStateMachine();
    expect(ww.confirm(0.9)).toBe(false);
  });

  it('deactivates to cooldown', () => {
    const ww = new WakeWordStateMachine();
    ww.trigger(0.9);
    ww.confirm(0.9);
    ww.deactivate();
    expect(ww.getState()).toBe('cooldown');
  });

  it('marks false positive and enters cooldown', () => {
    const ww = new WakeWordStateMachine();
    ww.trigger(0.9);
    ww.markFalsePositive();
    expect(ww.getState()).toBe('cooldown');
  });

  it('tracks activation history', () => {
    const ww = new WakeWordStateMachine();
    ww.trigger(0.9);
    ww.confirm(0.9);
    const hist = ww.getHistory();
    expect(hist.length).toBeGreaterThan(0);
    expect(hist.some((h) => h.to === 'active')).toBe(true);
  });

  it('counts activations', () => {
    const ww = new WakeWordStateMachine();
    ww.trigger(0.9);
    ww.confirm(0.9);
    expect(ww.getActivationCount()).toBe(1);
  });

  it('allows custom confidence threshold', () => {
    const ww = new WakeWordStateMachine();
    ww.setConfidenceThreshold(0.95);
    expect(ww.trigger(0.9)).toBe(false);
    expect(ww.trigger(0.96)).toBe(true);
  });
});

describe('PrivacyController', () => {
  it('starts without consent', () => {
    const pc = new PrivacyController();
    expect(pc.hasConsent()).toBe(false);
  });

  it('grants and revokes consent', () => {
    const pc = new PrivacyController();
    pc.grantConsent();
    expect(pc.hasConsent()).toBe(true);
    pc.revokeConsent();
    expect(pc.hasConsent()).toBe(false);
  });

  it('blocks recording without consent', () => {
    const pc = new PrivacyController();
    expect(pc.startRecording()).toBe(false);
  });

  it('starts recording with consent and shows privacy lamp', () => {
    const pc = new PrivacyController();
    pc.grantConsent();
    expect(pc.startRecording()).toBe(true);
    expect(pc.isPrivacyLampOn()).toBe(true);
    pc.stopRecording();
    expect(pc.isPrivacyLampOn()).toBe(false);
  });

  it('manages mute zones', () => {
    const pc = new PrivacyController();
    pc.addMuteZone('bathroom');
    pc.addMuteZone('bedroom');
    expect(pc.getMuteZones()).toEqual(['bathroom', 'bedroom']);
    pc.removeMuteZone('bathroom');
    expect(pc.getMuteZones()).toEqual(['bedroom']);
  });

  it('blocks recording in mute zone', () => {
    const pc = new PrivacyController();
    pc.grantConsent();
    pc.addMuteZone('bathroom');
    pc.enterZone('bathroom');
    expect(pc.startRecording()).toBe(false);
    pc.leaveZone();
    expect(pc.startRecording()).toBe(true);
  });

  it('manages per-app permissions', () => {
    const pc = new PrivacyController();
    pc.grantConsent();
    pc.setAppPermission('spotify', true);
    pc.setAppPermission('sketchyapp', false);
    expect(pc.isAppAllowed('spotify')).toBe(true);
    expect(pc.isAppAllowed('sketchyapp')).toBe(false);
    expect(pc.isAppAllowed('unknown')).toBe(false);
  });

  it('app permission requires global consent', () => {
    const pc = new PrivacyController();
    pc.setAppPermission('spotify', true);
    expect(pc.isAppAllowed('spotify')).toBe(false);
    pc.grantConsent();
    expect(pc.isAppAllowed('spotify')).toBe(true);
  });
});

describe('PhoneFreeController', () => {
  it('starts inactive', () => {
    const pf = new PhoneFreeController();
    expect(pf.isActive()).toBe(false);
  });

  it('activates and deactivates', () => {
    const pf = new PhoneFreeController();
    pf.activate();
    expect(pf.isActive()).toBe(true);
    pf.deactivate();
    expect(pf.isActive()).toBe(false);
  });

  it('filters commands when active', () => {
    const pf = new PhoneFreeController();
    pf.setAllowedCommands(['call', 'play music', 'navigate']);
    pf.activate();
    expect(pf.isCommandAllowed('call')).toBe(true);
    expect(pf.isCommandAllowed('take photo')).toBe(false);
  });

  it('allows all commands when inactive', () => {
    const pf = new PhoneFreeController();
    pf.setAllowedCommands(['call']);
    expect(pf.isCommandAllowed('anything')).toBe(true);
  });

  it('routes audio output', () => {
    const pf = new PhoneFreeController();
    pf.setAudioOutput('bluetooth');
    expect(pf.getAudioOutput()).toBe('bluetooth');
    pf.setAudioOutput('watch');
    expect(pf.getAudioOutput()).toBe('watch');
  });

  it('tracks session duration', () => {
    const pf = new PhoneFreeController();
    pf.activate();
    expect(pf.getSessionDuration()).toBeGreaterThanOrEqual(0);
  });

  it('detects session timeout', () => {
    const pf = new PhoneFreeController();
    pf.setSessionTimeout(0);
    pf.activate();
    expect(pf.isSessionExpired()).toBe(true);
  });

  it('enables and checks voice-only session', () => {
    const pf = new PhoneFreeController();
    expect(pf.isVoiceOnlySession()).toBe(false);
    pf.enableVoiceOnlySession({ briefOnStart: true });
    expect(pf.isVoiceOnlySession()).toBe(true);
    expect(pf.isActive()).toBe(true);
  });

  it('returns proactive brief when enabled', () => {
    const pf = new PhoneFreeController();
    pf.enableVoiceOnlySession({ briefOnStart: true });
    const brief = pf.getProactiveBrief();
    expect(brief.available).toBe(true);
    expect(brief.sections.length).toBeGreaterThan(0);
  });

  it('handles continuity handoff', () => {
    const pf = new PhoneFreeController();
    pf.activate();
    const result = pf.handleContinuity('watch-1');
    expect(result.success).toBe(true);
    expect(result.sessionTransferred).toBe(true);
    expect(result.targetDevice).toBe('watch-1');
  });

  it('tracks session summary with commands and apps', () => {
    const pf = new PhoneFreeController();
    pf.activate();
    pf.getContextualResponse('calendar', 'meetings');
    pf.getContextualResponse('mail', 'inbox');
    pf.getContextualResponse('calendar', 'tomorrow');
    const summary = pf.getSessionSummary();
    expect(summary.commandsExecuted).toBe(3);
    expect(summary.appsUsed).toContain('calendar');
    expect(summary.appsUsed).toContain('mail');
    expect(summary.duration).toBeGreaterThanOrEqual(0);
  });
});

describe('CommandRegistry', () => {
  it('has 100 commands across 10 categories', () => {
    const r = new CommandRegistry();
    expect(r.getCoverage()).toEqual({ total: 100, categories: 10 });
  });

  it('finds commands by category', () => {
    const r = new CommandRegistry();
    expect(r.getByCategory('communication').length).toBe(10);
  });

  it('executes existing command', () => {
    const r = new CommandRegistry();
    expect(r.execute('call mom')).toBe('cmd-0-0');
  });

  it('returns null for unknown command', () => {
    const r = new CommandRegistry();
    expect(r.execute('fly to moon')).toBeNull();
  });

  it('resolves aliases', () => {
    const r = new CommandRegistry();
    r.addAlias('phone mom', 'call mom');
    expect(r.execute('phone mom')).toBe('cmd-0-0');
  });

  it('fuzzy matches mis-heard commands', () => {
    const r = new CommandRegistry();
    const match = r.fuzzyMatch('cal mom'); // one char off from 'call mom'
    expect(match).not.toBeNull();
    expect(match!.phrase).toBe('call mom');
  });

  it('returns null for distant fuzzy matches', () => {
    const r = new CommandRegistry();
    const match = r.fuzzyMatch('xyzabcdefgh', 2);
    expect(match).toBeNull();
  });

  it('tracks command history', () => {
    const r = new CommandRegistry();
    r.execute('call mom');
    r.execute('play music');
    expect(r.getHistory()).toHaveLength(2);
  });

  it('supports undo of last command', () => {
    const r = new CommandRegistry();
    r.execute('call mom');
    const undone = r.undo();
    expect(undone).not.toBeNull();
    expect(undone!.commandId).toBe('cmd-0-0');
    expect(r.getHistory()).toHaveLength(0);
  });

  it('filters by context', () => {
    const r = new CommandRegistry();
    r.registerCommand({
      id: 'drive-1',
      phrase: 'next turn',
      category: 'navigation',
      handler: 'h',
      contexts: ['driving'],
    });
    r.setContextFilter('home');
    expect(r.execute('next turn')).toBeNull();
    r.setContextFilter('driving');
    expect(r.execute('next turn')).toBe('drive-1');
  });
});

describe('VoiceFirstMode', () => {
  it('enables and disables', () => {
    const m = new VoiceFirstMode();
    expect(m.isEnabled()).toBe(false);
    m.enable();
    expect(m.isEnabled()).toBe(true);
  });

  it('routes interactions based on state', () => {
    const m = new VoiceFirstMode();
    expect(m.routeInteraction('hi')).toBe('standard');
    m.enable();
    expect(m.routeInteraction('hi')).toBe('voice');
  });

  it('activates from lock screen', () => {
    const m = new VoiceFirstMode();
    expect(m.activateFromLockScreen()).toBe(true);
    expect(m.isEnabled()).toBe(true);
  });

  it('manages ambient context with transitions', () => {
    const m = new VoiceFirstMode();
    m.setAmbientContext({ type: 'driving', confidence: 0.9 });
    expect(m.getAmbientContext()?.type).toBe('driving');
    m.setAmbientContext({ type: 'home', confidence: 0.95 });
    expect(m.getContextTransitions()).toHaveLength(2);
  });

  it('manages DND mode', () => {
    const m = new VoiceFirstMode();
    expect(m.isDNDEnabled()).toBe(false);
    m.setDND(true);
    expect(m.isDNDEnabled()).toBe(true);
  });

  it('routes notifications with DND', () => {
    const m = new VoiceFirstMode();
    m.setNotificationRule('critical', 'read');
    m.setNotificationRule('normal', 'vibrate');
    m.setDND(true);
    expect(m.routeNotification('critical')).toBe('read');
    expect(m.routeNotification('normal')).toBe('silent');
  });

  it('manages feedback level', () => {
    const m = new VoiceFirstMode();
    m.setFeedbackLevel('silent');
    expect(m.getFeedbackLevel()).toBe('silent');
    const result = m.handleNotification({ id: '1', action: 'read', payload: 'test' });
    expect(result).toBe('suppressed');
  });
});

describe('ElderMode', () => {
  it('enables and disables', () => {
    const e = new ElderMode();
    e.enable({
      enabled: true,
      fontSize: 'xlarge',
      emergencyContact: '911',
      familyRemoteEnabled: false,
    });
    expect(e.isEnabled()).toBe(true);
    e.disable();
    expect(e.isEnabled()).toBe(false);
  });

  it('triggers emergency contact', () => {
    const e = new ElderMode();
    e.enable({
      enabled: true,
      fontSize: 'xlarge',
      emergencyContact: '911',
      familyRemoteEnabled: false,
    });
    expect(e.triggerEmergency()).toBe('911');
  });

  it('provides fallback UI', () => {
    const e = new ElderMode();
    e.enable({
      enabled: true,
      fontSize: 'xlarge',
      emergencyContact: '911',
      familyRemoteEnabled: false,
    });
    expect(e.getFallbackUI()).toEqual({ mode: 'large-buttons', fontSize: 'xlarge' });
  });

  it('manages medication reminders', () => {
    const e = new ElderMode();
    e.enable({
      enabled: true,
      fontSize: 'large',
      emergencyContact: '911',
      familyRemoteEnabled: true,
    });
    const id = e.addMedication('Aspirin', '08:00');
    expect(e.getMedications()).toHaveLength(1);
    expect(e.getDueMedications('08:00')).toHaveLength(1);
    e.takeMedication(id);
    expect(e.getDueMedications('08:00')).toHaveLength(0);
  });

  it('resets medications daily', () => {
    const e = new ElderMode();
    e.enable({
      enabled: true,
      fontSize: 'large',
      emergencyContact: '911',
      familyRemoteEnabled: true,
    });
    const id = e.addMedication('Vitamin D', '09:00');
    e.takeMedication(id);
    e.resetMedications();
    expect(e.getDueMedications('09:00')).toHaveLength(1);
  });

  it('records daily check-ins', () => {
    const e = new ElderMode();
    e.enable({
      enabled: true,
      fontSize: 'large',
      emergencyContact: '911',
      familyRemoteEnabled: true,
    });
    e.dailyCheckIn('good', 'Feeling fine today');
    expect(e.getCheckIns()).toHaveLength(1);
    expect(e.getCheckIns()[0]!.mood).toBe('good');
  });

  it('manages simplified commands', () => {
    const e = new ElderMode();
    expect(e.isSimplifiedCommand('call mom')).toBe(true);
    expect(e.isSimplifiedCommand('configure network settings')).toBe(false);
  });

  it('logs family activity', () => {
    const e = new ElderMode();
    e.enable({
      enabled: true,
      fontSize: 'large',
      emergencyContact: '911',
      familyRemoteEnabled: true,
    });
    e.addMedication('Pills', '10:00');
    e.dailyCheckIn('ok', '');
    const log = e.getFamilyLog();
    expect(log.length).toBeGreaterThanOrEqual(2);
  });
});
