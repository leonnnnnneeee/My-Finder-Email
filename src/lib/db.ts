import { Pool, QueryResultRow } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

let initialized = false;

export async function initDb() {
  if (initialized) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS competitor_sites (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        url TEXT UNIQUE NOT NULL,
        domain TEXT NOT NULL,
        last_crawled_at TIMESTAMP WITH TIME ZONE,
        total_pages_crawled INTEGER DEFAULT 0,
        total_emails_found INTEGER DEFAULT 0,
        owner_id TEXT
      );

      CREATE TABLE IF NOT EXISTS crawled_pages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        site_id UUID REFERENCES competitor_sites(id) ON DELETE CASCADE,
        page_url TEXT UNIQUE NOT NULL,
        page_title TEXT,
        emails_found JSONB DEFAULT '[]'::jsonb,
        crawled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS emails (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        address TEXT UNIQUE NOT NULL,
        domain TEXT,
        source_url TEXT,
        source_type TEXT DEFAULT 'manual',
        contact_name TEXT,
        position TEXT,
        status TEXT DEFAULT 'new',
        reply_status TEXT,
        replied_at TIMESTAMP WITH TIME ZONE,
        open_count INTEGER DEFAULT 0,
        opened_at TIMESTAMP WITH TIME ZONE,
        sent_at TIMESTAMP WITH TIME ZONE,
        remind1_sent_at TIMESTAMP WITH TIME ZONE,
        remind1_status TEXT,
        remind1_subject TEXT,
        remind2_sent_at TIMESTAMP WITH TIME ZONE,
        remind2_status TEXT,
        remind2_subject TEXT,
        remind3_sent_at TIMESTAMP WITH TIME ZONE,
        remind3_status TEXT,
        remind3_subject TEXT,
        last_subject TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        owner_id TEXT
      );

      CREATE TABLE IF NOT EXISTS send_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
        subject TEXT,
        body TEXT,
        from_name TEXT,
        from_email TEXT,
        status TEXT,
        error_msg TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS email_templates (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        owner_id TEXT
      );

      CREATE TABLE IF NOT EXISTS email_blacklist (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        domain TEXT,
        email TEXT,
        reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    initialized = true;
  } catch (error) {
    console.error('Database initialization failed:', error);
  } finally {
    client.release();
  }
}

// Ensure initialization is triggered, but don't await it at the top level
// to avoid blocking the module loading.
initDb().catch(console.error);

export const db = {
  query: async <T extends QueryResultRow = any>(text: string, params?: any[]) => {
    await initDb();
    return pool.query<T>(text, params);
  }
};

export type Email = {
  id: string;
  address: string;
  source_url: string | null;
  domain: string | null;
  status: 'new' | 'sent' | 'failed';
  reply_status: 'replied' | null;
  sent_at: string | null;
  created_at: string;
  owner_id: string | null;
};
