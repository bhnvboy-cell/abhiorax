'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Post, Profile } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { PostCard } from '@/components/feed/PostCard';

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { user, status } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [graphTab, setGraphTab] = useState<'followers' | 'following' | null>(null);
  const [graphUsers, setGraphUsers] = useState<Profile[]>([]);
  const [tipAmount, setTipAmount] = useState('5');
  const [tipNotice, setTipNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (status === 'authenticated') {
        const [data, userPosts] = await Promise.all([
          api.users.get<Profile>(username),
          api.users.posts<Post[]>(username).catch(() => [] as Post[]),
        ]);
        setProfile(data);
        setPosts(userPosts);
      } else {
        const pub = await api.public.profile<{ profile: Profile; posts: Post[] }>(username);
        setProfile(pub.profile);
        setPosts(pub.posts);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'This profile could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [username, status]);

  useEffect(() => {
    if (status !== 'loading') {
      void load();
    }
  }, [status, load]);

  const toggleFollow = async () => {
    if (!profile || busy) return;
    setBusy(true);
    const previous = profile.isFollowing;
    const prevFollowerCount = profile.followerCount;
    setProfile({
      ...profile,
      isFollowing: !previous,
      followerCount: Math.max(0, (prevFollowerCount ?? 0) + (previous ? -1 : 1)),
    });
    try {
      await (previous ? api.users.unfollow(profile.username) : api.users.follow(profile.username));
    } catch {
      setProfile((p) => (p ? { ...p, isFollowing: previous, followerCount: prevFollowerCount } : p));
    } finally {
      setBusy(false);
    }
  };

  const openGraph = async (tab: 'followers' | 'following') => {
    if (!profile) return;
    if (graphTab === tab) {
      setGraphTab(null);
      return;
    }
    setGraphTab(tab);
    try {
      const list = await (tab === 'followers'
        ? api.users.followers<Profile[]>(profile.username)
        : api.users.following<Profile[]>(profile.username));
      setGraphUsers(list);
    } catch {
      setGraphUsers([]);
    }
  };

  const startMessage = async () => {
    if (!profile) return;
    try {
      const conv = await api.post<{ id: string }>('/chat/conversations', { participantId: profile.id });
      router.push(`/chat?c=${encodeURIComponent(conv.id)}`);
    } catch {
      router.push('/chat');
    }
  };

  const toggleBlock = async () => {
    if (!profile || busy) return;
    setBusy(true);
    const prevBlocked = !!profile.isBlocked;
    try {
      await (prevBlocked ? api.users.unblock(profile.username) : api.users.block(profile.username));
      setProfile({
        ...profile,
        isBlocked: !prevBlocked,
        isFollowing: prevBlocked ? profile.isFollowing : false,
      });
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const toggleSubscribe = async () => {
    if (!profile || busy) return;
    setBusy(true);
    try {
      const res = await api.creator.subscribe(profile.username);
      setProfile({
        ...profile,
        isSubscribed: res.subscribed,
        subscriberCount: Math.max(0, (profile.subscriberCount ?? 0) + (res.subscribed ? 1 : -1)),
      });
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const sendTip = async () => {
    if (!profile) return;
    const amount = Number(tipAmount);
    if (Number.isNaN(amount) || amount < 1) return;
    try {
      await api.creator.tip({ creatorUsername: profile.username, amountUsd: amount });
      setTipNotice(`Sent $${amount.toFixed(2)} tip to @${profile.username}!`);
    } catch {
      setTipNotice('Could not send tip.');
    }
  };

  if (status === 'loading')
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-6">
        <h1 className="sr-only">User profile</h1>
        <p aria-live="polite">Loading profile…</p>
      </main>
    );
  if (loading)
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-6">
        <h1 className="sr-only">User profile</h1>
        <p aria-live="polite">Loading profile…</p>
      </main>
    );
  if (error)
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-6">
        <h1 className="sr-only">User profile</h1>
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-4 py-2 text-danger">
          {error}
        </p>
      </main>
    );
  if (!profile)
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-6">
        <h1 className="sr-only">User profile</h1>
      </main>
    );

  const isSelf = user && (user.userId === profile.id || user.id === profile.id);

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-6">
      <header className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-start gap-4">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt={`Avatar of ${profile.displayName ?? profile.username}`}
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 text-3xl font-bold text-primary"
            >
              {(profile.displayName ?? profile.username ?? '?').slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              {profile.displayName ?? profile.username}
              {profile.verified && (
                <span role="img" aria-label="Verified account" title="Verified account">
                  ✓
                </span>
              )}
            </h1>
            <p className="text-onSurfaceDim">@{profile.username}</p>
            {profile.bio && <p className="mt-2">{profile.bio}</p>}
            {(profile.location || profile.website) && (
              <p className="mt-2 flex flex-wrap gap-4 text-sm text-onSurfaceDim">
                {profile.location && <span>📍 {profile.location}</span>}
                {profile.website && (
                  <a href={profile.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {profile.website}
                  </a>
                )}
              </p>
            )}
          </div>
        </div>

        <dl className="mt-4 flex gap-6 text-base">
          <div>
            <dt className="sr-only">Followers</dt>
            <dd className="flex items-center gap-1.5">
              <span className="font-semibold">{profile.followerCount}</span>
              <span className="text-onSurfaceDim">followers</span>
              <button
                type="button"
                aria-label="Show subscriber list"
                onClick={() => openGraph('followers')}
                className="text-xs text-primary hover:underline"
              >
                (view)
              </button>
            </dd>
          </div>
          <div>
            <dt className="sr-only">Following</dt>
            <dd className="flex items-center gap-1.5">
              <span className="font-semibold">{profile.followingCount}</span>
              <span className="text-onSurfaceDim">following</span>
              <button
                type="button"
                aria-label="Show subscriptions list"
                onClick={() => openGraph('following')}
                className="text-xs text-primary hover:underline"
              >
                (view)
              </button>
            </dd>
          </div>
          <div>
            <dt className="sr-only">Posts</dt>
            <dd>
              <span className="font-semibold">{posts.length}</span>{' '}
              <span className="text-onSurfaceDim">posts</span>
            </dd>
          </div>
        </dl>

        {graphTab && (
          <div className="mt-4 rounded-lg border border-border bg-bg p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold capitalize">{graphTab}</p>
              <button type="button" onClick={() => setGraphTab(null)} className="text-sm text-primary underline">
                Close
              </button>
            </div>
            {graphUsers.length === 0 ? (
              <p className="text-sm text-onSurfaceDim">No users yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-3">
                {graphUsers.map((u) => (
                  <li key={u.id}>
                    <Link href={`/u/${encodeURIComponent(u.username)}`} className="text-sm font-medium text-primary hover:underline">
                      @{u.username}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {status !== 'authenticated' ? (
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 font-semibold text-onPrimary hover:bg-primaryHover"
            >
              Log in to connect
            </Link>
          ) : !isSelf ? (
            <>
              <button
                onClick={toggleFollow}
                disabled={busy}
                aria-pressed={!!profile.isFollowing}
                className={`min-h-11 rounded-md px-5 font-semibold transition-colors disabled:opacity-60 ${
                  profile.isFollowing
                    ? 'border border-border bg-surfaceAlt text-onSurface hover:bg-surface'
                    : 'bg-primary text-onPrimary hover:bg-primaryHover'
                }`}
              >
                {profile.isFollowing ? 'Following' : 'Follow'}
              </button>
              <button
                type="button"
                onClick={toggleSubscribe}
                disabled={busy}
                aria-pressed={!!profile.isSubscribed}
                className="min-h-11 rounded-md border border-primary bg-primary/10 px-4 text-sm font-semibold text-primary hover:bg-primary/20"
              >
                {profile.isSubscribed ? 'Subscribed' : 'Subscribe'}
              </button>
              <button
                type="button"
                onClick={startMessage}
                className="min-h-11 rounded-md border border-border bg-bg px-5 font-semibold hover:bg-surfaceAlt"
              >
                Message
              </button>
              <div className="flex items-center gap-1">
                <label htmlFor="tip-amount" className="sr-only">
                  Tip amount in USD
                </label>
                <select
                  id="tip-amount"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  className="min-h-11 rounded-md border border-border bg-bg px-2 text-sm"
                >
                  <option value="2">$2</option>
                  <option value="5">$5</option>
                  <option value="10">$10</option>
                  <option value="25">$25</option>
                </select>
                <button
                  type="button"
                  onClick={sendTip}
                  className="min-h-11 rounded-md border border-border bg-bg px-3 text-sm font-medium hover:bg-surfaceAlt"
                >
                  Tip
                </button>
              </div>
              <button
                type="button"
                onClick={toggleBlock}
                disabled={busy}
                aria-pressed={!!profile.isBlocked}
                className="min-h-11 rounded-md border border-border bg-bg px-4 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                {profile.isBlocked ? 'Unblock' : 'Block'}
              </button>
            </>
          ) : (
            <Link
              href="/settings"
              className="inline-flex min-h-11 items-center rounded-md border border-border bg-bg px-5 font-semibold hover:bg-surfaceAlt"
            >
              Edit profile
            </Link>
          )}
        </div>
        {tipNotice && (
          <p role="status" className="mt-3 text-sm text-primary">
            {tipNotice}
          </p>
        )}
      </header>

      <section aria-label="Posts" className="mt-6 flex flex-col gap-4">
        <h2 className="text-xl font-bold">Posts</h2>
        {posts.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-6 text-center text-onSurfaceDim">
            No posts yet.
          </p>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
            />
          ))
        )}
      </section>
    </main>
  );
}
