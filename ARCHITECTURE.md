# 시스템 구조 — 주식회사 프래프트

주식회사 프래프트(투자·상거래 겸업 법인)가 쓰는 내부 시스템. **하나의 저장소·하나의 Supabase 프로젝트 위에 두 개의 웹앱**이 올라가 있다.

| 앱 | 용도 | 접속 |
|---|---|---|
| **문서포털** (기본 화면) | 전자결재, 일정, 매매일지, 프로젝트, 제규정 등 업무 문서·기록 | `https://praft-accounting.vercel.app/` |
| **관리회계 시스템** | 복식부기 장부, 재무제표, 법인세, 증권 분개 | `/portal.html` 또는 `/accounting` |

> 이 문서는 "지금 구조가 어떻게 생겼는지"를 설명한다. 어떤 순서로, 왜 그렇게 만들어졌는지는 [PROJECT_HISTORY.md](PROJECT_HISTORY.md), 버전별 변경은 [CHANGELOG.md](CHANGELOG.md), 버전 규칙은 [VERSIONING.md](VERSIONING.md)를 본다.

---

## 1. 기술 스택

- **프런트엔드**: Vite 5 + 순수 JavaScript(ES 모듈). 프레임워크·라우터 라이브러리 없음.
- **백엔드**: Supabase — Postgres(데이터), Auth(이메일/비밀번호 로그인), Storage(첨부파일). 별도 서버 코드는 없고, 브라우저가 Supabase 클라이언트로 직접 DB를 호출한다.
- **배포**: GitHub `praftdavid/account`의 `main` 브랜치 → Vercel 자동 배포(운영).
- **PWA**: 매니페스트 + 서비스워커(`public/sw.js`). 설치 가능, 네트워크 우선·오프라인 시 캐시 폴백.
- **주요 라이브러리**: `@supabase/supabase-js`, `html2canvas` + `jspdf`(PDF 저장), `xlsx`(엑셀), `pdfjs-dist`(증권사 PDF 파싱).
- **글꼴**: 화면 전체 Pretendard, 문서 미리보기 영역만 경기천년제목(표제부)·경기천년바탕(본문). 둘 다 jsDelivr CDN 웹폰트.

## 2. 저장소 구조

```
index.html            문서포털 진입점 (루트 `/`)
portal.html           관리회계 진입점
vercel.json           /accounting → /portal.html 재작성
vite.config.js        두 HTML을 멀티페이지 입력으로 빌드
public/               manifest.json, portal-manifest.json, sw.js, 아이콘
db/                   SQL 스크립트 (스키마·시드·마이그레이션, 번호순)
scripts/              일회성 변환·파서 스크립트 (분개 이관, 은행/증권 파일 파서 원형)

src/
  style.css           두 앱이 공유하는 전역 스타일
  lib/                두 앱 공용 코드 (supabase 클라이언트, 첨부파일, 유틸, 회계 계산)
  main.js             관리회계 앱 엔트리 (메뉴 구성)
  pages/              관리회계 화면 (장부·재무제표·법인세·증권)
  portal/
    main.js           문서포털 앱 엔트리 (메뉴 구성)
    nav.js            탭 전환 상태 (아래 §4 참고)
    pages/            문서포털 화면
    lib/              문서포털 전용 로직
```

> **빌드 결과물 이름 주의**: 진입점을 맞바꾼 뒤에도 Vite 입력 키 이름(`main`=`index.html`, `portal`=`portal.html`)이 그대로라, `dist/assets/main-*.js`가 **문서포털** 번들이고 `portal-*.js`가 **관리회계** 번들이다. 파일명만 보고 헷갈리기 쉽다.

## 3. 두 앱의 진입과 전환

