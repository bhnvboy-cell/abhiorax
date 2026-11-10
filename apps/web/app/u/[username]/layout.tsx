import type { Metadata } from 'next';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:8080/v1';

export async function generateMetadata({ params }: { params: { username: string } }): Promise<Metadata> {
  const handle = decodeURIComponent(params.username);
  try {
    const res = await fetch(`${API_BASE}/public/profiles/${encodeURIComponent(handle)}`, { cache: 'no-store' });
    if (res.ok) {
      const json = (await res.json()) as { data?: { profile?: { displayName?: string; bio?: string } } };
      const profile = json.data?.profile;
      const title = profile?.displayName ? `${profile.displayName} (@${handle})` : `@${handle}`;
      const description = profile?.bio || `Follow @${handle} on ABHIORAX.`;
      return {
        title,
        description,
        openGraph: { title, description, type: 'profile' },
        twitter: { card: 'summary', title, description },
      };
    }
  } catch {
    /* fallback */
  }
  return { title: `@${handle}`, description: `View @${handle} on ABHIORAX.` };
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
