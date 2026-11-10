const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const {
  REFRESH_TTL_MS,
  USERNAME_RE,
  EMAIL_RE,
  PASSWORD_RE,
  isUuid,
  sha256,
  hashPassword,
  verifyPassword,
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
} = require('./auth');
const {
  DEFAULT_PRIVACY,
  getStore,
  scheduleSave,
  findUserById,
  findUserByUsername,
  findUserByIdentifier,
  safeUser,
  hydrateProfile,
  hydratePost,
  addNotification,
} = require('./store');
const {
  attachChatWebsocket,
  broadcastMessage,
  getRoomOnlineUsers,
  broadcastChannelMessage,
  broadcastChannelTopic,
} = require('./ws');
const { moderateContent, rankFeedPosts, generateAltText, summarizePost } = require('./ai');

const PORT = Number(process.env.PORT || 8080);
const VALID_REACTIONS = new Set(['like', 'love', 'haha', 'wow', 'sad', 'angry', 'care']);
const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');
const ALLOWED_MIME = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['audio/webm', '.weba'],
  ['audio/mpeg', '.mp3'],
  ['audio/ogg', '.ogg'],
  ['audio/wav', '.wav'],
  ['audio/mp4', '.m4a'],
]);

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || 'http://localhost:3000';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Accept, X-Device-Id, X-Refresh-Token',
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
}

function sendOk(res, status, data, meta) {
  const body = meta !== undefined ? { success: true, data, meta } : { success: true, data };
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendError(res, status, code, message, details) {
  const error = {
    code,
    message,
    requestId: crypto.randomUUID(),
    ...(details ? { details } : {}),
  };
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ success: false, error }));
}

function sendNoContent(res) {
  res.writeHead(204);
  res.end();
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 40_000_000) {
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function getDeviceId(req) {
  const raw = req.headers['x-device-id'];
  return typeof raw === 'string' ? raw.trim() : '';
}

function isBlockedBetween(store, userA, userB) {
  if (!userA || !userB) return false;
  return store.blocks.some(
    (b) => (b.blockerId === userA && b.blockedId === userB) || (b.blockerId === userB && b.blockedId === userA),
  );
}

function canViewPost(post, viewerId, store) {
  if (!post) return false;
  if (viewerId && post.authorId === viewerId) return true;
  if (viewerId && isBlockedBetween(store, viewerId, post.authorId)) return false;
  const author = findUserById(post.authorId);
  const effectiveVis =
    post.visibility === 'only_me' || post.visibility === 'followers'
      ? post.visibility
      : author?.privacy?.posts || 'public';
  if (effectiveVis === 'only_me') return false;
  if (effectiveVis === 'followers') {
    if (!viewerId) return false;
    return store.follows.some((f) => f.followerId === viewerId && f.followeeId === post.authorId);
  }
  return true;
}

function notifyMentions(text, actor, resourceId) {
  const mentions = Array.from(new Set((text.match(/@([a-zA-Z0-9_]+)/g) || []).map((m) => m.slice(1))));
  for (const username of mentions) {
    const target = findUserByUsername(username);
    if (target && target.id !== actor.id) {
      addNotification({
        userId: target.id,
        actorId: actor.id,
        type: 'mention',
        resourceId,
        message: `@${actor.username} mentioned you.`,
      });
    }
  }
}

function authenticate(req) {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
  const claims = verifyAccessToken(auth.slice(7).trim());
  if (!claims) return null;
  return findUserById(claims.sub);
}

function issueSessionTokens(store, user, deviceId) {
  const resolvedDevice = isUuid(deviceId) ? deviceId : 'default-device';
  const sessionKey = `${user.id}:${resolvedDevice}`;
  const refreshToken = generateRefreshToken();
  const tokenEntry = {
    hash: sha256(refreshToken),
    used: false,
    revoked: false,
    expiresAt: Date.now() + REFRESH_TTL_MS,
  };
  // Valid login/register establishes a clean, unlocked device session.
  store.sessions[sessionKey] = {
    locked: false,
    tokens: [tokenEntry],
  };
  scheduleSave();
  return {
    accessToken: signAccessToken(user),
    refreshToken,
  };
}

function handleRefresh(req, res) {
  const deviceId = getDeviceId(req);
  if (!isUuid(deviceId)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'A valid X-Device-Id UUID header is required.');
  }
  const rawRefresh = req.headers['x-refresh-token'];
  if (typeof rawRefresh !== 'string' || !rawRefresh) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Missing refresh token.');
  }

  const store = getStore();
  const tokenHash = sha256(rawRefresh);

  for (const [sessionKey, session] of Object.entries(store.sessions)) {
    const [, keyDeviceId] = sessionKey.split(':');
    const match = session.tokens.find((t) => t.hash === tokenHash);
    if (!match) continue;

    // Must match bound device id.
    if (keyDeviceId !== deviceId) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Refresh token is not bound to this device.');
    }

    // Replay of an already-rotated token locks the device until re-login.
    if (match.used) {
      session.locked = true;
      for (const t of session.tokens) t.revoked = true;
      scheduleSave();
      return sendError(res, 401, 'UNAUTHORIZED', 'Refresh token reuse detected. Please log in again.');
    }

    if (session.locked || match.revoked || match.expiresAt < Date.now()) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Session expired or revoked.');
    }

    const userId = sessionKey.split(':')[0];
    const user = findUserById(userId);
    if (!user) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Account not found.');
    }

    match.used = true;
    const nextRefresh = generateRefreshToken();
    session.tokens.push({
      hash: sha256(nextRefresh),
      used: false,
      revoked: false,
      expiresAt: Date.now() + REFRESH_TTL_MS,
    });
    // Keep only recent token records per device.
    if (session.tokens.length > 10) {
      session.tokens = session.tokens.slice(-10);
    }
    scheduleSave();

    return sendOk(res, 200, {
      accessToken: signAccessToken(user),
      refreshToken: nextRefresh,
      user: safeUser(user),
    });
  }

  return sendError(res, 401, 'UNAUTHORIZED', 'Invalid refresh token.');
}