- `/` → `index.html` → `src/portal/main.js` (문서포털).
- `/portal.html` (= `/accounting`) → `src/main.js` (관리회계).
- 각 앱 헤더에 서로 넘어가는 링크가 있다. PWA 매니페스트의 `start_url`도 각자 자기 앱(`/`, `/portal.html`)을 가리킨다.
- 두 앱은 **같은 Supabase 프로젝트·같은 로그인 세션**을 쓴다. 한쪽에서 로그인하면 다른 쪽도 로그인된 상태다(같은 origin의 localStorage 세션).

## 4. 프런트엔드 구조

### 4.1 화면 라우팅 방식
URL 라우터가 없다. 각 앱의 `main.js`가 메뉴를 `GROUPS` 배열(그룹 → 하위 메뉴 → 렌더 함수)로 들고 있고, 메뉴를 누르면 `go(view)`가 해당 렌더 함수를 `main` 영역에 호출한다. 새로고침하면 항상 대시보드로 돌아간다.

### 4.2 페이지 모듈의 공통 패턴
문서포털의 목록형 페이지(전자결재·제규정·프로젝트·매매일지·일정관리·서식 등)는 모두 같은 모양이다.

- 모듈 스코프 변수 `mode`(`list`/`new`/`edit`/`view`)와 `currentXxxId`로 지금 어느 화면인지 기억한다.
- `renderXxx(container)`가 `mode`를 보고 `renderList` / `renderForm` / `renderDetail`로 분기한다.
- `resetView()`를 export하고, 메뉴를 눌러 들어올 때만 `main.js`의 `VIEW_RESET`이 호출해 항상 **목록부터** 보이게 한다. 저장 후 상세로 넘어가는 것 같은 페이지 내부 전환은 리셋을 거치지 않는다.
- 필터(분류·연도·상태)도 모듈 변수라 같은 세션에서는 유지된다.

### 4.3 다른 탭의 항목을 바로 열기 (`portal/nav.js`)
대시보드·일정관리에서 프로젝트 마감일을 누르면 프로젝트 탭의 해당 프로젝트 상세로 바로 가야 한다. 이때 `projects.openProject(id)`로 모드를 미리 `view`로 맞춰 두고 `nav.navigate('projects')`로 탭만 바꾼다. `navigate`는 `VIEW_RESET`을 거치지 않아 맞춰 둔 상태가 유지된다. 탭 상태를 `main.js`가 아닌 별도 모듈에 둔 이유는 페이지 모듈이 `main.js`를 거꾸로 import하면 순환 참조가 생기기 때문이다.

### 4.4 공용 모듈 (`src/lib/`)
| 파일 | 역할 |
|---|---|
| `supabaseClient.js` | Supabase 클라이언트. `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`를 빌드 시점에 주입 |
| `attachments.js` | 첨부파일 업로드·삭제·다운로드·목록 위젯 (§7) |
| `util.js` | HTML 이스케이프, 천단위 콤마 입력, 날짜 헬퍼 |
| `exportExcel.js` | 화면의 `<table>`을 그대로 엑셀로 내보내기 |
| `data.js`, `statements.js`, `autoJournal.js`, `securitiesJournal.js`, `taxAdjust.js` | 관리회계 계산 로직 (§6) |

## 5. 문서포털

메뉴 순서: **대시보드 → 일정관리 → 매매일지 → 제규정 → 전자결재 → 프로젝트 → 부서자료 → 기초정보(부서관리·서식관리·직인관리·날인기록부)**

### 5.1 대시보드
- **다가오는 일정**(맨 위): 미완료 일정 + 종료예정일이 있는 진행중 프로젝트를 기한 순으로 최대 8건. D-day 배지 색은 기한 지남=빨강, 7일 이내=노랑, 그 외=초록.
- 부서별 프로젝트 진행 현황(진행률 = 완료 업무 / 전체 업무), 결재 대기 문서 수, 시행중 규정 수, 최근 제규정.

