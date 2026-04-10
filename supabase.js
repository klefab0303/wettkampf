// ═══════════════════════════════════════════════════════════
// supabase.js – Datenbankverbindung (Supabase)
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://qibmzwckrnkwpgvwosuk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpYm16d2Nrcm5rd3Bndndvc3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2OTQ1NjQsImV4cCI6MjA4NzI3MDU2NH0.rde0zrU5ACAZDcCaNGe0QXnkEgSBhaTZeNXxB3-YMzY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
