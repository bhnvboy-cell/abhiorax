import type { Metadata } from 'next';
import { FeedList } from '@/components/feed/FeedList';

export const metadata: Metadata = { title: 'Feed' };

export default function FeedPage() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl py-2">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Your feed</h1>
        <p className="text-sm text-onSurfaceDim">Transparent ranking you control — zero dark patterns.</p>
      </div>
      <FeedList />
    </main>
  );
}