### 5.2 일정관리 (`schedules`)
- 수동 일정 분류: 세무 / 주주총회 / 기타. 프로젝트는 **자동 연동**(별도 등록 없음).
- **전체 탭 = 월간 달력**. 날짜 밑에 분류 색 점(세무 초록, 주주총회 빨강, 프로젝트 노랑, 기타 회색), 화살표·좌우 스와이프로 월 이동, 날짜를 누르면 아래에 그날 목록. 개별 분류 탭은 표 목록.
- 프로젝트 항목은 `projects.end_date`를 끌어온 **읽기 전용 가상 행**이다(체크·삭제 없음). 누르면 프로젝트 탭의 실제 상세로 이동.

### 5.3 매매일지 (`trade_logs`)
- 거래일·종목·티커·매수/매도·수량·단가·전략/셋업.
- **매매 이유**: 분류(거시환경·기업실적·산업변화·밸류에이션·차트·수급·뉴스이벤트·기타)를 고르면 분류별 작성 가이드가 나오고, 분류마다 세부 사유를 필수로 적는다. `reasons` jsonb(`[{category, detail}]`)로 저장. 분류 목록·가이드는 `portal/lib/tradeReasons.js` 한 곳에서 고친다.
- **결과/복기**: 나중에 돌아와서 적는 별도 칸(인라인 수정).
- 첨부파일(차트 캡처 등), 목록 필터(구분·종목·근거·전략·연도).
- 각 거래를 개별 행으로 기록한다. 매수-매도를 묶는 포지션 단위 손익 계산은 없다.

### 5.4 전자결재 (`documents`)
- 문서 종류: **기안문 / 시행문 / 지급회의서**. 발송명의인이 있으면 시행문 성격. 지급회의서는 계정과목·지출일자·금액·증빙·세무처리를 입력하고, 계정과목은 **관리회계의 `accounts`(비용 계정)를 그대로 조회**한다 — 두 앱이 연결되는 지점.
- 상태 흐름:

  ```
  draft(기안중) ─상신→ submitted(결재대기) ─승인→ approved(승인/시행)
                          │  └─반려→ rejected ─(수정)→ 재상신 → submitted
                          └─회수(삭제)           approved ─회수→ recalled(회수됨)
  ```
  - 대표이사 1인 체제라 결재선이 없다. 상신한 본인이 승인/반려한다.
  - **문서번호는 상신 시점에 채번**: `{부서명}_{연도}{일련번호 2자리}` (예: `경영지원팀_202601`).
  - 상신 후 승인 전 **회수 = 문서 삭제**(첨부 포함). 승인 후 **회수 = 상태만 `recalled`로 변경**하고 사유·회수자·시각을 보존(삭제하지 않음).
