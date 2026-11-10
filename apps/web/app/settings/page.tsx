'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { PrivacyPrefs, Profile } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { useAccessibility } from '@/components/a11y/AccessibilityProvider';

const DEFAULT_PRIVACY: PrivacyPrefs = {
  profile: 'public',
  posts: 'public',
  activity: 'followers',
  searchable: true,
  tags_enabled: true,
  messages: 'everyone',
};

export default function SettingsPage() {
  const { user, status, refreshUser } = useAuth();
  const { highContrast, largeText, dyslexiaFriendly, toggleHighContrast, toggleLargeText, toggleDyslexiaFriendly } =
    useAccessibility();
  const router = useRouter();

  const [form, setForm] = useState({ displayName: '', bio: '', website: '', location: '', avatarUrl: '' });
  const [privacy, setPrivacy] = useState<PrivacyPrefs>(DEFAULT_PRIVACY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [blockedUsers, setBlockedUsers] = useState<Profile[]>([]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated' && user) {
      void api.users
        .me<Profile>()
        .then((me) =>
          setForm({
            displayName: me.displayName ?? '',
            bio: me.bio ?? '',
            website: me.website ?? '',
            location: me.location ?? '',
            avatarUrl: me.avatarUrl ?? '',
          }),
        )
        .catch(() => undefined);

      void api.users
        .privacy<{ privacy?: PrivacyPrefs }>()
        .then((res) => {
          if (res.privacy) setPrivacy(res.privacy);
        })
        .catch(() => undefined);

      void api.users
        .blocks<Profile[]>()
        .then(setBlockedUsers)
        .catch(() => undefined);
    }
  }, [status, user]);

  const onAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setError(null);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read image.'));
        reader.readAsDataURL(file);
      });
      const uploaded = await api.media.upload({ filename: file.name, mimeType: file.type, dataBase64 });
      setForm((f) => ({ ...f, avatarUrl: uploaded.url }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Avatar upload failed.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      await api.users.update({
        displayName: form.displayName.trim(),
        bio: form.bio.trim(),
        website: form.website.trim() || undefined,
        location: form.location.trim() || undefined,
        avatarUrl: form.avatarUrl.trim() || undefined,
      });
      await refreshUser();
      setSaved('Profile saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const savePrivacy = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(null);
    try {
      await api.users.updatePrivacy(privacy);
      setSaved('Privacy preferences saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update privacy preferences.');
    }
  };

  const startMfa = async () => {
    setError(null);
    try {
      const setup = await api.auth.mfaSetup();
      setMfaSetup(setup);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not initialize MFA.');
    }
  };

  const verifyMfa = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.auth.mfaVerify(mfaCode.trim());
      setSaved('Two-factor authentication verified.');
      setMfaSetup(null);
      setMfaCode('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid verification code.');
    }
  };

  const unblockUser = async (username: string) => {
    try {
      await api.users.unblock(username);
      setBlockedUsers((prev) => prev.filter((u) => u.username !== username));
      setSaved(`Unblocked @${username}.`);
    } catch {
      setError(`Could not unblock @${username}.`);
    }
  };

  if (status === 'loading') {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold">Settings</h1>
        <p aria-live="polite">Loading settings…</p>
      </main>
    );
  }
  if (status === 'unauthenticated') {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold">Settings</h1>
        <p aria-live="polite">Redirecting to log in…</p>
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      {error && (
        <p role="alert" className="mb-4 rounded-md border border-danger bg-danger/10 px-4 py-2 text-danger">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="mb-4 rounded-md border border-primary bg-primary/10 px-4 py-2 text-onSurface">
          {saved}
        </p>
      )}

      <form onSubmit={save} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">Profile</h2>

        <div className="flex flex-wrap items-center gap-4">
          {form.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.avatarUrl} alt="Your avatar" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/20 text-xl font-bold text-primary">
              {(form.displayName || user?.username || '?').slice(0, 1).toUpperCase()}
            </span>
          )}
          <label htmlFor="set-avatar" className="min-h-11 cursor-pointer rounded-md border border-border bg-bg px-4 py-2 text-sm font-medium hover:bg-surfaceAlt">
            {uploadingAvatar ? 'Uploading…' : 'Upload avatar'}
          </label>
          <input id="set-avatar" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onAvatarChange} className="sr-only" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="set-displayName">Display name</label>
          <input
            id="set-displayName"
            value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            maxLength={50}
            className="min-h-11 rounded-md border border-border bg-bg px-4 py-2"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="set-bio">Bio</label>
          <textarea
            id="set-bio"
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            maxLength={500}
            rows={3}
            className="min-h-20 resize-y rounded-md border border-border bg-bg px-4 py-2"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="set-website">Website</label>
          <input
            id="set-website"
            type="url"
            value={form.website}
            onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            placeholder="https://…"
            className="min-h-11 rounded-md border border-border bg-bg px-4 py-2"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="set-location">Location</label>
          <input
            id="set-location"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            maxLength={100}
            className="min-h-11 rounded-md border border-border bg-bg px-4 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={saving || uploadingAvatar}
          className="min-h-11 self-end rounded-md bg-primary px-6 font-semibold text-onPrimary hover:bg-primaryHover disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>

      <form onSubmit={savePrivacy} className="mt-8 flex flex-col gap-4 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">Privacy</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="priv-posts">Who can see your posts</label>
            <select
              id="priv-posts"
              value={privacy.posts}
              onChange={(e) => setPrivacy((p) => ({ ...p, posts: e.target.value as PrivacyPrefs['posts'] }))}
              className="min-h-11 rounded-md border border-border bg-bg px-3 py-2"
            >
              <option value="public">Everyone (Public)</option>
              <option value="followers">Followers only</option>
              <option value="only_me">Only me</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="priv-messages">Who can message you</label>
            <select
              id="priv-messages"
              value={privacy.messages}
              onChange={(e) => setPrivacy((p) => ({ ...p, messages: e.target.value as PrivacyPrefs['messages'] }))}
              className="min-h-11 rounded-md border border-border bg-bg px-3 py-2"
            >
              <option value="everyone">Everyone</option>
              <option value="followers">Followers only</option>
              <option value="no_one">No one</option>
            </select>
          </div>
        </div>
        <button
          type="submit"
          className="min-h-11 self-end rounded-md border border-border bg-bg px-5 font-semibold hover:bg-surfaceAlt"
        >
          Save privacy
        </button>
      </form>

      <section aria-labelledby="security-heading" className="mt-8 rounded-xl border border-border bg-surface p-6">
        <h2 id="security-heading" className="text-lg font-semibold">
          Security (2FA / MFA)
        </h2>
        <p className="mt-1 text-onSurfaceDim">Protect your account with a TOTP authenticator app.</p>
        {!mfaSetup ? (
          <button
            type="button"
            onClick={startMfa}
            className="mt-4 min-h-11 rounded-md border border-border bg-bg px-5 font-semibold hover:bg-surfaceAlt"
          >
            Enable two-factor auth
          </button>
        ) : (
          <form onSubmit={verifyMfa} className="mt-4 flex flex-col gap-3">
            <p className="text-sm">
              Secret key: <code className="rounded bg-bg px-2 py-1">{mfaSetup.secret}</code>
            </p>
            <label htmlFor="mfa-code" className="text-sm font-medium">
              Enter 6-digit code
            </label>
            <div className="flex gap-2">
              <input
                id="mfa-code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="123456"
                className="min-h-11 flex-1 rounded-md border border-border bg-bg px-4 py-2"
              />
              <button
                type="submit"
                className="min-h-11 rounded-md bg-primary px-5 font-semibold text-onPrimary hover:bg-primaryHover"
              >
                Verify
              </button>
            </div>
          </form>
        )}
      </section>

      <section aria-labelledby="blocks-heading" className="mt-8 rounded-xl border border-border bg-surface p-6">
        <h2 id="blocks-heading" className="text-lg font-semibold">
          Blocked accounts
        </h2>
        {blockedUsers.length === 0 ? (
          <p className="mt-2 text-sm text-onSurfaceDim">You have not blocked any accounts.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {blockedUsers.map((b) => (
              <li key={b.id} className="flex items-center justify-between rounded-md border border-border bg-bg px-4 py-2">
                <span>@{b.username}</span>
                <button
                  type="button"
                  onClick={() => unblockUser(b.username)}
                  className="min-h-11 rounded-md border border-border px-3 text-sm hover:bg-surfaceAlt"
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="a11y-heading"
        className="mt-8 rounded-xl border border-border bg-surface p-6"
      >
        <h2 id="a11y-heading" className="text-lg font-semibold">
          Accessibility (WCAG AAA)
        </h2>
        <p className="mt-1 text-onSurfaceDim">
          Your preferences are stored on this device and applied instantly.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
            <span>
              <span className="font-medium">High contrast mode</span>
              <span className="block text-sm text-onSurfaceDim">Stronger color contrast for all surfaces.</span>
            </span>
            <input
              type="checkbox"
              checked={highContrast}
              onChange={() => toggleHighContrast()}
              className="h-6 w-6"
            />
          </label>

          <label className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
            <span>
              <span className="font-medium">Larger text</span>
              <span className="block text-sm text-onSurfaceDim">Increase the base font size to 20px.</span>
            </span>
            <input
              type="checkbox"
              checked={largeText}
              onChange={() => toggleLargeText()}
              className="h-6 w-6"
            />
          </label>

          <label className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
            <span>
              <span className="font-medium">Dyslexia-friendly reading mode</span>
              <span className="block text-sm text-onSurfaceDim">Wider letter, word, and line spacing for easier reading.</span>
            </span>
            <input
              type="checkbox"
              checked={dyslexiaFriendly}
              onChange={() => toggleDyslexiaFriendly()}
              className="h-6 w-6"
            />
          </label>
        </div>
      </section>
    </main>
  );
}
