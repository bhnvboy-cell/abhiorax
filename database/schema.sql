-- ============================================================================
-- ABHIORAX — Canonical Database Schema
-- PostgreSQL 16 + Citus 12 (distributed tables sharded by user_id)
-- Multi-region: us-east-1 (primary) · eu-west-1 · ap-south-1 (active-active)
-- Conventions:
--   * UUID (v7) primary keys — orderable, no IDOR surface
--   * created_at/updated_at via GENERATED ALWAYS + app writes
--   * soft delete (deleted_at) for compliance/retention
--   * JSONB for flexible metadata + accessibility tracking
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "vector";          -- pgvector (semantic embedding storage)

-- UUIDv7 (time-ordered) generator; Postgres 18+ has built-in uuidv7(), else this shim.
CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid AS $$
DECLARE
  v_time       numeric := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000);
  v_unixts     bigint := FLOOR(v_time)::bigint;
  v_usec       int    := ((v_time - FLOOR(v_time)) * 1000000)::int;
  v_rand       bytea  := gen_random_bytes(10);
BEGIN
  v_rand := set_byte(v_rand, 0, ((v_rand[0]::int & 63) | 128)::int);  -- variant
  RETURN encode(substr(int8send(v_unixts), 3, 6) ||
                substr(int2send((v_usec << 4)::int2 & (65536 - 16))::bytea, 1, 2) ||
                set_byte(substr(v_rand, 1, 2), 0, ((substr(v_rand,1,2)[0]::int & 15) | 112)::int) ||
                substr(v_rand, 3), 'hex')::uuid;
END $$ LANGUAGE plpgsql VOLATILE;

-- ---------------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------------
CREATE TYPE user_role       AS ENUM ('user','creator','moderator','admin','system');
CREATE TYPE account_status  AS ENUM ('active','suspended','banned','deactivated','pending_verification');
CREATE TYPE mfa_method      AS ENUM ('totp','sms','email','backup_code');
CREATE TYPE post_type       AS ENUM ('text','image','video','story','reel','audio');
CREATE TYPE post_visibility AS ENUM ('public','followers','only_me','custom');
CREATE TYPE reaction_type   AS ENUM ('like','love','haha','wow','sad','angry','care');
CREATE TYPE chat_type       AS ENUM ('direct','group');
CREATE TYPE msg_type        AS ENUM ('text','voice','video','image','file','system');
CREATE TYPE msg_status      AS ENUM ('sent','delivered','read');
CREATE TYPE notif_type      AS ENUM ('like','comment','follow','mention','message','system','payout','subscription','report_outcome');
CREATE TYPE report_reason   AS ENUM ('spam','hate_speech','bullying','nudity','violence','scam','impersonation','copyright','self_harm','other');
CREATE TYPE report_status   AS ENUM ('open','under_review','actioned','dismissed','escalated');
CREATE TYPE payout_status   AS ENUM ('draft','processing','paid','failed','cancelled');
CREATE TYPE ads_status      AS ENUM ('draft','review','running','paused','ended','rejected');
CREATE TYPE exp_status      AS ENUM ('draft','running','stopped');

-- ============================================================================
-- USERS & IDENTITY
-- ============================================================================
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  username       citext NOT NULL,                      -- unique case-insensitive
  email          citext,                               -- nullable until verified via OAuth
  email_verified boolean NOT NULL DEFAULT false,
  phone          citext,
  phone_verified boolean NOT NULL DEFAULT false,
  password_hash  text,                                 -- bcrypt (null for OAuth-only)
  role           user_role NOT NULL DEFAULT 'user',
  status         account_status NOT NULL DEFAULT 'active',
  mfa_enabled    boolean NOT NULL DEFAULT false,
  locale         text NOT NULL DEFAULT 'en',
  rtl            boolean NOT NULL DEFAULT false,
  timezone       text NOT NULL DEFAULT 'UTC',
  country_code   char(2),                              -- GDPR/data residency hint
  last_login_at  timestamptz,
  last_login_ip  inet,
  signup_flow    text,                                 -- growth funnel identifier
  a11y_prefs     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- WCAG personalization: contrast, motion, fontscale
  risk_score     double precision NOT NULL DEFAULT 0,  -- bot/spam risk 0..1 (ai-svc)
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  CONSTRAINT users_username_uniq UNIQUE (username) WHERE deleted_at IS NULL,
  CONSTRAINT users_email_uniq   UNIQUE (email)    WHERE email IS NOT NULL AND deleted_at IS NULL
);
CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_created  ON users (created_at DESC);
CREATE INDEX idx_users_risk     ON users (risk_score DESC) WHERE risk_score > 0.5;