- **결재 이력** (`document_events`): 기안·상신·재상신·승인·반려·회수·날인을 한 줄씩 기록. 문서 행에는 마지막 결정만 남기 때문에 이력은 별도 테이블이다.
- **서식** (`doc_templates`): 기안 작성 화면의 [서식 불러오기]/[서식으로 저장], 기초정보 > 서식관리.
- **한글(HWPX) 서식**: 서식에 `.hwp/.hwpx` 파일을 올리면(HWP는 HWPX로 변환해 보관, `doc_templates.hwpx_path`) 문서 안의 `{{자리표시}}`마다 기안 화면에 입력칸이 생기고, 저장하면 값으로 채운 HWPX가 문서 첨부로 붙는다. 한 줄 값만 지원하며, 글꼴은 HWPX 글꼴 정의를 고쳐서 문서 제목(글자가 든 글자모양 중 가장 큰 것)만 `경기천년제목 Medium`, 나머지 본문은 전부 `경기천년바탕 Regular`로 바꾸고 굵게 표시는 뺀다(글꼴 이름이 아니라 역할 기준). 엔진은 `@rhwp/core`(WASM 약 11.8MB, 한글 기능을 쓸 때만 로드). 로직은 `portal/lib/hwpxCore.js`(순수 함수), 로더·캔버스 렌더·PDF는 `hwpx.js`, 미리보기 창은 `hwpxViewer.js`.
- **HWP/HWPX 첨부 미리보기·PDF**: 첨부 목록의 "(한글 미리보기)"가 쪽별로 캔버스에 그리고 [PDF 저장]으로 이미지 PDF를 만든다. 캔버스 렌더러를 써야 페이지에 로드된 경기천년 웹폰트가 적용된다(SVG를 이미지로 쓰면 웹폰트가 빠진다).
- **직인 날인** (`seals`, `seal_logs`): 직인 이미지를 올리면 흰 배경을 투명 처리해 PNG로 저장. 사용 지정한 직인 1개가 승인된 시행문의 "(인)" 자리에 찍히고 화면·PDF에 반영된다. 날인은 취소할 수 없고 `seal_logs`(날인기록부)에 한 줄 남는다. 이미 날인에 쓴 직인은 삭제 불가.
- **출력**: 화면 미리보기는 공문서 서식(`letterheadPrint.js`·`expenseResolution.js`), PDF 저장은 `html2canvas`+`jsPDF`(`exportPdf.js`). 편집 가능한 출력은 한글(HWPX)이 맡는다: 한글 서식으로 만든 문서는 첨부된 HWPX, 직접 쓴 기안문·시행문은 상세화면의 [한글(HWPX) 저장]이 공문서 모양(표어·회사명·수신·제목·본문·발송명의인·직인·시행/연락처)으로 새로 만든다(`hwpxLetterhead.js`). 직인은 글자처럼 취급되는 그림으로 이름 뒤에 놓인다. 농협 시행문 양식처럼 머리(표어·회사명·수신·제목)와 시행번호·연락처는 가는 선(제목 아래·시행번호 위) 한 줄씩의 표로 만들고 본문은 줄 간격 165%로 둔다. 시행번호·연락처 표는 용지 기준 아래쪽 고정 위치(본문 길이와 무관)에 놓는다(화면·PDF 미리보기도 A4 비율 카드의 맨 아래에 고정). Word 내보내기는 없앴다.
- 첨부파일은 **작성(입력) 화면에서만** 올리고, 상세(확인) 화면은 읽기 전용이다.

### 5.5 제규정 (`regulations`)
이미 만들어진 규정·정관 파일을 등록·관리하는 메뉴라 본문을 타이핑하지 않는다. 구분·규정번호·버전·시행일을 입력하고 파일을 **등록 시점에** 첨부하며, 상세화면은 첨부된 **PDF를 iframe으로 그대로 미리보기**한다. 시행중/폐지 상태 전환.

### 5.6 프로젝트 (`projects`, `project_tasks`, `project_notes`)
부서별·업무종류별 프로젝트, 업무 목록(담당자·시작일·기한·상태), 간트 차트(`gantt.js`), 진행 메모(여러 줄), 프로젝트 내용(수정 가능), 기간 수정, 첨부파일. 완료 처리하면 `archived`가 되어 **부서자료 > 완료 프로젝트**에서 읽기 전용(+재오픈)으로 본다. 업무 기한이 프로젝트 종료예정일보다 늦으면 경고와 함께 종료예정일을 맞추는 버튼이 뜬다.

### 5.7 기초정보
- **부서관리** (`departments`): 문서번호 접두사·프로젝트 소속의 기준.
- **서식관리**, **직인관리**, **날인기록부**: §5.4 참고. 날인기록부는 연도 필터·엑셀 다운로드.

## 6. 관리회계 시스템

메뉴는 회계 데이터가 흐르는 순서(상류→하류)로 배치되어 있다.

