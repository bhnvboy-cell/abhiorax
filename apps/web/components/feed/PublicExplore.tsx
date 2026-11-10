'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { GroupItem, Post } from '@/lib/types';
import { PostCard } from './PostCard';

interface ExplorePayload {
  posts: Post[];
  trending: Array<{ tag: string; count: number }>;
  groups: GroupItem[];
}

/**
 * Read-only public Explore feed shown on the landing page so visitors can
 * browse live posts, trending hashtags, and communities before signing up.
 */
export function PublicExplore() {
  const [data, setData] = useState<ExplorePayload | null>(null);

  useEffect(() => {
    void api.public
      .explore<ExplorePayload>()
      .then(setData)
      .catch(() => undefined);
  }, []);

  if (!data) return null;

  return (
    <section aria-label="Public explore" className="mt-12 w-full text-left">
      {data.trending.length > 0 && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-base font-semibold">Trending now</h2>
          <div className="flex flex-wrap gap-2">
            {data.trending.map((t) => (
              <Link
                key={t.tag}
                href={`/search?q=%23${encodeURIComponent(t.tag)}`}
                className="min-h-10 inline-flex items-center rounded-full border border-border bg-bg px-3 text-sm font-medium text-primary hover:bg-surfaceAlt"
              >
                #{t.tag} · {t.count}
              </Link>
            ))}
          </div>
        </div>
      )}

      {data.posts.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">Latest public posts</h2>
          {data.posts.slice(0, 6).map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}
