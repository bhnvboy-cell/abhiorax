'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

const mobileLinks = [
  { href: '/feed', label: 'Feed' },
  { href: '/rooms', label: 'Rooms' },
  { href: '/groups', label: 'Groups' },
  { href: '/notifications', label: 'Alerts' },
  { href: '/chat', label: 'Chat' },
];

/** Mobile bottom navigation bar + PWA service worker registration. */
export function MobileNav() {
  const pathname = usePathname();
  const { status } = useAuth();

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  if (pathname === '/login' || pathname === '/register' || status !== 'authenticated') {
    return null;
  }

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-bg/95 backdrop-blur sm:hidden"
    >
      <ul className="grid grid-cols-5">
        {mobileLinks.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-12 items-center justify-center text-xs font-semibold ${
                  active ? 'text-primary' : 'text-onSurfaceDim'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
