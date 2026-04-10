// ═══════════════════════════════════════════════════════════
// supabase.js – Datenbankverbindung (Supabase)
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://utgntktnvnayksksqlyg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0Z250a3Rudm5heWtza3NxbHlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTYzNzEsImV4cCI6MjA4NzA5MjM3MX0.nSstbmb5FMQor-5WJoFjxfWRrVsWtgp-LrkNmr3wNiM';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
