import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata: Metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-8">
      <h1 className="mb-6 text-center text-3xl font-bold tracking-tight">Create your account</h1>
      <RegisterForm />
    </main>
  );
}
