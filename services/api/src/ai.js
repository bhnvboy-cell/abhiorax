/**
 * ABHIORAX Local AI & Trust Engine
 * Provides content moderation scoring, feed ranking with explainable reasons,
 * AI alt-text generation, and post TL;DR summarization.
 */

const BLOCKED_TERMS = ['buy followers now', 'free crypto giveaway', 'click here to claim prize', 'phishing-scam'];

function moderateContent(text) {
  const lower = (text || '').toLowerCase();
  const matched = BLOCKED_TERMS.filter((term) => lower.includes(term));
  const capsRatio = text.length > 15 ? text.replace(/[^A-Z]/g, '').length / text.length : 0;
  const linkCount = (text.match(/https?:\/\//gi) || []).length;

  let risk = matched.length * 0.6 + (capsRatio > 0.7 ? 0.25 : 0) + (linkCount > 3 ? 0.25 : 0);
  risk = Math.min(1, Number(risk.toFixed(2)));

  return {
    riskScore: risk,
    moderationStatus: risk >= 0.6 ? 'flagged' : 'approved',
    reasons: matched,
  };
}

function rankFeedPosts(posts, viewer, follows) {
  const viewerId = viewer?.id;
  const interests = new Set((viewer?.interests || []).map((i) => i.toLowerCase()));
  const followingIds = new Set(follows.filter((f) => f.followerId === viewerId).map((f) => f.followeeId));
  const now = Date.now();

  return posts
    .map((post) => {
      const ageHours = Math.max(0.1, (now - new Date(post.createdAt).getTime()) / 3_600_000);
      const recencyScore = 1 / Math.pow(ageHours + 1, 0.45);
      const engagement = (post.likes?.length || 0) * 1.5 + (post.shareCount || 0) * 2 + (post.viewCount || 0) * 0.05;
      const affinityBonus = post.authorId === viewerId ? 0.35 : followingIds.has(post.authorId) ? 0.5 : 0;
      const interestMatch = (post.hashtags || []).some((t) => interests.has(t.toLowerCase())) ? 0.3 : 0;
      const moderationPenalty = post.moderationStatus === 'flagged' ? -0.8 : 0;
      const rankScore = Number(
        (recencyScore + Math.min(1, engagement * 0.05) + affinityBonus + interestMatch + moderationPenalty).toFixed(3),
      );
      const reason =
        post.authorId === viewerId
          ? 'Your post'
          : followingIds.has(post.authorId)
            ? 'Because you follow this creator'
            : interestMatch > 0
              ? 'Matches your interests'
              : engagement > 2
                ? 'Trending on ABHIORAX'
                : 'Recommended for you';
      return { post, rankScore, reason };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}

function generateAltText(filename, contextText) {
  const cleanName = (filename || 'image')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  const context = (contextText || '').trim().slice(0, 80);
  if (context) {
    return `Visual related to "${context}" (${cleanName || 'uploaded media'}).`;
  }
  return `Uploaded media showing ${cleanName || 'community content'}.`;
}

function summarizePost(text) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return { summary: '', readingSeconds: 0 };
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  const summary = sentences.slice(0, 2).join(' ').slice(0, 180);
  const wordCount = clean.split(' ').length;
  return {
    summary: summary.length < clean.length ? `${summary}…` : summary,
    readingSeconds: Math.max(5, Math.round((wordCount / 200) * 60)),
  };
}

module.exports = { moderateContent, rankFeedPosts, generateAltText, summarizePost };
