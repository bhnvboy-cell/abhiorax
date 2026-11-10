import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';
import { ChannelMessage, Message, RoomUser } from './types';

export interface Ack {
  clientMsgId: string;
  messageId: string;
  at: string;
}

export class ChatSocket {
  private socket: Socket | null = null;
  private listeners: Array<() => void> = [];

  connect(): void {
    if (this.socket?.connected) return;
    const base = process.env.NEXT_PUBLIC_WS_BASE_URL ?? 'ws://localhost:8080/chat';
    this.socket = io(base, {
      auth: { token: getAccessToken() },
      transports: ['websocket'],
      reconnectionDelayMax: 10_000,
    });
  }

  disconnect(): void {
    this.listeners = [];
    this.socket?.disconnect();
    this.socket = null;
  }

  onMessage(cb: (m: Message) => void): () => void {
    return this.on('chat:message', cb);
  }

  offMessage(cb: (m: Message) => void): void {
    this.socket?.off('chat:message', cb);
  }

  onAck(cb: (a: Ack) => void): () => void {
    return this.on('chat:ack', cb);
  }

  offAck(cb: (a: Ack) => void): void {
    this.socket?.off('chat:ack', cb);
  }

  onAuthError(cb: () => void): () => void {
    return this.on('auth_error', cb);
  }

  offAuthError(cb: () => void): void {
    this.socket?.off('auth_error', cb);
  }

  onConnect(cb: () => void): () => void {
    return this.on('connect', cb);
  }

  offConnect(cb: () => void): void {
    this.socket?.off('connect', cb);
  }

  onTyping(cb: (t: { conversationId: string; userId: string; username: string }) => void): () => void {
    return this.on('chat:typing', cb);
  }

  offTyping(cb: (t: { conversationId: string; userId: string; username: string }) => void): void {
    this.socket?.off('chat:typing', cb);
  }

  onRoomMessage(cb: (m: ChannelMessage) => void): () => void {
    return this.on('room:message', cb);
  }

  offRoomMessage(cb: (m: ChannelMessage) => void): void {
    this.socket?.off('room:message', cb);
  }

  onRoomPresence(cb: (p: { channelId: string; users: RoomUser[] }) => void): () => void {
    return this.on('room:presence', cb);
  }

  offRoomPresence(cb: (p: { channelId: string; users: RoomUser[] }) => void): void {
    this.socket?.off('room:presence', cb);
  }

  onRoomTopic(cb: (t: { channelId: string; topic: string }) => void): () => void {
    return this.on('room:topic', cb);
  }

  offRoomTopic(cb: (t: { channelId: string; topic: string }) => void): void {
    this.socket?.off('room:topic', cb);
  }

  onRoomError(cb: (e: { message: string }) => void): () => void {
    return this.on('room:error', cb);
  }

  offRoomError(cb: (e: { message: string }) => void): void {
    this.socket?.off('room:error', cb);
  }

  private on(event: string, cb: (...args: any[]) => void): () => void {
    this.socket?.on(event, cb);
    const off = () => this.socket?.off(event, cb);
    this.listeners.push(off);
    return off;
  }

  send(
    conversationId: string,
    content: string,
    clientMsgId: string,
    media?: { type?: 'image' | 'video' | 'audio' | 'text'; mediaUrl?: string; mediaType?: 'image' | 'video' | 'audio' },
  ): void {
    this.socket?.emit('chat:send', {
      conversationId,
      type: media?.type ?? media?.mediaType ?? 'text',
      content,
      ...(media?.mediaUrl ? { mediaUrl: media.mediaUrl, mediaType: media.mediaType } : {}),
      clientMsgId,
    });
  }

  typing(conversationId: string): void {
    this.socket?.emit('chat:typing', { conversationId });
  }

  read(conversationId: string, messageId: string): void {
    this.socket?.emit('chat:read', { conversationId, messageId });
  }

  joinRoom(channelId: string): void {
    this.socket?.emit('room:join', { channelId });
  }

  leaveRoom(channelId: string): void {
    this.socket?.emit('room:leave', { channelId });
  }

  sendRoom(
    channelId: string,
    payload: { content?: string; type?: string; mediaUrl?: string; mediaType?: string; clientMsgId?: string },
  ): void {
    this.socket?.emit('room:send', { channelId, ...payload });
  }
}

export const chatSocket = new ChatSocket();
