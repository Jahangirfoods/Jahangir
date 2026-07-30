// supabase-client.js
// Fill these in from your Supabase project: Settings → API
// The anon key is safe to expose publicly — it only allows what your
// Row Level Security policies permit (see schema.sql).

const SUPABASE_URL = 'https://rhyzwkovymmocxkorwcj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoeXp3a292eW1tb2N4a29yd2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNjA1OTksImV4cCI6MjEwMDkzNjU5OX0.VfHH58atfHNgyldT3dDu1Zf05D2OTy3Ch1ceCTFC30E';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
