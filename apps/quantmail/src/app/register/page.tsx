'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, FormField, Input, Button } from '@quant/shared-ui';
import { apiClient } from '../../services/api-client';
import { PageTransition } from '../../components/PageTransition';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!email) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!username) {
      errors.username = 'Username is required';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const res = await apiClient.register({
        email,
        password,
        username,
        displayName: username,
        acceptTerms: true,
      });
      if (res.success) {
        router.push('/login?success=Registration+successful.+Please+sign+in.');
      } else {
        setError(res.error?.message || 'Registration failed. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageTransition className="min-h-screen flex items-center justify-center p-4 bg-[var(--quant-background,#f9fafb)] dark:bg-gray-900">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-full bg-[var(--brand-app-color)] flex items-center justify-center text-white font-bold text-2xl mb-4">
            Q
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Create your account
          </h1>
          <p className="text-sm text-[var(--quant-muted-foreground)] mt-1">
            Join QuantMail and unify your workflow
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Email" required htmlFor="register-email" error={fieldErrors.email}>
              <Input
                id="register-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
                autoComplete="email"
              />
            </FormField>

            <FormField
              label="Username"
              required
              htmlFor="register-username"
              error={fieldErrors.username}
            >
              <Input
                id="register-username"
                type="text"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                fullWidth
                autoComplete="username"
              />
            </FormField>

            <FormField
              label="Password"
              required
              htmlFor="register-password"
              error={fieldErrors.password}
              hint="Minimum 8 characters"
            >
              <Input
                id="register-password"
                type="password"
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                fullWidth
                autoComplete="new-password"
              />
            </FormField>

            <FormField
              label="Confirm Password"
              required
              htmlFor="register-confirm-password"
              error={fieldErrors.confirmPassword}
            >
              <Input
                id="register-confirm-password"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                fullWidth
                autoComplete="new-password"
              />
            </FormField>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              Create Account
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-[var(--quant-muted-foreground)]">
          Already have an account?{' '}
          <Link
            href="/login"
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
          >
            Sign in
          </Link>
        </p>
      </div>
    </PageTransition>
  );
}
