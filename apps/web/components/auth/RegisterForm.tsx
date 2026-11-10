'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/lib/api';

const PASSWORD_MIN = 12;
// Backend contract: must contain upper + lower + digit (see RegisterDto).
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/;

export function RegisterForm() {
  const { register, oauthLogin } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const valid =
    username.length >= 3 &&
    email.length > 0 &&
    password.length >= PASSWORD_MIN &&
    PASSWORD_RE.test(password) &&
    password === confirm;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters.`);
      return;
    }
    if (!PASSWORD_RE.test(password)) {
      setError('Password must contain an uppercase letter, a lowercase letter and a digit.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await register(username, email, password);
      window.location.href = '/feed';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Account creation failed. Try again.');
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
        label="Username"
        name="username"
        autoComplete="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        hint="3+ characters, letters, numbers and underscores."
        required
      />
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={`At least ${PASSWORD_MIN} characters with upper, lower and a digit. A passphrase is safer.`}
        required
      />
      <Input
        label="Confirm password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
      />
      <Button type="submit" loading={submitting} disabled={!valid}>
        Create account
      </Button>
      <div className="my-1 flex items-center gap-3 text-xs text-onSurfaceDim">
        <span className="h-px flex-1 bg-border" />
        <span>or quick start</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={async () => {
            setSubmitting(true);
            try {
              await oauthLogin('google', email || undefined);
              window.location.href = '/feed';
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Google sign-up failed.');
              setSubmitting(false);
            }
          }}
          disabled={submitting}
          className="min-h-11 rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-surfaceAlt disabled:opacity-50"
        >
          Continue with Google
        </button>
        <button
          type="button"
          onClick={async () => {
            setSubmitting(true);
            try {
              await oauthLogin('github', email || undefined);
              window.location.href = '/feed';
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'GitHub sign-up failed.');
              setSubmitting(false);
            }
          }}
          disabled={submitting}
          className="min-h-11 rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-surfaceAlt disabled:opacity-50"
        >
          Continue with GitHub
        </button>
      </div>
      <p className="text-center text-sm text-onSurfaceDim">
        Already registered?{' '}
        <Link href="/login" className="font-semibold text-primary underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
