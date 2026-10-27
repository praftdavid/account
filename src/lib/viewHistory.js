// 화면 이동을 브라우저 방문 기록에 남겨서, iOS의 왼쪽 가장자리 스와이프·안드로이드 뒤로가기·브라우저 뒤로가기가
// 앱 안에서 "이전에 보던 화면"으로 돌아가게 한다. 새로고침해도 보던 화면이 유지된다.
//
// 쓰는 쪽(앱)은 initHistory로 "지금 화면 상태를 읽는 함수"와 "저장된 상태로 화면을 되돌리는 함수"를 알려 주고,
// 화면이 바뀔 수 있는 시점마다 trackHistory()를 부르면 된다. 상태가 바뀌었을 때만 기록을 남긴다.

let cfg = null;
let stack = [];
let idx = -1;
let skipNextPop = false;

const sig = (s) => JSON.stringify(s);

export function initHistory(config) {
  cfg = config;
  window.addEventListener('popstate', onPop);
  const st = history.state;
  if (st && st.__v) {
    // 새로고침: 방문 기록에 남아 있는 화면 상태를 되돌린다.
    idx = st.idx;
    stack[idx] = st.s;
    cfg.restore(st.s);
  }
}

function onPop(e) {
  const st = e.state;
  if (!st || !st.__v) return;
  idx = st.idx;
  stack[idx] = st.s;
  if (skipNextPop) {
    skipNextPop = false; // "목록으로" 버튼처럼 이미 화면을 바꾼 뒤 기록만 한 칸 되돌린 경우
    return;
  }
  cfg.apply(st.s);
}

export function trackHistory() {
  if (!cfg) return;
  const s = cfg.getState();
  if (!s) return;
  if (idx < 0) {
    idx = 0;
    stack = [s];
    history.replaceState({ __v: 1, idx, s }, '');
    return;
  }
  if (sig(stack[idx]) === sig(s)) return;

  // 상세 화면에서 "목록" 버튼으로 돌아온 경우: 새 기록을 쌓지 않고 한 칸 뒤로 간다.
  if (idx > 0 && stack[idx - 1] && sig(stack[idx - 1]) === sig(s)) {
    skipNextPop = true;
    history.back();
    return;
  }

  // 작성·수정 화면에서 저장해 상세 화면으로 넘어간 경우: 작성 화면 기록을 상세로 바꿔 둔다(뒤로 가면 빈 작성 화면이 아니라 그 전 화면).
  const prev = stack[idx];
  if (prev && prev.view === s.view && (prev.page?.mode === 'new' || prev.page?.mode === 'edit' || prev.page?.mode === 'form') && s.page?.mode === 'view') {
    stack[idx] = s;
    history.replaceState({ __v: 1, idx, s }, '');
    return;
  }

  stack = stack.slice(0, idx + 1);
  stack.push(s);
  idx += 1;
  history.pushState({ __v: 1, idx, s }, '');
}
