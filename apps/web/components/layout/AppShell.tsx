'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { GroupItem, Profile } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { useAccessibility } from '@/components/a11y/AccessibilityProvider';

interface TrendingTag {
  tag: string;
  count: number;
}

const STANDALONE_ROUTES = new Set(['/', '/login', '/register']);
const WIDE_CENTER_ROUTES = new Set(['/chat', '/rooms', '/admin/dashboard', '/creator/dashboard']);

/**
 * 3-column futuristic cockpit layout for app routes:
 * - Left sticky rail: navigation + instant Accessibility & Comfort dock
 * - Center stage: the page's <main id="main-content">
 * - Right sticky rail: live Trending Pulse, Creators, and Communities
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const { user, status } = useAuth();
  const { highContrast, largeText, dyslexiaFriendly, toggleHighContrast, toggleLargeText, toggleDyslexiaFriendly } =
    useAccessibility();

  const [trending, setTrending] = useState<TrendingTag[]>([]);
  const [suggestions, setSuggestions] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);

  const isStandalone = STANDALONE_ROUTES.has(pathname);
  const hideRightRail = WIDE_CENTER_ROUTES.has(pathname);

  useEffect(() => {
    if (isStandalone || hideRightRail || status === 'loading') return;
    if (status === 'authenticated') {
      void api.search.trending<TrendingTag[]>().then(setTrending).catch(() => undefined);
      void api.search.suggestions<Profile[]>().then(setSuggestions).catch(() => undefined);
      void api.groups.list<GroupItem[]>().then(setGroups).catch(() => undefined);
    } else {
      void api.public
        .explore<{ trending: TrendingTag[]; groups: GroupItem[] }>()
        .then((res) => {
          setTrending(res.trending ?? []);
          setGroups(res.groups ?? []);
        })
        .catch(() => undefined);
    }
  }, [isStandalone, hideRightRail, status]);

  if (isStandalone) {
    return <>{children}</>;
  }

  const navItems = [
    { href: '/feed', label: 'Feed', icon: '⚡' },
    { href: '/rooms', label: 'Live Rooms', icon: '#️⃣' },
    { href: '/groups', label: 'Groups', icon: '🌐' },
    { href: '/search', label: 'Explore', icon: '🔍' },
    { href: '/notifications', label: 'Alerts', icon: '🔔' },
    { href: '/chat', label: 'Messages', icon: '💬' },
    ...(user ? [{ href: `/u/${encodeURIComponent(user.username)}`, label: 'Profile', icon: '👤' }] : []),
    ...(user ? [{ href: '/settings', label: 'Settings', icon: '⚙️' }] : []),
    ...(user?.role === 'creator' || user?.role === 'admin'
      ? [{ href: '/creator/dashboard', label: 'Creator Studio', icon: '✨' }]
      : []),
    ...(user?.role === 'admin' ? [{ href: '/admin/dashboard', label: 'Admin Console', icon: '🛡️' }] : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-4">
      <aside aria-label="Workspace navigation" className="sticky top-20 hidden h-fit w-60 shrink-0 flex-col gap-4 lg:flex">
        <nav aria-label="Sidebar" className="ax-glass flex flex-col gap-1 rounded-2xl border border-border p-3">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary/15 font-semibold text-primary ring-1 ring-primary/30'
                    : 'text-onSurface hover:bg-surfaceAlt'
                }`}
              >
                <span aria-hidden className="text-base">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <section
          aria-label="Quick accessibility controls"
          className="ax-glass flex flex-col gap-2 rounded-2xl border border-border p-3.5"
        >
          <h2 className="text-xs font-bold uppercase tracking-wider text-onSurfaceDim">Accessibility Dock</h2>
          <button
            type="button"
            onClick={toggleHighContrast}
            aria-pressed={highContrast}
            className={`flex min-h-10 items-center justify-between rounded-lg border px-3 text-xs font-medium transition-colors ${
              highContrast ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-bg/60 hover:bg-surfaceAlt'
            }`}
          >
            <span>High contrast</span>
            <span>{highContrast ? 'ON' : 'OFF'}</span>
          </button>
          <button
            type="button"
            onClick={toggleLargeText}
            aria-pressed={largeText}
            className={`flex min-h-10 items-center justify-between rounded-lg border px-3 text-xs font-medium transition-colors ${
              largeText ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-bg/60 hover:bg-surfaceAlt'
            }`}
          >
            <span>Large text</span>
            <span>{largeText ? 'ON' : 'OFF'}</span>
          </button>
          <button
            type="button"
            onClick={toggleDyslexiaFriendly}
            aria-pressed={dyslexiaFriendly}
            className={`flex min-h-10 items-center justify-between rounded-lg border px-3 text-xs font-medium transition-colors ${
              dyslexiaFriendly
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border bg-bg/60 hover:bg-surfaceAlt'
            }`}
          >
            <span>Dyslexia spacing</span>
            <span>{dyslexiaFriendly ? 'ON' : 'OFF'}</span>
          </button>
        </section>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>

      {!hideRightRail && (
        <aside aria-label="Discovery pulse" className="sticky top-20 hidden h-fit w-80 shrink-0 flex-col gap-4 xl:flex">
          {trending.length > 0 && (
            <section className="ax-glass rounded-2xl border border-border p-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-onSurfaceDim">Trending Pulse</h2>
              <ul className="flex flex-col gap-2">
                {trending.slice(0, 6).map((t) => (
                  <li key={t.tag} className="flex items-center justify-between text-sm">
                    <Link href={`/search?q=%23${encodeURIComponent(t.tag)}`} className="font-medium text-primary hover:underline">
                      #{t.tag}
                    </Link>
                    <span className="text-xs text-onSurfaceDim">{t.count} posts</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {suggestions.length > 0 && (
            <section className="ax-glass rounded-2xl border border-border p-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-onSurfaceDim">Creators to Explore</h2>
              <ul className="flex flex-col gap-2.5">
                {suggestions.slice(0, 4).map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/u/${encodeURIComponent(u.username)}`} className="flex min-w-0 items-center gap-2 hover:underline">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                        {(u.displayName ?? u.username).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="truncate font-medium">@{u.username}</span>
                    </Link>
                    <Link
                      href={`/u/${encodeURIComponent(u.username)}`}
                      className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-surfaceAlt"
                    >
                      View
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {groups.length > 0 && (
            <section className="ax-glass rounded-2xl border border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-onSurfaceDim">Communities</h2>
                <Link href="/groups" className="text-xs text-primary hover:underline">
                  All
                </Link>
              </div>
              <ul className="flex flex-col gap-2">
                {groups.slice(0, 4).map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href="/groups" className="truncate font-medium hover:underline">
                      {g.name}
                    </Link>
                    <span className="shrink-0 text-xs text-onSurfaceDim">{g.memberCount}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      )}
    </div>
  );
}
