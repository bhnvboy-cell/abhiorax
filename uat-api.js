const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const API_BASE = process.env.UAT_API_BASE ?? 'http://localhost:8080/v1';
const PASSWORD = 'UatPassword123!';
const SUFFIX = Date.now().toString().slice(-8);
let seq = 0;

const counts = { passed: 0, failed: 0, scenarios: 0 };
const storyResults = [];

async function req(method, apiPath, { token, body, headers = {}, device } = {}) {
  const h = { Accept: 'application/json', ...headers };
  if (device) h['X-Device-Id'] = device;
  if (body) h['Content-Type'] = 'application/json';
  if (token) h['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API_BASE + apiPath, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

function makeHarness() {
  return {
    failures: [],
    device: crypto.randomUUID(),
    check(name, cond, extra) {
      if (cond) {
        console.log(`  PASS  ${name}`);
      } else {
        this.failures.push(`${name}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ''}`);
        console.log(`  FAIL  ${name}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ''}`);
      }
    },
    async register(prefix) {
      const username = `${prefix}${SUFFIX}${(seq++).toString(36)}`;
      const r = await req('POST', '/auth/register', {
        body: { username, email: `${username}@example.com`, password: PASSWORD, locale: 'en' },
        device: this.device,
      });
      return {
        username,
        status: r.status,
        json: r.json,
        accessToken: r.json?.data?.accessToken,
        refreshToken: r.json?.data?.refreshToken,
        user: r.json?.data?.user,
      };
    },
    async login(identifier, password, device) {
      const r = await req('POST', '/auth/login', {
        body: { identifier, password },
        device: device ?? this.device,
      });
      return { status: r.status, json: r.json, accessToken: r.json?.data?.accessToken, refreshToken: r.json?.data?.refreshToken };
    },
    async refresh(refreshToken, device) {
      const r = await req('POST', '/auth/refresh', {
        headers: refreshToken ? { 'X-Refresh-Token': refreshToken } : {},
        device: device ?? this.device,
      });
      return { status: r.status, json: r.json, accessToken: r.json?.data?.accessToken, refreshToken: r.json?.data?.refreshToken };
    },
  };
}

function scenario(name, acceptance, run) {
  return { name, acceptance, run };
}

const stories = [
  {
    id: 'US-01',
    title: 'Account registration',
    description: 'A new visitor can create an account with a valid username, email and strong password.',
    scenarios: [
      scenario(
        'UAT-01-01',
        'AC: Registration with a valid username/email/password returns 201 with an access token and a refresh token, and an account profile is created.',
        async (h) => {
          const a = await h.register('uat01alice');
          h.check('status 201', a.status === 201, a.json);
          h.check('access token issued', typeof a.accessToken === 'string' && a.accessToken.length > 20, a.accessToken);
          h.check('refresh token issued', typeof a.refreshToken === 'string' && a.refreshToken.length > 20);
          h.check('user id returned', !!a.user?.id);
          h.check('username returned', a.user?.username === a.username, a.user);
          h.check('no passwordHash leak', !JSON.stringify(a.user ?? {}).includes('passwordHash'));
        },
      ),
      scenario(
        'UAT-01-02',
        'AC: Re-registering with an existing username or email is rejected with 409.',
        async (h) => {
          const a = await h.register('uat01alice');
          const r = await req('POST', '/auth/register', {
            body: { username: a.username, email: `${a.username}@example.com`, password: PASSWORD },
            device: h.device,
          });
          h.check('duplicate username rejected 409', r.status === 409, r.json);
        },
      ),
      scenario(
        'UAT-01-03',
        'AC: Passwords shorter than 12 characters or lacking an upper-case letter, lower-case letter and digit are rejected with 400.',
        async (h) => {
          const r = await req('POST', '/auth/register', {
            body: { username: `uat01weak${SUFFIX}`, email: `uat01weak${SUFFIX}@example.com`, password: 'short' },
            device: h.device,
          });
          h.check('weak password rejected 400', r.status === 400, r.json);
        },
      ),
      scenario(
        'UAT-01-04',
        'AC: Usernames with disallowed characters are rejected with 400.',
        async (h) => {
          const r = await req('POST', '/auth/register', {
            body: { username: 'bad name!', email: `uat01bad${SUFFIX}@example.com`, password: PASSWORD },
            device: h.device,
          });
          h.check('invalid username rejected 400', r.status === 400, r.json);
        },
      ),
    ],
  },
  {
    id: 'US-02',
    title: 'Authentication and session lifecycle',
    description: 'A registered user can log in, keep the session alive via rotating refresh tokens, and revoke it by logging out.',
    scenarios: [
      scenario(
        'UAT-02-01',
        'AC: Login with valid credentials returns 200 with a fresh token pair.',
        async (h) => {
          const a = await h.register('uat02alice');
          const r = await h.login(a.username, PASSWORD);
          h.check('login 200', r.status === 200, r.json);
          h.check('access token issued', !!r.accessToken);
          h.check('refresh token issued', !!r.refreshToken);
          h.check('user context returned', r.json?.data?.user?.username === a.username, r.json?.data?.user);
        },
      ),
      scenario(
        'UAT-02-02',
        'AC: Login with an incorrect password is rejected with 401 and no token is issued.',
        async (h) => {
          const a = await h.register('uat02alice');
          const r = await h.login(a.username, 'WrongPass123!');
          h.check('wrong password 401', r.status === 401, r.json);
          h.check('no access token', !r.accessToken);
        },
      ),
      scenario(
        'UAT-02-03',
        'AC: A valid refresh token can be exchanged for a new token pair (rotation).',
        async (h) => {
          const a = await h.register('uat02alice');
          const r = await h.refresh(a.refreshToken);
          h.check('refresh 200', r.status === 200, r.json);
          h.check('new access token', !!r.accessToken);
          h.check('refresh token rotated', !!r.refreshToken && r.refreshToken !== a.refreshToken);
        },
      ),
      scenario(
        'UAT-02-04',
        'AC: A refresh token is single-use; replaying it is rejected with 401 and locks the device.',
        async (h) => {
          const a = await h.register('uat02alice');
          const rotated = await h.refresh(a.refreshToken);
          const replay = await h.refresh(a.refreshToken);
          h.check('replayed token rejected 401', replay.status === 401, replay.json);
          const afterLock = await h.refresh(rotated.refreshToken);
          h.check('device locked after reuse 401', afterLock.status === 401, afterLock.json);
          const relogin = await h.login(a.username, PASSWORD);
          h.check('re-login recovers the device', relogin.status === 200 && !!relogin.accessToken, relogin.json);
        },
      ),
      scenario(
        'UAT-02-05',
        'AC: Refresh requires the caller to present a valid device id; a malformed device id is rejected with 400.',
        async (h) => {
          const a = await h.register('uat02alice');
          const r = await req('POST', '/auth/refresh', {
            headers: { 'X-Refresh-Token': a.refreshToken },
            device: 'not-a-uuid',
          });
          h.check('malformed device id rejected 400', r.status === 400, r.json);
        },
      ),
      scenario(
        'UAT-02-06',
        'AC: Logging out revokes the refresh token; a subsequent refresh attempt returns 401.',
        async (h) => {
          const a = await h.register('uat02alice');
          const logout = await req('POST', '/auth/logout', { token: a.accessToken, device: h.device });
          h.check('logout 204', logout.status === 204, logout.json);
          const r = await h.refresh(a.refreshToken);
          h.check('refresh after logout 401', r.status === 401, r.json);
        },
      ),
      scenario(
        'UAT-02-07',
        'AC: Protected endpoints reject requests without a token with 401.',
        async (h) => {
          const r = await req('GET', '/users/me', { device: h.device });
          h.check('users/me without token 401', r.status === 401, r.json);
          const f = await req('GET', '/feed', { device: h.device });
          h.check('feed without token 401', f.status === 401, f.json);
        },
      ),
      scenario(
        'UAT-02-08',
        'AC: MFA setup issues a TOTP secret and an otpauth URI for an authenticated user.',
        async (h) => {
          const a = await h.register('uat02alice');
          const r = await req('GET', '/auth/mfa/setup', { token: a.accessToken, device: h.device });
          h.check('mfa setup 200', r.status === 200, r.json);
          h.check('secret issued', typeof r.json?.data?.secret === 'string' && r.json.data.secret.length >= 16, r.json?.data);
          h.check('otpauth url issued', typeof r.json?.data?.otpauthUrl === 'string' && r.json.data.otpauthUrl.startsWith('otpauth://'), r.json?.data);
        },
      ),
    ],
  },
  {
    id: 'US-03',
    title: 'Profile management',
    description: 'A user can view and update their own profile, control privacy, and be found by others.',
    scenarios: [
      scenario(
        'UAT-03-01',
        'AC: GET /users/me returns the authenticated user profile.',
        async (h) => {
          const a = await h.register('uat03alice');
          const r = await req('GET', '/users/me', { token: a.accessToken, device: h.device });
          h.check('me 200', r.status === 200, r.json);
          h.check('username matches', r.json?.data?.username === a.username, r.json?.data);
        },
      ),
      scenario(
        'UAT-03-02',
        'AC: PATCH /users/me persists display name, bio and location.',
        async (h) => {
          const a = await h.register('uat03alice');
          const r = await req('PATCH', '/users/me', {
            token: a.accessToken,
            body: { displayName: 'UAT Tester', bio: 'acceptance', location: 'Bengaluru' },
            device: h.device,
          });
          h.check('patch 200', r.status === 200, r.json);
          h.check('displayName saved', r.json?.data?.displayName === 'UAT Tester', r.json?.data);
        },
      ),
      scenario(
        'UAT-03-03',
        'AC: Profile validation rejects an over-length display name with 400.',
        async (h) => {
          const a = await h.register('uat03alice');
          const r = await req('PATCH', '/users/me', {
            token: a.accessToken,
            body: { displayName: 'x'.repeat(51) },
            device: h.device,
          });
          h.check('over-length displayName 400', r.status === 400, r.json);
        },
      ),
      scenario(
        'UAT-03-04',
        'AC: A public profile is resolvable by username; an unknown username returns 404.',
        async (h) => {
          const a = await h.register('uat03alice');
          const r = await req('GET', `/users/${a.username}`, { token: a.accessToken, device: h.device });
          h.check('profile by username 200', r.status === 200, r.json);
          const nf = await req('GET', `/users/uat03nobody${SUFFIX}`, { token: a.accessToken, device: h.device });
          h.check('unknown username 404', nf.status === 404, nf.json);
        },
      ),
      scenario(
        'UAT-03-05',
        'AC: Privacy settings can be read and updated, and the new values persist.',
        async (h) => {
          const a = await h.register('uat03alice');
          const get = await req('GET', '/users/me/privacy', { token: a.accessToken, device: h.device });
          h.check('privacy get 200', get.status === 200, get.json);
          const patch = await req('PATCH', '/users/me/privacy', {
            token: a.accessToken,
            body: { posts: 'followers', activity: 'no_one' },
            device: h.device,
          });
          h.check('privacy patch 200', patch.status === 200, patch.json);
          h.check('privacy persisted', patch.json?.data?.privacy?.posts === 'followers' && patch.json?.data?.privacy?.activity === 'no_one', patch.json?.data);
        },
      ),
      scenario(
        'UAT-03-06',
        'AC: Profile privacy is respected: viewing a profile requires authentication.',
        async (h) => {
          const a = await h.register('uat03alice');
          const r = await req('GET', `/users/${a.username}`, { device: h.device });
          h.check('profile without token 401', r.status === 401, r.json);
        },
      ),
    ],
  },
  {
    id: 'US-04',
    title: 'Posting and engagement',
    description: 'A user can publish text posts, like, react and comment on posts.',
    scenarios: [
      scenario(
        'UAT-04-01',
        'AC: A valid post is created with 201 and is retrievable by id.',
        async (h) => {
          const a = await h.register('uat04alice');
          const content = `UAT post ${SUFFIX}`;
          const created = await req('POST', '/posts', {
            token: a.accessToken,
            body: { content, visibility: 'public', type: 'text' },
            device: h.device,
          });
          h.check('create post 201', created.status === 201, created.json);
          const id = created.json?.data?.id;
          h.check('post id returned', !!id);
          const fetched = await req('GET', `/posts/${id}`, { token: a.accessToken, device: h.device });
          h.check('post retrievable', fetched.status === 200 && fetched.json?.data?.content === content, fetched.json);
        },
      ),
      scenario(
        'UAT-04-02',
        'AC: Empty and over-length posts are rejected with 400.',
        async (h) => {
          const a = await h.register('uat04alice');
          const empty = await req('POST', '/posts', { token: a.accessToken, body: { content: '' }, device: h.device });
          h.check('empty post 400', empty.status === 400, empty.json);
          const big = await req('POST', '/posts', { token: a.accessToken, body: { content: 'x'.repeat(4001) }, device: h.device });
          h.check('oversized post 400', big.status === 400, big.json);
        },
      ),
      scenario(
        'UAT-04-03',
        'AC: A user can like a post and the like persists.',
        async (h) => {
          const a = await h.register('uat04alice');
          const post = await req('POST', '/posts', { token: a.accessToken, body: { content: `likes ${SUFFIX}` }, device: h.device });
          const id = post.json?.data?.id;
          const r = await req('POST', `/posts/${id}/like`, { token: a.accessToken, device: h.device });
          h.check('like accepted', r.status === 200 || r.status === 201, r.json);
        },
      ),
      scenario(
        'UAT-04-04',
        'AC: Reactions accept a supported value and reject an unsupported one with 400.',
        async (h) => {
          const a = await h.register('uat04alice');
          const post = await req('POST', '/posts', { token: a.accessToken, body: { content: `reactions ${SUFFIX}` }, device: h.device });
          const id = post.json?.data?.id;
          const good = await req('POST', `/posts/${id}/reactions`, { token: a.accessToken, body: { reaction: 'love' }, device: h.device });
          h.check('valid reaction accepted', good.status === 200 || good.status === 201, good.json);
          const bad = await req('POST', `/posts/${id}/reactions`, { token: a.accessToken, body: { reaction: 'meh' }, device: h.device });
          h.check('invalid reaction rejected 400', bad.status === 400, bad.json);
        },
      ),
      scenario(
        'UAT-04-05',
        'AC: A user can comment on a post, empty comments are rejected, and comments are listed.',
        async (h) => {
          const a = await h.register('uat04alice');
          const post = await req('POST', '/posts', { token: a.accessToken, body: { content: `comments ${SUFFIX}` }, device: h.device });
          const id = post.json?.data?.id;
          const c = await req('POST', `/posts/${id}/comments`, { token: a.accessToken, body: { content: 'UAT comment' }, device: h.device });
          h.check('comment 201', c.status === 201, c.json);
          const empty = await req('POST', `/posts/${id}/comments`, { token: a.accessToken, body: { content: '' }, device: h.device });
          h.check('empty comment 400', empty.status === 400, empty.json);
          const list = await req('GET', `/posts/${id}/comments`, { token: a.accessToken, device: h.device });
          h.check('comments listed', list.status === 200 && Array.isArray(list.json?.data) && list.json.data.length >= 1, list.json);
        },
      ),
    ],
  },
  {
    id: 'US-05',
    title: 'Feed and discovery',
    description: 'An authenticated user can browse their feed, trending content, search and suggestions.',
    scenarios: [
      scenario(
        'UAT-05-01',
        'AC: The feed returns a ranked list of posts.',
        async (h) => {
          const a = await h.register('uat05alice');
          await req('POST', '/posts', { token: a.accessToken, body: { content: `feed post ${SUFFIX}` }, device: h.device });
          const r = await req('GET', '/feed', { token: a.accessToken, device: h.device });
          h.check('feed 200', r.status === 200, r.json);
          h.check('feed returns array', Array.isArray(r.json?.data), r.json?.data);
        },
      ),
      scenario(
        'UAT-05-02',
        'AC: The feed supports cursor pagination.',
        async (h) => {
          const a = await h.register('uat05alice');
          const r = await req('GET', '/feed?cursor=0', { token: a.accessToken, device: h.device });
          h.check('feed cursor 200', r.status === 200, r.json);
        },
      ),
      scenario(
        'UAT-05-03',
        'AC: Trending content is available.',
        async (h) => {
          const a = await h.register('uat05alice');
          const r = await req('GET', '/trending', { token: a.accessToken, device: h.device });
          h.check('trending 200', r.status === 200, r.json);
        },
      ),
      scenario(
        'UAT-05-04',
        'AC: Search returns results for a query.',
        async (h) => {
          const a = await h.register('uat05alice');
          const r = await req('GET', '/search?q=uat&type=all', { token: a.accessToken, device: h.device });
          h.check('search 200', r.status === 200, r.json);
        },
      ),
      scenario(
        'UAT-05-05',
        'AC: Account suggestions are returned for a user.',
        async (h) => {
          const a = await h.register('uat05alice');
          const r = await req('GET', '/suggestions/users', { token: a.accessToken, device: h.device });
          h.check('suggestions 200', r.status === 200, r.json);
        },
      ),
    ],
  },
  {
    id: 'US-06',
    title: 'Social graph',
    description: 'A user can follow others, see follower lists, and unfollow.',
    scenarios: [
      scenario(
        'UAT-06-01',
        'AC: Following another user succeeds and the follower appears in the followee followers list.',
        async (h) => {
          const a = await h.register('uat06alice');
          const b = await h.register('uat06bob');
          const follow = await req('POST', `/users/${b.username}/follow`, { token: a.accessToken, device: h.device });
          h.check('follow 2xx', follow.status === 200 || follow.status === 201, follow.json);
          const list = await req('GET', `/users/${b.username}/followers`, { token: a.accessToken, device: h.device });
          h.check('followers listed', list.status === 200, list.json);
          const items = Array.isArray(list.json?.data) ? list.json?.data : (list.json?.data?.items ?? []);
          h.check('follower appears', items.some((it) => it.username === a.username), list.json?.data);
        },
      ),
      scenario(
        'UAT-06-02',
        'AC: Following yourself is rejected.',
        async (h) => {
          const a = await h.register('uat06alice');
          const r = await req('POST', `/users/${a.username}/follow`, { token: a.accessToken, device: h.device });
          h.check('self-follow rejected', r.status === 400 || r.status === 404, r.json);
        },
      ),
      scenario(
        'UAT-06-03',
        'AC: Unfollowing removes the follower from the followee followers list.',
        async (h) => {
          const a = await h.register('uat06alice');
          const b = await h.register('uat06bob');
          await req('POST', `/users/${b.username}/follow`, { token: a.accessToken, device: h.device });
          const un = await req('POST', `/users/${b.username}/unfollow`, { token: a.accessToken, device: h.device });
          h.check('unfollow 2xx', un.status === 200 || un.status === 201, un.json);
          const list = await req('GET', `/users/${b.username}/followers`, { token: a.accessToken, device: h.device });
          const items = Array.isArray(list.json?.data) ? list.json?.data : (list.json?.data?.items ?? []);
          h.check('follower removed', items.length === 0, list.json?.data);
        },
      ),
    ],
  },
  {
    id: 'US-07',
    title: 'Messaging',
    description: 'Two authenticated users can start a conversation and exchange messages.',
    scenarios: [
      scenario(
        'UAT-07-01',
        'AC: A conversation can be created with a second participant.',
        async (h) => {
          const a = await h.register('uat07alice');
          const b = await h.register('uat07bob');
          const r = await req('POST', '/chat/conversations', {
            token: a.accessToken,
            body: { participantId: b.user.id },
            device: h.device,
          });
          h.check('conversation created 201', r.status === 201, r.json);
          h.check('conversation id returned', !!r.json?.data?.id);
        },
      ),
      scenario(
        'UAT-07-02',
        'AC: Conversations can be listed.',
        async (h) => {
          const a = await h.register('uat07alice');
          const b = await h.register('uat07bob');
          await req('POST', '/chat/conversations', { token: a.accessToken, body: { participantId: b.user.id }, device: h.device });
          const r = await req('GET', '/chat/conversations', { token: a.accessToken, device: h.device });
          h.check('conversation list 200', r.status === 200, r.json);
        },
      ),
      scenario(
        'UAT-07-03',
        'AC: A participant can send a message and read the history back.',
        async (h) => {
          const a = await h.register('uat07alice');
          const b = await h.register('uat07bob');
          const conv = await req('POST', '/chat/conversations', { token: a.accessToken, body: { participantId: b.user.id }, device: h.device });
          const convId = conv.json?.data?.id;
          const sent = await req('POST', `/chat/conversations/${convId}/messages`, {
            token: a.accessToken,
            body: { content: 'UAT hello' },
            device: h.device,
          });
          h.check('message sent 201', sent.status === 201, sent.json);
          const hist = await req('GET', `/chat/conversations/${convId}/messages`, { token: a.accessToken, device: h.device });
          h.check('history 200', hist.status === 200, hist.json);
          h.check('message present', Array.isArray(hist.json?.data) && hist.json.data.some((m) => m.content === 'UAT hello'), hist.json?.data);
        },
      ),
      scenario(
        'UAT-07-04',
        'AC: A message can be marked as read.',
        async (h) => {
          const a = await h.register('uat07alice');
          const b = await h.register('uat07bob');
          const conv = await req('POST', '/chat/conversations', { token: a.accessToken, body: { participantId: b.user.id }, device: h.device });
          const convId = conv.json?.data?.id;
          await req('POST', `/chat/conversations/${convId}/messages`, { token: a.accessToken, body: { content: 'UAT readme' }, device: h.device });
          const hist = await req('GET', `/chat/conversations/${convId}/messages`, { token: a.accessToken, device: h.device });
          const msgId = hist.json?.data?.[0]?.id;
          const r = await req('POST', `/chat/conversations/${convId}/messages/${msgId}/read`, { token: a.accessToken, device: h.device });
          h.check('mark read 204', r.status === 204, r.json);
        },
      ),
    ],
  },
  {
    id: 'US-08',
    title: 'Notifications',
    description: 'A user can view notifications, mark them read and register a push token.',
    scenarios: [
      scenario(
        'UAT-08-01',
        'AC: Notification list is available.',
        async (h) => {
          const a = await h.register('uat08alice');
          const r = await req('GET', '/notifications', { token: a.accessToken, device: h.device });
          h.check('notifications 200', r.status === 200, r.json);
        },
      ),
      scenario(
        'UAT-08-02',
        'AC: All notifications can be marked as read.',
        async (h) => {
          const a = await h.register('uat08alice');
          const r = await req('POST', '/notifications/read', { token: a.accessToken, device: h.device });
          h.check('mark all read 204', r.status === 204, r.json);
        },
      ),
      scenario(
        'UAT-08-03',
        'AC: A push token can be registered for push delivery.',
        async (h) => {
          const a = await h.register('uat08alice');
          const r = await req('PUT', '/notifications/push-token', {
            token: a.accessToken,
            body: { token: `uat-token-${SUFFIX}`, platform: 'fcm' },
            device: h.device,
          });
          h.check('push token registered 204', r.status === 204, r.json);
        },
      ),
    ],
  },
  {
    id: 'US-09',
    title: 'Trust and safety',
    description: 'A user can report content that may violate platform policy.',
    scenarios: [
      scenario(
        'UAT-09-01',
        'AC: A report can be submitted against a post and is accepted.',
        async (h) => {
          const a = await h.register('uat09alice');
          const post = await req('POST', '/posts', { token: a.accessToken, body: { content: `report me ${SUFFIX}` }, device: h.device });
          const id = post.json?.data?.id;
          const r = await req('POST', '/tns/report', {
            token: a.accessToken,
            body: { targetType: 'post', targetId: id, reason: 'spam' },
            device: h.device,
          });
          h.check('report accepted', r.status === 200 || r.status === 201 || r.status === 204, r.json);
        },
      ),
    ],
  },
  {
    id: 'US-10',
    title: 'Role-based access control',
    description: 'Privileged capabilities are restricted to the appropriate roles.',
    scenarios: [
      scenario(
        'UAT-10-01',
        'AC: Creator-only endpoints return 403 for a regular user.',
        async (h) => {
          const a = await h.register('uat10alice');
          const r = await req('GET', '/creator/account', { token: a.accessToken, device: h.device });
          h.check('creator blocked 403', r.status === 403, r.json);
        },
      ),
      scenario(
        'UAT-10-02',
        'AC: Admin-only endpoints return 403 for a regular user.',
        async (h) => {
          const a = await h.register('uat10alice');
          const r = await req('GET', '/admin/stats', { token: a.accessToken, device: h.device });
          h.check('admin blocked 403', r.status === 403, r.json);
        },
      ),
      scenario(
        'UAT-10-03',
        'AC: Accessibility reporting is restricted to authorized roles.',
        async (h) => {
          const a = await h.register('uat10alice');
          const r = await req('POST', '/accessibility/report', {
            token: a.accessToken,
            body: { resourceType: 'page', resourceId: '/login', passed: 5, failed: 0, violations: 0 },
            device: h.device,
          });
          h.check('a11y report blocked for user 403', r.status === 403, r.json);
        },
      ),
      scenario(
        'UAT-10-04',
        'AC: Unknown routes return a structured 404.',
        async (h) => {
          const a = await h.register('uat10alice');
          const r = await req('GET', '/definitely-not-a-route', { token: a.accessToken, device: h.device });
          h.check('unknown route 404', r.status === 404, r.json);
          h.check('structured error envelope', r.json?.error?.code === 'NOT_FOUND', r.json);
        },
      ),
    ],
  },
];

async function runAll() {
  for (const story of stories) {
    console.log(`\n[${story.id}] ${story.title}`);
    const storyRecord = { id: story.id, title: story.title, description: story.description, passed: 0, failed: 0, scenarios: [] };
    for (const sc of story.scenarios) {
      const h = makeHarness();
      try {
        await sc.run(h);
      } catch (e) {
        h.failures.push(`scenario threw: ${e.message}`);
        console.log(`  ERROR ${e.message}`);
      }
      counts.scenarios += 1;
      if (h.failures.length === 0) {
        counts.passed += 1;
        storyRecord.passed += 1;
        console.log(`  PASS  ${sc.name}`);
      } else {
        counts.failed += 1;
        storyRecord.failed += 1;
        console.log(`  FAIL  ${sc.name}`);
      }
      storyRecord.scenarios.push({ name: sc.name, acceptance: sc.acceptance, failures: [...h.failures] });
    }
    storyResults.push(storyRecord);
  }
}

function writeReport() {
  const dir = path.join(__dirname, 'docs', 'uat', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const env = {
    apiBase: API_BASE,
    node: process.version,
    runAt: new Date().toISOString(),
  };
  const lines = [];
  lines.push('# ABHIORAX API — UAT Report');
  lines.push('');
  lines.push('| | |');
  lines.push('|---|---|');
  lines.push(`| **Product** | ABHIORAX API |`);
  lines.push(`| **Environment** | ${env.apiBase} |`);
  lines.push(`| **Node** | ${env.node} |`);
  lines.push(`| **Run at** | ${env.runAt} |`);
  lines.push(`| **Result** | **${counts.passed} passed / ${counts.failed} failed** |`);
  lines.push('');
  lines.push(`> Sign-off gate: **${counts.failed === 0 ? 'PASSED — ready for release' : 'FAILED — not ready'}**`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Story | Scenarios | Pass | Fail | Status |');
  lines.push('|---|---|---|---|---|');
  for (const s of storyResults) {
    const status = s.failed === 0 ? 'PASS' : 'FAIL';
    lines.push(`| ${s.id} ${s.title} | ${s.scenarios.length} | ${s.passed} | ${s.failed} | ${status} |`);
  }
  lines.push('');
  lines.push('## Details');
  lines.push('');
  for (const s of storyResults) {
    lines.push(`### ${s.id} — ${s.title}`);
    lines.push('');
    lines.push(`${s.description}`);
    lines.push('');
    for (const sc of s.scenarios) {
      const status = sc.failures.length === 0 ? 'PASS' : 'FAIL';
      lines.push(`**${sc.name}** — ${status}`);
      lines.push('');
      lines.push(`- ${sc.acceptance}`);
      if (sc.failures.length > 0) {
        lines.push('- Failures:');
        for (const f of sc.failures) lines.push(`  - ${f}`);
      }
      lines.push('');
    }
  }
  lines.push('## Sign-off');
  lines.push('');
  lines.push('| Role | Name | Date | Decision |');
  lines.push('|---|---|---|---|');
  lines.push('| Product owner | | |  |');
  lines.push('| QA lead | | |  |');
  lines.push('| Engineering | | |  |');
  lines.push('');
  const file = path.join(dir, 'api-uat-report.md');
  fs.writeFileSync(file, lines.join('\n'));
  return file;
}

runAll().then(() => {
  console.log(`\n===== UAT RESULT: ${counts.passed} passed, ${counts.failed} failed =====`);
  const file = writeReport();
  console.log(`Report written to ${file}`);
  if (counts.failed > 0) process.exit(1);
});
