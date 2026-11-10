'use client';

import { ChangeEvent, useId, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { MediaItem, Post } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

const MAX_LENGTH = 4000;

interface ComposerProps {
  onCreated: (post: Post) => void;
  groupId?: string;
  placeholder?: string;
}

/**
 * Rich accessible post composer: Photo, Video & Audio uploads with live
 * visual previews, AI-assisted alt-text (WCAG 1.1.1), polls, and scheduling.
 */
export function Composer({ onCreated, groupId, placeholder }: ComposerProps) {
  const { user } = useAuth();
  const uid = useId();
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'only_me'>('public');
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [showPoll, setShowPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [scheduledAt, setScheduledAt] = useState('');
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const remaining = MAX_LENGTH - content.length;
  const allMediaHaveAlt = mediaList.every((m) => m.type !== 'image' || (m.altText && m.altText.trim().length > 0));
  const validPoll =
    !showPoll || (pollQuestion.trim().length > 0 && pollOptions.filter((o) => o.trim().length > 0).length >= 2);
  const canPublish =
    (content.trim().length > 0 || mediaList.length > 0 || showPoll) && allMediaHaveAlt && validPoll;

  const onFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of files.slice(0, 4)) {
        const dataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Could not read file.'));
          reader.readAsDataURL(file);
        });
        const uploaded = await api.media.upload({
          filename: file.name,
          mimeType: file.type,
          dataBase64,
        });
        let suggestedAlt = '';
        if (uploaded.type === 'image') {
          const aiRes = await api.ai
            .altText({ filename: file.name, context: content })
            .catch(() => ({ altText: file.name }));
          suggestedAlt = aiRes.altText;
        }
        setMediaList((prev) => [...prev, { key: uploaded.url, type: uploaded.type, altText: suggestedAlt }]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Media upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const regenerateAlt = async (idx: number) => {
    const target = mediaList[idx];
    if (!target) return;
    try {
      const res = await api.ai.altText({ filename: target.key, context: content });
      setMediaList((prev) => prev.map((m, i) => (i === idx ? { ...m, altText: res.altText } : m)));
    } catch {
      /* ignore */
    }
  };

  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!allMediaHaveAlt) {
      setError('Every image needs alt text for accessibility.');
      return;
    }

    setPublishing(true);
    try {
      const endpoint = groupId ? `/groups/${encodeURIComponent(groupId)}/posts` : '/posts';
      const post = await api.post<Post>(endpoint, {
        content: content.trim(),
        visibility,
        type: mediaList.length > 0 ? mediaList[0].type : 'text',
        ...(mediaList.length > 0 ? { media: mediaList } : {}),
        ...(showPoll
          ? {
              poll: {
                question: pollQuestion.trim(),
                options: pollOptions.map((o) => o.trim()).filter(Boolean),
              },
            }
          : {}),
        ...(scheduledAt && !groupId ? { scheduledAt } : {}),
      });
      setContent('');
      setMediaList([]);
      setShowPoll(false);
      setPollQuestion('');
      setPollOptions(['', '']);
      setScheduledAt('');
      onCreated(post);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not publish your post.');
    } finally {
      setPublishing(false);
    }
  };

  const photoInputId = `${uid}-photo`;
  const videoInputId = `${uid}-video`;
  const audioInputId = `${uid}-audio`;

  return (
    <section aria-label="Compose a post" className="ax-glass rounded-2xl border border-border p-5">
      <form onSubmit={publish} className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="rounded-md border border-danger bg-danger/10 px-4 py-2 text-danger">
            {error}
          </p>
        )}
        <label htmlFor={groupId ? `${uid}-content` : 'composer-content'} className="sr-only">
          What is on your mind?
        </label>
        <textarea
          id={groupId ? `${uid}-content` : 'composer-content'}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={placeholder ?? 'Share a thought, photo, or video… Use #hashtags or @mentions'}
          maxLength={MAX_LENGTH}
          rows={3}
          className="min-h-24 w-full resize-y rounded-xl border border-border bg-bg/90 px-4 py-3 text-onSurface placeholder:text-onSurfaceDim"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={photoInputId}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3.5 text-sm font-semibold text-primary hover:bg-primary/20"
            >
              <span aria-hidden>📷</span>
              <span>{uploading ? 'Uploading…' : 'Photo'}</span>
            </label>
            <input
              id={photoInputId}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={onFileSelected}
              className="sr-only"
            />

            <label
              htmlFor={videoInputId}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3.5 text-sm font-semibold text-primary hover:bg-primary/20"
            >
              <span aria-hidden>🎥</span>
              <span>Video</span>
            </label>
            <input
              id={videoInputId}
              type="file"
              accept="video/mp4,video/webm"
              onChange={onFileSelected}
              className="sr-only"
            />

            <label
              htmlFor={audioInputId}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-bg px-3.5 text-sm font-medium hover:bg-surfaceAlt"
            >
              <span aria-hidden>🎙️</span>
              <span>Audio</span>
            </label>
            <input
              id={audioInputId}
              type="file"
              accept="audio/*"
              onChange={onFileSelected}
              className="sr-only"
            />

            <button
              type="button"
              onClick={() => setShowPoll((v) => !v)}
              aria-expanded={showPoll}
              className="min-h-11 rounded-full border border-border bg-bg px-3.5 text-sm font-medium hover:bg-surfaceAlt"
            >
              {showPoll ? 'Remove poll' : '📊 Poll'}
            </button>
          </div>
          <p className={`text-xs ${remaining < 100 ? 'text-danger' : 'text-onSurfaceDim'}`}>
            {remaining} left
          </p>
        </div>

        {mediaList.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {mediaList.map((item, idx) => (
              <div key={item.key} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3">
                <div className="flex items-center justify-between text-xs text-onSurfaceDim">
                  <span className="font-semibold uppercase">{item.type} preview</span>
                  <button
                    type="button"
                    onClick={() => setMediaList((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-danger underline"
                  >
                    Remove
                  </button>
                </div>
                {item.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.key}
                    alt={item.altText || 'Uploaded image preview'}
                    className="max-h-56 w-full rounded-lg object-cover"
                  />
                ) : item.type === 'video' ? (
                  <video src={item.key} controls className="max-h-56 w-full rounded-lg" />
                ) : (
                  <audio src={item.key} controls className="w-full" />
                )}
                {item.type === 'image' && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-onSurfaceDim">Alt text (required)</span>
                      <button
                        type="button"
                        onClick={() => regenerateAlt(idx)}
                        className="text-xs text-primary underline"
                      >
                        AI refresh
                      </button>
                    </div>
                    <input
                      value={item.altText ?? ''}
                      onChange={(e) =>
                        setMediaList((prev) =>
                          prev.map((m, i) => (i === idx ? { ...m, altText: e.target.value } : m)),
                        )
                      }
                      placeholder="Describe the image for screen readers"
                      required
                      className="min-h-10 rounded border border-border bg-surface px-3 py-1.5 text-sm"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {showPoll && (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3">
            <input
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="Poll question…"
              className="min-h-10 rounded border border-border bg-surface px-3 py-1.5 text-sm"
            />
            {pollOptions.map((opt, idx) => (
              <input
                key={idx}
                value={opt}
                onChange={(e) =>
                  setPollOptions((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                }
                placeholder={`Option ${idx + 1}`}
                className="min-h-10 rounded border border-border bg-surface px-3 py-1.5 text-sm"
              />
            ))}
            {pollOptions.length < 4 && (
              <button
                type="button"
                onClick={() => setPollOptions((prev) => [...prev, ''])}
                className="self-start text-xs font-medium text-primary underline"
              >
                + Add option
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
          <div className="flex flex-wrap items-center gap-3">
            {!groupId && (
              <>
                <div className="flex items-center gap-2">
                  <label htmlFor="composer-visibility" className="text-sm text-onSurfaceDim">
                    Audience
                  </label>
                  <select
                    id="composer-visibility"
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as 'public' | 'followers' | 'only_me')}
                    className="min-h-11 rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
                  >
                    <option value="public">Public</option>
                    <option value="followers">Followers</option>
                    <option value="only_me">Only me</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="composer-schedule" className="text-sm text-onSurfaceDim">
                    Schedule
                  </label>
                  <input
                    id="composer-schedule"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="min-h-11 rounded-md border border-border bg-bg px-2 py-1 text-xs"
                  />
                </div>
              </>
            )}
          </div>
          <button
            type="submit"
            disabled={!canPublish || publishing || uploading}
            aria-busy={publishing}
            className="rounded-full bg-primary px-6 py-2.5 font-semibold text-onPrimary transition-colors hover:bg-primaryHover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishing ? 'Publishing…' : scheduledAt && !groupId ? 'Schedule' : 'Post'}
          </button>
        </div>
      </form>
    </section>
  );
}
