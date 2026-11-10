'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { StoryItem } from '@/lib/types';
import { useFocusTrap } from '@/components/a11y/AccessibilityProvider';

/**
 * 24-hour Stories strip supporting text, photo, and video stories
 * with an accessible focus-trapped viewer modal.
 */
export function StoriesBar() {
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video' | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [activeStory, setActiveStory] = useState<StoryItem | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(!!activeStory, dialogRef);

  useEffect(() => {
    void api.stories
      .list<StoryItem[]>()
      .then(setStories)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!activeStory) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveStory(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeStory]);

  const onStoryMedia = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      const res = await api.media.upload({ filename: file.name, mimeType: file.type, dataBase64 });
      setMediaUrl(res.url);
      setMediaType(res.type === 'video' ? 'video' : 'image');
    } catch {
      /* ignore */
    } finally {
      setUploading(false);
    }
  };

  const publishStory = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim() && !mediaUrl) return;
    try {
      const created = await api.stories.create<StoryItem>({
        content: draft.trim(),
        ...(mediaUrl ? { mediaUrl, mediaType } : {}),
      } as { content: string });
      setStories((prev) => [created, ...prev]);
      setDraft('');
      setMediaUrl('');
      setMediaType(undefined);
      setCreating(false);
    } catch {
      /* ignore */
    }
  };

  return (
    <section aria-label="Stories" className="ax-glass rounded-2xl border border-border p-4">
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-primary bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20"
        >
          <span>+ Your story</span>
        </button>
        {stories.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveStory(s)}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-bg px-4 py-2 text-sm hover:bg-surfaceAlt"
          >
            {s.mediaType === 'video' ? <span aria-hidden>🎥</span> : s.mediaUrl ? <span aria-hidden>📷</span> : null}
            <span className="font-semibold">@{s.author?.username ?? 'user'}</span>
          </button>
        ))}
        {stories.length === 0 && !creating && (
          <span className="text-sm text-onSurfaceDim">Share a 24-hour photo, video, or text story.</span>
        )}
      </div>

      {creating && (
        <form onSubmit={publishStory} className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="story-input" className="sr-only">
              Story update
            </label>
            <input
              id="story-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={300}
              placeholder="Caption or story update…"
              className="min-h-11 flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm"
            />
            <label
              htmlFor="story-media-file"
              className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-border bg-bg px-3 text-sm font-medium hover:bg-surfaceAlt"
            >
              {uploading ? 'Uploading…' : '📷/🎥 Media'}
            </label>
            <input
              id="story-media-file"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
              onChange={onStoryMedia}
              className="sr-only"
            />
            <button
              type="submit"
              disabled={(!draft.trim() && !mediaUrl) || uploading}
              className="min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-onPrimary disabled:opacity-50"
            >
              Share
            </button>
          </div>
          {mediaUrl && (
            <div className="rounded-lg border border-border bg-bg p-2">
              {mediaType === 'video' ? (
                <video src={mediaUrl} controls className="max-h-40 w-full rounded" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl} alt="Story preview" className="max-h-40 w-full rounded object-cover" />
              )}
            </div>
          )}
        </form>
      )}

      {activeStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-4" role="presentation">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Story by @${activeStory.author?.username ?? 'user'}`}
            tabIndex={-1}
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="font-semibold">@{activeStory.author?.username ?? 'user'}</p>
              <button
                type="button"
                onClick={() => setActiveStory(null)}
                className="min-h-11 rounded-md border border-border px-3 text-sm hover:bg-surfaceAlt"
              >
                Close
              </button>
            </div>
            {activeStory.mediaUrl && (
              <div className="mb-3">
                {activeStory.mediaType === 'video' ? (
                  <video src={activeStory.mediaUrl} controls className="max-h-72 w-full rounded-xl" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeStory.mediaUrl}
                    alt={activeStory.content || 'Story media'}
                    className="max-h-72 w-full rounded-xl object-cover"
                  />
                )}
              </div>
            )}
            {activeStory.content && <p className="rounded-xl bg-primary/15 p-5 text-lg">{activeStory.content}</p>}
            <p className="mt-3 text-xs text-onSurfaceDim">
              Expires {new Date(activeStory.expiresAt).toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
