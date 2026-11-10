import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicExplore } from '@/components/feed/PublicExplore';

export const metadata: Metadata = { title: 'Welcome' };

export default function HomePage() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-svh w-full max-w-5xl flex-col items-center px-4 py-12">
      <section className="ax-glass w-full rounded-3xl border border-border p-8 text-center sm:p-12">
        <p className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-4 py-1 text-xs font-bold uppercase tracking-wider text-primary">
          Next-Gen Social · WCAG AAA · Creator-Owned
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
          ABHIORAX<span className="text-primary">.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-onSurfaceDim sm:text-xl">
          A fearless, forward social, realtime communication and creator platform—designed for human control,
          communities, and universal accessibility.
        </p>
        <nav aria-label="Primary" className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/register"
            className="min-h-11 rounded-full bg-primary px-7 py-2.5 font-semibold text-onPrimary transition-colors hover:bg-primaryHover"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="min-h-11 rounded-full border border-border bg-surfaceAlt px-7 py-2.5 font-semibold transition-colors hover:bg-surface"
          >
            Log in
          </Link>
          <Link
            href="/search"
            className="min-h-11 rounded-full border border-border bg-bg px-7 py-2.5 font-semibold transition-colors hover:bg-surfaceAlt"
          >
            Explore public feed
          </Link>
        </nav>
        <div className="mx-auto mt-8 grid max-w-3xl gap-3 text-left sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-bg/70 p-4">
            <p className="text-sm font-bold text-primary">Transparent Feed</p>
            <p className="mt-1 text-xs text-onSurfaceDim">Switch between Ranked, Chronological, Groups, and Keyword Mutes.</p>
          </div>
          <div className="rounded-2xl border border-border bg-bg/70 p-4">
            <p className="text-sm font-bold text-primary">AI Accessibility</p>
            <p className="mt-1 text-xs text-onSurfaceDim">Auto alt-text, TL;DR summaries, High Contrast &amp; Dyslexia modes.</p>
          </div>
          <div className="rounded-2xl border border-border bg-bg/70 p-4">
            <p className="text-sm font-bold text-primary">Creator Ownership</p>
            <p className="mt-1 text-xs text-onSurfaceDim">Tips, memberships, scheduled posts, and portable CSV subscriber export.</p>
          </div>
        </div>
      </section>

      <PublicExplore />
    </main>
  );
}
