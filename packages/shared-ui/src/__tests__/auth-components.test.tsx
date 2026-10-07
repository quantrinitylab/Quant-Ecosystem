// @vitest-environment jsdom
// ============================================================================
// Shared UI - Auth Components Tests (LoginPage + ConsentScreen)
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoginPage } from '../components/Auth/LoginPage';
import { ConsentScreen } from '../components/Auth/ConsentScreen';

describe('LoginPage', () => {
  const mockOnSubmit = vi.fn();
  const mockOnSocialLogin = vi.fn();
  const mockOnForgotPassword = vi.fn();
  const mockOnRegister = vi.fn();

  const defaultProps = {
    onSubmit: mockOnSubmit,
    onSocialLogin: mockOnSocialLogin,
    onForgotPassword: mockOnForgotPassword,
    onRegister: mockOnRegister,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form with heading', () => {
    render(<LoginPage {...defaultProps} />);
    expect(screen.getByText('Welcome Back')).toBeDefined();
    expect(screen.getByLabelText(/login form/i)).toBeDefined();
  });

  it('renders register form when mode is register', () => {
    render(<LoginPage {...defaultProps} mode="register" />);
    expect(screen.getByRole('heading', { name: 'Create Account' })).toBeDefined();
    expect(screen.getByLabelText('Confirm password')).toBeDefined();
  });

  it('renders social login buttons', () => {
    render(<LoginPage {...defaultProps} />);
    expect(screen.getByLabelText('Sign in with Google')).toBeDefined();
    expect(screen.getByLabelText('Sign in with GitHub')).toBeDefined();
    expect(screen.getByLabelText('Sign in with QuantMail')).toBeDefined();
  });

  it('calls onSocialLogin with provider when social button is clicked', () => {
    render(<LoginPage {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Sign in with Google'));
    expect(mockOnSocialLogin).toHaveBeenCalledWith('google');
    fireEvent.click(screen.getByLabelText('Sign in with GitHub'));
    expect(mockOnSocialLogin).toHaveBeenCalledWith('github');
  });

  it('shows validation error for empty email', () => {
    render(<LoginPage {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Sign in'));
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Email is required')).toBeDefined();
  });

  it('shows validation error for invalid email', () => {
    render(<LoginPage {...defaultProps} />);
    const emailInput = screen.getByLabelText('Email address');
    fireEvent.change(emailInput, { target: { value: 'invalid' } });
    fireEvent.click(screen.getByLabelText('Sign in'));
    expect(screen.getByText('Please enter a valid email address')).toBeDefined();
  });

  it('shows validation error for short password', () => {
    render(<LoginPage {...defaultProps} />);
    const emailInput = screen.getByLabelText('Email address');
    const passwordInput = screen.getByLabelText('Password');
    fireEvent.change(emailInput, { target: { value: 'user@test.com' } });
    fireEvent.change(passwordInput, { target: { value: 'short' } });
    fireEvent.click(screen.getByLabelText('Sign in'));
    expect(screen.getByText('Password must be at least 8 characters')).toBeDefined();
  });

  it('calls onSubmit with valid credentials', () => {
    render(<LoginPage {...defaultProps} />);
    const emailInput = screen.getByLabelText('Email address');
    const passwordInput = screen.getByLabelText('Password');
    fireEvent.change(emailInput, { target: { value: 'user@test.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(screen.getByLabelText('Sign in'));
    expect(mockOnSubmit).toHaveBeenCalledWith('user@test.com', 'password123');
  });

  it('shows Forgot password link in login mode', () => {
    render(<LoginPage {...defaultProps} />);
    const link = screen.getByLabelText('Forgot password');
    expect(link).toBeDefined();
    fireEvent.click(link);
    expect(mockOnForgotPassword).toHaveBeenCalledTimes(1);
  });

  it('shows external error when provided', () => {
    render(<LoginPage {...defaultProps} error="Invalid credentials" />);
    expect(screen.getByText('Invalid credentials')).toBeDefined();
  });

  it('disables submit button when loading', () => {
    render(<LoginPage {...defaultProps} loading={true} />);
    const submitBtn = screen.getByLabelText('Sign in');
    expect(submitBtn.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('validates passwords match in register mode', () => {
    render(<LoginPage {...defaultProps} mode="register" />);
    const emailInput = screen.getByLabelText('Email address');
    const passwordInput = screen.getByLabelText('Password');
    const confirmInput = screen.getByLabelText('Confirm password');
    fireEvent.change(emailInput, { target: { value: 'user@test.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(confirmInput, { target: { value: 'different123' } });
    fireEvent.click(screen.getByLabelText('Create account'));
    expect(screen.getByText('Passwords do not match')).toBeDefined();
  });
});

describe('ConsentScreen', () => {
  const mockOnAllow = vi.fn();
  const mockOnDeny = vi.fn();

  const permissions = [
    { id: 'read-email', name: 'Read your email', description: 'Access your email messages' },
    { id: 'send-email', name: 'Send email', description: 'Send emails on your behalf' },
    { id: 'read-contacts', name: 'Read contacts', description: 'Access your contacts list' },
  ];

  const defaultProps = {
    appName: 'TestApp',
    appIcon: '\uD83D\uDD11',
    permissions,
    onAllow: mockOnAllow,
    onDeny: mockOnDeny,
    userEmail: 'user@quant.dev',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the consent dialog', () => {
    render(<ConsentScreen {...defaultProps} />);
    expect(screen.getByRole('dialog', { name: /oauth consent/i })).toBeDefined();
  });

  it('shows requesting app name', () => {
    render(<ConsentScreen {...defaultProps} />);
    expect(screen.getByText('TestApp wants access')).toBeDefined();
  });

  it('shows user email', () => {
    render(<ConsentScreen {...defaultProps} />);
    expect(screen.getByText(/user@quant.dev/)).toBeDefined();
  });

  it('renders all permissions', () => {
    render(<ConsentScreen {...defaultProps} />);
    expect(screen.getByText('Read your email')).toBeDefined();
    expect(screen.getByText('Send email')).toBeDefined();
    expect(screen.getByText('Read contacts')).toBeDefined();
    expect(screen.getByText('Access your email messages')).toBeDefined();
  });

  it('calls onDeny when Deny is clicked', () => {
    render(<ConsentScreen {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Deny access'));
    expect(mockOnDeny).toHaveBeenCalledTimes(1);
  });

  it('calls onAllow with remember=false by default', () => {
    render(<ConsentScreen {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Allow access'));
    expect(mockOnAllow).toHaveBeenCalledWith(false);
  });

  it('calls onAllow with remember=true when checkbox is checked', () => {
    render(<ConsentScreen {...defaultProps} />);
    const checkbox = screen.getByLabelText('Remember this app');
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByLabelText('Allow access'));
    expect(mockOnAllow).toHaveBeenCalledWith(true);
  });

  it('shows the permissions list with proper role', () => {
    render(<ConsentScreen {...defaultProps} />);
    expect(screen.getByRole('list', { name: /requested permissions/i })).toBeDefined();
  });
});
