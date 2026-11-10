'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/lib/api';

export function LoginForm() {
  const { login, oauthLogin } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(identifier, password);
      window.location.href = '/feed';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Log in failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const quickSignIn = async (provider: 'google' | 'github' | 'magic_link') => {
    setError(null);
    setSubmitting(true);
    try {
      await oauthLogin(provider, identifier.includes('@') ? identifier : undefined);
      window.location.href = '/feed';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Quick sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-4 py-2 text-danger">
          {error}
        </p>
      )}
      <Input
        label="Username or email"
        name="identifier"
        autoComplete="username"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        required
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <Button type="submit" loading={submitting}>
        Log in
      </Button>

      <div className="my-1 flex items-center gap-3 text-xs text-onSurfaceDim">
        <span className="h-px flex-1 bg-border" />
        <span>or instant sign-in</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => quickSignIn('google')}
          disabled={submitting}
          className="min-h-11 rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-surfaceAlt disabled:opacity-50"
        >
          Google
        </button>
        <button
          type="button"
          onClick={() => quickSignIn('github')}
          disabled={submitting}
          className="min-h-11 rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-surfaceAlt disabled:opacity-50"
        >
          GitHub
        </button>
        <button
          type="button"
          onClick={() => quickSignIn('magic_link')}
          disabled={submitting}
          className="min-h-11 rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-surfaceAlt disabled:opacity-50"
        >
          Magic Link
        </button>
      </div>
      <p className="text-center text-sm text-onSurfaceDim">
        New here?{' '}
        <Link href="/register" className="font-semibold text-primary underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
