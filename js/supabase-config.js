// Supabase 연결 설정
// 아래 두 값을 Supabase Dashboard에서 확인해 입력하세요.
// Project Settings → API → Project URL / Publishable key(또는 anon key)
const SUPABASE_URL = "https://huxefngduhlyvpxpmfsq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_RqnUgmxWh_s1HMXDP3aTyg_oUAZiY73";

const { createClient } = window.supabase;
window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
