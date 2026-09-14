import { WORKSPACE_TIMEZONE } from './date.js';

// LFG Outreach CRM Supabase project. The publishable key is intentionally safe for browser use;
// authorization is enforced by Supabase Auth + RLS/RPC checks. Never put a secret/service-role key here.
export const backendConfig = {
  url: 'https://dbsfyqrkpjmkyraplfrk.supabase.co',
  publishableKey: 'sb_publishable_VYom8plb9NSdxJJn6lXeZw_2TsPh5PO',
  enabled: true,
  timezone: WORKSPACE_TIMEZONE
};
