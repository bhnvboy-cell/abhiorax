'use client';

import { FormEvent, Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Profile } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

interface SearchHit {
  type: string;
  id: string;
  score: number;
  highlight?: string;
}

interface TrendingItem {
  tag: string;
  count: number;
}

function SearchForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useAuth();
  const initialQ = params.get('q') ?? '';
  const [q, setQ] = useState(initialQ);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [trending, setTrending] = useState<TrendingItem[]>([]);
  const [suggestions, setSuggestions] = useState<Profile[]>([]);

  const run = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setResults([]);
        setSearched(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        if (status === 'authenticated') {
          const res = await api.page<SearchHit[]>(`/search?q=${encodeURIComponent(query.trim())}&type=all&limit=20`);
          setResults(res.data);
        } else {
          const hits = await api.public.search<SearchHit[]>(query.trim());
          setResults(hits);
        }
        setSearched(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Search is unavailable right now.');
      } finally {
        setLoading(false);
      }
    },
    [status],
  );

  useEffect(() => {
    if (status === 'loading') return;
    if (initialQ) void run(initialQ);
    if (status === 'authenticated') {
      void api.search.trending<TrendingItem[]>().then(setTrending).catch(() => undefined);
      void api.search.suggestions<Profile[]>().then(setSuggestions).catch(() => undefined);
    } else {
      void api.public
        .explore<{ trending: TrendingItem[] }>()
        .then((res) => setTrending(res.trending ?? []))
        .catch(() => undefined);
    }
  }, [status, initialQ, run]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    router.replace(`/search?q=${encodeURIComponent(query)}`);
    void run(query);
  };

  const labelFor = (hit: SearchHit) => {
    switch (hit.type) {
      case 'user':
        return `User @${hit.id}`;
      case 'post':
        return `Post by ${hit.id}`;
      case 'hashtag':
        return `Hashtag #${hit.id}`;
      default:
        return hit.highlight ?? hit.id;
    }
  };

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="mb-1">Search</h1>
      <p className="text-onSurfaceDim">Find people, posts and hashtags across ABHIORAX.</p>

      <form onSubmit={onSubmit} role="search" className="mt-6 flex items-center gap-3">
        <label htmlFor="search-q" className="sr-only">
          Search ABHIORAX
        </label>
        <input
          id="search-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Try #accessibility, a username, or a topic…"
          className="min-h-11 flex-1 rounded-md border border-border bg-surface px-4 py-2 text-onSurface placeholder:text-onSurfaceDim"
        />
        <button
          type="submit"
          className="min-h-11 rounded-md bg-primary px-5 font-semibold text-onPrimary hover:bg-primaryHover"
        >
          Search
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-danger bg-danger/10 px-4 py-2 text-danger">
          {error}
        </p>
      )}
      {loading && <p className="mt-4" aria-live="polite">Searching…</p>}

      {searched && !loading && (
        <section aria-label="Search results" className="mt-6 flex flex-col gap-3">
          {results.length === 0 ? (
            <p className="text-onSurfaceDim">No results for “{q}”. Try different keywords.</p>
          ) : (
            results.map((hit) => (
              <div key={`${hit.type}-${hit.id}`} className="rounded-xl border border-border bg-surface p-4">
                {hit.type === 'user' && (
                  <Link href={`/u/${encodeURIComponent(hit.id)}`} className="font-semibold hover:underline">
                    @{hit.id}
                  </Link>
                )}
                {hit.type === 'post' && (
                  <Link href={`/posts/${hit.id}`} className="font-semibold hover:underline">
                    View post
                  </Link>
                )}
                {hit.type === 'hashtag' && (
                  <Link href={`/search?q=%23${encodeURIComponent(hit.id)}`} className="font-semibold text-primary hover:underline">
                    #{hit.id}
                  </Link>
                )}
                {hit.highlight && <p className="mt-1 text-sm text-onSurfaceDim">{hit.highlight}</p>}
              </div>
            ))
          )}
        </section>
      )}

      {(trending.length > 0 || suggestions.length > 0) && (
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {trending.length > 0 && (
            <section aria-label="Trending hashtags" className="rounded-xl border border-border bg-surface p-5">
              <h2 className="mb-3 text-lg font-semibold">Trending</h2>
              <ul className="flex flex-col gap-2">
                {trending.map((t) => (
                  <li key={t.tag} className="flex items-center justify-between">
                    <Link
                      href={`/search?q=%23${encodeURIComponent(t.tag)}`}
                      onClick={() => {
                        setQ(`#${t.tag}`);
                        void run(`#${t.tag}`);
                      }}
                      className="font-medium text-primary hover:underline"
                    >
                      #{t.tag}
                    </Link>
                    <span className="text-xs text-onSurfaceDim">{t.count} posts</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {suggestions.length > 0 && (
            <section aria-label="Suggested people" className="rounded-xl border border-border bg-surface p-5">
              <h2 className="mb-3 text-lg font-semibold">Who to follow</h2>
              <ul className="flex flex-col gap-2">
                {suggestions.slice(0, 5).map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2">
                    <Link href={`/u/${encodeURIComponent(u.username)}`} className="truncate font-medium hover:underline">
                      @{u.username}
                    </Link>
                    <span className="shrink-0 text-xs text-onSurfaceDim">{u.followerCount ?? 0} followers</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<main id="main-content" tabIndex={-1} className="px-4 py-6">Loading search…</main>}>
      <SearchForm />
    </Suspense>
  );
}
