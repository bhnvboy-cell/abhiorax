const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { verifyAccessToken } = require('./auth');
const { findUserById, getStore, scheduleSave } = require('./store');
const { moderateContent } = require('./ai');

// Connected Socket.IO clients on /chat: Set<{ ws, userId, username, role, channelId, authenticated, sid }>
const clients = new Set();

function sendPacket(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(payload);
  }
}

function broadcastMessage(conversationId, message) {
  const frame = `42/chat,${JSON.stringify(['chat:message', message])}`;
  for (const client of clients) {
    if (client.authenticated) {
      sendPacket(client.ws, frame);
    }
  }
}

function getRoomOnlineUsers(channelId) {
  const byUser = new Map();
  for (const c of clients) {
    if (c.authenticated && c.channelId === channelId && c.userId) {
      byUser.set(c.userId, { id: c.userId, username: c.username || 'user', role: c.role || 'user' });
    }
  }
  return Array.from(byUser.values());
}

function broadcastRoomPresence(channelId) {
  if (!channelId) return;
  const users = getRoomOnlineUsers(channelId);
  const frame = `42/chat,${JSON.stringify(['room:presence', { channelId, users }])}`;
  for (const c of clients) {
    if (c.authenticated && c.channelId === channelId) {
      sendPacket(c.ws, frame);
    }
  }
}

function broadcastChannelMessage(channelId, message) {
  const frame = `42/chat,${JSON.stringify(['room:message', message])}`;
  for (const c of clients) {
    if (c.authenticated && c.channelId === channelId) {
      sendPacket(c.ws, frame);
    }
  }
}

function broadcastChannelTopic(channelId, topic) {
  const frame = `42/chat,${JSON.stringify(['room:topic', { channelId, topic }])}`;
  for (const c of clients) {
    if (c.authenticated && c.channelId === channelId) {
      sendPacket(c.ws, frame);
    }
  }
}

function attachChatWebsocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = req.url || '';
    if (!url.startsWith('/socket.io/')) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    const eioSid = crypto.randomBytes(12).toString('base64url');
    const client = {
      ws,
      userId: null,
      username: null,
      role: 'user',
      channelId: null,
      authenticated: false,
      sid: eioSid,
    };
    clients.add(client);

    // Engine.IO v4 open packet
    sendPacket(
      ws,
      `0${JSON.stringify({ sid: eioSid, upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1000000 })}`,
    );

    ws.on('message', (raw) => {
      const msg = raw.toString();

      // Engine.IO ping -> pong
      if (msg === '2') {
        sendPacket(ws, '3');
        return;
      }

      // Socket.IO CONNECT to /chat namespace: "40/chat" or "40/chat,{...}"
      if (msg.startsWith('40/chat')) {
        const jsonPart = msg.slice('40/chat'.length).replace(/^,/, '');
        let authPayload = {};
        if (jsonPart) {
          try {
            authPayload = JSON.parse(jsonPart);
          } catch {
            authPayload = {};
          }
        }
        const claims = verifyAccessToken(authPayload.token);
        if (!claims) {
          sendPacket(ws, `40/chat,${JSON.stringify({ sid: crypto.randomBytes(10).toString('base64url') })}`);
          sendPacket(ws, `42/chat,${JSON.stringify(['auth_error'])}`);
          return;
        }
        const user = findUserById(claims.sub);
        client.userId = claims.sub;
        client.username = user?.username || claims.username || 'user';
        client.role = user?.role || claims.role || 'user';
        client.authenticated = true;
        sendPacket(ws, `40/chat,${JSON.stringify({ sid: crypto.randomBytes(10).toString('base64url') })}`);
        return;
      }

      // Socket.IO EVENT on /chat namespace: "42/chat,[event, payload]"
      if (msg.startsWith('42/chat,')) {
        if (!client.authenticated) {
          sendPacket(ws, `42/chat,${JSON.stringify(['auth_error'])}`);
          return;
        }
        let parsed;
        try {
          parsed = JSON.parse(msg.slice('42/chat,'.length));
        } catch {
          return;
        }
        if (!Array.isArray(parsed) || parsed.length < 1) return;
        const [eventName, payload] = parsed;

        if (eventName === 'chat:send' && payload && (typeof payload.content === 'string' || typeof payload.mediaUrl === 'string')) {
          const content = typeof payload.content === 'string' ? payload.content.trim() : '';
          const mediaUrl = typeof payload.mediaUrl === 'string' ? payload.mediaUrl.trim() : undefined;
          const mediaType =
            payload.mediaType === 'video' || payload.mediaType === 'audio' || payload.mediaType === 'image'
              ? payload.mediaType
              : undefined;
          if (!content && !mediaUrl) return;
          const store = getStore();
          const sender = findUserById(client.userId);
          const message = {
            id: crypto.randomUUID(),
            conversationId: payload.conversationId || 'example-conversation',
            senderId: client.userId,
            senderUsername: sender ? sender.username : undefined,
            senderDisplayName: sender ? sender.displayName : undefined,
            type: payload.type || mediaType || 'text',
            content,
            mediaUrl,
            mediaType,
            readBy: [],
            createdAt: new Date().toISOString(),
          };
          store.messages.push(message);
          scheduleSave();

          if (payload.clientMsgId) {
            sendPacket(
              ws,
              `42/chat,${JSON.stringify([
                'chat:ack',
                { clientMsgId: payload.clientMsgId, messageId: message.id, at: message.createdAt },
              ])}`,
            );
          }
          broadcastMessage(message.conversationId, message);
        } else if (eventName === 'chat:typing' && payload && payload.conversationId) {
          const typingFrame = `42/chat,${JSON.stringify([
            'chat:typing',
            {
              conversationId: payload.conversationId,
              userId: client.userId,
              username: client.username || 'Someone',
            },
          ])}`;
          for (const other of clients) {
            if (other.authenticated && other.userId !== client.userId) {
              sendPacket(other.ws, typingFrame);
            }
          }
        } else if (eventName === 'chat:read' && payload && payload.messageId) {
          const store = getStore();
          const m = store.messages.find((item) => item.id === payload.messageId);
          if (m && !m.readBy.includes(client.userId)) {
            m.readBy.push(client.userId);
            scheduleSave();
          }
        } else if (eventName === 'room:join' && payload && typeof payload.channelId === 'string') {
          const prevChannel = client.channelId;
          client.channelId = payload.channelId;
          if (prevChannel && prevChannel !== payload.channelId) {
            broadcastRoomPresence(prevChannel);
          }
          broadcastRoomPresence(payload.channelId);
        } else if (eventName === 'room:leave' && payload && typeof payload.channelId === 'string') {
          if (client.channelId === payload.channelId) {
            client.channelId = null;
            broadcastRoomPresence(payload.channelId);
          }
        } else if (eventName === 'room:send' && payload && typeof payload.channelId === 'string') {
          const content = typeof payload.content === 'string' ? payload.content.trim() : '';
          const mediaUrl = typeof payload.mediaUrl === 'string' ? payload.mediaUrl.trim() : undefined;
          const mediaType =
            payload.mediaType === 'video' || payload.mediaType === 'audio' || payload.mediaType === 'image'
              ? payload.mediaType
              : undefined;
          if (!content && !mediaUrl) return;
          const mod = moderateContent(content);
          if (mod.moderationStatus === 'flagged') {
            sendPacket(ws, `42/chat,${JSON.stringify(['room:error', { message: 'Message blocked by AI safety filter.' }])}`);
            return;
          }
          const store = getStore();
          const message = {
            id: crypto.randomUUID(),
            channelId: payload.channelId,
            senderId: client.userId,
            senderUsername: client.username || 'user',
            senderRole: client.role || 'user',
            type: payload.type === 'action' ? 'action' : mediaType || 'text',
            content,
            mediaUrl,
            mediaType,
            createdAt: new Date().toISOString(),
          };
          store.channelMessages.push(message);
          if (store.channelMessages.length > 1000) {
            store.channelMessages = store.channelMessages.slice(-1000);
          }
          scheduleSave();
          broadcastChannelMessage(payload.channelId, message);
        }
      }
    });

    ws.on('close', () => {
      const prevChannel = client.channelId;
      clients.delete(client);
      if (prevChannel) {
        broadcastRoomPresence(prevChannel);
      }
    });
  });
}

module.exports = {
  attachChatWebsocket,
  broadcastMessage,
  getRoomOnlineUsers,
  broadcastChannelMessage,
  broadcastChannelTopic,
};
