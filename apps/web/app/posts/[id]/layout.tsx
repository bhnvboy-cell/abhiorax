import type { Metadata } from 'next';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:8080/v1';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const res = await fetch(`${API_BASE}/posts/${encodeURIComponent(params.id)}`, { cache: 'no-store' });
    if (res.ok) {
      const json = (await res.json()) as { data?: { content?: string; author?: { username?: string; displayName?: string } } };
      const post = json.data;
      const authorName = post?.author?.displayName ?? (post?.author?.username ? `@${post.author.username}` : 'ABHIORAX');
      const snippet = (post?.content ?? 'View post on ABHIORAX').slice(0, 140);
      return {
        title: `${authorName} on ABHIORAX`,
        description: snippet,
        openGraph: { title: `${authorName} on ABHIORAX`, description: snippet, type: 'article' },
        twitter: { card: 'summary', title: `${authorName} on ABHIORAX`, description: snippet },
      };
    }
  } catch {
    /* fallback */
  }
  return { title: 'Post', description: 'View post on ABHIORAX.' };
}

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return children;
}
