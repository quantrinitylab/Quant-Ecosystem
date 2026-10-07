// @vitest-environment jsdom
// ============================================================================
// Shared UI - Shell, States, Guards, Onboarding Component Tests
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalNav } from '../components/Shell/GlobalNav';
import { AppSwitcher } from '../components/Shell/AppSwitcher';
import { NotificationCenter } from '../components/Shell/NotificationCenter';
import { CommandMenu } from '../components/Shell/CommandMenu';
import { EmptyState } from '../components/States/EmptyState';
import { LoadingState } from '../components/States/LoadingState';
import { ErrorState } from '../components/States/ErrorState';
import { SuccessState } from '../components/States/SuccessState';
import { AuthGuard } from '../guards/AuthGuard';
import { RouteGuard } from '../guards/RouteGuard';
import { OnboardingFlow } from '../components/Onboarding/OnboardingFlow';

describe('GlobalNav', () => {
  const user = { name: 'Test User', email: 'test@quant.dev' };

  it('renders app name', () => {
    render(<GlobalNav appName="QuantMail" user={user} />);
    expect(screen.getByText('QuantMail')).toBeDefined();
  });

  it('renders notification count badge', () => {
    render(<GlobalNav appName="QuantMail" user={user} notificationCount={5} />);
    expect(screen.getByText('5')).toBeDefined();
  });

  it('renders user avatar fallback with initial', () => {
    render(<GlobalNav appName="QuantMail" user={user} />);
    expect(screen.getByText('T')).toBeDefined();
  });

  it('calls onAppSwitcher when app switcher button clicked', () => {
    const onAppSwitcher = vi.fn();
    render(<GlobalNav appName="QuantMail" user={user} onAppSwitcher={onAppSwitcher} />);
    fireEvent.click(screen.getByLabelText('Open app switcher'));
    expect(onAppSwitcher).toHaveBeenCalledTimes(1);
  });

  it('calls onNotifications when bell clicked', () => {
    const onNotifications = vi.fn();
    render(<GlobalNav appName="QuantMail" user={user} onNotifications={onNotifications} />);
    fireEvent.click(screen.getByLabelText('Notifications'));
    expect(onNotifications).toHaveBeenCalledTimes(1);
  });
});

describe('AppSwitcher', () => {
  const apps = [
    { id: 'mail', name: 'QuantMail', icon: '\u{1F4E7}', href: '/mail', active: true },
    { id: 'chat', name: 'QuantChat', icon: '\u{1F4AC}', href: '/chat' },
    { id: 'drive', name: 'QuantDrive', icon: '\u{1F4C1}', href: '/drive' },
  ];

  it('renders nothing when closed', () => {
    render(<AppSwitcher apps={apps} isOpen={false} onClose={() => {}} />);
    expect(screen.queryByText('QuantMail')).toBeNull();
  });

  it('lists apps when open', () => {
    render(<AppSwitcher apps={apps} isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('QuantMail')).toBeDefined();
    expect(screen.getByText('QuantChat')).toBeDefined();
    expect(screen.getByText('QuantDrive')).toBeDefined();
  });

  it('calls onSelect when an app is clicked', () => {
    const onSelect = vi.fn();
    render(<AppSwitcher apps={apps} isOpen={true} onClose={() => {}} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('QuantChat'));
    expect(onSelect).toHaveBeenCalledWith(apps[1]);
  });
});

describe('NotificationCenter', () => {
  const notifications = [
    {
      id: '1',
      title: 'New message',
      body: 'You have a new message',
      time: '5m ago',
      read: false,
      app: 'Chat',
    },
    {
      id: '2',
      title: 'File shared',
      body: 'A file was shared with you',
      time: '1h ago',
      read: true,
      app: 'Drive',
    },
  ];

  it('renders nothing when closed', () => {
    render(<NotificationCenter notifications={notifications} isOpen={false} onClose={() => {}} />);
    expect(screen.queryByText('New message')).toBeNull();
  });

  it('shows notifications when open', () => {
    render(<NotificationCenter notifications={notifications} isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('New message')).toBeDefined();
    expect(screen.getByText('File shared')).toBeDefined();
  });

  it('shows empty state when no notifications', () => {
    render(<NotificationCenter notifications={[]} isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('No notifications')).toBeDefined();
  });
});