CREATE TABLE user_devices (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name text,
  os          text,
  ip          inet,
  user_agent  text,
  refresh_token_hash char(64),                        -- SHA-256, single-use
  expires_at  timestamptz NOT NULL,
  last_seen_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_devices_user ON user_devices (user_id);
CREATE INDEX idx_devices_hash ON user_devices (refresh_token_hash) WHERE refresh_token_hash IS NOT NULL;

CREATE TABLE mfa_challenges (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method      mfa_method NOT NULL,
  code_hash   char(64) NOT NULL,                       -- HMAC of TOTP secret/OTP
  secret      text,                                   -- TOTP secret (encrypted at rest)
  attempts    smallint NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mfa_challenges_user ON mfa_challenges (user_id, created_at DESC);

CREATE TABLE oauth_accounts (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     text NOT NULL,                          -- 'google' | 'github' ...
  provider_uid text NOT NULL,
  access_token_enc text,
  refresh_token_enc text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_uid)
);
CREATE INDEX idx_oauth_user ON oauth_accounts (user_id);

-- ============================================================================
-- PROFILES
-- ============================================================================
CREATE TABLE profiles (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name  text NOT NULL,
  bio           text,
  avatar_url    text,
  banner_url    text,
  verified      boolean NOT NULL DEFAULT false,
  follower_count int NOT NULL DEFAULT 0,
  following_count int NOT NULL DEFAULT 0,
  post_count    int NOT NULL DEFAULT 0,
  website       text,
  location      text,
  birth_date    date,                                  -- COPPA: gated, never public
  gender        text,
  pronouns      text[],
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  privacy       jsonb NOT NULL DEFAULT
    '{"profile": "public", "posts": "public", "activity": "followers", "searchable": true, "tags_enabled": true, "messages": "everyone"}'::jsonb,
  accessibility jsonb NOT NULL DEFAULT
    '{"prefer_reduced_motion": false, "high_contrast": false, "large_text": false, "alt_text_default": "ask", "captions": "auto"}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_verified ON profiles (verified) WHERE verified = true;

-- ============================================================================
-- SOCIAL GRAPH
-- ============================================================================
CREATE TABLE follows (
  follower_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'active',         -- active | muted | hidden
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX idx_follows_followee ON follows (followee_id, created_at DESC);
CREATE INDEX idx_follows_status   ON follows (status);

CREATE TABLE blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE user_groups (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  name         text NOT NULL,
  slug         text NOT NULL,
  description  text,
  owner_id     uuid NOT NULL REFERENCES users(id),
  avatar_url   text,
  type         chat_type NOT NULL DEFAULT 'group',
  member_count int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_groups_slug ON user_groups (slug);

CREATE TABLE group_members (
  group_id   uuid NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member',           -- owner | admin | member
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- ============================================================================
-- POSTS, MEDIA, COMMENTS, LIKES, REACTIONS, SAVES
-- ============================================================================
CREATE TABLE posts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  author_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          post_type NOT NULL DEFAULT 'text',
  visibility    post_visibility NOT NULL DEFAULT 'public',
  content       text,                                  -- sanitized rich text
  content_embedding vector(384),                       -- pgvector (optional w/ OpenSearch primary)
  media_ids     uuid[] NOT NULL DEFAULT '{}',
  hashtags      text[] NOT NULL DEFAULT '{}',
  mentions      uuid[] NOT NULL DEFAULT '{}',
  reply_to_id   uuid REFERENCES posts(id) ON DELETE SET NULL,
  group_id      uuid REFERENCES user_groups(id) ON DELETE SET NULL,
  like_count    int NOT NULL DEFAULT 0,
  comment_count int NOT NULL DEFAULT 0,
  share_count   int NOT NULL DEFAULT 0,
  view_count    int NOT NULL DEFAULT 0,
  watch_time_ms bigint NOT NULL DEFAULT 0,             -- ranking signal
  avg_watch_pct double precision NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'published',     -- draft | published | archived | removed
  moderation_status text NOT NULL DEFAULT 'pending',   -- pending | approved | flagged | removed
  moderation_score double precision NOT NULL DEFAULT 0,
  ai_rank_score double precision,                      -- cached rank for organic
  is_pinned     boolean NOT NULL DEFAULT false,
  expires_at    timestamptz,                           -- stories
  published_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  search_tsv    tsvector                                -- for quick FTS fallback
);
CREATE INDEX idx_posts_author_time  ON posts (author_id, published_at DESC) WHERE status = 'published';
CREATE INDEX idx_posts_feed         ON posts (visibility, moderation_status, published_at DESC) WHERE status = 'published';
CREATE INDEX idx_posts_hashtag      ON posts USING GIN (hashtags);
CREATE INDEX idx_posts_mentions     ON posts USING GIN (mentions);
CREATE INDEX idx_posts_expiry       ON posts (expires_at) WHERE type = 'story' AND expires_at IS NOT NULL;
CREATE INDEX idx_posts_tsv          ON posts USING GIN (search_tsv);
CREATE INDEX idx_posts_embedding    ON posts USING hnsw (content_embedding vector_cosine_ops);

CREATE TABLE post_media (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  post_id       uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  bucket        text NOT NULL,
  object_key    text NOT NULL,
  media_type    text NOT NULL,
  size_bytes    bigint NOT NULL,
  width         int,
  height        int,
  duration_ms   int,                                   -- video/audio/voice
  thumbnail_key text,
  alt_text      text,                                  -- WCAG AAA: required for decorative/meaningful
  captions_key  text,                                  -- SRT for video (a11y)
  blurhash      text,
  transcoded    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_post ON post_media (post_id);

CREATE TABLE comments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  post_id     uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES comments(id) ON DELETE CASCADE,
  content     text NOT NULL,
  mentions    uuid[] NOT NULL DEFAULT '{}',
  moderation_status text NOT NULL DEFAULT 'pending',
  like_count  int NOT NULL DEFAULT 0,
  reply_count int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX idx_comments_post ON comments (post_id, created_at ASC);
CREATE INDEX idx_comments_author ON comments (author_id, created_at DESC);

CREATE TABLE likes (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);
CREATE INDEX idx_likes_post ON likes (post_id, created_at DESC);

CREATE TABLE reactions (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reaction   reaction_type NOT NULL DEFAULT 'like',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id, reaction)
);
CREATE INDEX idx_reactions_post ON reactions (post_id);

CREATE TABLE post_saves (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  collection text NOT NULL DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id, collection)
);

-- ============================================================================
-- MESSAGING / CHAT (direct + groups)
-- ============================================================================
CREATE TABLE conversations (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  type       chat_type NOT NULL DEFAULT 'direct',
  title      text,                                     -- group name
  group_id   uuid REFERENCES user_groups(id) ON DELETE CASCADE,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conv_updated ON conversations (last_message_at DESC);

CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_msg_id uuid,
  muted_until      timestamptz,
  is_archived      boolean NOT NULL DEFAULT false,
  joined_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX idx_cp_user ON conversation_participants (user_id, joined_at DESC);

CREATE TABLE messages (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_msg_id uuid NOT NULL,                         -- idempotency key from client
  type          msg_type NOT NULL DEFAULT 'text',
  content       text,
  media_ids     uuid[] NOT NULL DEFAULT '{}',
  reply_to_id   uuid REFERENCES messages(id) ON DELETE SET NULL,
  status        msg_status NOT NULL DEFAULT 'sent',
  moderation_status text NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  edited_at     timestamptz,
  deleted_at    timestamptz,
  UNIQUE (sender_id, client_msg_id)
);
CREATE INDEX idx_messages_conv ON messages (conversation_id, created_at ASC);
CREATE INDEX idx_messages_sender ON messages (sender_id, created_at DESC);

-- delivery receipts (fanned out via Redis presence; persisted for history)
CREATE TABLE message_receipts (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at timestamptz,
  read_at    timestamptz,
  PRIMARY KEY (message_id, user_id)
);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- recipient
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  type        notif_type NOT NULL,
  title       text NOT NULL,
  body        text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,      -- {postId, convId, ...}
  deep_link   text,
  read_at     timestamptz,
  delivered_push_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user_unread ON notifications (user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_notif_user_time   ON notifications (user_id, created_at DESC);

CREATE TABLE push_tokens (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   text NOT NULL,                            -- apns | fcm
  token      text NOT NULL,
  device_id  text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, token)
);
CREATE INDEX idx_push_user ON push_tokens (user_id);

-- ============================================================================
-- SEARCH (keyword via OpenSearch; snapshot table for admin/sync)
-- ============================================================================
CREATE TABLE search_sync_state (
  entity_type text PRIMARY KEY,                        -- post | user | hashtag
  last_cursor uuid NOT NULL,
  last_indexed_at timestamptz NOT NULL
);

CREATE TABLE hashtags (
  name        citext PRIMARY KEY,
  post_count  int NOT NULL DEFAULT 0,
  follower_count int NOT NULL DEFAULT 0,
  cluster_id  uuid,                                    -- semantic cluster
  embedding   vector(384),
  trending_score double precision NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hashtags_trending ON hashtags (trending_score DESC);
CREATE INDEX idx_hashtags_cluster  ON hashtags (cluster_id);

-- ============================================================================
-- TRUST & SAFETY
-- ============================================================================
CREATE TABLE reports (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  reporter_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type  text NOT NULL,                          -- post | user | comment | message | group
  target_id    uuid NOT NULL,
  reason       report_reason NOT NULL,
  details      text,
  status       report_status NOT NULL DEFAULT 'open',
  assigned_to  uuid REFERENCES users(id) ON DELETE SET NULL,
  action_taken text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);
CREATE INDEX idx_reports_status ON reports (status, created_at ASC) WHERE status = 'open';
CREATE INDEX idx_reports_target  ON reports (target_type, target_id);

CREATE TABLE moderation_decisions (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  report_id    uuid REFERENCES reports(id) ON DELETE SET NULL,
  target_type  text NOT NULL,
  target_id    uuid NOT NULL,
  action       text NOT NULL,                          -- approve | remove | restrict | shadow_ban
  reason       text,
  model_verdict jsonb,                                 -- ai-svc output snapshot
  decision_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_moddec_target ON moderation_decisions (target_type, target_id);

CREATE TABLE abuse_logs (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  target_type text,
  target_id   uuid,
  model       text NOT NULL,                           -- moderation | bot | spam
  model_version text NOT NULL,
  score       double precision NOT NULL,
  verdict     text NOT NULL,
  features    jsonb,                                   -- model explainability snapshot
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_abuse_logs_user ON abuse_logs (user_id, created_at DESC);
CREATE INDEX idx_abuse_logs_model ON abuse_logs (model, created_at DESC) WHERE score > 0.7;

CREATE TABLE audit_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role  user_role,
  action      text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  request_id  text,
  ip          inet,
  user_agent  text,
  before_json jsonb,
  after_json  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_actor ON audit_logs (actor_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_logs (resource_type, resource_id);
CREATE INDEX idx_audit_action ON audit_logs (action, created_at DESC);

-- ============================================================================
-- MONETIZATION
-- ============================================================================
CREATE TABLE creator_accounts (
  user_id        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_account_id text,
  paypal_email   text,
  tax_id_enc     text,                                 -- encrypted PII
  country        char(2) NOT NULL,
  kyc_status     text NOT NULL DEFAULT 'pending',
  payout_currency text NOT NULL DEFAULT 'USD',
  ad_revenue_share double precision NOT NULL DEFAULT 0.50,
  total_earned   numeric(14,2) NOT NULL DEFAULT 0,
  total_withdrawn numeric(14,2) NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payouts (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  creator_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  amount         numeric(14,2) NOT NULL CHECK (amount > 0),
  currency       text NOT NULL,
  status         payout_status NOT NULL DEFAULT 'draft',
  method         text NOT NULL,                        -- stripe | paypal | bank
  reference      text,
  failure_reason text,
  requested_at   timestamptz,
  processed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payouts_amount_positive CHECK (amount > 0)
);
CREATE INDEX idx_payouts_creator ON payouts (creator_id, created_at DESC);

CREATE TABLE subscriptions (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  subscriber_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier          text NOT NULL,
  amount        numeric(10,2) NOT NULL,
  currency      text NOT NULL DEFAULT 'USD',
  status        text NOT NULL DEFAULT 'active',
  starts_at     timestamptz NOT NULL DEFAULT now(),
  renews_at     timestamptz,
  cancelled_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscriber_id, creator_id) WHERE status = 'active'
);

CREATE TABLE ad_campaigns (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  advertiser_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  budget_cents    bigint NOT NULL,
  currency        text NOT NULL DEFAULT 'USD',
  targeting       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- geo, age, interests, hashtags
  schedule        jsonb,
  status          ads_status NOT NULL DEFAULT 'draft',
  creative_ids    uuid[] NOT NULL DEFAULT '{}',
  daily_cap_cents bigint,
  spend_cents     bigint NOT NULL DEFAULT 0,
  impressions     bigint NOT NULL DEFAULT 0,
  clicks          bigint NOT NULL DEFAULT 0,
  conversions     bigint NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ads_status ON ad_campaigns (status, updated_at DESC);

CREATE TABLE ad_creatives (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  campaign_id uuid NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  media_key   text NOT NULL,
  headline    text,
  body        text,
  cta         text,
  landing_url text NOT NULL,
  alt_text    text,                                    -- WCAG AAA
  status      ads_status NOT NULL DEFAULT 'draft'
);

-- ============================================================================
-- ANALYTICS (creator intelligence, cohorts, growth)
-- ============================================================================
CREATE TABLE analytics_events (
  id          bigint GENERATED ALWAYS AS IDENTITY,
  user_id     uuid NOT NULL,
  event       text NOT NULL,                           -- post_view | post_like | share | watch | open_app ...
  post_id     uuid,
  session_id  uuid,
  properties  jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, user_id)                            -- distributed by user_id
);
CREATE INDEX idx_analytics_user_time ON analytics_events (user_id, occurred_at DESC);
CREATE INDEX idx_analytics_event_time ON analytics_events (event, occurred_at DESC);

-- Rollup for creator dashboard (daily aggregates, cheap reads)
CREATE TABLE creator_daily_stats (
  user_id       uuid NOT NULL,
  day           date NOT NULL,
  impressions   bigint NOT NULL DEFAULT 0,
  reach         bigint NOT NULL DEFAULT 0,
  likes         bigint NOT NULL DEFAULT 0,
  comments      bigint NOT NULL DEFAULT 0,
  shares        bigint NOT NULL DEFAULT 0,
  follows       bigint NOT NULL DEFAULT 0,
  unfollows     bigint NOT NULL DEFAULT 0,
  watch_time_ms bigint NOT NULL DEFAULT 0,
  avg_watch_pct double precision NOT NULL DEFAULT 0,
  revenue_cents bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX idx_cds_creator ON creator_daily_stats (user_id, day DESC);

CREATE TABLE cohorts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  name          text NOT NULL,                         -- signup_week | retention_week
  cohort_date   date NOT NULL,
  size          int NOT NULL DEFAULT 0,
  retention     jsonb NOT NULL DEFAULT '{}'::jsonb,    -- {d0:1.0, d1:0.42, d7:0.21,...}
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cohorts_date ON cohorts (cohort_date DESC);

CREATE TABLE churn_predictions (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  model_version text NOT NULL,
  churn_probability double precision NOT NULL,
  top_reasons jsonb,
  predicted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_churn_prob ON churn_predictions (churn_probability DESC) WHERE churn_probability > 0.5;

-- ============================================================================
-- GROWTH & EXPERIMENTATION
-- ============================================================================
CREATE TABLE onboarding_funnels (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  funnel_name   text NOT NULL,                         -- signup | follow_suggestions | first_post
  step          text NOT NULL,
  completed     boolean NOT NULL DEFAULT false,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_funnel_user ON onboarding_funnels (user_id, funnel_name);

CREATE TABLE user_suggestions (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  suggested_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      text,                                    -- shared_hashtag | mutual_follow | geo | similar
  score       double precision NOT NULL DEFAULT 0,
  dismissed   boolean NOT NULL DEFAULT false,
  followed    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, suggested_id)
);
CREATE INDEX idx_suggestions_pending ON user_suggestions (user_id, dismissed, followed, score DESC);

CREATE TABLE experiments (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  key            text NOT NULL UNIQUE,
  name           text NOT NULL,
  description    text,
  status         exp_status NOT NULL DEFAULT 'draft',
  start_at       timestamptz,
  end_at         timestamptz,
  traffic_percent int NOT NULL DEFAULT 100,
  variants       jsonb NOT NULL,                       -- [{key, weight}]
  primary_metric text NOT NULL,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE experiment_assignments (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  variant       text NOT NULL,
  bucket        int NOT NULL,                          -- stable hash bucket 0..999
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, user_id)
);
CREATE INDEX idx_exp_assign ON experiment_assignments (experiment_id, variant);

-- ============================================================================
-- ACCESSIBILITY (WCAG AAA compliance tracking)
-- ============================================================================
CREATE TABLE a11y_compliance (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  resource_type  text NOT NULL,                        -- page | component | route
  resource_id    text NOT NULL,
  wcag_version   text NOT NULL DEFAULT '2.2',
  conformance_level text NOT NULL DEFAULT 'AAA',
  passed_rules   jsonb NOT NULL DEFAULT '[]'::jsonb,
  failed_rules   jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{rule, impact, nodes}]
  violations_count int NOT NULL DEFAULT 0,
  contrast_min   double precision,                     -- worst-case ratio on page
  checked_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource_type, resource_id, wcag_version)
);
CREATE INDEX idx_a11y_violations ON a11y_compliance (violations_count DESC) WHERE violations_count > 0;

CREATE TABLE media_alt_text_audit (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  media_id        uuid NOT NULL REFERENCES post_media(id) ON DELETE CASCADE,
  alt_provided    boolean NOT NULL DEFAULT false,
  generated_alt   text,
  quality_score   double precision,                    -- ai eval of alt-text usefulness
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_alt_audit ON media_alt_text_audit (media_id);

-- ============================================================================
-- CONTENT LIFECYCLE / RETENTION
-- ============================================================================
CREATE TABLE retention_policies (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  region         text NOT NULL,                        -- EU | US | IN | GLOBAL
  data_class     text NOT NULL,                        -- message | story | post | analytics
  retention_days int NOT NULL,
  action         text NOT NULL DEFAULT 'delete',       -- delete | anonymize | archive
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE content_archives (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archive_type   text NOT NULL,                        -- posts | messages | profile
  storage_key    text NOT NULL,
  size_bytes     bigint NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'processing',
  requested_at   timestamptz NOT NULL DEFAULT now(),
  ready_at       timestamptz
);

-- ============================================================================
-- OUTBOX (transactional event emission — ADR-0006)
-- ============================================================================
CREATE TABLE outbox_events (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  aggregate_id  uuid NOT NULL,
  event_type    text NOT NULL,
  payload       jsonb NOT NULL,
  idempotency_key text UNIQUE,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_outbox_pending ON outbox_events (created_at ASC) WHERE published_at IS NULL;

-- ============================================================================
-- CITUS DISTRIBUTION (execute in coordinator; app executes via migration shim)
-- ============================================================================
-- SELECT create_distributed_table('users','id');
-- SELECT create_distributed_table('posts','author_id');
-- SELECT create_distributed_table('comments','author_id');
-- SELECT create_distributed_table('likes','user_id');
-- SELECT create_distributed_table('follows','follower_id');
-- SELECT create_distributed_table('messages','sender_id');
-- SELECT create_distributed_table('notifications','user_id');
-- SELECT create_distributed_table('analytics_events','user_id');
-- SELECT create_distributed_table('creator_daily_stats','user_id');
-- Reference tables (replicated everywhere):
-- SELECT create_reference_table('retention_policies');
-- SELECT create_reference_table('hashtags');
