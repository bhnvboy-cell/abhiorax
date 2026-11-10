'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Post } from '@/lib/types';
import { PostCard } from '@/components/feed/PostCard';
import { useAuth } from '@/hooks/useAuth';

interface Comment {
  id: string;
  postId: string;
  authorId: string;
  parentId?: string | null;
  author?: { id: string; username: string; displayName?: string; avatarUrl?: string };
  content: string;
  createdAt: string;
}

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, status } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const postData = await api.get<Post>(`/posts/${id}`);
      setPost(postData);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'This post could not be loaded.');
    }
  }, [id]);

  const loadComments = useCallback(async () => {
    try {
      const commentsRes = await api.page<Comment[]>(`/posts/${id}/comments?limit=50`);
      setComments(commentsRes.data);
    } catch {
      // Comments are best-effort; the post itself still renders without them.
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (status === 'authenticated') void loadComments();
  }, [status, loadComments]);

  const addComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || posting) return;
    setPosting(true);
    setPostError(null);
    try {
      const comment = await api.post<Comment>(`/posts/${id}/comments`, {
        content: draft.trim(),
        ...(replyTo ? { parentId: replyTo.id } : {}),
      });
      setComments((prev) => [...prev, comment]);
      setDraft('');
      setReplyTo(null);
    } catch (err) {
      setPostError(err instanceof ApiError ? err.message : 'Could not post your comment.');
    } finally {
      setPosting(false);
    }
  };

  if (loadError)
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-6">
        <h1 className="sr-only">Post details</h1>
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-4 py-2 text-danger">
          {loadError}
        </p>
      </main>
    );
  if (!post)
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-6">
        <h1 className="sr-only">Post details</h1>
        <p aria-live="polite">Loading post…</p>
      </main>
    );

  const topLevel = comments.filter((c) => !c.parentId);
  const repliesFor = (parentId: string) => comments.filter((c) => c.parentId === parentId);

  const renderComment = (c: Comment, depth = 0) => {
    const isMine = c.authorId === user?.userId || c.authorId === user?.id;
    const handle = isMine ? 'you' : c.author?.username ?? c.authorId;
    const childReplies = repliesFor(c.id);
    return (
      <div key={c.id} className={depth > 0 ? 'ml-6 border-l-2 border-border pl-4' : ''}>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-onSurfaceDim">
              @{handle} ·{' '}
              <time dateTime={c.createdAt}>
                {new Date(c.createdAt).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </p>
            {status === 'authenticated' && depth === 0 && (
              <button
                type="button"
                onClick={() => setReplyTo(c)}
                className="min-h-9 rounded px-2 text-xs font-medium text-primary hover:bg-surfaceAlt"
              >
                Reply
              </button>
            )}
          </div>
          <p className="mt-1">{c.content}</p>
        </div>
        {childReplies.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {childReplies.map((reply) => renderComment(reply, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="sr-only">Post details</h1>
      <PostCard post={post} />

      <section aria-label="Comments" className="mt-6">
        <h2 className="mb-4 text-xl font-bold">Comments ({comments.length})</h2>

        {status === 'authenticated' ? (
          <form onSubmit={addComment} className="mb-6 flex flex-col gap-2">
            {postError && (
              <p role="alert" className="rounded-md border border-danger bg-danger/10 px-4 py-2 text-danger">
                {postError}
              </p>
            )}
            {replyTo && (
              <div className="flex items-center justify-between rounded-md border border-border bg-surfaceAlt px-3 py-1.5 text-sm">
                <span>Replying to @{replyTo.author?.username ?? replyTo.authorId}</span>
                <button type="button" onClick={() => setReplyTo(null)} className="text-primary underline">
                  Cancel
                </button>
              </div>
            )}
            <label htmlFor="comment-input" className="sr-only">
              Add a comment
            </label>
            <textarea
              id="comment-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
              rows={2}
              maxLength={1000}
              className="min-h-16 w-full resize-y rounded-md border border-border bg-surface px-4 py-3 text-onSurface placeholder:text-onSurfaceDim"
            />
            <button
              type="submit"
              disabled={!draft.trim() || posting}
              className="min-h-11 self-end rounded-md bg-primary px-5 font-semibold text-onPrimary hover:bg-primaryHover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {posting ? 'Posting…' : replyTo ? 'Reply' : 'Comment'}
            </button>
          </form>
        ) : (
          <p className="mb-6">
            <Link href="/login" className="font-semibold text-primary underline">
              Log in
            </Link>{' '}
            to join the conversation.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {comments.length === 0 ? (
            <p className="text-onSurfaceDim">No comments yet — start the conversation.</p>
          ) : (
            topLevel.map((c) => renderComment(c))
          )}
        </div>
      </section>
    </main>
  );
}
