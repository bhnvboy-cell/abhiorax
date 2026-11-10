const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { hashPassword } = require('./auth');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

const DEFAULT_PRIVACY = {
  profile: 'public',
  posts: 'public',
  activity: 'followers',
  searchable: true,
  tags_enabled: true,
  messages: 'everyone',
};

function createInitialStore() {
  const adminId = crypto.randomUUID();
  const now = new Date().toISOString();
  const post1Id = crypto.randomUUID();
  const post2Id = crypto.randomUUID();

  return {
    users: [
      {
        id: adminId,
        username: 'admin',
        email: 'admin@abhiorax.local',
        passwordHash: hashPassword('AbhioraxAdmin123!'),
        role: 'admin',
        locale: 'en',
        displayName: 'ABHIORAX Admin',
        bio: 'Platform administrator account (local dev seed).',
        website: '',
        location: 'Global',
        avatarUrl: null,
        verified: true,
        privacy: { ...DEFAULT_PRIVACY },
        createdAt: now,
      },
    ],
    // deviceKey `${userId}:${deviceId}` -> { locked: boolean, tokens: Array<{ hash, used, revoked, expiresAt }> }
    sessions: {},
    follows: [], // [{ followerId, followeeId, createdAt }]
    blocks: [], // [{ blockerId, blockedId, createdAt }]
    stories: [], // [{ id, authorId, content, mediaUrl, bgColor, createdAt, expiresAt }]
    posts: [
      {
        id: post1Id,
        authorId: adminId,
        type: 'text',
        visibility: 'public',
        content:
          'Welcome to ABHIORAX! Fearless, forward, next-gen social communication built with WCAG AAA accessibility at its core. #abhiorax #accessibility',
        media: [],
        hashtags: ['abhiorax', 'accessibility'],
        likes: [],
        reactions: {}, // { [userId]: reactionType }
        viewCount: 12,
        status: 'published',
        moderationStatus: 'approved',
        publishedAt: now,
        createdAt: now,
      },
      {
        id: post2Id,
        authorId: adminId,
        type: 'text',
        visibility: 'public',
        content:
          'Tip: Open Settings to toggle High Contrast mode or Larger Text at any time. Try posting or starting a conversation in Messages! #wcag #creator',
        media: [],
        hashtags: ['wcag', 'creator'],
        likes: [],
        reactions: {},
        viewCount: 7,
        status: 'published',
        moderationStatus: 'approved',
        publishedAt: now,
        createdAt: now,
      },
    ],
    comments: [], // [{ id, postId, authorId, parentId, content, createdAt }]
    saves: [], // [{ userId, postId, createdAt }]
    subscriptions: [], // [{ subscriberId, creatorId, createdAt }]
    tips: [], // [{ id, fromUserId, toUserId, amountUsd, message, createdAt }]
    channels: [
      {
        id: 'lobby',
        name: 'lobby',
        topic: 'Welcome to ABHIORAX! Introduce yourself or type /help for IRC commands.',
        ownerId: adminId,
        createdAt: now,
      },
      {
        id: 'tech',
        name: 'tech',
        topic: 'Engineering, AI, open source, and building the future.',
        ownerId: adminId,
        createdAt: now,
      },
      {
        id: 'accessibility',
        name: 'accessibility',
        topic: 'WCAG AAA, screen readers, inclusive design & assistive tech.',
        ownerId: adminId,
        createdAt: now,
      },
      {
        id: 'creators',
        name: 'creators',
        topic: 'Creator economy, media craft, and audience ownership.',
        ownerId: adminId,
        createdAt: now,
      },
    ],
    channelMessages: [
      {
        id: crypto.randomUUID(),
        channelId: 'lobby',
        senderId: adminId,
        senderUsername: 'admin',
        senderRole: 'admin',
        type: 'system',
        content: 'Channel #lobby initialized. Type /help for mIRC commands or attach photos/videos.',
        createdAt: now,
      },
    ],
    groups: [
      {
        id: 'abhiorax-builders',
        name: 'ABHIORAX Builders',
        slug: 'abhiorax-builders',
        category: 'Tech',
        description: 'Open community for creators, engineers, and accessibility advocates.',
        ownerId: adminId,
        memberIds: [adminId],
        pinnedPostId: null,
        createdAt: now,
      },
      {
        id: 'inclusive-design',
        name: 'Inclusive Design & A11y',
        slug: 'inclusive-design',
        category: 'Accessibility',
        description: 'Sharing WCAG AAA patterns, screen-reader tips, and inclusive UX.',
        ownerId: adminId,
        memberIds: [adminId],
        pinnedPostId: null,
        createdAt: now,
      },
    ],
    conversations: [
      {
        id: 'example-conversation',
        title: 'General Lobby',
        type: 'group',
        participantIds: [adminId],
        createdAt: now,
      },
    ],
    messages: [
      {
        id: crypto.randomUUID(),
        conversationId: 'example-conversation',
        senderId: adminId,
        type: 'text',
        content: 'Welcome to ABHIORAX realtime messaging!',
        readBy: [],
        createdAt: now,
      },
    ],
    notifications: [],
    pushTokens: {},
    reports: [],
    a11yReports: [],
  };
}

