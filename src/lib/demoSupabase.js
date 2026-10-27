// 체험 모드용 가짜 Supabase — DB 접속 정보(VITE_SUPABASE_URL)가 없는 빌드(Vercel 미리보기 등)에서만 쓴다.
// 실제 DB에는 전혀 연결되지 않고, 샘플 데이터를 브라우저 메모리에 올려 두고 조회·저장·수정·삭제를 흉내 낸다.
// 새로고침하면 처음 상태로 돌아간다. 운영 빌드는 접속 정보가 있어서 이 코드를 쓰지 않는다.

const day = (n) => {
  const t = new Date();
  t.setDate(t.getDate() + n);
  return t.toISOString().slice(0, 10);
};
const ts = (n) => `${day(n)}T09:00:00+09:00`;

const PK = {
  departments: 'dept_id',
  documents: 'doc_id',
  projects: 'project_id',
  project_tasks: 'task_id',
  project_notes: 'note_id',
  regulations: 'reg_id',
  schedules: 'schedule_id',
  trade_logs: 'trade_id',
  attachments: 'attachment_id',
  doc_templates: 'template_id',
  document_events: 'event_id',
  seals: 'seal_id',
  seal_logs: 'log_id',
};

const DB = {
  departments: [
    { dept_id: 1, dept_name: '경영지원팀', dept_code: 'MGMT', sort_order: 0, is_active: true, active: true },
    { dept_id: 2, dept_name: '자산운용팀', dept_code: 'INV', sort_order: 1, is_active: true, active: true },
  ],
  projects: [
    { project_id: 1, dept_id: 1, title: '정관 개정', category: '규정', status: 'active', description: '사업목적 추가 및 이사회 소집 절차 정비', start_date: day(-20), end_date: day(5), created_at: ts(-20) },
    { project_id: 2, dept_id: 2, title: '미국주식 포트폴리오 재편', category: '투자', status: 'active', description: '종목 비중 재조정', start_date: day(-5), end_date: day(40), created_at: ts(-5) },
    { project_id: 3, dept_id: 1, title: '사무실 이전', category: '총무', status: 'archived', description: '평택 본점 이전 완료', start_date: day(-120), end_date: day(-60), created_at: ts(-120) },
  ],
  project_tasks: [
    { task_id: 1, project_id: 1, title: '개정안 검토', status: '진행중', start_date: day(-5), due_date: day(2), assignee: '대표이사', sort_order: 0 },
    { task_id: 2, project_id: 1, title: '이사회 소집', status: '시작전', start_date: day(3), due_date: day(12), assignee: '경영지원', sort_order: 1 },
    { task_id: 3, project_id: 1, title: '초안 작성', status: '완료', start_date: day(-20), due_date: day(-6), assignee: '경영지원', sort_order: 2 },
    { task_id: 4, project_id: 2, title: '종목 리스트 정리', status: '시작전', start_date: null, due_date: null, assignee: '자산운용', sort_order: 0 },
  ],
  project_notes: [],
  documents: [
    { doc_id: 1, doc_type: '시행문', title: '임시주주총회 소집 통지의 건', doc_no: '프래프트(경영)2026-003', status: 'submitted', dept_id: 1, recipient: '(주)OO기관 대표이사', issuer_name: '대표이사 홍길동', disclosure: '공개', body: '1. 귀사의 무궁한 발전을 기원합니다.\n2. 아래와 같이 임시주주총회를 개최하오니 참석하여 주시기 바랍니다.\n\n- 아 래 -\n가. 일시 : 2026.11.05. 14:00\n나. 장소 : 본점 회의실', drafter_email: 'demo@praft.local', created_at: ts(-3), submitted_at: ts(-2) },
    { doc_id: 2, doc_type: '기안문', title: '사무용품 구입 기안', doc_no: null, status: 'draft', dept_id: 1, recipient: null, issuer_name: null, disclosure: '공개', body: '업무용 사무용품을 아래와 같이 구입하고자 합니다.', drafter_email: 'demo@praft.local', created_at: ts(-1) },
    { doc_id: 3, doc_type: '시행문', title: '정관 개정 결과 통보의 건', doc_no: '프래프트(경영)2026-002', status: 'approved', dept_id: 1, recipient: '관할 등기소', issuer_name: '대표이사 홍길동', disclosure: '공개', body: '정관 개정 결과를 아래와 같이 통보합니다.', drafter_email: 'demo@praft.local', created_at: ts(-12), submitted_at: ts(-11), decided_at: ts(-10), decided_by: 'demo@praft.local' },
    { doc_id: 4, doc_type: '기안문', title: '2026년 하반기 운영계획 보고', doc_no: '프래프트(경영)2026-001', status: 'approved', dept_id: 1, recipient: null, issuer_name: null, disclosure: '비공개', body: '하반기 운영계획을 보고드립니다.', drafter_email: 'demo@praft.local', created_at: ts(-30), submitted_at: ts(-30), decided_at: ts(-29), decided_by: 'demo@praft.local' },
  ],
  document_events: [],
  regulations: [
    { reg_id: 1, category: '정관', title: '주식회사 프래프트 정관', reg_no: '정관-01', version: '3.0', status: 'active', effective_date: day(-60), created_at: ts(-60) },
    { reg_id: 2, category: '규정', title: '이사회 운영 규정', reg_no: '규정-02', version: '1.2', status: 'active', effective_date: day(-30), created_at: ts(-30) },
  ],
  schedules: [
    { schedule_id: 1, category: '세무', title: '부가가치세 신고·납부', due_date: day(3), done: false, memo: '' },
    { schedule_id: 2, category: '주주총회', title: '임시주주총회', due_date: day(11), done: false, memo: '' },
    { schedule_id: 3, category: '세무', title: '법인세 중간예납', due_date: day(25), done: false, memo: '' },
    { schedule_id: 4, category: '이사회', title: '3분기 이사회', due_date: day(-2), done: true, memo: '' },
  ],
  trade_logs: [
    { trade_id: 1, trade_date: day(-3), stock_name: 'NVDA', ticker: 'NVDA', side: 'buy', quantity: 10, price: 118, strategy: '성장주', reasons: [{ category: '기업실적', detail: '데이터센터 매출 가이던스 상향' }], rationale: '', review: null, created_by: 'demo@praft.local', created_at: ts(-3) },
    { trade_id: 2, trade_date: day(-12), stock_name: 'AAPL', ticker: 'AAPL', side: 'sell', quantity: 5, price: 215, strategy: '리밸런싱', reasons: [{ category: '차트', detail: '저항선 부근 과열' }], rationale: '', review: '비중 조절 판단은 적절했음. 이후 조정이 있었다.', created_by: 'demo@praft.local', created_at: ts(-12) },
  ],
  attachments: [],
  doc_templates: [],
  seals: [],
  seal_logs: [],
};

