import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = { title: 'Log in' };

export default function LoginPage() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-8">
      <h1 className="mb-6 text-center text-3xl font-bold tracking-tight">Log in to ABHIORAX</h1>
      <LoginForm />
    </main>
  );
}