let store = loadStore();
let saveTimer = null;

function loadStore() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
      if (parsed && Array.isArray(parsed.users)) {
        if (!Array.isArray(parsed.saves)) parsed.saves = [];
        if (!Array.isArray(parsed.blocks)) parsed.blocks = [];
        if (!Array.isArray(parsed.stories)) parsed.stories = [];
        if (!Array.isArray(parsed.subscriptions)) parsed.subscriptions = [];
        if (!Array.isArray(parsed.tips)) parsed.tips = [];
        if (!Array.isArray(parsed.channels)) {
          const admin = parsed.users.find((u) => u.role === 'admin') || parsed.users[0];
          const now = new Date().toISOString();
          parsed.channels = [
            { id: 'lobby', name: 'lobby', topic: 'Welcome to ABHIORAX! Type /help for IRC commands.', ownerId: admin?.id || 'system', createdAt: now },
            { id: 'tech', name: 'tech', topic: 'Engineering, AI, and open source.', ownerId: admin?.id || 'system', createdAt: now },
            { id: 'accessibility', name: 'accessibility', topic: 'WCAG AAA & inclusive UX.', ownerId: admin?.id || 'system', createdAt: now },
            { id: 'creators', name: 'creators', topic: 'Creator growth & tips.', ownerId: admin?.id || 'system', createdAt: now },
          ];
        }
        if (!Array.isArray(parsed.channelMessages)) parsed.channelMessages = [];
        if (!Array.isArray(parsed.groups)) {
          const admin = parsed.users.find((u) => u.role === 'admin') || parsed.users[0];
          parsed.groups = [
            {
              id: 'abhiorax-builders',
              name: 'ABHIORAX Builders',
              slug: 'abhiorax-builders',
              description: 'Open community for creators, engineers, and accessibility advocates.',
              ownerId: admin ? admin.id : 'system',
              memberIds: admin ? [admin.id] : [],
              createdAt: new Date().toISOString(),
            },
          ];
        }
        return parsed;
      }
    }
  } catch {
    /* fall through to fresh store */
  }
  const initial = createInitialStore();
  persistNow(initial);
  return initial;
}

function persistNow(data = store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, STORE_PATH);
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      persistNow(store);
    } catch {
      /* ignore transient disk write errors */
    }
  }, 50);
}

function findUserById(id) {
  return store.users.find((u) => u.id === id) || null;
}

function findUserByUsername(username) {
  if (typeof username !== 'string') return null;
  const target = username.toLowerCase();
  return store.users.find((u) => u.username.toLowerCase() === target) || null;
}

function findUserByIdentifier(identifier) {
  if (typeof identifier !== 'string') return null;
  const target = identifier.trim().toLowerCase();
  return (
    store.users.find((u) => u.username.toLowerCase() === target || u.email.toLowerCase() === target) || null
  );
}