| 그룹 | 화면 | 하는 일 |
|---|---|---|
| 기초정보 | 계정과목, 계좌 관리 | 계정 트리, 금융계좌↔GL계정 연결 |
| 자동분개 | 거래 업로드, 거래 검토·분개, 증권 거래 분개, 잔액 대사, 증권 재평가 | 은행(국민 `.xls`)·증권(키움 CSV/PDF) 파일 파싱 → 적요 패턴으로 상대계정 제안 → 분개 생성 → 잔고증명서와 대사 |
| 전표·장부 | 분개 입력, 분개장, 계정별원장, 시산표 | 복식부기 기록 |
| 재무제표 | 재무상태표, 손익계산서, 이익잉여금처분계산서, 자본변동표, 현금흐름표 | 조회 + 엑셀 |
| 법인세 | 법인세 계산, 소득금액조정합계표, 유보 관리, 기납부세액·세액공제 | 세무조정·세액 계산 |
| 증권관리 | 보유종목, 매매내역, 배당금내역, 환전내역, 환율(거래일 대사) | **조회·분석 전용**(분개 생성은 자동분개 쪽에 모음) |

핵심 설계: **마감분개 없이 실시간 당기순이익**을 계산한다. 수익·비용 계정은 조회 시점에 회계연도 시작일부터 다시 집계하고, 자산·부채·자본 계정은 전체 누적으로 잡는다(`fetchTrialBalance`, `src/lib/data.js`). 파일 파서는 `scripts/`에 원형이, 화면용은 `src/lib/parsers/`에 있다.

## 7. 데이터 모델 (Supabase / Postgres)

### 관리회계
`fiscal_periods`, `accounts`, `financial_accounts`, `import_batches`, `mapping_rules`, `journal_entries`, `journal_lines`, `raw_transactions`, `balance_snapshots`, `securities_lots`, `securities_transactions`, `securities_valuations`, `fx_rates`, `tax_adjustments`, `tax_credits`

### 문서포털
| 테이블 | 내용 | 주요 관계 |
|---|---|---|
| `departments` | 부서 | — |
| `documents` | 기안문·시행문·지급회의서. `status`는 draft/submitted/approved/rejected/recalled. 직인 컬럼 `seal_id`·`sealed_at`·`sealed_by` | → departments, accounts(지급회의서), seals |
| `document_events` | 결재 이력 | → documents (삭제 시 같이 삭제) |
| `doc_templates` | 기안 서식 | — |
| `seals` | 직인 이미지 경로, `is_active`(사용 중 1개) | — |
| `seal_logs` | 날인기록부. 문서번호·제목·직인명을 **문자열로 복사**해 문서가 삭제돼도 남음 | → documents, seals (삭제 시 null) |
| `regulations` | 제규정 | — |
| `projects` / `project_tasks` / `project_notes` | 프로젝트 / 업무 / 진행 메모 | → departments |
| `schedules` | 수동 일정 (분류·제목·기한·메모·완료여부) | — |
| `trade_logs` | 매매일지 (`reasons` jsonb, `strategy`, `review`) | — |
| `attachments` | 모든 첨부파일 (아래) | 다형 참조 |
| `dept_posts` | 부서 게시글 — **테이블만 있고 현재 화면에서 쓰지 않음** | → departments |

### 첨부파일 (`attachments` + Storage 버킷 `portal-files`)
`attachments(target_type, target_id, file_name, storage_path, ...)`가 문서·규정·프로젝트·매매일지를 가리키는 **다형 참조**다(`target_type` = `document` / `regulation` / `project` / `trade`). 파일은 비공개 버킷 `portal-files`에 저장한다.

- **저장 경로는 영문 UUID**(`{종류}/{id}/{timestamp}_{uuid}{확장자}`), 한글 원본 파일명은 DB `file_name`에만 저장한다. Supabase Storage가 비-ASCII 키를 거부하기 때문.
- **다운로드**는 서명 URL로 받아 Blob으로 만든 뒤 `<a download="원본이름">`으로 저장 → 한글 파일명이 그대로 유지된다.
- **PDF 미리보기**는 위젯을 그릴 때 서명 URL(1시간)을 미리 받아 평범한 `<a target="_blank">`로 연다(스크립트로 새 탭을 여는 방식은 팝업 차단에 걸려서 폐기).
- 사진(JPG/PNG/WebP)은 업로드 전에 1920px·JPEG 82%로 줄인다. PDF·HWPX는 그대로.
- 위젯은 `allowUpload`/`allowDelete` 옵션으로 입력 화면과 열람 화면을 구분한다.

