'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Post, PostPoll, ReactionType } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

interface PostCardProps {
  post: Post;
  reason?: string;
  onDeleted?: (postId: string) => void;
}

const REACTIONS: Array<{ type: ReactionType; emoji: string; label: string }> = [
  { type: 'like', emoji: '👍', label: 'Like' },
  { type: 'love', emoji: '❤️', label: 'Love' },
  { type: 'haha', emoji: '😂', label: 'Haha' },
  { type: 'wow', emoji: '😮', label: 'Wow' },
  { type: 'sad', emoji: '😢', label: 'Sad' },
  { type: 'angry', emoji: '😡', label: 'Angry' },
  { type: 'care', emoji: '🤗', label: 'Care' },
];

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const units: Array<[number, string]> = [
    [31536000, 'year'],
    [2592000, 'month'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ];
  for (const [secs, label] of units) {
    const value = Math.floor(seconds / secs);
    if (value >= 1) return `${value} ${label}${value > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

function renderContentWithHashtags(content: string) {
  const parts = content.split(/(#[a-zA-Z0-9_]+|@[a-zA-Z0-9_]+)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('#') && part.length > 1) {
      return (
        <Link
          key={idx}
          href={`/search?q=${encodeURIComponent(part)}`}
          className="font-medium text-primary hover:underline"
        >
          {part}
        </Link>
      );
    }
    if (part.startsWith('@') && part.length > 1) {
      return (
        <Link
          key={idx}
          href={`/u/${encodeURIComponent(part.slice(1))}`}
          className="font-medium text-primary hover:underline"
        >
          {part}
        </Link>
      );
    }
    return part;
  });
}

/**
 * Accessible post card: multi-media, interactive polls, AI TL;DR summary,
 * 7-reaction picker, save, share, report, edit, and delete.
 */
export function PostCard({ post, reason, onDeleted }: PostCardProps) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(!!post.viewerLiked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [myReaction, setMyReaction] = useState<ReactionType | null>(post.viewerReaction ?? null);
  const [reactionCounts, setReactionCounts] = useState<Partial<Record<ReactionType, number>>>(post.reactionCounts ?? {});
  const [showReactions, setShowReactions] = useState(false);
  const [saved, setSaved] = useState(!!post.viewerSaved);
  const [shareCount, setShareCount] = useState(post.shareCount ?? 0);
  const [poll, setPoll] = useState<PostPoll | undefined>(post.poll);
  const [summary, setSummary] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content ?? '');
  const [displayContent, setDisplayContent] = useState(post.content ?? '');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const author = post.author ?? {
    username: post.authorId,
    displayName: 'ABHIORAX user',
    avatarUrl: undefined,
    a11yVerified: false,
  };
  const handle = author.username ?? post.authorId;
  const isOwner = !!user && (user.id === post.authorId || user.userId === post.authorId);
  const canDelete = isOwner || user?.role === 'admin';

  const toggleLike = async () => {
    if (busy || !user) return;
    setBusy(true);
    const previousLiked = liked;
    setLiked(!previousLiked);
    setLikeCount((c) => c + (previousLiked ? -1 : 1));
    try {
      const res = await api.posts.like(post.id);
      setLiked(res.liked);
      setLikeCount(res.likeCount);
    } catch {
      setLiked(previousLiked);
      setLikeCount((c) => c + (previousLiked ? 1 : -1));
    } finally {
      setBusy(false);
    }
  };

  const toggleReaction = async (reaction: ReactionType) => {
    setShowReactions(false);
    try {
      const res = await api.posts.react(post.id, reaction);
      setMyReaction((res.reaction as ReactionType | null) ?? null);
      setReactionCounts(res.reactionCounts ?? {});
    } catch {
      setStatusNotice('Could not update reaction.');
    }
  };

  const votePoll = async (optionId: string) => {
    if (!user) return;
    try {
      const updated = await api.posts.vote<PostPoll>(post.id, optionId);
      setPoll(updated);
    } catch {
      setStatusNotice('Could not record vote.');
    }
  };

  const summarize = async () => {
    if (summary) {
      setSummary(null);
      return;
    }
    try {
      const res = await api.ai.summarize(displayContent);
      setSummary(`${res.summary} (~${res.readingSeconds}s read)`);
    } catch {
      setStatusNotice('Summary unavailable.');
    }
  };

  const toggleSave = async () => {
    const prev = saved;
    setSaved(!prev);
    try {
      const res = await api.posts.save(post.id);
      setSaved(res.saved);
      setStatusNotice(res.saved ? 'Saved to bookmarks.' : 'Removed from bookmarks.');
    } catch {
      setSaved(prev);
    }
  };

  const sharePost = async () => {
    try {
      const res = await api.posts.share(post.id);
      setShareCount(res.shareCount);
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(`${window.location.origin}/posts/${post.id}`).catch(() => undefined);
      }
      setStatusNotice('Post link copied.');
    } catch {
      setStatusNotice('Could not share post.');
    }
  };

  const reportPost = async () => {
    if (reported) return;
    try {
      await api.tns.report({ targetType: 'post', targetId: post.id, reason: 'spam' });
      setReported(true);
      setStatusNotice('Reported for moderator review.');
    } catch {
      setStatusNotice('Could not submit report.');
    }
  };

  const deletePost = async () => {
    if (!canDelete) return;
    try {
      await api.posts.delete(post.id);
      onDeleted?.(post.id);
    } catch {
      setStatusNotice('Could not delete post.');
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editContent.trim()) return;
    try {
      const updated = await api.posts.update<Post>(post.id, { content: editContent.trim() });
      setDisplayContent(updated.content ?? editContent.trim());
      setEditing(false);
      setStatusNotice('Post updated.');
    } catch {
      setStatusNotice('Could not update post.');
    }
  };

  const activeReactions = REACTIONS.filter((r) => (reactionCounts[r.type] ?? 0) > 0);
  const totalVotes = poll ? poll.options.reduce((s, o) => s + o.voteCount, 0) : 0;

  return (
    <article className="rounded-xl border border-border bg-surface p-5" aria-labelledby={`post-${post.id}-title`}>
      {reason && (
        <p className="mb-2 text-xs font-medium text-onSurfaceDim">
          {reason}
        </p>
      )}
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {author.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={author.avatarUrl} alt="" aria-hidden className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-lg font-bold text-primary"
            >
              {(author.displayName ?? '?').slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="flex min-w-0 flex-col">
            <h2 id={`post-${post.id}-title`} className="flex items-center gap-1.5 truncate text-base font-semibold">
              <Link href={`/u/${encodeURIComponent(handle)}`} className="hover:underline">
                {author.displayName ?? handle}
              </Link>
              {author.a11yVerified && (
                <span
                  title="Accessibility Verified Creator"
                  className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary"
                >
                  A11y
                </span>
              )}
            </h2>
            <p className="text-sm text-onSurfaceDim">
              @{handle} · <time dateTime={post.publishedAt}>{timeAgo(post.publishedAt)}</time>
              {post.visibility && post.visibility !== 'public' && ` · ${post.visibility.replace('_', ' ')}`}
            </p>
          </div>
        </div>
        {user && (
          <div className="flex items-center gap-1">
            {displayContent.length > 160 && (
              <button
                type="button"
                onClick={summarize}
                className="min-h-11 rounded-md px-2.5 text-xs font-medium text-primary hover:bg-surfaceAlt"
              >
                {summary ? 'Hide TL;DR' : 'TL;DR'}
              </button>
            )}
            {isOwner && (
              <button
                type="button"
                onClick={() => {
                  setEditContent(displayContent);
                  setEditing((v) => !v);
                }}
                className="min-h-11 rounded-md px-2.5 text-sm text-onSurfaceDim hover:bg-surfaceAlt"
              >
                {editing ? 'Cancel' : 'Edit'}
              </button>
            )}
            {!isOwner && (
              <button
                type="button"
                onClick={reportPost}
                disabled={reported}
                className="min-h-11 rounded-md px-2.5 text-sm text-onSurfaceDim hover:bg-surfaceAlt disabled:opacity-50"
              >
                {reported ? 'Reported' : 'Report'}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={deletePost}
                className="min-h-11 rounded-md px-2.5 text-sm text-danger hover:bg-danger/10"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </header>

      {summary && (
        <p className="mb-3 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
          <span className="font-semibold">AI TL;DR:</span> {summary}
        </p>
      )}

      {editing ? (
        <form onSubmit={saveEdit} className="flex flex-col gap-2">
          <label htmlFor={`edit-post-${post.id}`} className="sr-only">
            Edit post content
          </label>
          <textarea
            id={`edit-post-${post.id}`}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={3}
            maxLength={4000}
            className="w-full rounded-md border border-border bg-bg p-3 text-base"
          />
          <button
            type="submit"
            disabled={!editContent.trim()}
            className="min-h-11 self-end rounded-md bg-primary px-4 text-sm font-semibold text-onPrimary disabled:opacity-50"
          >
            Save
          </button>
        </form>
      ) : (
        displayContent && <p className="whitespace-pre-wrap text-base">{renderContentWithHashtags(displayContent)}</p>
      )}

      {post.media && post.media.length > 0 && (
        <div className={`mt-4 grid gap-2 ${post.media.length > 1 ? 'sm:grid-cols-2' : ''}`}>
          {post.media.map((m) =>
            m.type === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={m.key}
                src={m.key}
                alt={m.altText ?? `${post.content ?? 'Post'} image`}
                className="w-full rounded-lg object-cover"
              />
            ) : m.type === 'video' ? (
              <video key={m.key} src={m.key} controls className="w-full rounded-lg">
                <track kind="captions" srcLang="en" label="Captions" />
              </video>
            ) : m.type === 'audio' ? (
              <audio key={m.key} src={m.key} controls className="w-full" />
            ) : null,
          )}
        </div>
      )}

      {poll && (
        <div className="mt-4 rounded-lg border border-border bg-bg p-3" role="group" aria-label={poll.question}>
          <p className="mb-2 font-semibold">{poll.question}</p>
          <div className="flex flex-col gap-2">
            {poll.options.map((opt) => {
              const pct = totalVotes > 0 ? Math.round((opt.voteCount / totalVotes) * 100) : 0;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => votePoll(opt.id)}
                  aria-pressed={!!opt.voted}
                  className={`flex min-h-10 items-center justify-between rounded border px-3 text-sm ${
                    opt.voted ? 'border-primary bg-primary/15 font-semibold' : 'border-border bg-surface hover:bg-surfaceAlt'
                  }`}
                >
                  <span>{opt.text}</span>
                  <span className="text-xs text-onSurfaceDim">
                    {pct}% ({opt.voteCount})
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-onSurfaceDim">{totalVotes} votes</p>
        </div>
      )}

      {activeReactions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Post reactions">
          {activeReactions.map((r) => (
            <button
              key={r.type}
              type="button"
              onClick={() => toggleReaction(r.type)}
              aria-pressed={myReaction === r.type}
              className={`min-h-9 rounded-full border px-2.5 text-xs ${
                myReaction === r.type ? 'border-primary bg-primary/20 text-onSurface' : 'border-border bg-bg text-onSurfaceDim'
              }`}
            >
              {r.emoji} {reactionCounts[r.type]}
            </button>
          ))}
        </div>
      )}

      {showReactions && (
        <div role="group" aria-label="Choose a reaction" className="mt-3 flex flex-wrap gap-1 rounded-lg border border-border bg-bg p-2">
          {REACTIONS.map((r) => (
            <button
              key={r.type}
              type="button"
              onClick={() => toggleReaction(r.type)}
              aria-label={r.label}
              aria-pressed={myReaction === r.type}
              className={`min-h-11 rounded-md px-2.5 text-lg hover:bg-surfaceAlt ${
                myReaction === r.type ? 'bg-primary/20' : ''
              }`}
            >
              {r.emoji}
            </button>
          ))}
        </div>
      )}

      {statusNotice && (
        <p role="status" className="mt-2 text-xs text-onSurfaceDim">
          {statusNotice}
        </p>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button
          onClick={toggleLike}
          aria-pressed={liked}
          disabled={busy || !user}
          aria-label={liked ? `Unlike (${likeCount} likes)` : `Like (${likeCount} likes)`}
          className="flex min-h-11 items-center gap-2 rounded-md px-3 text-base transition-colors hover:bg-surfaceAlt disabled:opacity-60"
        >
          <span aria-hidden>{liked ? '❤️' : '🤍'}</span>
          <span>{likeCount}</span>
        </button>
        {user && (
          <button
            type="button"
            onClick={() => setShowReactions((v) => !v)}
            aria-expanded={showReactions}
            className="min-h-11 rounded-md px-3 text-sm text-onSurfaceDim transition-colors hover:bg-surfaceAlt"
          >
            React
          </button>
        )}
        <Link
          href={`/posts/${post.id}`}
          aria-label={`${post.commentCount} comments`}
          className="flex min-h-11 items-center gap-2 rounded-md px-3 text-base text-onSurfaceDim transition-colors hover:bg-surfaceAlt"
        >
          <span aria-hidden>💬</span>
          <span>{post.commentCount}</span>
        </Link>
        {user && (
          <>
            <button
              type="button"
              onClick={sharePost}
              className="flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm text-onSurfaceDim transition-colors hover:bg-surfaceAlt"
            >
              <span aria-hidden>↗</span>
              <span>Share ({shareCount})</span>
            </button>
            <button
              type="button"
              onClick={toggleSave}
              aria-pressed={saved}
              className={`min-h-11 rounded-md px-3 text-sm transition-colors hover:bg-surfaceAlt ${
                saved ? 'font-semibold text-primary' : 'text-onSurfaceDim'
              }`}
            >
              {saved ? 'Saved' : 'Save'}
            </button>
          </>
        )}
        <span className="ml-auto text-sm text-onSurfaceDim" aria-label={`${post.viewCount} views`}>
          {post.viewCount} views
        </span>
      </footer>
    </article>
  );
}
