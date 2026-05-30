import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Sanitize inputs (remove quotes, whitespace, or carriage returns)
const supabaseUrl = rawUrl ? rawUrl.replace(/['"\r\n]/g, '').trim() : '';
const supabaseAnonKey = rawKey ? rawKey.replace(/['"\r\n]/g, '').trim() : '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const authAdminClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
