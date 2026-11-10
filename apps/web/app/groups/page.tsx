'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { GroupItem, Post } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { PostCard } from '@/components/feed/PostCard';
import { Composer } from '@/components/feed/Composer';

const CATEGORIES = ['All', 'Tech', 'Accessibility', 'Design', 'Creators', 'General'];

export default function GroupsPage() {
  const { user, status } = useAuth();
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [category, setCategory] = useState('All');
  const [selectedGroup, setSelectedGroup] = useState<GroupItem | null>(null);
  const [groupPosts, setGroupPosts] = useState<Post[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [newCategory, setNewCategory] = useState('Tech');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.groups.list<GroupItem[]>(category);
      setGroups(list);
      if (list.length > 0 && (!selectedGroup || !list.some((g) => g.id === selectedGroup.id))) {
        setSelectedGroup(list[0]);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load groups.');
    } finally {
      setLoading(false);
    }
  }, [category, selectedGroup]);

  const loadPosts = useCallback(async (groupId: string) => {
    try {
      const list = await api.groups.posts<Post[]>(groupId);
      setGroupPosts(list);
    } catch {
      setGroupPosts([]);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') void loadGroups();
    else if (status === 'unauthenticated') setLoading(false);
  }, [status, loadGroups]);

  useEffect(() => {
    if (status === 'authenticated' && selectedGroup) {
      void loadPosts(selectedGroup.id);
    }
  }, [status, selectedGroup, loadPosts]);

  const createGroup = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      const created = await api.groups.create<GroupItem>({
        name: name.trim(),
        description: description.trim(),
        category: newCategory,
      });
      setGroups((prev) => [created, ...prev]);
      setSelectedGroup(created);
      setName('');
      setDescription('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create group.');
    }
  };

  const toggleJoin = async (g: GroupItem) => {
    try {
      const res = await (g.isMember ? api.groups.leave(g.id) : api.groups.join(g.id));
      setGroups((prev) =>
        prev.map((item) =>
          item.id === g.id ? { ...item, isMember: res.isMember, memberCount: res.memberCount } : item,
        ),
      );
      if (selectedGroup?.id === g.id) {
        setSelectedGroup({ ...g, isMember: res.isMember, memberCount: res.memberCount });
      }
    } catch {
      setError('Could not update group membership.');
    }
  };

  const togglePin = async (postId: string) => {
    if (!selectedGroup) return;
    const nextPin = selectedGroup.pinnedPostId === postId ? null : postId;
    try {
      await api.groups.pin(selectedGroup.id, nextPin);
      setSelectedGroup({ ...selectedGroup, pinnedPostId: nextPin });
      setGroups((prev) => prev.map((g) => (g.id === selectedGroup.id ? { ...g, pinnedPostId: nextPin } : g)));
    } catch {
      setError('Could not update pinned post.');
    }
  };

  if (status === 'loading') {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold">Groups</h1>
        <p aria-live="polite">Loading groups…</p>
      </main>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold">Groups</h1>
        <p>
          <Link href="/login" className="font-semibold text-primary underline">
            Log in
          </Link>{' '}
          to join and post in community groups.
        </p>
      </main>
    );
  }

  const pinnedPost = selectedGroup?.pinnedPostId
    ? groupPosts.find((p) => p.id === selectedGroup.pinnedPostId)
    : null;
  const canPin =
    !!selectedGroup && !!user && (selectedGroup.ownerId === user.id || selectedGroup.ownerId === user.userId || user.role === 'admin');

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold">Groups</h1>
      <p className="mb-6 text-onSurfaceDim">Discover communities by topic, run polls, and chat together.</p>

      {error && (
        <p role="alert" className="mb-4 rounded-md border border-danger bg-danger/10 px-4 py-2 text-danger">
          {error}
        </p>
      )}

      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter groups by category">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            aria-pressed={category === cat}
            className={`min-h-10 rounded-full px-4 text-sm font-medium ${
              category === cat ? 'bg-primary text-onPrimary' : 'border border-border bg-surface hover:bg-surfaceAlt'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <form onSubmit={createGroup} className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Create a group</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="group-name" className="sr-only">
            Group name
          </label>
          <input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name (3-60 chars)"
            className="min-h-11 flex-1 rounded-md border border-border bg-bg px-4 py-2"
          />
          <label htmlFor="group-cat" className="sr-only">
            Category
          </label>
          <select
            id="group-cat"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="min-h-11 rounded-md border border-border bg-bg px-3 py-2"
          >
            {CATEGORIES.filter((c) => c !== 'All').map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="group-desc" className="sr-only">
            Description
          </label>
          <input
            id="group-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description (optional)"
            className="min-h-11 flex-1 rounded-md border border-border bg-bg px-4 py-2"
          />
          <button
            type="submit"
            disabled={name.trim().length < 3}
            className="min-h-11 rounded-md bg-primary px-5 font-semibold text-onPrimary hover:bg-primaryHover disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </form>

      {loading ? (
        <p aria-live="polite">Loading groups…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <div
              key={g.id}
              className={`rounded-xl border p-4 ${
                selectedGroup?.id === g.id ? 'border-primary bg-surface' : 'border-border bg-surface'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-medium text-primary">{g.category ?? 'General'}</span>
                  <div>
                    <button
                      type="button"
                      onClick={() => setSelectedGroup(g)}
                      className="text-left text-lg font-semibold hover:underline"
                    >
                      {g.name}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleJoin(g)}
                  aria-pressed={g.isMember}
                  className={`min-h-11 rounded-md px-3 text-sm font-semibold ${
                    g.isMember ? 'border border-border bg-bg hover:bg-surfaceAlt' : 'bg-primary text-onPrimary hover:bg-primaryHover'
                  }`}
                >
                  {g.isMember ? 'Joined' : 'Join'}
                </button>
              </div>
              {g.description && <p className="mt-1 text-sm text-onSurfaceDim">{g.description}</p>}
              <div className="mt-3 flex items-center justify-between text-xs text-onSurfaceDim">
                <span>{g.memberCount} members</span>
                <Link href={`/chat?c=${encodeURIComponent(`group-${g.id}`)}`} className="font-medium text-primary hover:underline">
                  Group chat →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedGroup && (
        <section aria-label={selectedGroup.name} className="mt-8 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">{selectedGroup.name} — Feed</h2>
            <Link
              href={`/chat?c=${encodeURIComponent(`group-${selectedGroup.id}`)}`}
              className="min-h-10 inline-flex items-center rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-surfaceAlt"
            >
              Open group chat
            </Link>
          </div>

          {pinnedPost && (
            <div className="rounded-xl border border-primary/50 bg-primary/10 p-4">
              <p className="mb-1 text-xs font-bold uppercase text-primary">Pinned post</p>
              <p className="text-base">{pinnedPost.content}</p>
            </div>
          )}

          <Composer
            groupId={selectedGroup.id}
            placeholder={`Share a post, photo, video, or poll in ${selectedGroup.name}…`}
            onCreated={(post) => setGroupPosts((prev) => [post, ...prev])}
          />

          {groupPosts.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-6 text-center text-onSurfaceDim">
              No posts in this group yet.
            </p>
          ) : (
            groupPosts.map((p) => (
              <div key={p.id} className="flex flex-col gap-1">
                <PostCard
                  post={p}
                  onDeleted={(id) => setGroupPosts((prev) => prev.filter((x) => x.id !== id))}
                />
                {canPin && (
                  <button
                    type="button"
                    onClick={() => togglePin(p.id)}
                    className="self-end text-xs font-medium text-primary underline"
                  >
                    {selectedGroup.pinnedPostId === p.id ? 'Unpin post' : 'Pin to top'}
                  </button>
                )}
              </div>
            ))
          )}
        </section>
      )}
    </main>
  );
}
