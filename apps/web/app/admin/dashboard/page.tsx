'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

interface AdminStats {
  users: number;
  posts: number;
  comments: number;
  groups: number;
  conversations: number;
  reports: number;
  openReports: number;
}

interface ReportItem {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  reporterUsername: string;
  targetPreview?: string;
  createdAt: string;
}

interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
}

export default function AdminDashboardPage() {
  const { user, status } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, r, u] = await Promise.all([
        api.admin.stats<AdminStats>(),
        api.admin.reports<ReportItem[]>(),
        api.admin.users<AdminUser[]>(),
      ]);
      setStats(s);
      setReports(r);
      setUsers(u);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Admin access required.');
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') void load();
  }, [status, load]);

  const handleReport = async (id: string, nextStatus: 'actioned' | 'dismissed', deleteTarget = false) => {
    try {
      await api.admin.reviewReport(id, { status: nextStatus, deleteTarget });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update report.');
    }
  };

  const changeRole = async (id: string, role: string) => {
    try {
      await api.admin.setUserRole(id, role);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update role.');
    }
  };

  if (status === 'loading') {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold">Admin Dashboard</h1>
        <p aria-live="polite">Loading admin console…</p>
      </main>
    );
  }

  if (status === 'unauthenticated' || user?.role !== 'admin') {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold">Admin Dashboard</h1>
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-4 py-3 text-danger">
          Administrator privileges are required to view this page.{' '}
          <Link href="/feed" className="underline">
            Return to feed
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold">Admin Dashboard</h1>
      <p className="mb-6 text-onSurfaceDim">Platform metrics, trust &amp; safety moderation queue, and RBAC management.</p>

      {error && (
        <p role="alert" className="mb-4 rounded-md border border-danger bg-danger/10 px-4 py-2 text-danger">
          {error}
        </p>
      )}

      {stats && (
        <section aria-label="Platform statistics" className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            ['Users', stats.users],
            ['Posts', stats.posts],
            ['Comments', stats.comments],
            ['Groups', stats.groups],
            ['Conversations', stats.conversations],
            ['Open reports', stats.openReports],
          ].map(([label, val]) => (
            <div key={String(label)} className="rounded-xl border border-border bg-surface p-4">
              <p className="text-sm text-onSurfaceDim">{label}</p>
              <p className="mt-1 text-2xl font-bold">{val}</p>
            </div>
          ))}
        </section>
      )}

      <section aria-label="Moderation queue" className="mb-8">
        <h2 className="mb-3 text-xl font-bold">Moderation Queue</h2>
        {reports.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-5 text-onSurfaceDim">No reports submitted.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {reports.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    <span className="font-semibold">@{r.reporterUsername}</span> reported{' '}
                    <span className="font-semibold">{r.targetType}</span> ({r.reason}) ·{' '}
                    <span className="uppercase">{r.status}</span>
                  </p>
                  {r.status === 'open' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleReport(r.id, 'dismissed')}
                        className="min-h-11 rounded-md border border-border px-3 text-sm hover:bg-surfaceAlt"
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReport(r.id, 'actioned', true)}
                        className="min-h-11 rounded-md bg-danger px-3 text-sm font-semibold text-onPrimary"
                      >
                        Remove content
                      </button>
                    </div>
                  )}
                </div>
                {r.targetPreview && <p className="mt-2 rounded bg-bg p-2 text-sm text-onSurfaceDim">{r.targetPreview}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="User roles">
        <h2 className="mb-3 text-xl font-bold">Users &amp; Roles</h2>
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
              <div>
                <p className="font-semibold">@{u.username}</p>
                <p className="text-xs text-onSurfaceDim">{u.email}</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <span className="sr-only">Role for {u.username}</span>
                <select
                  value={u.role}
                  onChange={(e) => changeRole(u.id, e.target.value)}
                  className="min-h-11 rounded-md border border-border bg-bg px-3 py-1.5"
                >
                  <option value="user">user</option>
                  <option value="creator">creator</option>
                  <option value="moderator">moderator</option>
                  <option value="admin">admin</option>
                </select>
              </label>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
