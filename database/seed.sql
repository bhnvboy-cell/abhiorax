-- ============================================================================
-- ABHIORAX — Local Development Seed Data
-- Creates a default local-development admin account + profile (idempotent).
-- WARNING: Change these credentials before using in any non-local environment.
-- ============================================================================

DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT id
    INTO v_admin_id
    FROM users
   WHERE username = 'admin'
     AND deleted_at IS NULL;

  IF v_admin_id IS NULL THEN
    INSERT INTO users (
      username,
      email,
      email_verified,
      password_hash,
      role,
      status
    )
    VALUES (
      'admin',
      'admin@abhiorax.local',
      true,
      crypt('AbhioraxAdmin123!', gen_salt('bf', 12)),
      'admin',
      'active'
    )
    RETURNING id INTO v_admin_id;

    INSERT INTO profiles (
      user_id,
      display_name,
      bio,
      verified
    )
    VALUES (
      v_admin_id,
      'ABHIORAX Admin',
      'Platform administrator account (local dev seed).',
      true
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;
