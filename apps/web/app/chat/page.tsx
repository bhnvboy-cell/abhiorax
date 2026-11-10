import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';

export const metadata: Metadata = { title: 'Messages' };

export default function ChatPage() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-5xl py-2">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
          <p className="text-sm text-onSurfaceDim">Realtime encrypted-in-transit messaging &amp; group rooms.</p>
        </div>
      </div>
      <Suspense fallback={<p aria-live="polite">Loading messages…</p>}>
        <ChatWorkspace />
      </Suspense>
    </main>
  );
}