async function route(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return sendNoContent(res);
  }

  const parsedUrl = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;
  const method = req.method || 'GET';

  if (pathname === '/docs' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<!doctype html><html><body><h1>ABHIORAX Local API</h1><p>Base path: <code>/v1</code></p><p>Health: <a href="/v1/health">/v1/health</a></p></body></html>',
    );
    return;
  }

  if (pathname === '/v1/health' && method === 'GET') {
    return sendOk(res, 200, { status: 'ok', time: new Date().toISOString() });
  }

  if (!pathname.startsWith('/v1/')) {
    return sendError(res, 404, 'NOT_FOUND', `Route ${method} ${pathname} not found.`);
  }

  const apiPath = pathname.slice(3); // strips '/v1'
  const store = getStore();
  let body = {};
  if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
    try {
      body = await readJson(req);
    } catch (err) {
      return sendError(res, 400, 'BAD_REQUEST', err.message);
    }
  }

  // ---- AUTH ----
  if (apiPath === '/auth/register' && method === 'POST') {
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!USERNAME_RE.test(username)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Username must be 3-30 alphanumeric/underscore characters.');
    }
    if (!EMAIL_RE.test(email)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'A valid email address is required.');
    }
    if (!PASSWORD_RE.test(password)) {
      return sendError(
        res,
        400,
        'VALIDATION_ERROR',
        'Password must be at least 12 characters with an uppercase letter, lowercase letter, and digit.',
      );
    }
    if (
      store.users.some((u) => u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === email)
    ) {
      return sendError(res, 409, 'CONFLICT', 'Username or email is already registered.');
    }

    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      username,
      email,
      passwordHash: hashPassword(password),
      role: 'user',
      locale: typeof body.locale === 'string' ? body.locale : 'en',
      displayName: username,
      bio: '',
      website: '',
      location: '',
      avatarUrl: null,
      verified: false,
      privacy: { ...DEFAULT_PRIVACY },
      createdAt: now,
    };
    store.users.push(user);
    const tokens = issueSessionTokens(store, user, getDeviceId(req));
    return sendOk(res, 201, { ...tokens, user: safeUser(user) });
  }

  if (apiPath === '/auth/login' && method === 'POST') {
    const identifier = typeof body.identifier === 'string' ? body.identifier : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const user = findUserByIdentifier(identifier);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Invalid username/email or password.');
    }
    const tokens = issueSessionTokens(store, user, getDeviceId(req));
    return sendOk(res, 200, { ...tokens, user: safeUser(user) });
  }

  if (apiPath === '/auth/refresh' && method === 'POST') {
    return handleRefresh(req, res);
  }

  if (apiPath === '/auth/logout' && method === 'POST') {
    const user = authenticate(req);
    const deviceId = getDeviceId(req);
    if (user) {
      const resolvedDevice = isUuid(deviceId) ? deviceId : 'default-device';
      const session = store.sessions[`${user.id}:${resolvedDevice}`];
      if (session) {
        for (const t of session.tokens) t.revoked = true;
        scheduleSave();
      }
    }
    return sendNoContent(res);
  }

  if (apiPath === '/auth/mfa/setup' && method === 'GET') {
    const user = authenticate(req);
    if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required.');
    const secret = crypto.randomBytes(16).toString('hex').toUpperCase();
    const otpauthUrl = `otpauth://totp/ABHIORAX:${encodeURIComponent(user.username)}?secret=${secret}&issuer=ABHIORAX`;
    return sendOk(res, 200, { secret, otpauthUrl });
  }

  if (apiPath === '/auth/oauth' && method === 'POST') {
    const provider = typeof body.provider === 'string' ? body.provider.toLowerCase() : 'google';
    if (!['google', 'github', 'apple', 'magic_link'].includes(provider)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Unsupported auth provider.');
    }
    const emailRaw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const email = EMAIL_RE.test(emailRaw) ? emailRaw : `${provider}.guest@abhiorax.local`;
    let user = store.users.find((u) => u.email.toLowerCase() === email);
    if (!user) {
      const base = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 18) || provider;
      let username = base.length >= 3 ? base : `${base}user`;
      while (findUserByUsername(username)) {
        username = `${base.slice(0, 14)}${crypto.randomInt(100, 999)}`;
      }
      user = {
        id: crypto.randomUUID(),
        username,
        email,
        passwordHash: null,
        role: 'user',
        locale: 'en',
        displayName: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : username,
        bio: `Signed in with ${provider}.`,
        website: '',
        location: '',
        avatarUrl: null,
        verified: false,
        interests: [],
        privacy: { ...DEFAULT_PRIVACY },
        createdAt: new Date().toISOString(),
      };
      store.users.push(user);
    }
    const tokens = issueSessionTokens(store, user, getDeviceId(req));
    return sendOk(res, 200, { ...tokens, user: safeUser(user) });
  }

  if (apiPath === '/auth/mfa/verify' && method === 'POST') {
    const user = authenticate(req);
    if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required.');
    return sendNoContent(res);
  }

  // ---- PUBLIC DISCOVERY (no auth required for Explore / Profiles / Search) ----
  if (apiPath === '/public/explore' && method === 'GET') {
    const nowMs = Date.now();
    const publicPosts = store.posts
      .filter((p) => {
        if (p.scheduledAt && new Date(p.scheduledAt).getTime() > nowMs) return false;
        return canViewPost(p, null, store);
      })
      .slice(0, 20)
      .map((p) => hydratePost(p, null));
    const counts = new Map();
    for (const p of store.posts) {
      if (!canViewPost(p, null, store)) continue;
      for (const tag of p.hashtags || []) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    const trending = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count }));
    const groups = store.groups.slice(0, 6).map((g) => ({
      ...g,
      memberCount: g.memberIds.length,
      isMember: false,
    }));
    return sendOk(res, 200, { posts: publicPosts, trending, groups });
  }

  const publicProfileMatch = apiPath.match(/^\/public\/profiles\/([^/]+)$/);
  if (publicProfileMatch && method === 'GET') {
    const target = findUserByUsername(decodeURIComponent(publicProfileMatch[1]));
    if (!target || target.privacy?.profile === 'only_me') {
      return sendError(res, 404, 'NOT_FOUND', 'Public profile not found.');
    }
    const posts = store.posts
      .filter((p) => p.authorId === target.id && canViewPost(p, null, store))
      .map((p) => hydratePost(p, null));
    return sendOk(res, 200, { profile: hydrateProfile(target, null), posts });
  }

  if (apiPath === '/public/search' && method === 'GET') {
    const q = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase().replace(/^#/, '');
    const hits = [];
    if (q) {
      for (const u of store.users) {
        if (u.privacy?.searchable === false) continue;
        if (u.username.toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q)) {
          hits.push({ type: 'user', id: u.username, score: 1, highlight: u.displayName || u.username });
        }
      }
      for (const p of store.posts) {
        if (!canViewPost(p, null, store)) continue;
        if ((p.content || '').toLowerCase().includes(q)) {
          hits.push({ type: 'post', id: p.id, score: 0.9, highlight: (p.content || '').slice(0, 120) });
        }
      }
      const seenTags = new Set();
      for (const p of store.posts) {
        if (!canViewPost(p, null, store)) continue;
        for (const tag of p.hashtags || []) {
          if (tag.includes(q) && !seenTags.has(tag)) {
            seenTags.add(tag);
            hits.push({ type: 'hashtag', id: tag, score: 0.8 });
          }
        }
      }
    }
    return sendOk(res, 200, hits.slice(0, 20));
  }

  // ---- PUBLIC MEDIA SERVING (before auth gate for <img>/<video> tags) ----
  const mediaMatch = apiPath.match(/^\/media\/([a-zA-Z0-9._-]+)$/);
  if (mediaMatch && method === 'GET') {
    const filePath = path.join(UPLOAD_DIR, path.basename(mediaMatch[1]));
    if (!fs.existsSync(filePath)) return sendError(res, 404, 'NOT_FOUND', 'Media not found.');
    const ext = path.extname(filePath).toLowerCase();
    const mime =
      Array.from(ALLOWED_MIME.entries()).find(([, e]) => e === ext)?.[0] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // ---- PUBLIC POST DETAIL (before auth gate so anonymous post links load) ----
  const postDetailMatch = apiPath.match(/^\/posts\/([^/]+)$/);
  if (postDetailMatch && postDetailMatch[1] !== 'saved' && method === 'GET') {
    const viewer = authenticate(req);
    const post = store.posts.find((p) => p.id === postDetailMatch[1]);
    if (!post || !canViewPost(post, viewer?.id, store)) {
      return sendError(res, 404, 'NOT_FOUND', 'Post not found.');
    }
    post.viewCount = (post.viewCount || 0) + 1;
    scheduleSave();
    return sendOk(res, 200, hydratePost(post, viewer?.id));
  }

  // ---- ALL REMAINING ROUTES REQUIRE AUTHENTICATION ----
  const currentUser = authenticate(req);
  if (!currentUser) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required.');
  }

  // ---- MEDIA UPLOAD ----
  if (apiPath === '/media/upload' && method === 'POST') {
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType.toLowerCase().split(';')[0].trim() : '';
    const ext = ALLOWED_MIME.get(mimeType);
    if (!ext) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Unsupported file type. Use PNG, JPEG, WebP, GIF, MP4, WebM, or audio.');
    }
    const rawBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64.replace(/^data:[^;]+;base64,/, '') : '';
    if (!rawBase64) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Missing file data.');
    }
    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.length === 0 || buffer.length > 25_000_000) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'File must be between 1 byte and 25 MB.');
    }
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const key = `${crypto.randomUUID()}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, key), buffer);
    const url = `http://localhost:${PORT}/v1/media/${key}`;
    return sendOk(res, 201, {
      key: url,
      url,
      type: mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('audio/') ? 'audio' : 'image',
    });
  }

  // ---- AI HELPERS & ONBOARDING ----
  if (apiPath === '/ai/alt-text' && method === 'POST') {
    const altText = generateAltText(body.filename, body.context);
    return sendOk(res, 200, { altText });
  }

  if (apiPath === '/ai/summarize' && method === 'POST') {
    const result = summarizePost(body.content);
    return sendOk(res, 200, result);
  }

  if (apiPath === '/onboarding/interests' && method === 'POST') {
    const interests = Array.isArray(body.interests)
      ? body.interests.filter((i) => typeof i === 'string').slice(0, 12)
      : [];
    currentUser.interests = interests;
    // Auto-follow suggested accounts & join relevant groups so Day-1 feed is populated.
    let followedCount = 0;
    for (const u of store.users) {
      if (u.id === currentUser.id) continue;
      if (!store.follows.some((f) => f.followerId === currentUser.id && f.followeeId === u.id)) {
        store.follows.push({ followerId: currentUser.id, followeeId: u.id, createdAt: new Date().toISOString() });
        followedCount++;
      }
      if (followedCount >= 3) break;
    }
    for (const g of store.groups) {
      const cat = (g.category || '').toLowerCase();
      if (interests.some((i) => i.toLowerCase().includes(cat) || cat.includes(i.toLowerCase())) && !g.memberIds.includes(currentUser.id)) {
        g.memberIds.push(currentUser.id);
      }
    }
    scheduleSave();
    return sendOk(res, 200, { interests, followedCount });
  }

  // ---- USERS ----
  if (apiPath === '/users/me' && method === 'GET') {
    return sendOk(res, 200, hydrateProfile(currentUser, currentUser.id));
  }

  if (apiPath === '/users/me' && method === 'PATCH') {
    if (body.displayName !== undefined) {
      if (typeof body.displayName !== 'string' || body.displayName.length > 50) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'displayName must be 50 characters or fewer.');
      }
      currentUser.displayName = body.displayName.trim() || currentUser.username;
    }
    if (body.bio !== undefined) {
      if (typeof body.bio !== 'string' || body.bio.length > 500) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'bio must be 500 characters or fewer.');
      }
      currentUser.bio = body.bio;
    }
    if (body.location !== undefined) {
      if (typeof body.location !== 'string' || body.location.length > 100) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'location must be 100 characters or fewer.');
      }
      currentUser.location = body.location;
    }
    if (body.website !== undefined) {
      if (typeof body.website !== 'string' || body.website.length > 200) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid website URL.');
      }
      currentUser.website = body.website;
    }
    if (body.avatarUrl !== undefined) {
      if (typeof body.avatarUrl !== 'string' || body.avatarUrl.length > 500) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid avatarUrl.');
      }
      currentUser.avatarUrl = body.avatarUrl || null;
    }
    scheduleSave();
    return sendOk(res, 200, hydrateProfile(currentUser, currentUser.id));
  }

  if (apiPath === '/users/me/privacy' && method === 'GET') {
    return sendOk(res, 200, { ...hydrateProfile(currentUser, currentUser.id), privacy: currentUser.privacy });
  }

  if (apiPath === '/users/me/privacy' && method === 'PATCH') {
    currentUser.privacy = { ...currentUser.privacy, ...body };
    scheduleSave();
    return sendOk(res, 200, { ...hydrateProfile(currentUser, currentUser.id), privacy: currentUser.privacy });
  }

  if (apiPath === '/users/me/blocks' && method === 'GET') {
    const blocked = store.blocks
      .filter((b) => b.blockerId === currentUser.id)
      .map((b) => findUserById(b.blockedId))
      .filter(Boolean)
      .map((u) => hydrateProfile(u, currentUser.id));
    return sendOk(res, 200, blocked);
  }

  const userFollowMatch = apiPath.match(/^\/users\/([^/]+)\/(follow|unfollow|followers|following|posts|block|unblock)$/);
  if (userFollowMatch) {
    const targetUsername = decodeURIComponent(userFollowMatch[1]);
    const action = userFollowMatch[2];
    const target = findUserByUsername(targetUsername);
    if (!target) return sendError(res, 404, 'NOT_FOUND', 'User not found.');

    if (action === 'block' && method === 'POST') {
      if (target.id === currentUser.id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'You cannot block yourself.');
      }
      if (!store.blocks.some((b) => b.blockerId === currentUser.id && b.blockedId === target.id)) {
        store.blocks.push({ blockerId: currentUser.id, blockedId: target.id, createdAt: new Date().toISOString() });
        store.follows = store.follows.filter((f) => !(f.followerId === currentUser.id && f.followeeId === target.id));
        scheduleSave();
      }
      return sendOk(res, 200, { blocked: true });
    }

    if (action === 'unblock' && method === 'POST') {
      store.blocks = store.blocks.filter((b) => !(b.blockerId === currentUser.id && b.blockedId === target.id));
      scheduleSave();
      return sendOk(res, 200, { blocked: false });
    }

    if (action === 'follow' && method === 'POST') {
      if (target.id === currentUser.id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'You cannot follow yourself.');
      }
      const exists = store.follows.some((f) => f.followerId === currentUser.id && f.followeeId === target.id);
      if (!exists) {
        store.follows.push({ followerId: currentUser.id, followeeId: target.id, createdAt: new Date().toISOString() });
        addNotification({
          userId: target.id,
          actorId: currentUser.id,
          type: 'follow',
          resourceId: currentUser.username,
          message: `@${currentUser.username} started following you.`,
        });
        scheduleSave();
      }
      return sendOk(res, 200, { following: true });
    }

    if (action === 'unfollow' && method === 'POST') {
      store.follows = store.follows.filter((f) => !(f.followerId === currentUser.id && f.followeeId === target.id));
      scheduleSave();
      return sendOk(res, 200, { following: false });
    }

    if (action === 'followers' && method === 'GET') {
      const list = store.follows
        .filter((f) => f.followeeId === target.id)
        .map((f) => findUserById(f.followerId))
        .filter(Boolean)
        .map((u) => hydrateProfile(u, currentUser.id));
      return sendOk(res, 200, list);
    }

    if (action === 'following' && method === 'GET') {
      const list = store.follows
        .filter((f) => f.followerId === target.id)
        .map((f) => findUserById(f.followeeId))
        .filter(Boolean)
        .map((u) => hydrateProfile(u, currentUser.id));
      return sendOk(res, 200, list);
    }

    if (action === 'posts' && method === 'GET') {
      const list = store.posts
        .filter((p) => p.authorId === target.id && canViewPost(p, currentUser.id, store))
        .map((p) => hydratePost(p, currentUser.id));
      return sendOk(res, 200, list);
    }
  }

  const userGetMatch = apiPath.match(/^\/users\/([^/]+)$/);
  if (userGetMatch && method === 'GET') {
    const target = findUserByUsername(decodeURIComponent(userGetMatch[1]));
    if (!target) return sendError(res, 404, 'NOT_FOUND', 'User not found.');
    return sendOk(res, 200, hydrateProfile(target, currentUser.id));
  }

  // ---- POSTS ----
  if (apiPath === '/posts/saved' && method === 'GET') {
    const savedIds = new Set(store.saves.filter((s) => s.userId === currentUser.id).map((s) => s.postId));
    const list = store.posts.filter((p) => savedIds.has(p.id)).map((p) => hydratePost(p, currentUser.id));
    return sendOk(res, 200, list);
  }

  if (apiPath === '/posts' && method === 'POST') {
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const media = Array.isArray(body.media) ? body.media : [];
    const rawPoll = body.poll && typeof body.poll === 'object' ? body.poll : null;
    if ((!content && media.length === 0 && !rawPoll) || content.length > 4000) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Post content must be between 1 and 4000 characters.');
    }
    let poll = undefined;
    if (rawPoll && typeof rawPoll.question === 'string' && Array.isArray(rawPoll.options)) {
      const opts = rawPoll.options
        .filter((o) => typeof o === 'string' && o.trim())
        .slice(0, 4)
        .map((text, idx) => ({ id: `opt-${idx + 1}`, text: text.trim(), votes: [] }));
      if (rawPoll.question.trim() && opts.length >= 2) {
        poll = { question: rawPoll.question.trim(), options: opts };
      }
    }
    const hashtags = Array.from(new Set((content.match(/#([a-zA-Z0-9_]+)/g) || []).map((t) => t.slice(1).toLowerCase())));
    const mod = moderateContent(content);
    const now = new Date().toISOString();
    const scheduledAt =
      typeof body.scheduledAt === 'string' && !Number.isNaN(Date.parse(body.scheduledAt))
        ? new Date(body.scheduledAt).toISOString()
        : undefined;
    const post = {
      id: crypto.randomUUID(),
      authorId: currentUser.id,
      type: body.type || (media.length > 0 ? media[0].type || 'image' : 'text'),
      visibility: body.visibility || 'public',
      groupId: typeof body.groupId === 'string' ? body.groupId : undefined,
      content,
      media,
      poll,
      hashtags,
      likes: [],
      reactions: {},
      shareCount: 0,
      viewCount: 1,
      scheduledAt,
      status: scheduledAt && new Date(scheduledAt).getTime() > Date.now() ? 'scheduled' : 'published',
      moderationStatus: mod.moderationStatus,
      moderationScore: mod.riskScore,
      publishedAt: scheduledAt || now,
      createdAt: now,
    };
    if (media.some((m) => m.type === 'image') && media.every((m) => m.altText && m.altText.trim().length > 0)) {
      currentUser.a11yVerified = true;
    }
    store.posts.unshift(post);
    notifyMentions(content, currentUser, post.id);
    if (mod.moderationStatus === 'flagged') {
      store.reports.unshift({
        id: crypto.randomUUID(),
        reporterId: currentUser.id,
        targetType: 'post',
        targetId: post.id,
        reason: `ai_flagged (${mod.reasons.join(', ') || 'policy_risk'})`,
        status: 'open',
        createdAt: now,
      });
    }
    scheduleSave();
    return sendOk(res, 201, hydratePost(post, currentUser.id));
  }

  if (postDetailMatch && method === 'PATCH') {
    const post = store.posts.find((p) => p.id === postDetailMatch[1]);
    if (!post) return sendError(res, 404, 'NOT_FOUND', 'Post not found.');
    if (post.authorId !== currentUser.id && currentUser.role !== 'admin') {
      return sendError(res, 403, 'FORBIDDEN', 'Not permitted to edit this post.');
    }
    if (body.content !== undefined) {
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      if (!content || content.length > 4000) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Post content must be between 1 and 4000 characters.');
      }
      post.content = content;
      post.hashtags = Array.from(new Set((content.match(/#([a-zA-Z0-9_]+)/g) || []).map((t) => t.slice(1).toLowerCase())));
    }
    if (body.visibility && ['public', 'followers', 'only_me'].includes(body.visibility)) {
      post.visibility = body.visibility;
    }
    post.updatedAt = new Date().toISOString();
    scheduleSave();
    return sendOk(res, 200, hydratePost(post, currentUser.id));
  }

  if (postDetailMatch && method === 'DELETE') {
    const idx = store.posts.findIndex((p) => p.id === postDetailMatch[1]);
    if (idx === -1) return sendError(res, 404, 'NOT_FOUND', 'Post not found.');
    if (store.posts[idx].authorId !== currentUser.id && currentUser.role !== 'admin') {
      return sendError(res, 403, 'FORBIDDEN', 'Not permitted to delete this post.');
    }
    store.posts.splice(idx, 1);
    scheduleSave();
    return sendNoContent(res);
  }

  const postActionMatch = apiPath.match(/^\/posts\/([^/]+)\/(like|reactions|comments|save|share|vote)$/);
  if (postActionMatch) {
    const post = store.posts.find((p) => p.id === postActionMatch[1]);
    if (!post) return sendError(res, 404, 'NOT_FOUND', 'Post not found.');
    const action = postActionMatch[2];

    if (action === 'vote' && method === 'POST') {
      if (!post.poll || !Array.isArray(post.poll.options)) {
        return sendError(res, 400, 'BAD_REQUEST', 'This post does not have a poll.');
      }
      const optionId = body.optionId;
      const targetOpt = post.poll.options.find((o) => o.id === optionId);
      if (!targetOpt) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid poll option.');
      }
      for (const opt of post.poll.options) {
        opt.votes = (opt.votes || []).filter((uid) => uid !== currentUser.id);
      }
      targetOpt.votes.push(currentUser.id);
      scheduleSave();
      return sendOk(res, 200, hydratePost(post, currentUser.id).poll);
    }

    if (action === 'like' && method === 'POST') {
      const idx = post.likes.indexOf(currentUser.id);
      const liked = idx === -1;
      if (liked) {
        post.likes.push(currentUser.id);
        addNotification({
          userId: post.authorId,
          actorId: currentUser.id,
          type: 'like',
          resourceId: post.id,
          message: `@${currentUser.username} liked your post.`,
        });
      } else {
        post.likes.splice(idx, 1);
      }
      scheduleSave();
      return sendOk(res, 200, { liked, likeCount: post.likes.length });
    }

    if (action === 'reactions' && method === 'POST') {
      if (!VALID_REACTIONS.has(body.reaction)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Unsupported reaction type.');
      }
      if (!post.reactions) post.reactions = {};
      if (post.reactions[currentUser.id] === body.reaction) {
        delete post.reactions[currentUser.id];
      } else {
        post.reactions[currentUser.id] = body.reaction;
        addNotification({
          userId: post.authorId,
          actorId: currentUser.id,
          type: 'like',
          resourceId: post.id,
          message: `@${currentUser.username} reacted (${body.reaction}) to your post.`,
        });
      }
      const reactionCounts = {};
      for (const val of Object.values(post.reactions)) {
        reactionCounts[val] = (reactionCounts[val] || 0) + 1;
      }
      scheduleSave();
      return sendOk(res, 200, { reaction: post.reactions[currentUser.id] || null, reactionCounts });
    }

    if (action === 'save' && method === 'POST') {
      const idx = store.saves.findIndex((s) => s.userId === currentUser.id && s.postId === post.id);
      const saved = idx === -1;
      if (saved) store.saves.push({ userId: currentUser.id, postId: post.id, createdAt: new Date().toISOString() });
      else store.saves.splice(idx, 1);
      scheduleSave();
      return sendOk(res, 200, { saved });
    }

    if (action === 'share' && method === 'POST') {
      post.shareCount = (post.shareCount || 0) + 1;
      scheduleSave();
      return sendOk(res, 200, { shareCount: post.shareCount });
    }

    if (action === 'comments' && method === 'POST') {
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      if (!content || content.length > 1000) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Comment content must be between 1 and 1000 characters.');
      }
      const comment = {
        id: crypto.randomUUID(),
        postId: post.id,
        authorId: currentUser.id,
        parentId: typeof body.parentId === 'string' ? body.parentId : null,
        content,
        createdAt: new Date().toISOString(),
      };
      store.comments.push(comment);
      notifyMentions(content, currentUser, post.id);
      addNotification({
        userId: post.authorId,
        actorId: currentUser.id,
        type: 'comment',
        resourceId: post.id,
        message: `@${currentUser.username} commented on your post.`,
      });
      scheduleSave();
      return sendOk(res, 201, {
        ...comment,
        author: {
          id: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
          avatarUrl: currentUser.avatarUrl,
        },
      });
    }

    if (action === 'comments' && method === 'GET') {
      const list = store.comments
        .filter((c) => c.postId === post.id)
        .map((c) => {
          const author = findUserById(c.authorId);
          return {
            ...c,
            author: author
              ? { id: author.id, username: author.username, displayName: author.displayName, avatarUrl: author.avatarUrl }
              : undefined,
          };
        });
      return sendOk(res, 200, list);
    }
  }

  // ---- STORIES ----
  if (apiPath === '/stories' && method === 'GET') {
    const nowMs = Date.now();
    const blockedIds = new Set(store.blocks.filter((b) => b.blockerId === currentUser.id).map((b) => b.blockedId));
    const active = store.stories
      .filter((s) => new Date(s.expiresAt).getTime() > nowMs && !blockedIds.has(s.authorId))
      .map((s) => {
        const author = findUserById(s.authorId);
        return {
          ...s,
          author: author ? hydrateProfile(author, currentUser.id) : undefined,
        };
      });
    return sendOk(res, 200, active);
  }

  if (apiPath === '/stories' && method === 'POST') {
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const mediaUrl = typeof body.mediaUrl === 'string' ? body.mediaUrl.trim() : undefined;
    const mediaType = body.mediaType === 'video' ? 'video' : mediaUrl ? 'image' : undefined;
    if ((!content && !mediaUrl) || content.length > 300) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Story requires text (up to 300 chars) or media.');
    }
    const now = Date.now();
    const story = {
      id: crypto.randomUUID(),
      authorId: currentUser.id,
      content,
      mediaUrl,
      mediaType,
      bgColor: typeof body.bgColor === 'string' ? body.bgColor : '#1d4ed8',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    };
    store.stories.unshift(story);
    scheduleSave();
    return sendOk(res, 201, {
      ...story,
      author: hydrateProfile(currentUser, currentUser.id),
    });
  }

  // ---- FEED / DISCOVERY / SEARCH ----
  if (apiPath === '/feed' && method === 'GET') {
    const limit = Math.min(50, Math.max(1, Number(parsedUrl.searchParams.get('limit') || 20)));
    const offset = Math.max(0, Number(parsedUrl.searchParams.get('cursor') || 0));
    const mode = parsedUrl.searchParams.get('mode') || 'for_you';
    const muteRaw = parsedUrl.searchParams.get('mute') || '';
    const mutedWords = muteRaw
      .split(',')
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
    const nowMs = Date.now();
    const followingIds = new Set(store.follows.filter((f) => f.followerId === currentUser.id).map((f) => f.followeeId));
    const myGroupIds = new Set(store.groups.filter((g) => g.memberIds.includes(currentUser.id)).map((g) => g.id));

    const visiblePosts = store.posts.filter((p) => {
      if (p.scheduledAt && new Date(p.scheduledAt).getTime() > nowMs) return false;
      if (!canViewPost(p, currentUser.id, store)) return false;
      if (mutedWords.length > 0 && mutedWords.some((w) => (p.content || '').toLowerCase().includes(w))) {
        return false;
      }
      if (mode === 'following') {
        return p.authorId === currentUser.id || followingIds.has(p.authorId);
      }
      if (mode === 'groups') {
        return !!p.groupId && myGroupIds.has(p.groupId);
      }
      return true;
    });

    let ranked;
    if (mode === 'following' || mode === 'groups') {
      ranked = [...visiblePosts]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((post) => ({
          post,
          rankScore: 1,
          reason: mode === 'groups' ? 'From your groups' : 'Chronological following feed',
        }));
    } else {
      ranked = rankFeedPosts(visiblePosts, currentUser, store.follows);
    }

    const slice = ranked.slice(offset, offset + limit);
    const nextCursor = offset + slice.length < ranked.length ? String(offset + slice.length) : null;
    const data = slice.map(({ post, rankScore, reason }) => ({
      post: hydratePost(post, currentUser.id),
      rankScore,
      reason,
    }));
    return sendOk(res, 200, data, { nextCursor });
  }

  if (apiPath === '/trending' && method === 'GET') {
    const counts = new Map();
    for (const post of store.posts) {
      if (!canViewPost(post, currentUser.id, store)) continue;
      for (const tag of post.hashtags || []) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    const trending = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
    return sendOk(res, 200, trending);
  }

  if (apiPath === '/search' && method === 'GET') {
    const q = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase().replace(/^#/, '');
    const type = parsedUrl.searchParams.get('type') || 'all';
    const hits = [];

    if (q) {
      if (type === 'all' || type === 'user') {
        for (const u of store.users) {
          if (u.privacy?.searchable === false && u.id !== currentUser.id) continue;
          if (isBlockedBetween(store, currentUser.id, u.id)) continue;
          if (u.username.toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q)) {
            hits.push({ type: 'user', id: u.username, score: 1, highlight: u.displayName || u.username });
          }
        }
      }
      if (type === 'all' || type === 'post') {
        for (const p of store.posts) {
          if (!canViewPost(p, currentUser.id, store)) continue;
          if ((p.content || '').toLowerCase().includes(q)) {
            hits.push({ type: 'post', id: p.id, score: 0.9, highlight: (p.content || '').slice(0, 120) });
          }
        }
      }
      if (type === 'all' || type === 'hashtag') {
        const seenTags = new Set();
        for (const p of store.posts) {
          if (!canViewPost(p, currentUser.id, store)) continue;
          for (const tag of p.hashtags || []) {
            if (tag.includes(q) && !seenTags.has(tag)) {
              seenTags.add(tag);
              hits.push({ type: 'hashtag', id: tag, score: 0.8 });
            }
          }
        }
      }
    }
    return sendOk(res, 200, hits.slice(0, 20));
  }

  if (apiPath === '/suggestions/users' && method === 'GET') {
    const suggestions = store.users
      .filter((u) => u.id !== currentUser.id && !isBlockedBetween(store, currentUser.id, u.id))
      .slice(0, 10)
      .map((u) => hydrateProfile(u, currentUser.id));
    return sendOk(res, 200, suggestions);
  }

  if (apiPath.startsWith('/experiments/') && method === 'GET') {
    return sendOk(res, 200, { experiment: apiPath.slice('/experiments/'.length), variant: 'control' });
  }

  // ---- CHAT ----
  if (apiPath === '/chat/conversations' && method === 'POST') {
    const participantId = body.participantId;
    const other = participantId ? findUserById(participantId) : null;
    if (!other) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'A valid participantId is required.');
    }
    if (isBlockedBetween(store, currentUser.id, other.id)) {
      return sendError(res, 403, 'FORBIDDEN', 'Messaging is blocked between these accounts.');
    }
    const msgPref = other.privacy?.messages || 'everyone';
    if (msgPref === 'no_one' && other.id !== currentUser.id) {
      return sendError(res, 403, 'FORBIDDEN', 'This user does not accept direct messages.');
    }
    if (
      msgPref === 'followers' &&
      other.id !== currentUser.id &&
      !store.follows.some((f) => f.followerId === other.id && f.followeeId === currentUser.id)
    ) {
      return sendError(res, 403, 'FORBIDDEN', 'Only people this user follows can message them.');
    }

    const existing = store.conversations.find(
      (c) =>
        c.type === 'direct' &&
        c.participantIds.includes(currentUser.id) &&
        c.participantIds.includes(participantId),
    );
    if (existing) return sendOk(res, 201, existing);

    const conv = {
      id: crypto.randomUUID(),
      title: `Chat with @${other.username}`,
      type: 'direct',
      participantIds: [currentUser.id, participantId],
      createdAt: new Date().toISOString(),
    };
    store.conversations.push(conv);
    scheduleSave();
    return sendOk(res, 201, conv);
  }

  if (apiPath === '/chat/conversations' && method === 'GET') {
    const list = store.conversations
      .filter((c) => c.id === 'example-conversation' || c.participantIds.includes(currentUser.id))
      .map((c) => {
        const otherId = c.participantIds.find((id) => id !== currentUser.id);
        const other = otherId ? findUserById(otherId) : null;
        return {
          ...c,
          title: c.type === 'direct' && other ? `@${other.username}` : c.title,
        };
      });
    return sendOk(res, 200, list);
  }

  const chatMessagesMatch = apiPath.match(/^\/chat\/conversations\/([^/]+)\/messages$/);
  if (chatMessagesMatch) {
    const convId = decodeURIComponent(chatMessagesMatch[1]);
    if (method === 'GET') {
      const list = store.messages
        .filter((m) => m.conversationId === convId)
        .map((m) => {
          const sender = findUserById(m.senderId);
          return {
            ...m,
            senderUsername: m.senderUsername || (sender ? sender.username : undefined),
            senderDisplayName: m.senderDisplayName || (sender ? sender.displayName : undefined),
          };
        });
      return sendOk(res, 200, list);
    }
    if (method === 'POST') {
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      const mediaUrl = typeof body.mediaUrl === 'string' ? body.mediaUrl.trim() : undefined;
      const mediaType =
        body.mediaType === 'video' || body.mediaType === 'audio' || body.mediaType === 'image'
          ? body.mediaType
          : undefined;
      if (!content && !mediaUrl) return sendError(res, 400, 'VALIDATION_ERROR', 'Message content or media is required.');
      const message = {
        id: crypto.randomUUID(),
        conversationId: convId,
        senderId: currentUser.id,
        senderUsername: currentUser.username,
        senderDisplayName: currentUser.displayName,
        type: body.type || mediaType || 'text',
        content,
        mediaUrl,
        mediaType,
        readBy: [],
        createdAt: new Date().toISOString(),
      };
      store.messages.push(message);
      scheduleSave();
      broadcastMessage(convId, message);
      return sendOk(res, 201, message);
    }
  }

  const chatReadMatch = apiPath.match(/^\/chat\/conversations\/([^/]+)\/messages\/([^/]+)\/read$/);
  if (chatReadMatch && method === 'POST') {
    const msg = store.messages.find((m) => m.id === chatReadMatch[2]);
    if (msg && !msg.readBy.includes(currentUser.id)) {
      msg.readBy.push(currentUser.id);
      scheduleSave();
    }
    return sendNoContent(res);
  }

  // ---- MIRC-STYLE LIVE ROOMS (#CHANNELS) ----
  if (apiPath === '/rooms' && method === 'GET') {
    const list = store.channels.map((ch) => ({
      ...ch,
      onlineUsers: getRoomOnlineUsers(ch.id),
      onlineCount: getRoomOnlineUsers(ch.id).length,
      messageCount: store.channelMessages.filter((m) => m.channelId === ch.id).length,
    }));
    return sendOk(res, 200, list);
  }

  if (apiPath === '/rooms' && method === 'POST') {
    const rawName = typeof body.name === 'string' ? body.name.trim().replace(/^#/, '').toLowerCase() : '';
    const slug = rawName.replace(/[^a-z0-9_-]/g, '-').replace(/(^-|-$)/g, '');
    if (slug.length < 2 || slug.length > 30) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Channel name must be 2-30 alphanumeric characters.');
    }
    const existing = store.channels.find((ch) => ch.id === slug);
    if (existing) {
      return sendOk(res, 200, {
        ...existing,
        onlineUsers: getRoomOnlineUsers(existing.id),
        onlineCount: getRoomOnlineUsers(existing.id).length,
      });
    }
    const channel = {
      id: slug,
      name: slug,
      topic: typeof body.topic === 'string' && body.topic.trim() ? body.topic.trim().slice(0, 140) : `Welcome to #${slug}`,
      ownerId: currentUser.id,
      createdAt: new Date().toISOString(),
    };
    store.channels.push(channel);
    store.channelMessages.push({
      id: crypto.randomUUID(),
      channelId: slug,
      senderId: currentUser.id,
      senderUsername: currentUser.username,
      senderRole: currentUser.role,
      type: 'system',
      content: `@${currentUser.username} created #${slug}`,
      createdAt: channel.createdAt,
    });
    scheduleSave();
    return sendOk(res, 201, { ...channel, onlineUsers: [], onlineCount: 0 });
  }

  const roomTopicMatch = apiPath.match(/^\/rooms\/([^/]+)\/topic$/);
  if (roomTopicMatch && method === 'PATCH') {
    const channel = store.channels.find((ch) => ch.id === decodeURIComponent(roomTopicMatch[1]));
    if (!channel) return sendError(res, 404, 'NOT_FOUND', 'Channel not found.');
    const topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, 140) : '';
    channel.topic = topic || `Welcome to #${channel.name}`;
    const sysMsg = {
      id: crypto.randomUUID(),
      channelId: channel.id,
      senderId: currentUser.id,
      senderUsername: currentUser.username,
      senderRole: currentUser.role,
      type: 'system',
      content: `@${currentUser.username} changed the topic to: ${channel.topic}`,
      createdAt: new Date().toISOString(),
    };
    store.channelMessages.push(sysMsg);
    scheduleSave();
    broadcastChannelTopic(channel.id, channel.topic);
    broadcastChannelMessage(channel.id, sysMsg);
    return sendOk(res, 200, channel);
  }

  const roomMessagesMatch = apiPath.match(/^\/rooms\/([^/]+)\/messages$/);
  if (roomMessagesMatch) {
    const channelId = decodeURIComponent(roomMessagesMatch[1]);
    const channel = store.channels.find((ch) => ch.id === channelId);
    if (!channel) return sendError(res, 404, 'NOT_FOUND', 'Channel not found.');

    if (method === 'GET') {
      const list = store.channelMessages
        .filter((m) => m.channelId === channelId && !isBlockedBetween(store, currentUser.id, m.senderId))
        .slice(-100);
      return sendOk(res, 200, list, {
        onlineUsers: getRoomOnlineUsers(channelId),
        topic: channel.topic,
      });
    }

    if (method === 'POST') {
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      const mediaUrl = typeof body.mediaUrl === 'string' ? body.mediaUrl.trim() : undefined;
      const mediaType =
        body.mediaType === 'video' || body.mediaType === 'audio' || body.mediaType === 'image'
          ? body.mediaType
          : undefined;
      if (!content && !mediaUrl) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Message content or media is required.');
      }
      const mod = moderateContent(content);
      if (mod.moderationStatus === 'flagged') {
        return sendError(res, 400, 'POLICY_BLOCKED', 'Message blocked by AI safety filter.');
      }
      const message = {
        id: crypto.randomUUID(),
        channelId,
        senderId: currentUser.id,
        senderUsername: currentUser.username,
        senderRole: currentUser.role,
        type: body.type === 'action' ? 'action' : mediaType || 'text',
        content,
        mediaUrl,
        mediaType,
        createdAt: new Date().toISOString(),
      };
      store.channelMessages.push(message);
      scheduleSave();
      broadcastChannelMessage(channelId, message);
      return sendOk(res, 201, message);
    }
  }

  // ---- GROUPS ----
  if (apiPath === '/groups' && method === 'GET') {
    const category = parsedUrl.searchParams.get('category');
    const list = store.groups
      .filter((g) => !category || category === 'All' || (g.category || 'General') === category)
      .map((g) => ({
        ...g,
        category: g.category || 'General',
        memberCount: g.memberIds.length,
        isMember: g.memberIds.includes(currentUser.id),
      }));
    return sendOk(res, 200, list);
  }

  if (apiPath === '/groups' && method === 'POST') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : 'General';
    if (name.length < 3 || name.length > 60) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Group name must be 3-60 characters.');
    }
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || crypto.randomUUID().slice(0, 8);
    const group = {
      id: `${slug}-${crypto.randomUUID().slice(0, 6)}`,
      name,
      slug,
      category,
      description,
      ownerId: currentUser.id,
      memberIds: [currentUser.id],
      pinnedPostId: null,
      createdAt: new Date().toISOString(),
    };
    store.groups.unshift(group);
    scheduleSave();
    return sendOk(res, 201, { ...group, memberCount: 1, isMember: true });
  }

  const groupActionMatch = apiPath.match(/^\/groups\/([^/]+)\/(join|leave|posts|pin)$/);
  if (groupActionMatch) {
    const group = store.groups.find((g) => g.id === decodeURIComponent(groupActionMatch[1]));
    if (!group) return sendError(res, 404, 'NOT_FOUND', 'Group not found.');
    const action = groupActionMatch[2];

    if (action === 'join' && method === 'POST') {
      if (!group.memberIds.includes(currentUser.id)) {
        group.memberIds.push(currentUser.id);
        scheduleSave();
      }
      return sendOk(res, 200, { isMember: true, memberCount: group.memberIds.length });
    }

    if (action === 'leave' && method === 'POST') {
      group.memberIds = group.memberIds.filter((id) => id !== currentUser.id);
      scheduleSave();
      return sendOk(res, 200, { isMember: false, memberCount: group.memberIds.length });
    }

    if (action === 'pin' && method === 'POST') {
      if (group.ownerId !== currentUser.id && currentUser.role !== 'admin') {
        return sendError(res, 403, 'FORBIDDEN', 'Only the group owner or admin can pin posts.');
      }
      group.pinnedPostId = typeof body.postId === 'string' ? body.postId : null;
      scheduleSave();
      return sendOk(res, 200, { pinnedPostId: group.pinnedPostId });
    }

    if (action === 'posts' && method === 'GET') {
      const list = store.posts
        .filter((p) => p.groupId === group.id)
        .map((p) => hydratePost(p, currentUser.id));
      return sendOk(res, 200, list);
    }

    if (action === 'posts' && method === 'POST') {
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      const media = Array.isArray(body.media) ? body.media : [];
      if ((!content && media.length === 0) || content.length > 4000) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Post content must be between 1 and 4000 characters.');
      }
      const rawPoll = body.poll && typeof body.poll === 'object' ? body.poll : null;
      let poll = undefined;
      if (rawPoll && typeof rawPoll.question === 'string' && Array.isArray(rawPoll.options)) {
        const opts = rawPoll.options
          .filter((o) => typeof o === 'string' && o.trim())
          .slice(0, 4)
          .map((text, idx) => ({ id: `opt-${idx + 1}`, text: text.trim(), votes: [] }));
        if (rawPoll.question.trim() && opts.length >= 2) {
          poll = { question: rawPoll.question.trim(), options: opts };
        }
      }
      const now = new Date().toISOString();
      const post = {
        id: crypto.randomUUID(),
        authorId: currentUser.id,
        type: body.type || (media.length > 0 ? media[0].type || 'image' : 'text'),
        visibility: 'public',
        groupId: group.id,
        content,
        media,
        poll,
        hashtags: Array.from(new Set((content.match(/#([a-zA-Z0-9_]+)/g) || []).map((t) => t.slice(1).toLowerCase()))),
        likes: [],
        reactions: {},
        shareCount: 0,
        viewCount: 1,
        status: 'published',
        moderationStatus: 'approved',
        publishedAt: now,
        createdAt: now,
      };
      store.posts.unshift(post);
      scheduleSave();
      return sendOk(res, 201, hydratePost(post, currentUser.id));
    }
  }

  // ---- NOTIFICATIONS ----
  if (apiPath === '/notifications' && method === 'GET') {
    const mine = store.notifications.filter((n) => n.userId === currentUser.id);
    const unreadCount = mine.filter((n) => !n.read).length;
    return sendOk(res, 200, mine, { unreadCount });
  }

  if (apiPath === '/notifications/read' && method === 'POST') {
    for (const n of store.notifications) {
      if (n.userId === currentUser.id) n.read = true;
    }
    scheduleSave();
    return sendNoContent(res);
  }

  if (apiPath === '/notifications/push-token' && method === 'PUT') {
    store.pushTokens[currentUser.id] = { token: body.token, platform: body.platform };
    scheduleSave();
    return sendNoContent(res);
  }

  // ---- CREATOR / ADMIN / ACCESSIBILITY / TRUST & SAFETY ----
  if (apiPath === '/creator/account' && method === 'GET') {
    if (currentUser.role !== 'creator' && currentUser.role !== 'admin') {
      return sendError(res, 403, 'FORBIDDEN', 'Creator role required.');
    }
    return sendOk(res, 200, { userId: currentUser.id, tier: 'pro', payoutsEnabled: true });
  }

  const creatorSubMatch = apiPath.match(/^\/creator\/subscribe\/([^/]+)$/);
  if (creatorSubMatch && method === 'POST') {
    const creator = findUserByUsername(decodeURIComponent(creatorSubMatch[1]));
    if (!creator) return sendError(res, 404, 'NOT_FOUND', 'Creator not found.');
    if (creator.id === currentUser.id) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'You cannot subscribe to yourself.');
    }
    const idx = store.subscriptions.findIndex(
      (s) => s.subscriberId === currentUser.id && s.creatorId === creator.id,
    );
    const subscribed = idx === -1;
    if (subscribed) {
      store.subscriptions.push({
        subscriberId: currentUser.id,
        creatorId: creator.id,
        createdAt: new Date().toISOString(),
      });
      addNotification({
        userId: creator.id,
        actorId: currentUser.id,
        type: 'subscription',
        resourceId: currentUser.username,
        message: `@${currentUser.username} subscribed to your creator membership.`,
      });
    } else {
      store.subscriptions.splice(idx, 1);
    }
    scheduleSave();
    return sendOk(res, 200, { subscribed });
  }

  if (apiPath === '/creator/tip' && method === 'POST') {
    const creator = findUserByUsername(typeof body.creatorUsername === 'string' ? body.creatorUsername : '');
    const amountUsd = Number(body.amountUsd);
    if (!creator || Number.isNaN(amountUsd) || amountUsd < 1 || amountUsd > 500) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Tip amount must be between $1 and $500.');
    }
    const tip = {
      id: crypto.randomUUID(),
      fromUserId: currentUser.id,
      toUserId: creator.id,
      amountUsd: Number(amountUsd.toFixed(2)),
      message: typeof body.message === 'string' ? body.message.trim().slice(0, 200) : '',
      createdAt: new Date().toISOString(),
    };
    store.tips.unshift(tip);
    addNotification({
      userId: creator.id,
      actorId: currentUser.id,
      type: 'payout',
      resourceId: currentUser.username,
      message: `@${currentUser.username} sent you a $${tip.amountUsd.toFixed(2)} tip!`,
    });
    scheduleSave();
    return sendOk(res, 201, tip);
  }

  if (apiPath === '/creator/subscribers' && method === 'GET') {
    if (currentUser.role !== 'creator' && currentUser.role !== 'admin') {
      return sendError(res, 403, 'FORBIDDEN', 'Creator role required.');
    }
    const subs = store.subscriptions
      .filter((s) => s.creatorId === currentUser.id)
      .map((s) => {
        const u = findUserById(s.subscriberId);
        return u
          ? { id: u.id, username: u.username, email: u.email, displayName: u.displayName, subscribedAt: s.createdAt }
          : null;
      })
      .filter(Boolean);
    return sendOk(res, 200, subs);
  }

  if (apiPath === '/creator/stats' && method === 'GET') {
    if (currentUser.role !== 'creator' && currentUser.role !== 'admin') {
      return sendError(res, 403, 'FORBIDDEN', 'Creator role required.');
    }
    const myPosts = store.posts.filter((p) => p.authorId === currentUser.id);
    const scheduledPosts = myPosts.filter((p) => p.scheduledAt && new Date(p.scheduledAt).getTime() > Date.now());
    const totalViews = myPosts.reduce((sum, p) => sum + (p.viewCount || 0), 0);
    const totalLikes = myPosts.reduce((sum, p) => sum + (p.likes ? p.likes.length : 0), 0);
    const totalComments = store.comments.filter((c) => myPosts.some((p) => p.id === c.postId)).length;
    const followerCount = store.follows.filter((f) => f.followeeId === currentUser.id).length;
    const subscriberCount = store.subscriptions.filter((s) => s.creatorId === currentUser.id).length;
    const tipTotalUsd = store.tips
      .filter((t) => t.toUserId === currentUser.id)
      .reduce((sum, t) => sum + (t.amountUsd || 0), 0);
    return sendOk(res, 200, {
      postCount: myPosts.length,
      scheduledCount: scheduledPosts.length,
      totalViews,
      totalLikes,
      totalComments,
      followerCount,
      subscriberCount,
      tipTotalUsd: Number(tipTotalUsd.toFixed(2)),
      estimatedRevenueUsd: Number((totalViews * 0.02 + totalLikes * 0.1 + tipTotalUsd + subscriberCount * 5).toFixed(2)),
      recentPosts: myPosts.slice(0, 10).map((p) => hydratePost(p, currentUser.id)),
    });
  }

  if (apiPath === '/admin/stats' && method === 'GET') {
    if (currentUser.role !== 'admin') {
      return sendError(res, 403, 'FORBIDDEN', 'Admin role required.');
    }
    return sendOk(res, 200, {
      users: store.users.length,
      posts: store.posts.length,
      comments: store.comments.length,
      groups: store.groups.length,
      conversations: store.conversations.length,
      reports: store.reports.length,
      openReports: store.reports.filter((r) => (r.status || 'open') === 'open').length,
    });
  }

  if (apiPath === '/admin/reports' && method === 'GET') {
    if (currentUser.role !== 'admin' && currentUser.role !== 'moderator') {
      return sendError(res, 403, 'FORBIDDEN', 'Admin or moderator role required.');
    }
    const list = store.reports.map((r) => {
      const reporter = findUserById(r.reporterId);
      const targetPost = r.targetType === 'post' ? store.posts.find((p) => p.id === r.targetId) : null;
      return {
        ...r,
        status: r.status || 'open',
        reporterUsername: reporter ? reporter.username : 'unknown',
        targetPreview: targetPost ? targetPost.content : undefined,
      };
    });
    return sendOk(res, 200, list);
  }

  const adminReportMatch = apiPath.match(/^\/admin\/reports\/([^/]+)$/);
  if (adminReportMatch && method === 'PATCH') {
    if (currentUser.role !== 'admin' && currentUser.role !== 'moderator') {
      return sendError(res, 403, 'FORBIDDEN', 'Admin or moderator role required.');
    }
    const report = store.reports.find((r) => r.id === adminReportMatch[1]);
    if (!report) return sendError(res, 404, 'NOT_FOUND', 'Report not found.');
    const nextStatus = body.status === 'dismissed' ? 'dismissed' : 'actioned';
    report.status = nextStatus;
    report.reviewedBy = currentUser.id;
    report.reviewedAt = new Date().toISOString();
    if (nextStatus === 'actioned' && body.deleteTarget && report.targetType === 'post') {
      store.posts = store.posts.filter((p) => p.id !== report.targetId);
    }
    scheduleSave();
    return sendOk(res, 200, report);
  }

  if (apiPath === '/admin/users' && method === 'GET') {
    if (currentUser.role !== 'admin') {
      return sendError(res, 403, 'FORBIDDEN', 'Admin role required.');
    }
    return sendOk(res, 200, store.users.slice(0, 50).map((u) => safeUser(u)));
  }

  const adminUserRoleMatch = apiPath.match(/^\/admin\/users\/([^/]+)\/role$/);
  if (adminUserRoleMatch && method === 'PATCH') {
    if (currentUser.role !== 'admin') {
      return sendError(res, 403, 'FORBIDDEN', 'Admin role required.');
    }
    const target = findUserById(adminUserRoleMatch[1]);
    if (!target) return sendError(res, 404, 'NOT_FOUND', 'User not found.');
    const allowedRoles = new Set(['user', 'creator', 'moderator', 'admin']);
    if (!allowedRoles.has(body.role)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid role.');
    }
    target.role = body.role;
    scheduleSave();
    return sendOk(res, 200, safeUser(target));
  }

  if (apiPath === '/accessibility/report' && method === 'POST') {
    if (currentUser.role !== 'admin' && currentUser.role !== 'moderator') {
      return sendError(res, 403, 'FORBIDDEN', 'Moderator or admin role required.');
    }
    store.a11yReports.push({ ...body, reporterId: currentUser.id, createdAt: new Date().toISOString() });
    scheduleSave();
    return sendOk(res, 201, { recorded: true });
  }

  if (apiPath === '/tns/report' && method === 'POST') {
    store.reports.unshift({
      id: crypto.randomUUID(),
      reporterId: currentUser.id,
      status: 'open',
      ...body,
      createdAt: new Date().toISOString(),
    });
    scheduleSave();
    return sendOk(res, 201, { reported: true });
  }

  return sendError(res, 404, 'NOT_FOUND', `Route ${method} ${pathname} not found.`);
}

const server = http.createServer((req, res) => {
  route(req, res).catch((err) => {
    setCorsHeaders(req, res);
    sendError(res, 500, 'INTERNAL_ERROR', err?.message || 'Internal server error.');
  });
});

attachChatWebsocket(server);

server.listen(PORT, () => {
  console.log(`ABHIORAX API listening on http://localhost:${PORT}/v1 (docs at http://localhost:${PORT}/docs)`);
});
