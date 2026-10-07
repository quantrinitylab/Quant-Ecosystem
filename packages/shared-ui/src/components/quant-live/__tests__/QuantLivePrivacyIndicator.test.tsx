// @vitest-environment jsdom
// ============================================================================
// QuantLivePrivacyIndicator Component Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuantLivePrivacyIndicator } from '../QuantLivePrivacyIndicator';

describe('QuantLivePrivacyIndicator', () => {
  it('shows Mic on text when micActive=true', () => {
    render(
      <QuantLivePrivacyIndicator micActive={true} cameraActive={false} screenSharing={false} />,
    );
    expect(screen.getByText('Mic on')).toBeDefined();
  });

  it('shows Camera on text when cameraActive=true', () => {
    render(
      <QuantLivePrivacyIndicator micActive={false} cameraActive={true} screenSharing={false} />,
    );
    expect(screen.getByText('Camera on')).toBeDefined();
  });

  it('shows Screen shared text when screenSharing=true', () => {
    render(
      <QuantLivePrivacyIndicator micActive={false} cameraActive={false} screenSharing={true} />,
    );
    expect(screen.getByText('Screen shared')).toBeDefined();
  });

  it('does not render when all props are false', () => {
    const { container } = render(
      <QuantLivePrivacyIndicator micActive={false} cameraActive={false} screenSharing={false} />,
    );
    expect(container.firstElementChild).toBeNull();
  });

  it('shows multiple indicators when multiple are active', () => {
    render(<QuantLivePrivacyIndicator micActive={true} cameraActive={true} screenSharing={true} />);
    expect(screen.getByText('Mic on')).toBeDefined();
    expect(screen.getByText('Camera on')).toBeDefined();
    expect(screen.getByText('Screen shared')).toBeDefined();
  });

  it('has z-[9999] class for always-on-top', () => {
    render(
      <QuantLivePrivacyIndicator micActive={true} cameraActive={false} screenSharing={false} />,
    );
    const indicator = screen.getByRole('status');
    expect(indicator.className).toContain('z-[9999]');
  });

  it('has fixed positioning class', () => {
    render(
      <QuantLivePrivacyIndicator micActive={true} cameraActive={false} screenSharing={false} />,
    );
    const indicator = screen.getByRole('status');
    expect(indicator.className).toContain('fixed');
  });

  it('has role=status and appropriate aria-label', () => {
    render(
      <QuantLivePrivacyIndicator micActive={true} cameraActive={false} screenSharing={false} />,
    );
    const indicator = screen.getByRole('status');
    expect(indicator.getAttribute('aria-label')).toBe('Privacy indicators');
  });
});