describe('CommandMenu', () => {
  const commands = [
    { id: '1', label: 'Go to mail', group: 'Navigation', action: vi.fn() },
    { id: '2', label: 'Go to chat', group: 'Navigation', action: vi.fn() },
    { id: '3', label: 'Create document', group: 'Actions', action: vi.fn() },
  ];

  it('renders nothing when closed', () => {
    render(<CommandMenu commands={commands} isOpen={false} onClose={() => {}} onOpen={() => {}} />);
    expect(screen.queryByText('Go to mail')).toBeNull();
  });

  it('renders commands when open', () => {
    render(<CommandMenu commands={commands} isOpen={true} onClose={() => {}} onOpen={() => {}} />);
    expect(screen.getByText('Go to mail')).toBeDefined();
    expect(screen.getByText('Go to chat')).toBeDefined();
    expect(screen.getByText('Create document')).toBeDefined();
  });

  it('filters commands by query', () => {
    render(<CommandMenu commands={commands} isOpen={true} onClose={() => {}} onOpen={() => {}} />);
    const input = screen.getByLabelText('Command search');
    fireEvent.change(input, { target: { value: 'document' } });
    expect(screen.getByText('Create document')).toBeDefined();
    expect(screen.queryByText('Go to mail')).toBeNull();
  });

  it('shows group labels', () => {
    render(<CommandMenu commands={commands} isOpen={true} onClose={() => {}} onOpen={() => {}} />);
    expect(screen.getByText('Navigation')).toBeDefined();
    expect(screen.getByText('Actions')).toBeDefined();
  });
});

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No items" description="Get started by adding an item." />);
    expect(screen.getByText('No items')).toBeDefined();
    expect(screen.getByText('Get started by adding an item.')).toBeDefined();
  });

  it('renders action button when provided', () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        title="No items"
        description="Add one."
        actionLabel="Add Item"
        onAction={onAction}
      />,
    );
    const button = screen.getByText('Add Item');
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('LoadingState', () => {
  it('renders spinner by default', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('renders with text', () => {
    render(<LoadingState text="Loading data..." />);
    expect(screen.getByText('Loading data...')).toBeDefined();
  });
});

describe('ErrorState', () => {
  it('renders error message', () => {
    render(<ErrorState message="Failed to load data" />);
    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText('Failed to load data')).toBeDefined();
  });

  it('renders retry button when onRetry provided', () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Error" onRetry={onRetry} />);
    fireEvent.click(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('SuccessState', () => {
  it('renders success message', () => {
    render(<SuccessState message="Operation completed successfully" />);
    expect(screen.getByText('Success')).toBeDefined();
    expect(screen.getByText('Operation completed successfully')).toBeDefined();
  });

  it('renders action button when provided', () => {
    const onAction = vi.fn();
    render(<SuccessState message="Done!" actionLabel="Continue" onAction={onAction} />);
    fireEvent.click(screen.getByText('Continue'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('AuthGuard', () => {
  it('shows children when authenticated', () => {
    render(
      <AuthGuard isAuthenticated={true}>
        <p>Protected content</p>
      </AuthGuard>,
    );
    expect(screen.getByText('Protected content')).toBeDefined();
  });

  it('shows sign-in prompt when not authenticated', () => {
    render(
      <AuthGuard isAuthenticated={false}>
        <p>Protected content</p>
      </AuthGuard>,
    );
    expect(screen.queryByText('Protected content')).toBeNull();
    expect(screen.getByText('Authentication Required')).toBeDefined();
    expect(screen.getByText('Sign in')).toBeDefined();
  });
});

describe('RouteGuard', () => {
  it('shows children for correct role', () => {
    render(
      <RouteGuard userRole="admin" requiredRoles={['admin', 'editor']}>
        <p>Admin panel</p>
      </RouteGuard>,
    );
    expect(screen.getByText('Admin panel')).toBeDefined();
  });

  it('shows access denied for incorrect role', () => {
    render(
      <RouteGuard userRole="viewer" requiredRoles={['admin', 'editor']}>
        <p>Admin panel</p>
      </RouteGuard>,
    );
    expect(screen.queryByText('Admin panel')).toBeNull();
    expect(screen.getByText('Access Denied')).toBeDefined();
  });

  it('shows fallback when provided for incorrect role', () => {
    render(
      <RouteGuard userRole="viewer" requiredRoles={['admin']} fallback={<p>Custom fallback</p>}>
        <p>Admin panel</p>
      </RouteGuard>,
    );
    expect(screen.getByText('Custom fallback')).toBeDefined();
  });
});

describe('OnboardingFlow', () => {
  const steps = [
    <div key="1">Step 1 content</div>,
    <div key="2">Step 2 content</div>,
    <div key="3">Step 3 content</div>,
  ];

  it('shows current step content', () => {
    render(
      <OnboardingFlow
        steps={steps}
        currentStep={0}
        onNext={() => {}}
        onBack={() => {}}
        onComplete={() => {}}
      />,
    );
    expect(screen.getByText('Step 1 content')).toBeDefined();
  });

  it('shows progress indicator', () => {
    render(
      <OnboardingFlow
        steps={steps}
        currentStep={1}
        onNext={() => {}}
        onBack={() => {}}
        onComplete={() => {}}
      />,
    );
    expect(screen.getByText('Step 2 of 3')).toBeDefined();
  });

  it('shows Complete button on last step', () => {
    render(
      <OnboardingFlow
        steps={steps}
        currentStep={2}
        onNext={() => {}}
        onBack={() => {}}
        onComplete={() => {}}
      />,
    );
    expect(screen.getByLabelText('Complete onboarding')).toBeDefined();
  });

  it('calls onNext when Next button clicked', () => {
    const onNext = vi.fn();
    render(
      <OnboardingFlow
        steps={steps}
        currentStep={0}
        onNext={onNext}
        onBack={() => {}}
        onComplete={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('Next step'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
