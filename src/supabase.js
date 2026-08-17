import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const CAMPAIGN_SCHEMA = 'campaign_gerentes_2026';

export const hasSupabaseConfig = Boolean(
  supabaseUrl
  && supabaseAnonKey
  && !supabaseUrl.includes('SEU-PROJETO')
  && !supabaseAnonKey.includes('SUA_CHAVE'),
);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
    db: { schema: CAMPAIGN_SCHEMA },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
  : null;

export const usernameToEmail = (username) => (
  `${String(username).trim().toLowerCase().replace(/[^a-z0-9_]/g, '')}@campanha-gerentes-2026.eletroluz.local`
);
