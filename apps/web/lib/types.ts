export type PostType = 'text' | 'image' | 'video' | 'story' | 'reel' | 'audio';
export type PostVisibility = 'public' | 'followers' | 'only_me' | 'custom';
export type ReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry' | 'care';

export interface MediaItem {
  key: string;
  type: string;
  altText?: string;
  width?: number;
  height?: number;
}

export interface PollOption {
  id: string;
  text: string;
  voteCount: number;
  voted?: boolean;
}

export interface PostPoll {
  question: string;
  options: PollOption[];
}

export interface Author {
  id: string;
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  followerCount?: number;
  followingCount?: number;
  subscriberCount?: number;
  postCount?: number;
  isFollowing?: boolean;
  isSubscribed?: boolean;
  isBlocked?: boolean;
  a11yVerified?: boolean;
  isSelf?: boolean;
}

export interface StoryItem {
  id: string;
  authorId: string;
  author?: Author;
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  bgColor?: string;
  createdAt: string;
  expiresAt: string;
}

export interface Post {
  id: string;
  authorId: string;
  author?: Author;
  type: PostType;
  visibility: PostVisibility;
  groupId?: string;
  content?: string;
  media?: MediaItem[];
  poll?: PostPoll;
  hashtags?: string[];
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  viewerLiked?: boolean;
  viewerReaction?: ReactionType | null;
  viewerSaved?: boolean;
  reactionCounts?: Partial<Record<ReactionType, number>>;
  scheduledAt?: string;
  status: string;
  moderationStatus: string;
  publishedAt: string;
  createdAt: string;
}

export interface FeedItem {
  post: Post;
  rankScore: number;
  reason?: string;
}

export interface PrivacyPrefs {
  profile: 'public' | 'followers' | 'only_me';
  posts: 'public' | 'followers' | 'only_me';
  activity: 'everyone' | 'followers' | 'no_one';
  searchable: boolean;
  tags_enabled: boolean;
  messages: 'everyone' | 'followers' | 'no_one';
}

export interface Profile extends Author {
  email?: string;
  role?: string;
  bannerUrl?: string;
  website?: string;
  location?: string;
  verified?: boolean;
  privacy?: PrivacyPrefs;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderUsername?: string;
  senderDisplayName?: string;
  type: 'text' | 'voice' | 'video' | 'image' | 'file' | 'audio';
  content?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  readBy?: string[];
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  actorId?: string | null;
  actorUsername?: string;
  type: string;
  resourceId?: string | null;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface GroupItem {
  id: string;
  name: string;
  slug: string;
  category?: string;
  description?: string;
  ownerId: string;
  memberCount: number;
  isMember: boolean;
  pinnedPostId?: string | null;
  createdAt: string;
}

export interface RoomUser {
  id: string;
  username: string;
  role: string;
}

export interface ChannelItem {
  id: string;
  name: string;
  topic: string;
  ownerId: string;
  onlineCount?: number;
  messageCount?: number;
  onlineUsers?: RoomUser[];
  createdAt: string;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderUsername: string;
  senderRole?: string;
  type: 'text' | 'action' | 'system' | 'image' | 'video' | 'audio';
  content?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  createdAt: string;
}
