'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { NotificationItem } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

/**
 * Slim futuristic command header: brand mark, instant global search bar,
 * unread alerts indicator, and account actions.
 */
export function NavHeader() {
  const { user, status, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [quickQuery, setQuickQuery] = useState('');

  useEffect(() => {
    if (status !== 'authenticated') {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    const refreshUnread = () => {
      void api.notifications
        .list<NotificationItem[]>()
        .then((res) => {
          if (cancelled) return;
          const metaCount = typeof res.meta?.unreadCount === 'number' ? res.meta.unreadCount : undefined;
          setUnreadCount(metaCount ?? res.data.filter((n) => !n.read).length);
        })
        .catch(() => undefined);
    };
    refreshUnread();
    const timer = setInterval(refreshUnread, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status, pathname]);

  if (pathname === '/login' || pathname === '/register') return null;

  const onLogout = async () => {
    await logout();
    router.push('/login');
  };

  const onQuickSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = quickQuery.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-sm font-black text-primary ring-1 ring-primary/40"
            >
              A
            </span>
            <span>
              ABHIORAX<span className="text-primary">.</span>
            </span>
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-1 sm:flex lg:hidden">
            <Link href="/feed" className="min-h-10 rounded-md px-2.5 py-2 text-sm hover:bg-surfaceAlt">
              Feed
            </Link>
            <Link href="/rooms" className="min-h-10 rounded-md px-2.5 py-2 text-sm hover:bg-surfaceAlt">
              Rooms
            </Link>
            <Link href="/groups" className="min-h-10 rounded-md px-2.5 py-2 text-sm hover:bg-surfaceAlt">
              Groups
            </Link>
            <Link href="/chat" className="min-h-10 rounded-md px-2.5 py-2 text-sm hover:bg-surfaceAlt">
              Messages
            </Link>
          </nav>
        </div>

        <form onSubmit={onQuickSearch} role="search" aria-label="Quick search" className="hidden max-w-sm flex-1 md:flex">
          <label htmlFor="header-search" className="sr-only">
            Search ABHIORAX
          </label>
          <input
            id="header-search"
            type="search"
            value={quickQuery}
            onChange={(e) => setQuickQuery(e.target.value)}
            placeholder="Search people, #topics, posts…"
            className="min-h-10 w-full rounded-full border border-border bg-surface/80 px-4 py-1.5 text-sm text-onSurface placeholder:text-onSurfaceDim focus:border-primary"
          />
        </form>

        <div className="flex items-center gap-2">
          {status === 'authenticated' && user ? (
            <>
              <Link
                href="/notifications"
                aria-label={unreadCount > 0 ? `Alerts (${unreadCount} unread)` : 'Alerts'}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-sm font-medium hover:bg-surfaceAlt"
              >
                <span aria-hidden>🔔</span>
                <span className="hidden sm:inline">Alerts</span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-onPrimary">
                    {unreadCount}
                  </span>
                )}
              </Link>
              <Link
                href={`/u/${encodeURIComponent(user.username)}`}
                className="hidden min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-sm font-medium hover:bg-surfaceAlt sm:inline-flex"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                  {(user.displayName ?? user.username).slice(0, 1).toUpperCase()}
                </span>
                <span>@{user.username}</span>
              </Link>
              <button
                onClick={onLogout}
                className="min-h-11 rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-surfaceAlt"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/search"
                className="min-h-11 inline-flex items-center rounded-full border border-border px-4 text-sm font-medium hover:bg-surfaceAlt sm:hidden"
              >
                Explore
              </Link>
              <Link
                href="/login"
                className="min-h-11 inline-flex items-center rounded-full border border-border px-4 text-sm font-semibold hover:bg-surfaceAlt"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="min-h-11 hidden items-center rounded-full bg-primary px-4 text-sm font-semibold text-onPrimary hover:bg-primaryHover sm:inline-flex"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
