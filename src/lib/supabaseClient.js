import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    'Supabase 환경변수가 비어 있습니다. .env 파일에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 설정하세요 (.env.example 참고).'
  );
}

// url/anonKey가 비어 있으면 createClient()가 URL 파싱 단계에서 즉시 예외를 던져 화면 전체가
// 렌더링되지 않으므로, 미설정 상태에서도 로그인 화면 등 UI 셸은 뜨도록 더미 URL로 대체한다.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder-anon-key');
