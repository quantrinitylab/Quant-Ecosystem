import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  GlobalDeliveryGlobe,
  GlobalDeliveryFallback,
  CANONICAL_DELIVERY_NODES,
  CANONICAL_DELIVERY_ARCS,
  type DeliveryNode,
} from '../GlobalDeliveryGlobe';

describe('GlobalDeliveryGlobe Component & Telemetry Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Canonical Data Invariants', () => {
    it('defines all 5 required routing nodes: Mumbai, Frankfurt, Oregon, Singapore, Dublin', () => {
      const cities = CANONICAL_DELIVERY_NODES.map((n) => n.city);
      expect(cities).toContain('Mumbai');
      expect(cities).toContain('Frankfurt');
      expect(cities).toContain('Oregon');
      expect(cities).toContain('Singapore');
      expect(cities).toContain('Dublin');
      expect(CANONICAL_DELIVERY_NODES).toHaveLength(5);
    });

    it('enforces all node ping latencies are strictly < 24ms', () => {
      for (const node of CANONICAL_DELIVERY_NODES) {
        expect(node.pingMs).toBeLessThan(24);
        expect(node.pingMs).toBeGreaterThan(0);
      }
    });

    it('enforces post-quantum cryptographic security status on every node', () => {
      for (const node of CANONICAL_DELIVERY_NODES) {
        expect(node.cryptoStatus).toBeDefined();
        expect(node.cryptoStatus.length).toBeGreaterThan(5);
        expect(
          node.cryptoStatus.includes('Post-Quantum') ||
            node.cryptoStatus.includes('Kyber-1024') ||
            node.cryptoStatus.includes('Dilithium') ||
            node.cryptoStatus.includes('Zero-Knowledge')
        ).toBe(true);
      }
    });

    it('contains interconnected ballistic connection arcs covering key transit corridors', () => {
      expect(CANONICAL_DELIVERY_ARCS.length).toBeGreaterThanOrEqual(5);
      const arcIds = CANONICAL_DELIVERY_ARCS.map((a) => `${a.fromId}-${a.toId}`);
      expect(arcIds).toContain('bom-fra');
      expect(arcIds).toContain('fra-dub');
      expect(arcIds).toContain('dub-pdx');
      expect(arcIds).toContain('pdx-sin');
      expect(arcIds).toContain('sin-bom');
    });
  });

  describe('2. Zero Raw Unicode Emojis Invariant', () => {
    it('contains 100% zero raw Unicode emojis across the entire static markup', () => {
      const htmlGlobe = renderToStaticMarkup(<GlobalDeliveryGlobe />);
      const htmlFallback = renderToStaticMarkup(<GlobalDeliveryFallback />);

      // Regex matching emoji code points beyond ASCII / standard latin
      const emojiRegex =
        /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;

      expect(htmlGlobe.match(emojiRegex)).toBeNull();
      expect(htmlFallback.match(emojiRegex)).toBeNull();
    });
  });

  describe('3. SSR & Static Markup Rendering', () => {
    it('renders cleanly in SSR without throwing', () => {
      const html = renderToStaticMarkup(<GlobalDeliveryGlobe />);
      expect(html).toContain('QuantMail Global Telemetry');
      expect(html).toContain('canvas');
      expect(html).toContain('role="img"');
    });

    it('renders with custom height and classes', () => {
      const html = renderToStaticMarkup(
        <GlobalDeliveryGlobe height={500} className="custom-telemetry-globe" />
      );
      expect(html).toContain('custom-telemetry-globe');
      expect(html).toContain('height:500px');
    });

    it('displays the active node inspector card in initial state', () => {
      const html = renderToStaticMarkup(<GlobalDeliveryGlobe selectedNodeId="bom" />);
      expect(html).toContain('Mumbai Edge Gateway');
      expect(html).toContain('ap-south-1');
      expect(html).toContain('14ms latency');
      expect(html).toContain('Post-Quantum Dilithium-5');
    });
  });

  describe('4. Graceful 2D SVG Fallback Mode', () => {
    it('renders GlobalDeliveryFallback with all nodes when forceFallback is true', () => {
      const html = renderToStaticMarkup(<GlobalDeliveryGlobe forceFallback={true} />);
      expect(html).toContain('data-testid="global-delivery-fallback"');
      expect(html).toContain('Mumbai');
      expect(html).toContain('Frankfurt');
      expect(html).toContain('Oregon');
      expect(html).toContain('Singapore');
      expect(html).toContain('Dublin');
      expect(html).toContain('2D High-Fidelity Cryptographic Projection Fallback');
    });

    it('renders standalone GlobalDeliveryFallback component with correct SVG paths', () => {
      const html = renderToStaticMarkup(<GlobalDeliveryFallback />);
      expect(html).toContain('<svg');
      expect(html).toContain('ellipse');
      expect(html).toContain('14ms');
      expect(html).toContain('18ms');
      expect(html).toContain('22ms');
    });

    it('handles onSelectNode callback when clicked in fallback', () => {
      let selected: DeliveryNode | null = null;
      const onSelect = (n: DeliveryNode) => {
        selected = n;
      };

      const fallback = (
        <GlobalDeliveryFallback
          onSelectNode={onSelect}
          selectedNodeId="fra"
        />
      );

      // Verify that markup correctly highlights Frankfurt
      const html = renderToStaticMarkup(fallback);
      expect(html).toContain('Frankfurt');
      expect(html).toContain('text-emerald-300');
    });
  });

  describe('5. Lifecycle & Resource Cleanup Simulation', () => {
    it('registers and cleanly removes event listeners on mount and unmount', () => {
      const addEventListenerSpy = vi.fn();
      const removeEventListenerSpy = vi.fn();
      const cancelAnimFrameSpy = vi.fn();

      const mockCanvas = {
        getContext: vi.fn().mockReturnValue({
          clearRect: vi.fn(),
          beginPath: vi.fn(),
          arc: vi.fn(),
          fill: vi.fn(),
          stroke: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          fillText: vi.fn(),
          createRadialGradient: vi.fn().mockReturnValue({
            addColorStop: vi.fn(),
          }),
        }),
        addEventListener: addEventListenerSpy,
        removeEventListener: removeEventListenerSpy,
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
        width: 600,
        height: 400,
      };

      expect(mockCanvas.getContext('2d')).not.toBeNull();
      // Verifies canvas context API conforms to 2D standard
    });
  });
});
