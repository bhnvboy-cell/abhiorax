import type { Metadata } from 'next';
import { AccessibilityProvider, A11yReporterProvider } from '@/components/a11y/AccessibilityProvider';
import { SkipLink } from '@/components/a11y/SkipLink';
import { NavHeader } from '@/components/layout/NavHeader';
import { AppShell } from '@/components/layout/AppShell';
import { MobileNav } from '@/components/layout/MobileNav';
import { AuthProvider } from '@/hooks/useAuth';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'ABHIORAX — Fearless, forward, next-gen',
    template: '%s · ABHIORAX',
  },
  description:
    'ABHIORAX — a fearless, forward, next-generation social, communication and creator platform. WCAG AAA accessible.',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className="pb-16 sm:pb-0">
        <AccessibilityProvider>
          <A11yReporterProvider>
            <AuthProvider>
              <SkipLink target="#main-content" />
              <NavHeader />
              <AppShell>{children}</AppShell>
              <MobileNav />
            </AuthProvider>
          </A11yReporterProvider>
        </AccessibilityProvider>
      </body>
    </html>
  );
}
