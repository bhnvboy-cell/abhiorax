const BASE = 'http://localhost:8080/v1';
const PASSWORD = 'QcPassword123!';
const DEVICE = crypto.randomUUID();
let passed = 0, failed = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; failures.push(name + (extra ? ` :: ${JSON.stringify(extra)}` : '')); console.log(`FAIL  ${name} :: ${JSON.stringify(extra)}`); }
}

async function req(method, path, { token, body, headers = {}, device = DEVICE } = {}) {
  const h = { Accept: 'application/json', 'X-Device-Id': device, ...headers };
  if (body) h['Content-Type'] = 'application/json';
  if (token) h['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

(async () => {
  const uname = 'qcuser' + Date.now().toString().slice(-6);
  const email = `${uname}@example.com`;

  // ---- REGISTER + LOGIN + REFRESH (device binding) ----
  let r = await req('POST', '/auth/register', { body: { username: uname, email, password: PASSWORD, locale: 'en' } });
  ok('register 201', r.status === 201, r.json);
  ok('no passwordHash leak', !JSON.stringify(r.json?.data?.user ?? {}).includes('passwordHash'));
  let token = r.json?.data?.accessToken;
  let refreshToken = r.json?.data?.refreshToken;

  r = await req('POST', '/auth/refresh', { headers: { 'X-Refresh-Token': refreshToken } });
  ok('refresh with bound device -> 200', r.status === 200, r.json);
  ok('refresh rotates token', !!r.json?.data?.accessToken);

  r = await req('POST', '/auth/refresh', { headers: { 'X-Refresh-Token': refreshToken }, device: 'not-a-uuid' });
  ok('refresh bad device id -> 400', r.status === 400, r.json);

  r = await req('POST', '/auth/login', { body: { identifier: email, password: PASSWORD } });
  ok('login 200', r.status === 200, r.json);
  token = r.json?.data?.accessToken;
  refreshToken = r.json?.data?.refreshToken;
  r = await req('POST', '/auth/refresh', { headers: { 'X-Refresh-Token': refreshToken } });
  ok('refresh after re-login (same device) -> 200', r.status === 200, r.json);
  token = r.json?.data?.accessToken ?? token;

  r = await req('POST', '/auth/login', { body: { identifier: email, password: 'WrongPassword1' } });
  ok('wrong password -> 401', r.status === 401, r.json);

  // ---- VALIDATION ----
  r = await req('POST', '/auth/register', { body: { username: uname + 'b', email, password: 'short' } });
  ok('weak password -> 400', r.status === 400, r.json);
  r = await req('POST', '/auth/register', { body: { username: 'bad name!', email: 'x@y.com', password: PASSWORD } });
  ok('invalid username -> 400', r.status === 400, r.json);

  // ---- UNAUTHENTICATED ----
  r = await req('GET', '/users/me');
  ok('users/me no token -> 401', r.status === 401, r.json);
  r = await req('GET', '/feed');
  ok('feed no token -> 401', r.status === 401, r.json);

  // ---- USERS ----
  r = await req('GET', '/users/me', { token });
  ok('users/me 200', r.status === 200, r.json);
  ok('me username', r.json?.data?.username === uname, r.json?.data);
  r = await req('PATCH', '/users/me', { token, body: { displayName: 'QC Tester', bio: 'testing', location: 'Chennai' } });
  ok('users/me PATCH 200', r.status === 200, r.json);
  ok('displayName updated', r.json?.data?.displayName === 'QC Tester', r.json?.data);
  r = await req('PATCH', '/users/me', { token, body: { displayName: 'x'.repeat(51) } });
  ok('PATCH invalid displayName -> 400', r.status === 400, r.json);
  r = await req('GET', `/users/${uname}`, { token });
  ok('users/{username} 200', r.status === 200, r.json);
  r = await req('GET', '/users/nonexistentuserzz', { token });
  ok('users/{username} unknown -> 404', r.status === 404, r.json);
  r = await req('POST', `/users/${uname}/follow`, { token });
  ok('follow self -> 4xx', r.status === 400 || r.status === 404, r.json);
  r = await req('GET', '/users/me/privacy', { token });
  ok('privacy GET 200', r.status === 200, r.json);
  r = await req('PATCH', '/users/me/privacy', { token, body: { posts: 'followers', activity: 'no_one' } });
  ok('privacy PATCH 200', r.status === 200, r.json);

  // ---- POSTS ----
  const content = 'QC test post ' + Date.now();
  r = await req('POST', '/posts', { token, body: { content, visibility: 'public', type: 'text' } });
  ok('create post 201', r.status === 201, r.json);
  const postId = r.json?.data?.id;
  ok('post id present', !!postId);
  r = await req('GET', `/posts/${postId}`, { token });
  ok('get post 200', r.status === 200 && r.json?.data?.content === content, r.json);
  r = await req('POST', '/posts', { token, body: { content: '' } });
  ok('create empty post -> 400', r.status === 400, r.json);
  r = await req('POST', '/posts', { token, body: { content: 'x'.repeat(4001) } });
  ok('create >4000 chars -> 400', r.status === 400, r.json);

  r = await req('POST', `/posts/${postId}/like`, { token });
  ok('like post', r.status === 200 || r.status === 201, r.json);
  r = await req('POST', `/posts/${postId}/reactions`, { token, body: { reaction: 'love' } });
  ok('react post', r.status === 200 || r.status === 201, r.json);
  r = await req('POST', `/posts/${postId}/reactions`, { token, body: { reaction: 'bad' } });
  ok('react invalid -> 400', r.status === 400, r.json);
  r = await req('POST', `/posts/${postId}/comments`, { token, body: { content: 'QC comment' } });
  ok('comment 201', r.status === 201, r.json);
  r = await req('POST', `/posts/${postId}/comments`, { token, body: { content: '' } });
  ok('empty comment -> 400', r.status === 400, r.json);
  r = await req('GET', `/posts/${postId}/comments`, { token });
  ok('get comments 200', r.status === 200 && Array.isArray(r.json?.data) && r.json?.data.length >= 1, r.json);

  // ---- FEED / TRENDING / SEARCH / SUGGESTIONS ----
  r = await req('GET', '/feed', { token });
  ok('feed 200', r.status === 200, r.json);
  r = await req('GET', '/feed?cursor=0', { token });
  ok('feed cursor 200', r.status === 200, r.json);
  r = await req('GET', '/trending', { token });
  ok('trending 200', r.status === 200, r.json);
  r = await req('GET', '/search?q=qc&type=all', { token });
  ok('search 200', r.status === 200, r.json);
  r = await req('GET', '/suggestions/users', { token });
  ok('suggestions 200', r.status === 200, r.json);
  r = await req('GET', '/experiments/feed_v2', { token });
  ok('experiments 200', r.status === 200, r.json);

  // ---- CHAT (needs a second participant) ----
  const uname2 = 'qcuser' + Date.now().toString().slice(-6);
  r = await req('POST', '/auth/register', { body: { username: uname2, email: `${uname2}@example.com`, password: PASSWORD } });
  ok('register user2', r.status === 201, r.json);
  const uid2 = r.json?.data?.user?.id;
  r = await req('POST', '/chat/conversations', { token, body: { participantId: uid2 } });
  ok('chat create conversation 201', r.status === 201, r.json);
  const convId = r.json?.data?.id;
  if (convId) {
    r = await req('GET', '/chat/conversations', { token });
    ok('chat list 200', r.status === 200, r.json);
    r = await req('POST', `/chat/conversations/${convId}/messages`, { token, body: { content: 'hello there' } });
    ok('chat send message 201', r.status === 201, r.json);
    r = await req('GET', `/chat/conversations/${convId}/messages`, { token });
    ok('chat messages 200', r.status === 200, r.json);
    const msgId = r.json?.data?.items?.[0]?.id;
    if (msgId) {
      r = await req('POST', `/chat/conversations/${convId}/messages/${msgId}/read`, { token });
      ok('chat mark read 204', r.status === 204, r.json);
    }
  }

  r = await req('POST', `/users/${uname2}/follow`, { token });
  ok('follow other user 2xx', r.status === 200 || r.status === 201, r.json);
  r = await req('GET', `/users/${uname2}/followers`, { token });
  ok('list followers 200', r.status === 200, r.json);
  const followerList = Array.isArray(r.json?.data) ? r.json?.data : (r.json?.data?.items || []);
  ok('follower appears', followerList.some((it) => it.username === uname), r.json?.data);
  r = await req('POST', `/users/${uname2}/unfollow`, { token });
  ok('unfollow other user 2xx', r.status === 200 || r.status === 201, r.json);
  r = await req('GET', `/users/${uname2}/followers`, { token });
  const followerList2 = Array.isArray(r.json?.data) ? r.json?.data : (r.json?.data?.items || []);
  ok('follower removed after unfollow', followerList2.length === 0, r.json?.data);

  // ---- NOTIFICATIONS ----
  r = await req('GET', '/notifications', { token });
  ok('notifications 200', r.status === 200, r.json);
  r = await req('POST', '/notifications/read', { token });
  ok('notifications read 204', r.status === 204, r.json);
  r = await req('PUT', '/notifications/push-token', { token, body: { token: 'qc-device-token', platform: 'fcm' } });
  ok('push-token PUT 204', r.status === 204, r.json);

  // ---- CREATOR (regular user -> 403 by design) ----
  r = await req('GET', '/creator/account', { token });
  ok('creator account non-creator -> 403', r.status === 403, r.json);

  // ---- ADMIN (regular user -> 403 by design) ----
  r = await req('GET', '/admin/stats', { token });
  ok('admin stats non-admin -> 403', r.status === 403, r.json);

  // ---- MISC ----
  r = await req('POST', '/accessibility/report', { token, body: { resourceType: 'page', resourceId: '/login', passed: 5, failed: 0, violations: 0 } });
  ok('a11y report non-admin -> 403', r.status === 403, r.json);
  r = await req('POST', '/tns/report', { token, body: { targetType: 'post', targetId: postId, reason: 'spam' } });
  ok('tns report 2xx', r.status === 200 || r.status === 201 || r.status === 204, r.json);
  r = await req('GET', '/does-not-exist', { token });
  ok('unknown route -> 404', r.status === 404, r.json);

  // ---- LOGOUT ----
  r = await req('POST', '/auth/logout', { token });
  ok('logout 204', r.status === 204, r.json);

  console.log(`\n===== RESULT: ${passed} passed, ${failed} failed =====`);
  if (failed) { console.log('FAILURES:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
})().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(2); });
