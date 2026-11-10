'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { chatSocket } from '@/lib/socket';
import { Message } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

interface LocalMessage extends Message {
  clientMsgId?: string;
  pending?: boolean;
}

/**
 * Realtime chat supporting text, photo, video, and audio attachments,
 * optimistic send with server ack reconciliation (plus REST fallback),
 * and live typing indicators.
 */
export function ChatRoom({ conversationId, title }: { conversationId: string; title?: string }) {
  const { user, status } = useAuth();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pendingMedia, setPendingMedia] = useState<{ url: string; type: 'image' | 'video' | 'audio' } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const connectedRef = useRef(false);
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myId = user?.userId ?? user?.id;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    let cancelled = false;
    connectedRef.current = false;
    setMessages([]);
    setTypingUser(null);
    setLoadError(null);

    const loadHistory = async () => {
      try {
        const res = await api.page<Message[]>(
          `/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`,
        );
        if (!cancelled) setMessages(res.data);
      } catch {
        if (!cancelled) setLoadError('Could not load the conversation.');
      }
    };

    void loadHistory();
    chatSocket.connect();

    const onMessage = (m: Message) => {
      if (m.conversationId && m.conversationId !== conversationId) return;
      setMessages((prev) => (prev.some((p) => p.id === m.id || p.clientMsgId === m.id) ? prev : [...prev, m]));
      if (m.senderId !== myId) {
        chatSocket.read(conversationId, m.id);
      }
    };
    const onAck = ({ clientMsgId, messageId }: { clientMsgId: string; messageId: string }) => {
      if (sendTimerRef.current) {
        clearTimeout(sendTimerRef.current);
        sendTimerRef.current = null;
      }
      setSending(false);
      setMessages((prev) =>
        prev.map((m) => (m.clientMsgId === clientMsgId ? { ...m, id: messageId, pending: false } : m)),
      );
    };
    const onTypingEvent = (t: { conversationId: string; userId: string; username: string }) => {
      if (t.conversationId !== conversationId || t.userId === myId) return;
      setTypingUser(t.username);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => setTypingUser(null), 2500);
    };
    const onAuthError = () => {
      connectedRef.current = false;
      setLoadError('Chat connection failed. Please log in again.');
    };
    const onConnect = () => {
      connectedRef.current = true;
      setLoadError(null);
    };

    chatSocket.onMessage(onMessage);
    chatSocket.onAck(onAck);
    chatSocket.onTyping(onTypingEvent);
    chatSocket.onAuthError(onAuthError);
    chatSocket.onConnect(onConnect);

    return () => {
      cancelled = true;
      connectedRef.current = false;
      if (sendTimerRef.current) {
        clearTimeout(sendTimerRef.current);
        sendTimerRef.current = null;
      }
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      chatSocket.offMessage(onMessage);
      chatSocket.offAck(onAck);
      chatSocket.offTyping(onTypingEvent);
      chatSocket.offAuthError(onAuthError);
      chatSocket.offConnect(onConnect);
      chatSocket.disconnect();
    };
  }, [conversationId, myId, status]);

  const onAttachMedia = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setLoadError(null);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read file.'));
        reader.readAsDataURL(file);
      });
      const uploaded = await api.media.upload({ filename: file.name, mimeType: file.type, dataBase64 });
      const mediaType = uploaded.type === 'video' ? 'video' : uploaded.type === 'audio' ? 'audio' : 'image';
      setPendingMedia({ url: uploaded.url, type: mediaType });
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Media upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const send = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const content = draft.trim();
      if ((!content && !pendingMedia) || sending) return;

      const clientMsgId = crypto.randomUUID();
      const mediaSnap = pendingMedia;
      setMessages((prev) => [
        ...prev,
        {
          id: `pending-${clientMsgId}`,
          conversationId,
          senderId: myId ?? '',
          senderUsername: user?.username,
          type: mediaSnap?.type ?? 'text',
          content,
          mediaUrl: mediaSnap?.url,
          mediaType: mediaSnap?.type,
          createdAt: new Date().toISOString(),
          clientMsgId,
          pending: true,
        },
      ]);
      setDraft('');
      setPendingMedia(null);
      setSending(true);

      if (connectedRef.current) {
        chatSocket.send(
          conversationId,
          content,
          clientMsgId,
          mediaSnap ? { type: mediaSnap.type, mediaUrl: mediaSnap.url, mediaType: mediaSnap.type } : undefined,
        );
        sendTimerRef.current = setTimeout(() => {
          setSending(false);
          sendTimerRef.current = null;
        }, 800);
        return;
      }

      try {
        const saved = await api.post<Message>(
          `/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
          {
            content,
            ...(mediaSnap ? { type: mediaSnap.type, mediaUrl: mediaSnap.url, mediaType: mediaSnap.type } : {}),
          },
        );
        setMessages((prev) =>
          prev.map((m) => (m.clientMsgId === clientMsgId ? { ...saved, pending: false } : m)),
        );
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.clientMsgId !== clientMsgId));
        setLoadError(err instanceof ApiError ? err.message : 'Could not send message.');
      } finally {
        setSending(false);
      }
    },
    [conversationId, draft, myId, pendingMedia, sending, user?.username],
  );

  const onType = useCallback(() => {
    if (connectedRef.current) chatSocket.typing(conversationId);
  }, [conversationId]);

  if (status === 'loading') {
    return <p aria-live="polite">Connecting to messages…</p>;
  }

  if (status === 'unauthenticated') {
    return <p role="alert">Log in to start messaging.</p>;
  }

  return (
    <section
      aria-label="Conversation"
      className="ax-glass flex h-[68vh] flex-col rounded-2xl border border-border"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="font-semibold">{title ?? 'Conversation'}</p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
          <span aria-hidden className="h-2 w-2 rounded-full bg-primary" />
          Realtime
        </span>
      </header>
      {loadError && (
        <p role="alert" className="border-b border-danger bg-danger/10 px-4 py-2 text-danger">
          {loadError}
        </p>
      )}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => {
          const mine = m.senderId === myId;
          return (
            <div
              key={m.id}
              className={`max-w-[75%] rounded-lg px-4 py-2 ${
                mine ? 'ml-auto bg-primary text-onPrimary' : 'bg-surfaceAlt text-onSurface'
              }`}
            >
              {!mine && m.senderUsername && (
                <p className="mb-0.5 text-xs font-semibold text-primary">@{m.senderUsername}</p>
              )}
              {m.mediaUrl && (
                <div className="mb-1.5">
                  {m.mediaType === 'video' ? (
                    <video src={m.mediaUrl} controls className="max-h-56 w-full rounded" />
                  ) : m.mediaType === 'audio' ? (
                    <audio src={m.mediaUrl} controls className="w-full" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.mediaUrl}
                      alt={m.content || 'Shared image in chat'}
                      className="max-h-56 w-full rounded object-cover"
                    />
                  )}
                </div>
              )}
              {m.content && <p className="text-base">{m.content}</p>}
              <p className={`text-xs ${mine ? 'text-onPrimary/80' : 'text-onSurfaceDim'}`}>
                {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {m.pending && ' · sending…'}
                {m.type !== 'text' && ` · ${m.type}`}
              </p>
            </div>
          );
        })}
        {messages.length === 0 && !loadError && (
          <p className="text-center text-onSurfaceDim">No messages yet — say hello or share a photo/video.</p>
        )}
      </div>
      {typingUser && (
        <p aria-live="polite" className="px-4 pb-1 text-xs text-onSurfaceDim">
          @{typingUser} is typing…
        </p>
      )}
      {pendingMedia && (
        <div className="flex items-center justify-between gap-3 border-t border-border bg-bg/60 px-4 py-2">
          <div className="flex items-center gap-3">
            {pendingMedia.type === 'video' ? (
              <video src={pendingMedia.url} className="h-12 w-20 rounded object-cover" />
            ) : pendingMedia.type === 'audio' ? (
              <span className="text-xs font-medium">Audio ready to send</span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pendingMedia.url} alt="Attachment preview" className="h-12 w-12 rounded object-cover" />
            )}
            <span className="text-xs text-onSurfaceDim">Ready to send ({pendingMedia.type})</span>
          </div>
          <button type="button" onClick={() => setPendingMedia(null)} className="text-xs text-danger underline">
            Remove
          </button>
        </div>
      )}
      <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
        <label
          htmlFor="chat-media-input"
          aria-label="Attach photo or video"
          className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-border bg-bg px-3 text-sm hover:bg-surfaceAlt"
        >
          {uploading ? '…' : '📷/🎥'}
        </label>
        <input
          id="chat-media-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,audio/*"
          onChange={onAttachMedia}
          className="sr-only"
        />
        <label htmlFor="msg-input" className="sr-only">
          Message
        </label>
        <input
          id="msg-input"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onType();
          }}
          placeholder="Type a message or attach media"
          className="min-h-11 flex-1 rounded-md border border-border bg-bg px-4 py-2 text-onSurface placeholder:text-onSurfaceDim"
        />
        <button
          type="submit"
          disabled={(!draft.trim() && !pendingMedia) || sending || uploading}
          aria-busy={sending}
          className="min-h-11 rounded-md bg-primary px-5 font-semibold text-onPrimary transition-colors hover:bg-primaryHover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  );
}