## 8. 인증과 보안

- Supabase Auth 이메일/비밀번호. 계정은 Supabase 대시보드에서 직접 발급하며 가입 화면은 없다.
- **모든 테이블 RLS 활성화**, 정책은 `authenticated_full_access` 하나(로그인한 사용자는 전체 읽기/쓰기, 비로그인은 완전 차단). Storage 버킷도 같은 방식. 단일 조직(가족 법인)용이라 사용자별 데이터 분리는 없다.
- `anon` 키는 공개 키라 번들에 들어가도 되지만, 데이터는 RLS가 막는다. 로그인 계정이 곧 전체 권한이라 **계정 관리가 곧 보안**이다.
- 서비스 롤 키는 코드·저장소에 없다. 서버 코드가 없으므로 DB 스키마 변경은 직접 DB 접속(마이그레이션)으로 한다.

## 9. 빌드·배포·운영

```bash
npm run dev       # 개발 서버 (Google Drive 동기화 폴더에서는 HMR이 반복 새로고침되는 문제가 있어 build+preview 권장)
npm run build     # dist/ 생성 (멀티페이지)
npm run preview   # 빌드 결과를 정적 서버로 확인
```
- `main`에 푸시하면 Vercel이 자동 배포(운영). 환경변수 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`는 로컬 `.env`와 Vercel에 설정되어 있다(`.env`는 gitignore).
- 서비스워커는 같은 origin 정적 파일을 **네트워크 우선**으로 받고 실패할 때만 캐시를 쓴다. Supabase 등 외부 호출은 가로채지 않는다.
- 프로젝트 폴더가 Google Drive 동기화 폴더라 `npm install`이 파일 잠금 오류(EBADF/EPERM)로 실패하는 경우가 있다. 임시 폴더에서 설치한 뒤 `node_modules`를 복사하는 방식으로 우회해 왔다.

## 10. 알려진 한계·정리할 것

1. **DB 변경은 `db/21_portal_extensions.sql`에 정리했다**(`trade_logs`, `schedules`, `doc_templates`, `seals`, `seal_logs`, `document_events`, 직인 컬럼, `recalled` 상태, `doc_templates.hwpx_path`). 모두 멱등이라 다시 실행해도 안전하다. 이 파일을 만들기 전에 직접 적용한 것과 내용이 같은지는 새 환경에서 실행해 대조해 보지 않았다.
2. **CHANGELOG가 `v1.0.2`에서 멈춰 있다.** 커밋 메시지에는 v1.1.x~v1.2.0이 있으나 `package.json`·`CHANGELOG.md`는 갱신되지 않았다.
3. 상신 전 회수는 문서를 삭제하므로 **문서번호가 결번이 되고** 그 문서의 결재 이력도 함께 사라진다.
4. 문서포털의 첨부파일·직인 이미지는 Supabase Storage에만 있다. 별도 백업 절차는 없다.
5. 보존기한은 생성일 + 10년으로 **표시만** 한다(자동 삭제 없음, 문서 종류별 보존기간 선택 없음).
6. `dept_posts` 테이블은 현재 어느 화면에서도 쓰이지 않는다.
7. 로그인 계정이 곧 전체 권한이다. 계정을 늘릴 때는 접근 범위가 구분되지 않는다는 점을 감안해야 한다.

## 11. 문서 지도

| 문서 | 내용 |
|---|---|
| `ARCHITECTURE.md` (이 문서) | 현재 시스템 구조 |
| `PROJECT_HISTORY.md` | 관리회계 쪽이 어떤 순서·이유로 만들어졌는지 |
| `CHANGELOG.md` / `VERSIONING.md` | 버전별 변경 / 버전 규칙 |
| `db/README_fx_rates.md` | 환율 수동 시딩 절차 |
| `2026H1_가결산_재점검_보고서.md` | 2026 상반기 가결산 재점검 |
