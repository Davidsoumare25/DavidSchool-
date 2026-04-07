import { createClient } from '@supabase/supabase-js';

// ─── REMPLACEZ CES VALEURS PAR VOS CLÉS SUPABASE ─────────────────────────────
// Allez sur https://supabase.com → votre projet → Settings → API
const SUPABASE_URL = 'https://qrnjcomqvwjnuyjxhvsf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFybmpjb21xdndqbnV5anhodnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTU5NzAsImV4cCI6MjA5MTA5MTk3MH0.iNj_uFXBwRQANAp7Ap-A846GANbkJb1CEwGB9TluYjc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
