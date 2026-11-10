'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { NotificationItem } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

export default function NotificationsPage() {
  const { status } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.notifications.list<NotificationItem[]>();
      setItems(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      void load();
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
  }, [status, load]);

  const markAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      setError('Could not mark notifications as read.');
    }
  };

  if (status === 'loading') {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold">Notifications</h1>
        <p aria-live="polite">Loading notifications…</p>
      </main>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold">Notifications</h1>
        <p>
          <Link href="/login" className="font-semibold text-primary underline">
            Log in
          </Link>{' '}
          to view your notifications.
        </p>
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {items.some((n) => !n.read) && (
          <button
            type="button"
            onClick={markAllRead}
            className="min-h-11 rounded-md border border-border bg-surface px-4 text-sm font-semibold hover:bg-surfaceAlt"
          >
            Mark all read
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-md border border-danger bg-danger/10 px-4 py-2 text-danger">
          {error}
        </p>
      )}

      {loading ? (
        <p aria-live="polite">Loading notifications…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-onSurfaceDim">
          You have no notifications yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((n) => {
            const href =
              n.type === 'follow' && n.actorUsername
                ? `/u/${encodeURIComponent(n.actorUsername)}`
                : n.resourceId
                  ? `/posts/${encodeURIComponent(n.resourceId)}`
                  : null;
            return (
              <li
                key={n.id}
                className={`rounded-xl border p-4 ${
                  n.read ? 'border-border bg-surface' : 'border-primary bg-primary/10'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base">{n.message}</p>
                  {href && (
                    <Link href={href} className="shrink-0 text-sm font-semibold text-primary hover:underline">
                      View
                    </Link>
                  )}
                </div>
                <p className="mt-1 text-xs text-onSurfaceDim">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
