// @vitest-environment jsdom
// ============================================================================
// Shared UI - Component Tests
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Skeleton } from '../components/Skeleton';
import { FormField } from '../components/Form/FormField';
import { AppShell } from '../components/Layout/AppShell';
import { VoiceInput } from '../components/VoiceInput';

describe('Button', () => {
  it('renders children correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeDefined();
  });

  it('applies variant styles', () => {
    // `danger` is a brand-soft destructive surface (`#2A1215` with a `#F87171`
    // label), not Tailwind's generic `bg-red-600` — the palette classes were
    // retokenised onto the brand hexes. Asserted against `primary` as well so
    // this proves the variant actually switches rather than just that some
    // class is present.
    const { container: danger } = render(<Button variant="danger">Delete</Button>);
    const dangerClass = danger.querySelector('button')!.className;
    expect(dangerClass).toContain('bg-[#2A1215]');
    expect(dangerClass).toContain('text-[#F87171]');

    const { container: primary } = render(<Button variant="primary">Save</Button>);
    const primaryClass = primary.querySelector('button')!.className;
    expect(primaryClass).toContain('bg-[#FF8C42]');
    expect(primaryClass).not.toContain('bg-[#2A1215]');
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders as disabled', () => {
    render(<Button disabled>Disabled</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveProperty('disabled', true);
  });

  it('shows loading state', () => {
    render(<Button loading>Loading</Button>);
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
});

describe('Dialog', () => {
  it('renders when open', () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Test Dialog">
        <p>Dialog content</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Test Dialog')).toBeDefined();
    expect(screen.getByText('Dialog content')).toBeDefined();
  });

  it('does not render when closed', () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Hidden">
        <p>Hidden content</p>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Dialog open={true} onClose={onClose} title="Close test">
        <p>Content</p>
      </Dialog>,
    );
    const closeButton = screen.getByLabelText('Close dialog');
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has aria-modal attribute', () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Modal test">
        <p>Content</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });
});

describe('Skeleton', () => {
  it('renders with default props', () => {
    render(<Skeleton />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toBeDefined();
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
  });

  it('renders circle variant', () => {
    render(<Skeleton variant="circle" />);
    const skeleton = screen.getByRole('status');
    expect(skeleton.className).toContain('rounded-full');
  });

  it('applies custom dimensions', () => {
    render(<Skeleton width="200px" height="50px" />);
    const skeleton = screen.getByRole('status');
    expect(skeleton.style.width).toBe('200px');
    expect(skeleton.style.height).toBe('50px');
  });

  it('respects animate prop', () => {
    render(<Skeleton animate={false} />);
    const skeleton = screen.getByRole('status');
    expect(skeleton.className).not.toContain('animate-pulse');
  });
});

describe('FormField', () => {
  it('renders label and children', () => {
    render(
      <FormField label="Email">
        <input type="email" />
      </FormField>,
    );
    expect(screen.getByText('Email')).toBeDefined();
  });

  it('shows required indicator', () => {
    render(
      <FormField label="Name" required>
        <input type="text" />
      </FormField>,
    );
    expect(screen.getByText('*')).toBeDefined();
  });

  it('shows error message', () => {
    render(
      <FormField label="Email" error="Invalid email">
        <input type="email" />
      </FormField>,
    );
    expect(screen.getByText('Invalid email')).toBeDefined();
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('shows hint text when no error', () => {
    render(
      <FormField label="Email" hint="Enter your email">
        <input type="email" />
      </FormField>,
    );
    expect(screen.getByText('Enter your email')).toBeDefined();
  });
});

describe('AppShell', () => {
  it('renders children', () => {
    render(<AppShell>Main content</AppShell>);
    expect(screen.getByText('Main content')).toBeDefined();
  });

  it('renders with sidebar', () => {
    render(<AppShell sidebar={<div>Sidebar</div>}>Content</AppShell>);
    expect(screen.getByText('Sidebar')).toBeDefined();
    expect(screen.getByText('Content')).toBeDefined();
  });

  it('renders with topBar', () => {
    render(<AppShell topBar={<div>Top bar</div>}>Content</AppShell>);
    expect(screen.getByText('Top bar')).toBeDefined();
  });

  it('is a named region, not an application', () => {
    render(<AppShell>Content</AppShell>);
    expect(screen.getByRole('region', { name: 'Application shell' })).toBeDefined();
    expect(screen.queryByRole('application')).toBeNull();
  });
});

describe('VoiceInput', () => {
  it('renders with start recording label', () => {
    render(<VoiceInput />);
    expect(screen.getByLabelText('Start recording')).toBeDefined();
  });

  it('shows stop recording label when recording', () => {
    render(<VoiceInput isRecording={true} />);
    expect(screen.getByLabelText('Stop recording')).toBeDefined();
  });

  it('calls onRecordingStart when clicked', () => {
    const onStart = vi.fn();
    render(<VoiceInput onRecordingStart={onStart} />);
    fireEvent.click(screen.getByLabelText('Start recording'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('calls onRecordingStop when clicked while recording', () => {
    const onStop = vi.fn();
    render(<VoiceInput isRecording={true} onRecordingStop={onStop} />);
    fireEvent.click(screen.getByLabelText('Stop recording'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('renders waveform when recording', () => {
    render(<VoiceInput isRecording={true} />);
    expect(screen.getByRole('status')).toBeDefined();
  });
});
