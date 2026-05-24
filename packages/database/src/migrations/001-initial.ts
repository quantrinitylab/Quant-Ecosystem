// ============================================================================
// Database Migration - 001 Initial Schema
// ============================================================================

/** Migration definition interface */
export interface Migration {
  id: string;
  name: string;
  timestamp: number;
  up: () => string[];
  down: () => string[];
}

/** Initial database migration - creates all core tables */
export const migration001Initial: Migration = {
  id: '001',
  name: 'initial_schema',
  timestamp: 1700000000000,
  up: () => [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(254) UNIQUE NOT NULL,
      username VARCHAR(30) UNIQUE NOT NULL,
      display_name VARCHAR(50) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      avatar_url TEXT,
      banner_url TEXT,
      phone_number VARCHAR(20) UNIQUE,
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      status VARCHAR(30) NOT NULL DEFAULT 'pending_verification',
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
      two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      two_factor_secret VARCHAR(255),
      bio TEXT,
      website VARCHAR(500),
      location VARCHAR(100),
      date_of_birth DATE,
      last_login_at TIMESTAMPTZ,
      last_login_ip INET,
      login_count INTEGER NOT NULL DEFAULT 0,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      lockout_until TIMESTAMPTZ,
      preferences JSONB NOT NULL DEFAULT '{}',
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )`,

    // Conversations table
    `CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type VARCHAR(20) NOT NULL,
      name VARCHAR(100),
      description TEXT,
      avatar_url TEXT,
      created_by UUID NOT NULL REFERENCES users(id),
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      last_message_id UUID,
      last_message_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )`,

    // Messages table
    `CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES conversations(id),
      sender_id UUID NOT NULL REFERENCES users(id),
      type VARCHAR(20) NOT NULL DEFAULT 'text',
      content TEXT,
      media_url TEXT,
      media_thumbnail_url TEXT,
      media_type VARCHAR(50),
      media_duration INTEGER,
      reply_to_id UUID REFERENCES messages(id),
      forwarded_from_id UUID,
      is_edited BOOLEAN NOT NULL DEFAULT FALSE,
      edited_at TIMESTAMPTZ,
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      expires_at TIMESTAMPTZ,
      reactions JSONB NOT NULL DEFAULT '[]',
      mentions JSONB NOT NULL DEFAULT '[]',
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // Email threads
    `CREATE TABLE IF NOT EXISTS email_threads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      subject TEXT NOT NULL,
      participant_addresses JSONB NOT NULL DEFAULT '[]',
      message_count INTEGER NOT NULL DEFAULT 0,
      unread_count INTEGER NOT NULL DEFAULT 0,
      last_message_at TIMESTAMPTZ NOT NULL,
      snippet VARCHAR(200),
      is_starred BOOLEAN NOT NULL DEFAULT FALSE,
      labels JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // Emails
    `CREATE TABLE IF NOT EXISTS emails (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      thread_id UUID NOT NULL REFERENCES email_threads(id),
      from_address VARCHAR(254) NOT NULL,
      from_name VARCHAR(100),
      to_addresses JSONB NOT NULL,
      cc_addresses JSONB NOT NULL DEFAULT '[]',
      bcc_addresses JSONB NOT NULL DEFAULT '[]',
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      body_plain TEXT NOT NULL,
      snippet VARCHAR(200),
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      is_starred BOOLEAN NOT NULL DEFAULT FALSE,
      has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
      attachments JSONB NOT NULL DEFAULT '[]',
      labels JSONB NOT NULL DEFAULT '[]',
      priority VARCHAR(10) NOT NULL DEFAULT 'normal',
      ai_summary TEXT,
      ai_category VARCHAR(50),
      received_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )`,

    // Posts (QuantSync)
    `CREATE TABLE IF NOT EXISTS posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      type VARCHAR(20) NOT NULL DEFAULT 'text',
      content TEXT,
      media_urls JSONB NOT NULL DEFAULT '[]',
      hashtags JSONB NOT NULL DEFAULT '[]',
      mentions JSONB NOT NULL DEFAULT '[]',
      visibility VARCHAR(20) NOT NULL DEFAULT 'public',
      like_count INTEGER NOT NULL DEFAULT 0,
      comment_count INTEGER NOT NULL DEFAULT 0,
      repost_count INTEGER NOT NULL DEFAULT 0,
      view_count INTEGER NOT NULL DEFAULT 0,
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      moderation_status VARCHAR(20) NOT NULL DEFAULT 'approved',
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )`,

    // Videos (QuantTube)
    `CREATE TABLE IF NOT EXISTS videos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      title VARCHAR(200) NOT NULL,
      description TEXT,
      video_url TEXT NOT NULL,
      thumbnail_url TEXT NOT NULL,
      duration INTEGER NOT NULL,
      category VARCHAR(50),
      tags JSONB NOT NULL DEFAULT '[]',
      visibility VARCHAR(20) NOT NULL DEFAULT 'public',
      view_count BIGINT NOT NULL DEFAULT 0,
      like_count BIGINT NOT NULL DEFAULT 0,
      comment_count BIGINT NOT NULL DEFAULT 0,
      processing_status VARCHAR(20) NOT NULL DEFAULT 'uploading',
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )`,

    // AI Sessions
    `CREATE TABLE IF NOT EXISTS ai_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      title VARCHAR(200) NOT NULL,
      model VARCHAR(50) NOT NULL,
      system_prompt TEXT,
      total_tokens_used INTEGER NOT NULL DEFAULT 0,
      total_cost DECIMAL(10,6) NOT NULL DEFAULT 0,
      tags JSONB NOT NULL DEFAULT '[]',
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      source_app VARCHAR(20) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )`,

    // Notifications
    `CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      type VARCHAR(30) NOT NULL,
      title VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      image_url TEXT,
      action_url TEXT,
      source_app VARCHAR(20) NOT NULL,
      source_user_id UUID REFERENCES users(id),
      data JSONB NOT NULL DEFAULT '{}',
      priority VARCHAR(10) NOT NULL DEFAULT 'normal',
      channel VARCHAR(20) NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      read_at TIMESTAMPTZ,
      group_key VARCHAR(100),
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // Indexes
    'CREATE INDEX idx_users_email ON users(email)',
    'CREATE INDEX idx_users_username ON users(username)',
    'CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at)',
    'CREATE INDEX idx_emails_user ON emails(user_id, received_at)',
    'CREATE INDEX idx_posts_user ON posts(user_id, created_at)',
    'CREATE INDEX idx_videos_user ON videos(user_id, published_at)',
    'CREATE INDEX idx_ai_sessions_user ON ai_sessions(user_id, created_at)',
    'CREATE INDEX idx_notifications_user ON notifications(user_id, created_at)',
    'CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read)',
  ],
  down: () => [
    'DROP TABLE IF EXISTS notifications',
    'DROP TABLE IF EXISTS ai_sessions',
    'DROP TABLE IF EXISTS videos',
    'DROP TABLE IF EXISTS posts',
    'DROP TABLE IF EXISTS emails',
    'DROP TABLE IF EXISTS email_threads',
    'DROP TABLE IF EXISTS messages',
    'DROP TABLE IF EXISTS conversations',
    'DROP TABLE IF EXISTS users',
  ],
};