// 실제 DB가 열 기본값으로 채워 주는 값들(새 행에 상태가 비면 화면이 깨지므로 똑같이 채워 준다).
const DEFAULTS = {
  documents: { status: 'draft' },
  projects: { status: 'active' },
  regulations: { status: 'active' },
  schedules: { done: false },
  project_tasks: { status: '시작전' },
  departments: { is_active: true, active: true },
};

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function matchLike(value, pattern) {
  const re = new RegExp('^' + String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$');
  return re.test(String(value ?? ''));
}

class Query {
  constructor(table) {
    this.table = table;
    this.action = 'select';
    this.filters = [];
    this.orders = [];
    this.limitN = null;
    this.payload = null;
    this.selectStr = '*';
    this.head = false;
    this.wantCount = false;
    this.one = null; // 'single' | 'maybe'
    this.returning = false;
  }
  select(str = '*', opts = {}) {
    if (this.action === 'select') this.selectStr = str;
    else this.returning = true;
    if (opts.head) this.head = true;
    if (opts.count) this.wantCount = true;
    return this;
  }
  insert(p) { this.action = 'insert'; this.payload = p; return this; }
  update(p) { this.action = 'update'; this.payload = p; return this; }
  upsert(p) { this.action = 'insert'; this.payload = p; return this; }
  delete() { this.action = 'delete'; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  neq(c, v) { this.filters.push((r) => r[c] !== v); return this; }
  gt(c, v) { this.filters.push((r) => r[c] > v); return this; }
  gte(c, v) { this.filters.push((r) => r[c] >= v); return this; }
  lt(c, v) { this.filters.push((r) => r[c] < v); return this; }
  lte(c, v) { this.filters.push((r) => r[c] <= v); return this; }
  in(c, list) { this.filters.push((r) => list.includes(r[c])); return this; }
  is(c, v) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  not(c, op, v) { if (op === 'is') this.filters.push((r) => (r[c] ?? null) !== v); return this; }
  like(c, p) { this.filters.push((r) => matchLike(r[c], p)); return this; }
  ilike(c, p) { this.filters.push((r) => matchLike(String(r[c] ?? '').toLowerCase(), String(p).toLowerCase())); return this; }
  order(c, o = {}) { this.orders.push([c, o.ascending !== false]); return this; }
  limit(n) { this.limitN = n; return this; }
  range(a, b) { this.limitN = b - a + 1; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }

  embed(row) {
    // select('*, project_tasks(title, status)') 같은 연결 조회: 이름이 표 이름이면 그 표의 행을 붙인다.
    const out = { ...row };
    for (const m of this.selectStr.matchAll(/([a-z_]+)\s*\(/g)) {
      const child = m[1];
      if (!DB[child] || child === this.table) continue;
      const fk = this.table.replace(/s$/, '') + '_id';
      out[child] = DB[child].filter((c) => c[fk] === row[PK[this.table]]).map(clone);
    }
    return out;
  }

  run() {
    const rows = (DB[this.table] ??= []);
    const pk = PK[this.table] ?? 'id';
    const matches = () => rows.filter((r) => this.filters.every((f) => f(r)));

    if (this.action === 'insert') {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((p) => {
        const next = rows.reduce((m, r) => Math.max(m, Number(r[pk]) || 0), 0) + 1;
        const row = { [pk]: next, created_at: new Date().toISOString(), ...DEFAULTS[this.table], ...clone(p) };
        rows.push(row);
        return row;
      });
      return this.finish(this.returning || this.one ? list : null, list.length);
    }
    if (this.action === 'update') {
      const hit = matches();
      hit.forEach((r) => Object.assign(r, clone(this.payload), { updated_at: new Date().toISOString() }));
      return this.finish(this.returning || this.one ? hit : null, hit.length);
    }
    if (this.action === 'delete') {
      const hit = matches();
      DB[this.table] = rows.filter((r) => !hit.includes(r));
      return this.finish(null, hit.length);
    }

    let hit = matches().map((r) => this.embed(r));
    this.orders.forEach(([c, asc]) => hit.sort((a, b) => (a[c] === b[c] ? 0 : (a[c] ?? '') > (b[c] ?? '') ? 1 : -1) * (asc ? 1 : -1)));
    const total = hit.length;
    if (this.limitN != null) hit = hit.slice(0, this.limitN);
    return this.finish(this.head ? null : hit, total);
  }

  finish(data, count) {
    const res = { error: null, count: this.wantCount || this.head ? count : null };
    if (this.one) {
      const first = Array.isArray(data) ? data[0] : data;
      if (!first && this.one === 'single') return { data: null, error: { message: '해당 데이터가 없습니다.' }, count: null };
      return { ...res, data: clone(first ?? null) };
    }
    return { ...res, data: data === null ? null : clone(data) };
  }

  then(resolve, reject) {
    try { return Promise.resolve(this.run()).then(resolve, reject); } catch (e) { return Promise.reject(e).then(resolve, reject); }
  }
}

const EMAIL = 'demo@praft.local';
const session = { user: { email: EMAIL, id: 'demo' }, access_token: 'demo' };

export const demoSupabase = {
  auth: {
    getSession: async () => ({ data: { session }, error: null }),
    getUser: async () => ({ data: { user: session.user }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithPassword: async () => ({ data: { session }, error: null }),
    signOut: async () => ({ error: null }),
  },
  from: (table) => new Query(table),
  rpc: async () => ({ data: null, error: null }),
  storage: {
    from: () => ({
      upload: async (path) => ({ data: { path }, error: null }),
      remove: async () => ({ data: [], error: null }),
      download: async () => ({ data: new Blob(['체험 모드 샘플 파일']), error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: '#' }, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: '#' } }),
      list: async () => ({ data: [], error: null }),
    }),
  },
};

// 화면 맨 위에 "체험 모드" 띠를 붙여, 실제 데이터가 아님을 항상 보이게 한다.
export function showDemoBanner() {
  if (typeof document === 'undefined') return;
  const add = () => {
    if (document.getElementById('demoBanner')) return;
    const bar = document.createElement('div');
    bar.id = 'demoBanner';
    bar.textContent = '체험 모드 — 샘플 데이터이며 저장되지 않습니다. 새로고침하면 처음 상태로 돌아갑니다.';
    bar.style.cssText = 'background:#191f28;color:#fff;font-size:12px;text-align:center;padding:6px 12px;word-break:keep-all;';
    document.body.prepend(bar);
  };
  if (document.body) add();
  else document.addEventListener('DOMContentLoaded', add);
}
