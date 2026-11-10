import { Suspense } from 'react';
import type { Metadata } from 'next';
import { MircRooms } from '@/components/rooms/MircRooms';

export const metadata: Metadata = { title: 'Live Rooms' };

export default function RoomsPage() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl py-2">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Live Rooms (#Channels)</h1>
        <p className="text-sm text-onSurfaceDim">
          Real-time mIRC-style topic channels with slash commands, online presence, and media sharing.
        </p>
      </div>
      <Suspense fallback={<p aria-live="polite">Loading live rooms…</p>}>
        <MircRooms />
      </Suspense>
    </main>
  );
}
