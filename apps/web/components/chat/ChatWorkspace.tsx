'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Profile } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { ChatRoom } from './ChatRoom';

interface ConversationSummary {
  id: string;
  title?: string;
  name?: string;
  type?: string;
}

const DEFAULT_CONVERSATION_ID = 'example-conversation';

/**
 * 2-pane futuristic Messenger cockpit:
 * - Left pane: New DM launcher + scrollable conversation list
 * - Right pane: Active ChatRoom
 */
export function ChatWorkspace() {
  const { status } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const selectedFromUrl = params.get('c');

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string>(selectedFromUrl ?? DEFAULT_CONVERSATION_ID);
  const [targetUsername, setTargetUsername] = useState('');
  const [dmError, setDmError] = useState<string | null>(null);
  const [startingDm, setStartingDm] = useState(false);

  useEffect(() => {
    if (selectedFromUrl) {
      setActiveId(selectedFromUrl);
    }
  }, [selectedFromUrl]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await api.page<ConversationSummary[]>('/chat/conversations?limit=25');
      const list = Array.isArray(res.data) ? res.data : [];
      setConversations(list);
      if (!selectedFromUrl && list.length > 0) {
        setActiveId(list[0].id);
      }
    } catch {
      /* API unavailable or empty — fall back to the default room. */
    }
  }, [selectedFromUrl]);

  useEffect(() => {
    if (status === 'authenticated') {
      void loadConversations();
    }
  }, [status, loadConversations]);

  const selectConversation = (id: string) => {
    setActiveId(id);
    router.replace(`/chat?c=${encodeURIComponent(id)}`);
  };

  const startConversation = async (e: FormEvent) => {
    e.preventDefault();
    const handle = targetUsername.trim().replace(/^@/, '');
    if (!handle || startingDm) return;
    setDmError(null);
    setStartingDm(true);
    try {
      const profile = await api.users.get<Profile>(handle);
      const conv = await api.post<ConversationSummary>('/chat/conversations', {
        participantId: profile.id,
      });
      setTargetUsername('');
      await loadConversations();
      selectConversation(conv.id);
    } catch (err) {
      setDmError(err instanceof ApiError ? err.message : `Could not start chat with @${handle}.`);
    } finally {
      setStartingDm(false);
    }
  };

  if (status !== 'authenticated') {
    return <ChatRoom conversationId={activeId} />;
  }

  const activeConv = conversations.find((c) => c.id === activeId);
  const activeTitle = activeConv?.title ?? activeConv?.name ?? (activeId.startsWith('group-') ? 'Group Channel' : 'Direct Messages');

  return (
    <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
      <aside className="ax-glass flex flex-col gap-3 rounded-2xl border border-border p-4">
        <form onSubmit={startConversation} className="flex flex-col gap-2">
          <label htmlFor="new-dm-username" className="text-xs font-bold uppercase tracking-wider text-onSurfaceDim">
            Start direct message
          </label>
          <div className="flex gap-2">
            <input
              id="new-dm-username"
              value={targetUsername}
              onChange={(e) => setTargetUsername(e.target.value)}
              placeholder="@username…"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-sm text-onSurface placeholder:text-onSurfaceDim"
            />
            <button
              type="submit"
              disabled={!targetUsername.trim() || startingDm}
              className="min-h-11 shrink-0 rounded-xl bg-primary px-3.5 text-sm font-semibold text-onPrimary hover:bg-primaryHover disabled:opacity-50"
            >
              {startingDm ? '…' : 'New'}
            </button>
          </div>
        </form>

        {dmError && (
          <p role="alert" className="rounded-lg border border-danger bg-danger/10 px-3 py-2 text-xs text-danger">
            {dmError}
          </p>
        )}

        <div className="border-t border-border pt-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-onSurfaceDim">Channels &amp; DMs</p>
          <nav aria-label="Conversations" className="flex max-h-[48vh] flex-col gap-1.5 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="text-xs text-onSurfaceDim">General Lobby active</p>
            ) : (
              conversations.map((conv, index) => {
                const label = conv.title ?? conv.name ?? `Conversation ${index + 1}`;
                const current = conv.id === activeId;
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => selectConversation(conv.id)}
                    aria-current={current ? 'true' : undefined}
                    className={`flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${
                      current
                        ? 'bg-primary/15 font-semibold text-primary ring-1 ring-primary/35'
                        : 'text-onSurface hover:bg-surfaceAlt'
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surfaceAlt text-xs font-bold">
                      {label.replace(/^@/, '').slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate">{label}</span>
                  </button>
                );
              })
            )}
          </nav>
        </div>
        <a
          href="/rooms"
          className="mt-auto rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-center text-xs font-semibold text-primary hover:bg-primary/20"
        >
          Live #Channels (mIRC) →
        </a>
      </aside>

      <div className="min-w-0">
        <ChatRoom conversationId={activeId} title={activeTitle} />
      </div>
    </div>
  );
}
