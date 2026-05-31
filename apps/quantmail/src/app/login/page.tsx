'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, FormField, Input, Button } from '@quant/shared-ui';
import { useAuth } from '../../providers/auth-provider';
import { PageTransition } from '../../components/PageTransition';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const successMessage = searchParams?.get('success');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    try {
      await login(email, password);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
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
            Sign in to QuantMail
          </h1>
          <p className="text-sm text-[var(--quant-muted-foreground)] mt-1">
            Your unified workspace for email, code, and more
          </p>
        </div>

        {successMessage && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm text-center">
            {successMessage}
          </div>
        )}

        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Email" required htmlFor="login-email">
              <Input
                id="login-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
                autoComplete="email"
              />
            </FormField>

            <FormField label="Password" required htmlFor="login-password">
              <Input
                id="login-password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                fullWidth
                autoComplete="current-password"
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
              loading={isLoading}
              disabled={isLoading}
            >
              Sign In
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-[var(--quant-muted-foreground)]">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
          >
            Register
          </Link>
        </p>
      </div>
    </PageTransition>
  );
}