function safeUser(user) {
  return {
    id: user.id,
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    bio: user.bio,
    website: user.website,
    location: user.location,
    avatarUrl: user.avatarUrl,
    verified: !!user.verified,
    a11yVerified: !!user.a11yVerified || !!user.verified,
    interests: Array.isArray(user.interests) ? user.interests : [],
    locale: user.locale || 'en',
  };
}

function hydrateProfile(user, viewerId) {
  const followerCount = store.follows.filter((f) => f.followeeId === user.id).length;
  const followingCount = store.follows.filter((f) => f.followerId === user.id).length;
  const subscriberCount = (store.subscriptions || []).filter((s) => s.creatorId === user.id).length;
  const postCount = store.posts.filter((p) => p.authorId === user.id).length;
  const isFollowing = viewerId
    ? store.follows.some((f) => f.followerId === viewerId && f.followeeId === user.id)
    : false;
  const isSubscribed = viewerId
    ? (store.subscriptions || []).some((s) => s.subscriberId === viewerId && s.creatorId === user.id)
    : false;
  const isBlocked = viewerId
    ? store.blocks.some((b) => b.blockerId === viewerId && b.blockedId === user.id)
    : false;
  return {
    ...safeUser(user),
    followerCount,
    followingCount,
    subscriberCount,
    postCount,
    isFollowing,
    isSubscribed,
    isBlocked,
    isSelf: viewerId ? viewerId === user.id : false,
  };
}

function hydratePost(post, viewerId) {
  const author = findUserById(post.authorId);
  const commentCount = store.comments.filter((c) => c.postId === post.id).length;
  const likes = Array.isArray(post.likes) ? post.likes : [];
  const reactions = post.reactions && typeof post.reactions === 'object' ? post.reactions : {};
  const reactionCounts = {};
  for (const val of Object.values(reactions)) {
    reactionCounts[val] = (reactionCounts[val] || 0) + 1;
  }
  const saves = Array.isArray(store.saves) ? store.saves : [];
  const viewerLiked = viewerId ? likes.includes(viewerId) : false;
  const viewerReaction = viewerId ? reactions[viewerId] || null : null;
  const viewerSaved = viewerId ? saves.some((s) => s.userId === viewerId && s.postId === post.id) : false;
  const poll = post.poll
    ? {
        question: post.poll.question,
        options: (post.poll.options || []).map((opt) => ({
          id: opt.id,
          text: opt.text,
          voteCount: Array.isArray(opt.votes) ? opt.votes.length : 0,
          voted: viewerId && Array.isArray(opt.votes) ? opt.votes.includes(viewerId) : false,
        })),
      }
    : undefined;

  return {
    id: post.id,
    authorId: post.authorId,
    author: author ? hydrateProfile(author, viewerId) : undefined,
    type: post.type,
    visibility: post.visibility,
    groupId: post.groupId || undefined,
    content: post.content,
    media: post.media || [],
    poll,
    hashtags: post.hashtags || [],
    likeCount: likes.length,
    commentCount,
    shareCount: post.shareCount || 0,
    viewCount: post.viewCount || 0,
    viewerLiked,
    viewerReaction,
    viewerSaved,
    reactionCounts,
    scheduledAt: post.scheduledAt || undefined,
    status: post.status || 'published',
    moderationStatus: post.moderationStatus || 'approved',
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
  };
}

function addNotification({ userId, actorId, type, resourceId, message }) {
  if (!userId || userId === actorId) return;
  const actor = actorId ? findUserById(actorId) : null;
  store.notifications.unshift({
    id: crypto.randomUUID(),
    userId,
    actorId: actorId || null,
    actorUsername: actor ? actor.username : 'system',
    type,
    resourceId: resourceId || null,
    message,
    read: false,
    createdAt: new Date().toISOString(),
  });
  if (store.notifications.length > 500) {
    store.notifications = store.notifications.slice(0, 500);
  }
}

module.exports = {
  DEFAULT_PRIVACY,
  getStore: () => store,
  scheduleSave,
  findUserById,
  findUserByUsername,
  findUserByIdentifier,
  safeUser,
  hydrateProfile,
  hydratePost,
  addNotification,
};
