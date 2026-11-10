'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Post } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

interface CreatorStats {
  postCount: number;
  scheduledCount?: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  followerCount: number;
  subscriberCount?: number;
  tipTotalUsd?: number;
  estimatedRevenueUsd: number;
  recentPosts: Post[];
}

interface Subscriber {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  subscribedAt: string;
}

export default function CreatorDashboardPage() {
  const { user, status } = useAuth();
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    void Promise.all([
      api.creator.stats<CreatorStats>().then(setStats),
      api.creator.subscribers<Subscriber[]>().then(setSubscribers).catch(() => undefined),
    ]).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load creator analytics.'));
  }, [status]);

  const exportCsv = () => {
    const rows = ['username,email,subscribedAt', ...subscribers.map((s) => `${s.username},${s.email},${s.subscribedAt}`)];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'abhiorax-subscribers.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (status === 'loading') {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold">Creator Studio</h1>
        <p aria-live="polite">Loading creator analytics…</p>
      </main>
    );
  }

  if (status === 'unauthenticated' || (user?.role !== 'creator' && user?.role !== 'admin')) {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold">Creator Studio</h1>
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-4 py-3 text-danger">
          Creator or administrator role required.{' '}
          <Link href="/feed" className="underline">
            Return to feed
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold">Creator Studio</h1>
      <p className="mb-6 text-onSurfaceDim">
        Audience growth, transparent reach analytics, tips, and portable subscriber ownership.
      </p>

      {error && (
        <p role="alert" className="mb-4 rounded-md border border-danger bg-danger/10 px-4 py-2 text-danger">
          {error}
        </p>
      )}

      {stats && (
        <>
          <section aria-label="Creator metrics" className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ['Posts published', stats.postCount],
              ['Scheduled', stats.scheduledCount ?? 0],
              ['Total views', stats.totalViews],
              ['Total likes', stats.totalLikes],
              ['Followers', stats.followerCount],
              ['Subscribers', stats.subscriberCount ?? 0],
              ['Tips received', `$${(stats.tipTotalUsd ?? 0).toFixed(2)}`],
              ['Estimated earnings', `$${stats.estimatedRevenueUsd.toFixed(2)}`],
            ].map(([label, val]) => (
              <div key={String(label)} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm text-onSurfaceDim">{label}</p>
                <p className="mt-1 text-2xl font-bold">{val}</p>
              </div>
            ))}
          </section>

          <section aria-label="Portable subscribers" className="mb-8 rounded-xl border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Portable Subscribers ({subscribers.length})</h2>
                <p className="text-xs text-onSurfaceDim">You own your audience — export your subscriber list anytime.</p>
              </div>
              <button
                type="button"
                onClick={exportCsv}
                disabled={subscribers.length === 0}
                className="min-h-11 rounded-md border border-border bg-bg px-4 text-sm font-semibold hover:bg-surfaceAlt disabled:opacity-50"
              >
                Export CSV
              </button>
            </div>
            {subscribers.length === 0 ? (
              <p className="text-sm text-onSurfaceDim">No paid/membership subscribers yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {subscribers.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded bg-bg px-3 py-2 text-sm">
                    <span>@{s.username}</span>
                    <span className="text-onSurfaceDim">{s.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Recent post performance">
            <h2 className="mb-3 text-xl font-bold">Recent Posts &amp; Reach</h2>
            <div className="flex flex-col gap-3">
              {stats.recentPosts.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
                  <Link href={`/posts/${p.id}`} className="truncate font-medium hover:underline">
                    {p.content || '(media post)'}
                  </Link>
                  <p className="shrink-0 text-sm text-onSurfaceDim">
                    {p.status === 'scheduled' && '⏰ Scheduled · '}
                    {p.viewCount} views · {p.likeCount} likes · {p.commentCount} comments
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
