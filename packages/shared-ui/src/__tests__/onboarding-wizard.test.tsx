// @vitest-environment jsdom
// ============================================================================
// Shared UI - FullOnboardingWizard Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FullOnboardingWizard } from '../components/Onboarding/FullOnboardingWizard';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, exit, transition, custom, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  },
}));

describe('FullOnboardingWizard', () => {
  const mockOnComplete = vi.fn();
  const mockOnSkip = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the wizard with the first step', () => {
    render(<FullOnboardingWizard onComplete={mockOnComplete} />);
    expect(screen.getByRole('form', { name: /onboarding wizard/i })).toBeDefined();
    expect(screen.getByText('Welcome to Quant')).toBeDefined();
    expect(screen.getByText(/Step 1 of 5/)).toBeDefined();
  });

  it('shows progress bar with correct aria attributes', () => {
    render(<FullOnboardingWizard onComplete={mockOnComplete} />);
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toBeDefined();
    expect(progressbar.getAttribute('aria-valuenow')).toBe('1');
    expect(progressbar.getAttribute('aria-valuemax')).toBe('5');
  });

  it('navigates to the next step when Next is clicked', () => {
    render(<FullOnboardingWizard onComplete={mockOnComplete} />);
    fireEvent.click(screen.getByLabelText('Next step'));
    expect(screen.getByText(/Step 2 of 5/)).toBeDefined();
    expect(screen.getByText('Set up your workspace')).toBeDefined();
  });

  it('navigates back when Back is clicked', () => {
    render(<FullOnboardingWizard onComplete={mockOnComplete} initialStep={1} />);
    expect(screen.getByText(/Step 2 of 5/)).toBeDefined();
    fireEvent.click(screen.getByLabelText('Previous step'));
    expect(screen.getByText(/Step 1 of 5/)).toBeDefined();
  });

  it('disables Back button on first step', () => {
    render(<FullOnboardingWizard onComplete={mockOnComplete} />);
    const backBtn = screen.getByLabelText('Previous step');
    expect(backBtn.hasAttribute('disabled')).toBe(true);
  });

  it('shows Skip button when onSkip is provided', () => {
    render(<FullOnboardingWizard onComplete={mockOnComplete} onSkip={mockOnSkip} />);
    const skipBtn = screen.getByLabelText('Skip onboarding');
    expect(skipBtn).toBeDefined();
    fireEvent.click(skipBtn);
    expect(mockOnSkip).toHaveBeenCalledTimes(1);
  });

  it('does not show Skip button when onSkip is not provided', () => {
    render(<FullOnboardingWizard onComplete={mockOnComplete} />);
    expect(screen.queryByLabelText('Skip onboarding')).toBeNull();
  });

  it('shows Get Started button on the last step', () => {
    render(<FullOnboardingWizard onComplete={mockOnComplete} initialStep={4} />);
    expect(screen.getByLabelText('Complete onboarding')).toBeDefined();
    expect(screen.getByText('Get Started')).toBeDefined();
  });

  it('calls onComplete with wizard data on completion', () => {
    render(<FullOnboardingWizard onComplete={mockOnComplete} initialStep={4} />);
    fireEvent.click(screen.getByLabelText('Complete onboarding'));
    expect(mockOnComplete).toHaveBeenCalledTimes(1);
    expect(mockOnComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '',
        workspaceName: '',
        connectedApps: [],
        personality: 'professional',
      }),
    );
  });

  it('navigates through all steps sequentially', () => {
    render(<FullOnboardingWizard onComplete={mockOnComplete} />);
    // Step 1 - Welcome
    expect(screen.getByText('Welcome to Quant')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Next step'));
    // Step 2 - Workspace
    expect(screen.getByText('Set up your workspace')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Next step'));
    // Step 3 - Connect Apps
    expect(screen.getByText('Connect your apps')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Next step'));
    // Step 4 - AI Preferences
    expect(screen.getByText('AI Preferences')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Next step'));
    // Step 5 - Tour
    expect(screen.getByText('Explore Your Apps')).toBeDefined();
  });

  it('renders the AppTourStep on step 5', () => {
    render(<FullOnboardingWizard onComplete={mockOnComplete} initialStep={4} />);
    expect(screen.getByText('Explore Your Apps')).toBeDefined();
    expect(screen.getByText('QuantMail')).toBeDefined();
  });
});
