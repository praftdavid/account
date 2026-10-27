import { createClient } from '@supabase/supabase-js';
import { demoSupabase, showDemoBanner } from './demoSupabase.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// DB 접속 정보가 없는 빌드(Vercel 미리보기 등)는 실제 DB 대신 샘플 데이터로 돌아가는 체험 모드로 연다.
// 운영 빌드는 접속 정보가 있어서 항상 진짜 Supabase를 쓴다.
export const isDemo = !url || !anonKey;
if (isDemo) showDemoBanner();
export const supabase = isDemo ? demoSupabase : createClient(url, anonKey);
