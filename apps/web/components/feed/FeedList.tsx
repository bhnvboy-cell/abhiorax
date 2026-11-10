'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { FeedItem, Post as PostType } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { PostCard } from './PostCard';
import { Composer } from './Composer';
import { StoriesBar } from './StoriesBar';
import { OnboardingCard } from './OnboardingCard';

type FeedTab = 'for_you' | 'following' | 'groups' | 'saved';

/**
 * Controllable feed with For You (AI ranked), Following (chronological),
 * Groups, and Saved tabs, plus keyword mute filtering and onboarding.
 */
export function FeedList() {
  const { status } = useAuth();
  const [tab, setTab] = useState<FeedTab>('for_you');
  const [mutedKeywords, setMutedKeywords] = useState('');
  const [items, setItems] = useState<FeedItem[]>([]);
  const [savedPosts, setSavedPosts] = useState<PostType[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);

  const load = useCallback(
    async (reset = false, cursor?: string) => {
      if (tab === 'saved') return;
      setLoading(true);
      setError(null);
      try {
        const muteParam = mutedKeywords.trim() ? `&mute=${encodeURIComponent(mutedKeywords.trim())}` : '';
        const path = `/feed?limit=20&mode=${tab}${muteParam}${reset ? '&refresh=true' : ''}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        const res = await api.page<FeedItem[]>(path);
        setItems((prev) => (reset || !cursor ? res.data : [...prev, ...res.data]));
        setNextCursor((res.meta?.nextCursor as string | null) ?? null);
        if (liveRef.current) {
          liveRef.current.textContent = res.data.length
            ? `Loaded ${res.data.length} more posts.`
            : 'No more posts to load.';
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not load your feed.');
      } finally {
        setLoading(false);
      }
    },
    [tab, mutedKeywords],
  );

  const loadSaved = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.posts.saved<PostType[]>();
      setSavedPosts(list);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load saved posts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'authenticated') {
      if (tab === 'saved') void loadSaved();
      else void load(true);
    } else {
      setLoading(false);
      setItems([]);
    }
  }, [status, tab, load, loadSaved]);

  useEffect(() => {
    if (tab === 'saved') return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && nextCursor) {
          void load(false, nextCursor);
        }
      },
      { rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [tab, nextCursor, loading, load]);

  const onCreated = useCallback((post: PostType) => {
    setItems((prev) => [{ post, rankScore: 1, reason: 'Just posted' }, ...prev]);
    if (liveRef.current) liveRef.current.textContent = 'Your post was published.';
  }, []);

  const onDeleted = useCallback((postId: string) => {
    setItems((prev) => prev.filter((item) => item.post.id !== postId));
    setSavedPosts((prev) => prev.filter((post) => post.id !== postId));
    if (liveRef.current) liveRef.current.textContent = 'Post deleted.';
  }, []);

  if (status === 'unauthenticated') {
    return (
      <p className="rounded-xl border border-border bg-surface p-6 text-center">
        <Link href="/login" className="font-semibold text-primary underline">
          Log in
        </Link>{' '}
        to see your personalized feed.
      </p>
    );
  }

  if (status === 'loading') {
    return <p aria-live="polite">Checking your session…</p>;
  }

  if (error) {
    return (
      <p role="alert" className="rounded-md border border-danger bg-danger/10 px-4 py-2 text-danger">
        {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Feed views" className="flex flex-wrap gap-2">
          {(
            [
              ['for_you', 'For you'],
              ['following', 'Following'],
              ['groups', 'Groups'],
              ['saved', 'Saved'],
            ] as Array<[FeedTab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`min-h-11 rounded-md px-4 text-sm font-semibold ${
                tab === key ? 'bg-primary text-onPrimary' : 'border border-border bg-surface hover:bg-surfaceAlt'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab !== 'saved' && (
          <div className="flex items-center gap-2">
            <label htmlFor="feed-mute" className="sr-only">
              Mute keywords
            </label>
            <input
              id="feed-mute"
              value={mutedKeywords}
              onChange={(e) => setMutedKeywords(e.target.value)}
              placeholder="Mute keywords (comma-sep)…"
              className="min-h-11 rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
            />
          </div>
        )}
      </div>

      {tab === 'for_you' && <OnboardingCard onCompleted={() => void load(true)} />}
      {tab !== 'saved' && <StoriesBar />}
      {tab !== 'saved' && <Composer onCreated={onCreated} />}

      <p ref={liveRef} aria-live="polite" className="sr-only" />

      {tab !== 'saved' ? (
        <>
          {items.length === 0 && !loading && (
            <p className="rounded-xl border border-border bg-surface p-6 text-center text-onSurfaceDim">
              Your feed is quiet — follow people, join groups, or publish a post to get started.
            </p>
          )}
          {items.map((item) => (
            <PostCard key={item.post.id} post={item.post} reason={item.reason} onDeleted={onDeleted} />
          ))}
        </>
      ) : (
        <>
          {savedPosts.length === 0 && !loading && (
            <p className="rounded-xl border border-border bg-surface p-6 text-center text-onSurfaceDim">
              No saved posts yet. Click Save on any post to bookmark it here.
            </p>
          )}
          {savedPosts.map((post) => (
            <PostCard key={post.id} post={post} onDeleted={onDeleted} />
          ))}
        </>
      )}

      {loading && <p className="text-center text-onSurfaceDim">Loading posts…</p>}
      <div ref={sentinelRef} aria-hidden />
    </div>
  );
}
