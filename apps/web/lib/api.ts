const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080/v1';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly details?: unknown[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Session {
  accessToken: string;
  refreshToken: string;
}

/**
 * Access + refresh tokens live in module memory (XSS-safe). The refresh token
 * is also persisted so a page reload can rehydrate the session via
 * POST /auth/refresh (which expects `x-refresh-token` + `x-device-id` headers).
 */
let session: Session | null = null;

const REFRESH_KEY = 'ax-refresh-token';
const DEVICE_KEY = 'ax-device-id';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = window.localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function setSession(s: Session | null): void {
  session = s;
  if (typeof window !== 'undefined') {
    if (s) window.localStorage.setItem(REFRESH_KEY, s.refreshToken);
    else window.localStorage.removeItem(REFRESH_KEY);
  }
}

export function getAccessToken(): string | null {
  return session?.accessToken ?? null;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

interface RequestOptions extends RequestInit {
  /** Skip the automatic 401 → refresh → retry cycle. */
  skipAuthRetry?: boolean;
}

async function raw<T>(path: string, init: RequestOptions = {}): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-Device-Id', getDeviceId());

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
  } catch {
    throw new ApiError(
      'NETWORK_ERROR',
      `Cannot reach the ABHIORAX API server (${API_BASE}). Make sure the backend is running.`,
    );
  }

  if (res.status === 429) {
    throw new ApiError('RATE_LIMITED', 'You are moving too fast. Please wait a moment.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const err = body?.error;
    throw new ApiError(err?.code ?? 'HTTP_ERROR', err?.message ?? `Request failed (${res.status})`, err?.requestId, err?.details);
  }
  if (res.status === 204) return { data: undefined as T };

  const json = (await res.json()) as ApiEnvelope<T>;
  return { data: json.data, meta: json.meta };
}

/**
 * 401 → attempt one token refresh (rotating refresh token), then retry the
 * original request exactly once. Falls through to the original error otherwise.
 * Concurrent refreshes collapse into a single request (single-flight), so the
 * rotation race between StrictMode-duplicated effects can never surface.
 */
async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  try {
    const { data } = await raw<T>(path, init);
    return data;
  } catch (err) {
    if (!init.skipAuthRetry && err instanceof ApiError && err.code === 'UNAUTHORIZED' && session?.refreshToken) {
      try {
        await refreshSession();
        const retry = await raw<T>(path, { ...init, skipAuthRetry: true });
        return retry.data;
      } catch {
        setSession(null);
        throw err;
      }
    }
    throw err;
  }
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  user?: unknown;
}

let refreshInFlight: Promise<RefreshResult> | null = null;

/**
 * Rotate the persisted refresh token. Exactly one POST /auth/refresh is in
 * flight at a time; concurrent callers (e.g. StrictMode-duplicated hydration)
 * share the same request instead of racing and rotating each other's token.
 */
