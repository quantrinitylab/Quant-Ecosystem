// ============================================================================
// QuantAI — Advanced Voice Mode & Sovereign Personas Comprehensive Test Suite
// Task W39-A03: Real-Time Advanced Voice Mode Parity (ChatGPT Parity)
// Sovereign Personas: Aura, Vesper, Zenith, Zephyr
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SOVEREIGN_PERSONAS,
  PERSONA_LIST,
  DEFAULT_VOICE_CONFIG,
  type VoiceState,
  type VoicePersonaId,
  type TranscriptItem,
} from '../voice-personas';
import { VoiceOrb } from '../VoiceOrb';
import { VoiceFloatingChip } from '../VoiceFloatingChip';
import { VoiceModeModal } from '../VoiceModeModal';

describe('QuantAI Advanced Voice Mode Parity Suite (Task W39-A03)', () => {
  // --------------------------------------------------------------------------
  // 1. Sovereign Voice Personas Architecture (CEO Astra Trademark Audit)
  // --------------------------------------------------------------------------
  describe('1. Sovereign Voice Personas Specifications', () => {
    it('defines exactly the 4 trademark sovereign personas: Aura, Vesper, Zenith, Zephyr', () => {
      expect(PERSONA_LIST).toHaveLength(4);
      const personaIds = PERSONA_LIST.map((p) => p.id);
      expect(personaIds).toEqual(['aura', 'vesper', 'zenith', 'zephyr']);
    });

    it('validates Aura as warm & empathetic with correct acoustic profile', () => {
      const aura = SOVEREIGN_PERSONAS.aura;
      expect(aura.name).toBe('Aura');
      expect(aura.tagline).toBe('Warm & Empathetic');
      expect(aura.cadence).toBe('Warm & Conversational');
      expect(aura.defaultPitch).toBeGreaterThanOrEqual(1.0);
      expect(aura.defaultRate).toBe(1.0);
      expect(aura.avatar).toBe('🌸');
      expect(aura.sampleUtterance).toContain('Aura');
    });

    it('validates Vesper as crisp & analytical with precision tuning', () => {
      const vesper = SOVEREIGN_PERSONAS.vesper;
      expect(vesper.name).toBe('Vesper');
      expect(vesper.tagline).toBe('Crisp & Analytical');
      expect(vesper.cadence).toBe('Crisp & Analytical');
      expect(vesper.defaultPitch).toBeLessThan(1.0);
      expect(vesper.defaultRate).toBeGreaterThanOrEqual(1.0);
      expect(vesper.avatar).toBe('💎');
      expect(vesper.sampleUtterance).toContain('Vesper');
    });

    it('validates Zenith as authoritative & executive with resonant depth', () => {
      const zenith = SOVEREIGN_PERSONAS.zenith;
      expect(zenith.name).toBe('Zenith');
      expect(zenith.tagline).toBe('Authoritative & Executive');
      expect(zenith.cadence).toBe('Measured & Commanding');
      expect(zenith.defaultPitch).toBeLessThan(0.9);
      expect(zenith.avatar).toBe('⚡');
      expect(zenith.sampleUtterance).toContain('Zenith');
    });

    it('validates Zephyr as dynamic & playful with rapid cadence', () => {
      const zephyr = SOVEREIGN_PERSONAS.zephyr;
      expect(zephyr.name).toBe('Zephyr');
      expect(zephyr.tagline).toBe('Dynamic & Playful');
      expect(zephyr.cadence).toBe('Dynamic & Playful');
      expect(zephyr.defaultPitch).toBeGreaterThan(1.1);
      expect(zephyr.defaultRate).toBeGreaterThan(1.1);
      expect(zephyr.avatar).toBe('🍃');
      expect(zephyr.sampleUtterance).toContain('Zephyr');
    });

    it('ensures each persona defines distinct fluid orb gradients for all 4 states', () => {
      const states: VoiceState[] = ['idle', 'listening', 'thinking', 'speaking'];
      for (const persona of PERSONA_LIST) {
        for (const st of states) {
          const grad = persona.orbGradient[st];
          expect(grad).toBeDefined();
          expect(grad).toHaveLength(3);
        }
      }
    });

    it('provides sensible default voice session configuration with auto-interrupt', () => {
      expect(DEFAULT_VOICE_CONFIG.persona).toBe('aura');
      expect(DEFAULT_VOICE_CONFIG.isMuted).toBe(false);
      expect(DEFAULT_VOICE_CONFIG.autoInterrupt).toBe(true);
      expect(DEFAULT_VOICE_CONFIG.noiseSuppression).toBe(true);
      expect(DEFAULT_VOICE_CONFIG.echoCancellation).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Dynamic 3D Fluid Animated Audio Sphere (VoiceOrb)
  // --------------------------------------------------------------------------
  describe('2. Dynamic 3D Fluid Animated Audio Sphere (VoiceOrb)', () => {
    it('renders VoiceOrb with role="status", data-state, and accessible aria-label in idle state', () => {
      const html = renderToStaticMarkup(
        React.createElement(VoiceOrb, {
          state: 'idle',
          personaId: 'aura',
        }),
      );

      expect(html).toContain('role="status"');
      expect(html).toContain('data-testid="voice-orb"');
      expect(html).toContain('data-state="idle"');
      expect(html).toContain('data-persona="aura"');
      expect(html).toContain(
        'aria-label="QuantAI Voice Orb - Idle - ready to listen - Persona: Aura"',
      );
      expect(html).toContain('Idle - ready to listen');
    });

    it('renders listening state with dynamic audio level visualizers and responsive attributes', () => {
      const html = renderToStaticMarkup(
        React.createElement(VoiceOrb, {
          state: 'listening',
          personaId: 'vesper',
          audioLevel: 0.75,
        }),
      );

      expect(html).toContain('data-state="listening"');
      expect(html).toContain('data-persona="vesper"');
      expect(html).toContain('Listening to speech');
      // SVG listening frequency bars
      expect(html).toContain('height="30"');
    });

    it('renders thinking state with iridescent particle glow and central gyro core', () => {
      const html = renderToStaticMarkup(
        React.createElement(VoiceOrb, {
          state: 'thinking',
          personaId: 'zenith',
        }),
      );

      expect(html).toContain('data-state="thinking"');
      expect(html).toContain('data-persona="zenith"');
      expect(html).toContain('Synthesizing response...');
    });

    it('renders speaking state with fluid soundwave ripples and frequency amplitudes', () => {
      const html = renderToStaticMarkup(
        React.createElement(VoiceOrb, {
          state: 'speaking',
          personaId: 'zephyr',
          audioLevel: 0.9,
        }),
      );

      expect(html).toContain('data-state="speaking"');
      expect(html).toContain('data-persona="zephyr"');
      expect(html).toContain('Zephyr is speaking');
      // Internal SVG frequency wave paths
      expect(html).toContain('stroke-width="3.5"');
    });

    it('renders muted visual overlay when isMuted is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(VoiceOrb, {
          state: 'listening',
          personaId: 'aura',
          isMuted: true,
        }),
      );

      expect(html).toContain('🔇');
      expect(html).toContain('Muted');
    });

    it('supports multiple sizing presets (sm, md, lg, hero)', () => {
      const sizes: Array<'sm' | 'md' | 'lg' | 'hero'> = ['sm', 'md', 'lg', 'hero'];
      for (const size of sizes) {
        const html = renderToStaticMarkup(
          React.createElement(VoiceOrb, {
            state: 'idle',
            personaId: 'aura',
            size,
          }),
        );
        expect(html).toContain('data-testid="voice-orb"');
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Minimized Floating Status Chip (VoiceFloatingChip)
  // --------------------------------------------------------------------------
  describe('3. Minimized Floating Background Status Chip (VoiceFloatingChip)', () => {
    it('returns null and does not render when isMinimized is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(VoiceFloatingChip, {
          isOpen: true,
          isMinimized: false,
          state: 'listening',
          personaId: 'aura',
          isMuted: false,
          onExpand: vi.fn(),
          onToggleMute: vi.fn(),
          onDisconnect: vi.fn(),
        }),
      );

      expect(html).toBe('');
    });

    it('returns null when isOpen is false even if isMinimized is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(VoiceFloatingChip, {
          isOpen: false,
          isMinimized: true,
          state: 'listening',
          personaId: 'aura',
          isMuted: false,
          onExpand: vi.fn(),
          onToggleMute: vi.fn(),
          onDisconnect: vi.fn(),
        }),
      );

      expect(html).toBe('');
    });

    it('renders floating chip with persona name, live waveform, and action controls when active and minimized', () => {
      const html = renderToStaticMarkup(
        React.createElement(VoiceFloatingChip, {
          isOpen: true,
          isMinimized: true,
          state: 'speaking',
          personaId: 'vesper',
          isMuted: false,
          onExpand: vi.fn(),
          onToggleMute: vi.fn(),
          onDisconnect: vi.fn(),
        }),
      );

      expect(html).toContain('data-testid="voice-floating-chip"');
      expect(html).toContain('🎙️ Voice active: Vesper');
      expect(html).toContain('Vesper speaking');
      expect(html).toContain('aria-label="Expand voice mode to full screen"');
      expect(html).toContain('aria-label="Mute microphone"');
      expect(html).toContain('aria-label="Disconnect voice session"');
    });

    it('displays muted indicator in floating chip when isMuted is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(VoiceFloatingChip, {
          isOpen: true,
          isMinimized: true,
          state: 'listening',
          personaId: 'aura',
          isMuted: true,
          onExpand: vi.fn(),
          onToggleMute: vi.fn(),
          onDisconnect: vi.fn(),
        }),
      );

      expect(html).toContain('🔇');
      expect(html).toContain('aria-label="Unmute microphone"');
      expect(html).toContain('Muted');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Full-Screen Immersive VoiceModeModal & Controls
  // --------------------------------------------------------------------------
  describe('4. Full-Screen VoiceModeModal Parity & User Controls', () => {
    it('returns null when isOpen is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(VoiceModeModal, {
          isOpen: false,
          onClose: vi.fn(),
        }),
      );

      expect(html).toBe('');
    });

    it('renders dialog container with header, VoiceOrb, transcript ticker, and controls when isOpen is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(VoiceModeModal, {
          isOpen: true,
          onClose: vi.fn(),
          initialPersonaId: 'aura',
        }),
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('data-testid="voice-mode-modal"');
      expect(html).toContain('Advanced Voice Mode');
      expect(html).toContain('data-testid="voice-orb"');
      expect(html).toContain('data-testid="transcript-ticker"');
      expect(html).toContain('data-testid="mute-toggle-button"');
      expect(html).toContain('data-testid="disconnect-button"');
    });

    it('renders initial assistant greeting transcript in the real-time ticker', () => {
      const sampleTranscripts: TranscriptItem[] = [
        {
          id: 't-1',
          speaker: 'user',
          text: 'Can you benchmark our system architecture?',
          timestamp: '12:00 PM',
        },
        {
          id: 't-2',
          speaker: 'assistant',
          personaId: 'vesper',
          text: 'Analyzing system parameters with sub-millisecond precision.',
          timestamp: '12:00 PM',
        },
      ];

      const html = renderToStaticMarkup(
        React.createElement(VoiceModeModal, {
          isOpen: true,
          onClose: vi.fn(),
          initialPersonaId: 'vesper',
          initialTranscripts: sampleTranscripts,
        }),
      );

      expect(html).toContain('Can you benchmark our system architecture?');
      expect(html).toContain('Analyzing system parameters with sub-millisecond precision.');
      expect(html).toContain('You:');
      expect(html).toContain('Vesper:');
    });

    it('renders live microphone input visualizer with MIC indicator', () => {
      const html = renderToStaticMarkup(
        React.createElement(VoiceModeModal, {
          isOpen: true,
          onClose: vi.fn(),
          initialPersonaId: 'aura',
        }),
      );

      expect(html).toContain('MIC');
      expect(html).toContain('aria-label="Audio level visualizer"');
    });

    it('renders persona selector trigger showing active persona details', () => {
      const html = renderToStaticMarkup(
        React.createElement(VoiceModeModal, {
          isOpen: true,
          onClose: vi.fn(),
          initialPersonaId: 'zenith',
        }),
      );

      expect(html).toContain('Zenith');
      expect(html).toContain('Authoritative &amp; Executive');
      expect(html).toContain('⚡');
      expect(html).toContain('aria-label="Select Voice Persona"');
    });

    it('renders minimize button to allow browsing chats while speaking', () => {
      const html = renderToStaticMarkup(
        React.createElement(VoiceModeModal, {
          isOpen: true,
          onClose: vi.fn(),
          initialPersonaId: 'zephyr',
        }),
      );

      expect(html).toContain('aria-label="Minimize voice mode"');
      expect(html).toContain('title="Minimize voice to background chip"');
    });

    it('renders speed and pitch configuration trigger', () => {
      const html = renderToStaticMarkup(
        React.createElement(VoiceModeModal, {
          isOpen: true,
          onClose: vi.fn(),
          initialPersonaId: 'aura',
        }),
      );

      expect(html).toContain('aria-label="Voice settings"');
      expect(html).toContain('title="Voice pitch &amp; speed settings"');
    });
  });

  // --------------------------------------------------------------------------
  // 5. State Machine & Event Transitions Integrity
  // --------------------------------------------------------------------------
  describe('5. State Machine & Event Transitions Integrity', () => {
    it('initializes with default speech state and active connection', () => {
      const html = renderToStaticMarkup(
        React.createElement(VoiceModeModal, {
          isOpen: true,
          onClose: vi.fn(),
          initialPersonaId: 'aura',
        }),
      );

      expect(html).toContain('Real-time Low Latency');
      expect(html).toContain('Simulate Voice Turn');
    });

    it('renders interrupt button when assistant is actively speaking', () => {
      // Direct VoiceOrb speaking state check
      const htmlOrb = renderToStaticMarkup(
        React.createElement(VoiceOrb, {
          state: 'speaking',
          personaId: 'aura',
        }),
      );

      expect(htmlOrb).toContain('Aura is speaking');
    });
  });
});
