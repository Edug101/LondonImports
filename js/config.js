// Pegue em Supabase > Project Settings > API
const SUPABASE_URL = "https://omxdtduegcjflidelcgv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9teGR0ZHVlZ2NqZmxpZGVsY2d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODc4NDQsImV4cCI6MjEwNzA2Mzg0NH0.tUL3ZpE3jTEy-Ghr6b-0U3KY1TSSf55-zcVKG42hxWU";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const money = v => Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
