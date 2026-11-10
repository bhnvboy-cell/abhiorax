'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { chatSocket } from '@/lib/socket';
import { ChannelItem, ChannelMessage, Profile, RoomUser } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

/**
 * mIRC-inspired Live Rooms cockpit:
 * - Left pane: #channel directory + join/create channel
 * - Center pane: Topic bar, IRC-compact/modern view toggle, slash commands
 *   (/join, /topic, /me, /msg, /clear, /help), and photo/video sharing
 * - Right pane: Live online nick list with @op badges & quick DM/profile links
 */
export function MircRooms() {
  const { user, status } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const urlChannel = params.get('ch');

  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [activeId, setActiveId] = useState<string>(urlChannel || 'lobby');
  const [topic, setTopic] = useState<string>('');
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<RoomUser[]>([]);
  const [ircMode, setIrcMode] = useState<boolean>(true);
  const [newChannel, setNewChannel] = useState('');
  const [draft, setDraft] = useState('');
  const [pendingMedia, setPendingMedia] = useState<{ url: string; type: 'image' | 'video' | 'audio' } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const loadChannels = useCallback(async () => {
    try {
      const list = await api.rooms.list<ChannelItem[]>();
      setChannels(list);
      if (urlChannel && list.some((c) => c.id === urlChannel)) {
        setActiveId(urlChannel);
      }
    } catch {
      /* ignore */
    }
  }, [urlChannel]);

  const selectChannel = useCallback(
    (id: string) => {
      setActiveId(id);
      router.replace(`/rooms?ch=${encodeURIComponent(id)}`);
    },
    [router],
  );

  useEffect(() => {
    if (status === 'authenticated') {
      void loadChannels();
    }
  }, [status, loadChannels]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    setError(null);

    const loadRoom = async () => {
      try {
        const res = await api.rooms.messages<ChannelMessage[]>(activeId);
        if (cancelled) return;
        setMessages(res.data);
        if (typeof res.meta?.topic === 'string') setTopic(res.meta.topic);
        if (Array.isArray(res.meta?.onlineUsers)) setOnlineUsers(res.meta.onlineUsers as RoomUser[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Could not load channel.');
      }
    };

    void loadRoom();
    chatSocket.connect();
    chatSocket.joinRoom(activeId);

    const onConnect = () => {
      connectedRef.current = true;
      chatSocket.joinRoom(activeId);
    };
    const onMsg = (m: ChannelMessage) => {
      if (m.channelId !== activeId) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    };
    const onPresence = (p: { channelId: string; users: RoomUser[] }) => {
      if (p.channelId === activeId) setOnlineUsers(p.users);
    };
    const onTopic = (t: { channelId: string; topic: string }) => {
      if (t.channelId === activeId) setTopic(t.topic);
    };
    const onRoomErr = (e: { message: string }) => {
      setError(e.message);
    };

    chatSocket.onConnect(onConnect);
    chatSocket.onRoomMessage(onMsg);
    chatSocket.onRoomPresence(onPresence);
    chatSocket.onRoomTopic(onTopic);
    chatSocket.onRoomError(onRoomErr);

    return () => {
      cancelled = true;
      chatSocket.leaveRoom(activeId);
      chatSocket.offConnect(onConnect);
      chatSocket.offRoomMessage(onMsg);
      chatSocket.offRoomPresence(onPresence);
      chatSocket.offRoomTopic(onTopic);
      chatSocket.offRoomError(onRoomErr);
    };
  }, [activeId, status]);

  const appendLocalNotice = (text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${crypto.randomUUID()}`,
        channelId: activeId,
        senderId: 'system',
        senderUsername: 'system',
        type: 'system',
        content: text,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const joinOrCreateChannel = async (rawName: string) => {
    const clean = rawName.trim().replace(/^#/, '').toLowerCase();
    if (!clean) return;
    setError(null);
    try {
      const ch = await api.rooms.create<ChannelItem>({ name: clean });
      await loadChannels();
      selectChannel(ch.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join channel.');
    }
  };

  const onCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newChannel.trim()) return;
    await joinOrCreateChannel(newChannel);
    setNewChannel('');
  };

  const onAttach = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsDataURL(file);
      });
      const up = await api.media.upload({ filename: file.name, mimeType: file.type, dataBase64 });
      setPendingMedia({ url: up.url, type: up.type === 'video' ? 'video' : up.type === 'audio' ? 'audio' : 'image' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Media upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const startDmWith = async (username: string) => {
    try {
      const profile = await api.users.get<Profile>(username);
      const conv = await api.post<{ id: string }>('/chat/conversations', { participantId: profile.id });
      router.push(`/chat?c=${encodeURIComponent(conv.id)}`);
    } catch {
      setError(`Could not open DM with @${username}.`);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const raw = draft.trim();
    if (!raw && !pendingMedia) return;
    setError(null);

    // Handle classic mIRC slash commands
    if (raw.startsWith('/') && !pendingMedia) {
      const [cmd, ...rest] = raw.split(/\s+/);
      const arg = rest.join(' ').trim();
      setDraft('');

      if (cmd === '/help') {
        appendLocalNotice(
          'Commands: /join #channel · /topic <text> · /me <action> · /msg @user <text> · /clear · /help',
        );
        return;
      }
      if (cmd === '/clear') {
        setMessages([]);
        return;
      }
      if (cmd === '/join' && arg) {
        await joinOrCreateChannel(arg);
        return;
      }
      if (cmd === '/topic' && arg) {
        try {
          await api.rooms.updateTopic(activeId, arg);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Could not update topic.');
        }
        return;
      }
      if (cmd === '/msg' && rest.length >= 2) {
        const targetHandle = rest[0].replace(/^@/, '');
        const dmText = rest.slice(1).join(' ');
        try {
          const prof = await api.users.get<Profile>(targetHandle);
          const conv = await api.post<{ id: string }>('/chat/conversations', { participantId: prof.id });
          await api.post(`/chat/conversations/${encodeURIComponent(conv.id)}/messages`, { content: dmText });
          appendLocalNotice(`DM sent to @${targetHandle}. Open Messages to view thread.`);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : `Could not send DM to @${targetHandle}.`);
        }
        return;
      }
      if (cmd === '/me' && arg) {
        if (connectedRef.current) {
          chatSocket.sendRoom(activeId, { content: arg, type: 'action' });
        } else {
          const saved = await api.rooms.sendMessage<ChannelMessage>(activeId, { content: arg, type: 'action' });
          setMessages((prev) => (prev.some((x) => x.id === saved.id) ? prev : [...prev, saved]));
        }
        return;
      }
    }

    const mediaSnap = pendingMedia;
    setDraft('');
    setPendingMedia(null);

    try {
      if (connectedRef.current) {
        chatSocket.sendRoom(activeId, {
          content: raw,
          type: mediaSnap?.type ?? 'text',
          mediaUrl: mediaSnap?.url,
          mediaType: mediaSnap?.type,
        });
      } else {
        const saved = await api.rooms.sendMessage<ChannelMessage>(activeId, {
          content: raw,
          type: mediaSnap?.type ?? 'text',
          mediaUrl: mediaSnap?.url,
          mediaType: mediaSnap?.type,
        });
        setMessages((prev) => (prev.some((x) => x.id === saved.id) ? prev : [...prev, saved]));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send message.');
    }
  };

  if (status === 'loading') {
    return <p aria-live="polite">Connecting to live rooms…</p>;
  }

  if (status === 'unauthenticated') {
    return (
      <p className="rounded-xl border border-border bg-surface p-6 text-center">
        <Link href="/login" className="font-semibold text-primary underline">
          Log in
        </Link>{' '}
        to join live #channels.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_1fr_14rem]">
      {/* Left Pane: #Channels */}
      <aside className="ax-glass flex flex-col gap-3 rounded-2xl border border-border p-4">
        <form onSubmit={onCreateSubmit} className="flex flex-col gap-2">
          <label htmlFor="new-channel-name" className="text-xs font-bold uppercase tracking-wider text-onSurfaceDim">
            Join / Create #Channel
          </label>
          <div className="flex gap-1.5">
            <input
              id="new-channel-name"
              value={newChannel}
              onChange={(e) => setNewChannel(e.target.value)}
              placeholder="#channel…"
              className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-bg px-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={!newChannel.trim()}
              className="min-h-10 rounded-lg bg-primary px-3 text-xs font-semibold text-onPrimary disabled:opacity-50"
            >
              Go
            </button>
          </div>
        </form>

        <nav aria-label="Channels" className="flex flex-col gap-1 border-t border-border pt-3">
          {channels.map((ch) => {
            const current = ch.id === activeId;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => selectChannel(ch.id)}
                aria-current={current ? 'true' : undefined}
                className={`flex min-h-10 items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                  current
                    ? 'bg-primary/15 font-semibold text-primary ring-1 ring-primary/35'
                    : 'text-onSurface hover:bg-surfaceAlt'
                }`}
              >
                <span className="truncate">#{ch.name}</span>
                {(ch.onlineCount ?? 0) > 0 && (
                  <span className="text-xs text-onSurfaceDim">{ch.onlineCount}</span>
                )}
              </button>
            );
          })}
        </nav>

        <Link
          href="/chat"
          className="mt-auto rounded-lg border border-border bg-bg/70 px-3 py-2 text-center text-xs font-medium hover:bg-surfaceAlt"
        >
          Private DMs →
        </Link>
      </aside>

      {/* Center Pane: Live Room Log + Slash Command Input */}
      <section aria-label={`Channel #${activeId}`} className="ax-glass flex h-[70vh] flex-col rounded-2xl border border-border">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-primary">#{activeId}</span>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                {onlineUsers.length} online
              </span>
            </div>
            <p className="truncate text-xs text-onSurfaceDim" title={topic}>
              Topic: {topic || `Welcome to #${activeId}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIrcMode((v) => !v)}
            aria-pressed={ircMode}
            className="min-h-10 rounded-lg border border-border bg-bg px-3 text-xs font-medium hover:bg-surfaceAlt"
          >
            {ircMode ? 'IRC Log View' : 'Card View'}
          </button>
        </header>

        {error && (
          <p role="alert" className="border-b border-danger bg-danger/10 px-4 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div ref={scrollRef} aria-live="polite" className="flex-1 space-y-2 overflow-y-auto p-4">
          {messages.map((m) => {
            const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (m.type === 'system') {
              return (
                <p key={m.id} className="font-mono text-xs text-onSurfaceDim">
                  [{time}] *** {m.content}
                </p>
              );
            }
            if (m.type === 'action') {
              return (
                <p key={m.id} className={ircMode ? 'font-mono text-sm italic text-primary' : 'rounded-lg bg-primary/10 px-3 py-1.5 text-sm italic text-primary'}>
                  [{time}] * @{m.senderUsername} {m.content}
                </p>
              );
            }
            if (ircMode) {
              return (
                <div key={m.id} className="font-mono text-sm leading-relaxed">
                  <span className="text-xs text-onSurfaceDim">[{time}] </span>
                  <Link
                    href={`/u/${encodeURIComponent(m.senderUsername)}`}
                    className={`font-semibold hover:underline ${
                      m.senderRole === 'admin' ? 'text-focus' : 'text-primary'
                    }`}
                  >
                    &lt;{m.senderRole === 'admin' ? '@' : ''}
                    {m.senderUsername}&gt;
                  </Link>{' '}
                  <span>{m.content}</span>
                  {m.mediaUrl && (
                    <div className="my-1.5 max-w-sm">
                      {m.mediaType === 'video' ? (
                        <video src={m.mediaUrl} controls className="max-h-52 rounded-lg" />
                      ) : m.mediaType === 'audio' ? (
                        <audio src={m.mediaUrl} controls className="w-full" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.mediaUrl} alt={m.content || 'Channel image'} className="max-h-52 rounded-lg object-cover" />
                      )}
                    </div>
                  )}
                </div>
              );
            }
            const mine = m.senderId === (user?.userId ?? user?.id);
            return (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-xl px-4 py-2 ${
                  mine ? 'ml-auto bg-primary text-onPrimary' : 'bg-surfaceAlt text-onSurface'
                }`}
              >
                <p className={`text-xs font-semibold ${mine ? 'text-onPrimary/80' : 'text-primary'}`}>
                  @{m.senderUsername} · {time}
                </p>
                {m.mediaUrl && (
                  <div className="my-1">
                    {m.mediaType === 'video' ? (
                      <video src={m.mediaUrl} controls className="max-h-52 rounded" />
                    ) : m.mediaType === 'audio' ? (
                      <audio src={m.mediaUrl} controls className="w-full" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.mediaUrl} alt={m.content || 'Channel image'} className="max-h-52 rounded object-cover" />
                    )}
                  </div>
                )}
                {m.content && <p className="text-sm">{m.content}</p>}
              </div>
            );
          })}
        </div>

        {pendingMedia && (
          <div className="flex items-center justify-between border-t border-border bg-bg/60 px-4 py-2 text-xs">
            <span>Attached {pendingMedia.type} ready to send</span>
            <button type="button" onClick={() => setPendingMedia(null)} className="text-danger underline">
              Remove
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border p-3">
          <label
            htmlFor="room-media-input"
            aria-label="Attach photo or video"
            className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-border bg-bg px-3 text-sm hover:bg-surfaceAlt"
          >
            {uploading ? '…' : '📷/🎥'}
          </label>
          <input
            id="room-media-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,audio/*"
            onChange={onAttach}
            className="sr-only"
          />
          <label htmlFor="room-msg-input" className="sr-only">
            Message #{activeId}
          </label>
          <input
            id="room-msg-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message #${activeId} or try /help, /me, /topic, /join #name`}
            className="min-h-11 flex-1 rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-onSurface placeholder:text-onSurfaceDim"
          />
          <button
            type="submit"
            disabled={(!draft.trim() && !pendingMedia) || uploading}
            className="min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-onPrimary hover:bg-primaryHover disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </section>

      {/* Right Pane: mIRC Online Users List */}
      <aside className="ax-glass hidden flex-col gap-3 rounded-2xl border border-border p-4 lg:flex">
        <h2 className="text-xs font-bold uppercase tracking-wider text-onSurfaceDim">
          Online Users ({onlineUsers.length})
        </h2>
        {onlineUsers.length === 0 ? (
          <p className="text-xs text-onSurfaceDim">Connecting…</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {onlineUsers.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/u/${encodeURIComponent(u.username)}`} className="truncate font-mono hover:underline">
                  {u.role === 'admin' ? '@' : '+'}
                  {u.username}
                </Link>
                {u.id !== (user?.userId ?? user?.id) && (
                  <button
                    type="button"
                    onClick={() => startDmWith(u.username)}
                    className="shrink-0 rounded border border-border px-2 py-0.5 text-xs hover:bg-surfaceAlt"
                  >
                    DM
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