async function refreshSession(): Promise<RefreshResult> {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem(REFRESH_KEY) : null;
  if (!token) throw new ApiError('UNAUTHORIZED', 'No session to refresh.');
  if (!refreshInFlight) {
    refreshInFlight = raw<RefreshResult>('/auth/refresh', {
      method: 'POST',
      headers: { 'X-Refresh-Token': token, 'X-Device-Id': getDeviceId() },
      skipAuthRetry: true,
    })
      .then((r) => {
        setSession({ accessToken: r.data.accessToken, refreshToken: r.data.refreshToken });
        return r.data;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export { refreshSession };

/** Paginated endpoint — returns data plus the envelope `meta` (nextCursor, …). */
export async function page<T>(path: string): Promise<{ data: T; meta?: Record<string, unknown> }> {
  try {
    return await raw<T>(path);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'UNAUTHORIZED' && session?.refreshToken) {
      try {
        await refreshSession();
        return raw<T>(path);
      } catch {
        setSession(null);
        throw err;
      }
    }
    throw err;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  page: <T>(path: string) => page<T>(path),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined, ...opts }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  auth: {
    register: (body: { username: string; email: string; password: string; locale?: string }) =>
      request<{ accessToken: string; refreshToken: string; user: unknown }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    login: (body: { identifier: string; password: string; deviceName?: string }) =>
      request<{ accessToken: string; refreshToken: string; user: unknown }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    oauth: (body: { provider: 'google' | 'github' | 'apple' | 'magic_link'; email?: string; name?: string }) =>
      request<{ accessToken: string; refreshToken: string; user: unknown }>('/auth/oauth', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    logout: () => request<void>('/auth/logout', { method: 'POST', skipAuthRetry: true }),
    mfaSetup: () => request<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup'),
    mfaVerify: (code: string) => request<void>('/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ code }) }),
  },

  users: {
    me: <T>() => request<T>('/users/me'),
    get: <T>(username: string) => request<T>(`/users/${encodeURIComponent(username)}`),
    posts: <T>(username: string) => request<T>(`/users/${encodeURIComponent(username)}/posts`),
    update: <T>(body: unknown) => request<T>('/users/me', { method: 'PATCH', body: JSON.stringify(body) }),
    privacy: <T>() => request<T>('/users/me/privacy'),
    updatePrivacy: <T>(body: unknown) => request<T>('/users/me/privacy', { method: 'PATCH', body: JSON.stringify(body) }),
    follow: (username: string) => request(`/users/${encodeURIComponent(username)}/follow`, { method: 'POST' }),
    unfollow: (username: string) => request(`/users/${encodeURIComponent(username)}/unfollow`, { method: 'POST' }),
    followers: <T>(username: string) => request<T>(`/users/${encodeURIComponent(username)}/followers`),
    following: <T>(username: string) => request<T>(`/users/${encodeURIComponent(username)}/following`),
    block: (username: string) => request(`/users/${encodeURIComponent(username)}/block`, { method: 'POST' }),
    unblock: (username: string) => request(`/users/${encodeURIComponent(username)}/unblock`, { method: 'POST' }),
    blocks: <T>() => request<T>('/users/me/blocks'),
  },

  stories: {
    list: <T>() => request<T>('/stories'),
    create: <T>(body: { content: string; bgColor?: string }) =>
      request<T>('/stories', { method: 'POST', body: JSON.stringify(body) }),
  },

  posts: {
    create: (body: unknown) => request('/posts', { method: 'POST', body: JSON.stringify(body) }),
    get: <T>(id: string) => request<T>(`/posts/${id}`),
    update: <T>(id: string, body: { content?: string; visibility?: string }) =>
      request<T>(`/posts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    saved: <T>() => request<T>('/posts/saved'),
    delete: (id: string) => request<void>(`/posts/${id}`, { method: 'DELETE' }),
    like: (id: string) => request<{ liked: boolean; likeCount: number }>(`/posts/${id}/like`, { method: 'POST' }),
    react: (id: string, reaction: string) =>
      request<{ reaction: string | null; reactionCounts: Record<string, number> }>(`/posts/${id}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ reaction }),
      }),
    save: (id: string) => request<{ saved: boolean }>(`/posts/${id}/save`, { method: 'POST' }),
    share: (id: string) => request<{ shareCount: number }>(`/posts/${id}/share`, { method: 'POST' }),
    vote: <T>(id: string, optionId: string) =>
      request<T>(`/posts/${id}/vote`, { method: 'POST', body: JSON.stringify({ optionId }) }),
  },

  public: {
    explore: <T>() => request<T>('/public/explore'),
    profile: <T>(username: string) => request<T>(`/public/profiles/${encodeURIComponent(username)}`),
    search: <T>(q: string) => request<T>(`/public/search?q=${encodeURIComponent(q)}`),
  },

  ai: {
    altText: (body: { filename?: string; context?: string }) =>
      request<{ altText: string }>('/ai/alt-text', { method: 'POST', body: JSON.stringify(body) }),
    summarize: (content: string) =>
      request<{ summary: string; readingSeconds: number }>('/ai/summarize', {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),
  },

  onboarding: {
    saveInterests: (interests: string[]) =>
      request<{ interests: string[]; followedCount: number }>('/onboarding/interests', {
        method: 'POST',
        body: JSON.stringify({ interests }),
      }),
  },

  media: {
    upload: (body: { filename: string; mimeType: string; dataBase64: string }) =>
      request<{ key: string; url: string; type: string }>('/media/upload', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  notifications: {
    list: <T>() => page<T>('/notifications'),
    markAllRead: () => request<void>('/notifications/read', { method: 'POST' }),
  },

  groups: {
    list: <T>(category?: string) =>
      request<T>(`/groups${category && category !== 'All' ? `?category=${encodeURIComponent(category)}` : ''}`),
    create: <T>(body: { name: string; description?: string; category?: string }) =>
      request<T>('/groups', { method: 'POST', body: JSON.stringify(body) }),
    join: (id: string) => request<{ isMember: boolean; memberCount: number }>(`/groups/${encodeURIComponent(id)}/join`, { method: 'POST' }),
    leave: (id: string) => request<{ isMember: boolean; memberCount: number }>(`/groups/${encodeURIComponent(id)}/leave`, { method: 'POST' }),
    pin: (id: string, postId: string | null) =>
      request<{ pinnedPostId: string | null }>(`/groups/${encodeURIComponent(id)}/pin`, {
        method: 'POST',
        body: JSON.stringify({ postId }),
      }),
    posts: <T>(id: string) => request<T>(`/groups/${encodeURIComponent(id)}/posts`),
    createPost: <T>(id: string, content: string, poll?: { question: string; options: string[] }) =>
      request<T>(`/groups/${encodeURIComponent(id)}/posts`, {
        method: 'POST',
        body: JSON.stringify({ content, ...(poll ? { poll } : {}) }),
      }),
  },

  tns: {
    report: (body: { targetType: string; targetId: string; reason: string }) =>
      request<{ reported: boolean }>('/tns/report', { method: 'POST', body: JSON.stringify(body) }),
  },

  admin: {
    stats: <T>() => request<T>('/admin/stats'),
    reports: <T>() => request<T>('/admin/reports'),
    reviewReport: (id: string, body: { status: 'actioned' | 'dismissed'; deleteTarget?: boolean }) =>
      request(`/admin/reports/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
    users: <T>() => request<T>('/admin/users'),
    setUserRole: (id: string, role: string) =>
      request(`/admin/users/${encodeURIComponent(id)}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  },

  creator: {
    stats: <T>() => request<T>('/creator/stats'),
    subscribe: (username: string) =>
      request<{ subscribed: boolean }>(`/creator/subscribe/${encodeURIComponent(username)}`, { method: 'POST' }),
    subscribers: <T>() => request<T>('/creator/subscribers'),
    tip: (body: { creatorUsername: string; amountUsd: number; message?: string }) =>
      request('/creator/tip', { method: 'POST', body: JSON.stringify(body) }),
  },

  rooms: {
    list: <T>() => request<T>('/rooms'),
    create: <T>(body: { name: string; topic?: string }) =>
      request<T>('/rooms', { method: 'POST', body: JSON.stringify(body) }),
    updateTopic: <T>(id: string, topic: string) =>
      request<T>(`/rooms/${encodeURIComponent(id)}/topic`, { method: 'PATCH', body: JSON.stringify({ topic }) }),
    messages: <T>(id: string) => page<T>(`/rooms/${encodeURIComponent(id)}/messages`),
    sendMessage: <T>(
      id: string,
      body: { content?: string; type?: string; mediaUrl?: string; mediaType?: string },
    ) => request<T>(`/rooms/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify(body) }),
  },

  search: {
    all: <T>(q: string, type = 'all') =>
      request<T>(`/search?q=${encodeURIComponent(q)}&type=${type}`),
    trending: <T>() => request<T>('/trending'),
    suggestions: <T>() => request<T>('/suggestions/users'),
  },

  accessibility: {
    report: (resourceType: string, resourceId: string, summary: { passed: number; failed: number; violations: number }) =>
      request('/accessibility/report', {
        method: 'POST',
        body: JSON.stringify({ resourceType, resourceId, ...summary }),
      }),
  },
};

export function clearSession(): void {
  setSession(null);
}
