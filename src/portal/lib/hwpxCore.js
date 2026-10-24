// HWPX 템플릿 처리의 순수 로직. rhwp 모듈·JSZip을 인자로 받아서 브라우저와 Node 양쪽에서 같은
// 코드로 시험할 수 있다(Vite 전용 import는 hwpx.js 쪽에만 둔다).

export const TITLE_FONT = '경기천년제목 Medium';
export const BODY_FONT = '경기천년바탕';

const PLACEHOLDER_RE = /\{\{([^{}]+)\}\}/g;

export function docText(doc) {
  const parts = [];
  for (let i = 0; i < doc.pageCount(); i++) parts.push(doc.getPageText(i));
  return parts.join('\n');
}

// 템플릿 안의 {{자리표시}} 이름을 나타난 순서대로, 중복 없이 돌려준다.
export function findPlaceholders(doc) {
  const seen = new Set();
  for (const m of docText(doc).matchAll(PLACEHOLDER_RE)) seen.add(m[1].trim());
  return [...seen];
}

// 값 안의 줄바꿈은 rhwp의 문자열 치환이 문단으로 나눠주지 않아 한 문단 안에 깨진 글자로 남는다.
// 그래서 한 줄 값만 지원하고 줄바꿈은 공백으로 바꾼다.
export function fillPlaceholders(doc, values) {
  const missed = [];
  for (const [key, raw] of Object.entries(values)) {
    const value = String(raw ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim();
    const res = JSON.parse(doc.replaceAll(`{{${key}}}`, value, true));
    if (!res.count) missed.push(key);
  }
  return missed;
}

// 저장 중 내용이 빠지면(contentLoss) 호출한 쪽이 알 수 있도록 같이 돌려준다.
export function exportHwpx(doc) {
  const report = doc.exportHwpxWithReport();
  const loss = JSON.parse(report.contentLoss());
  return { bytes: report.takeBytes(), loss: loss.losses ?? [] };
}

// 우리 공문서 글꼴 규칙(제목=경기천년제목 Medium, 본문=경기천년바탕 Regular)을 HWPX의 글꼴
// 정의(Contents/header.xml)에 직접 적용한다. rhwp에는 글꼴 이름을 바꾸는 API가 없어서 압축 파일을
// 열어 face 이름만 바꾼다. 바탕/명조 계열은 본문 글꼴로, 그 외(고딕·돋움 등)는 제목 글꼴로 본다.
export async function applyHouseFonts(JSZip, hwpxBytes) {
  const zip = await JSZip.loadAsync(hwpxBytes);
  const file = zip.file('Contents/header.xml');
  if (!file) return hwpxBytes;
  const xml = await file.async('string');
  const isSerif = (face) => /바탕|명조|batang|myeongjo|serif/i.test(face);
  const next = xml.replace(/(<hh:font\b[^>]*\bface=")([^"]*)(")/g, (_m, a, face, c) => {
    if (face === TITLE_FONT || face === BODY_FONT) return a + face + c;
    return a + (isSerif(face) ? BODY_FONT : TITLE_FONT) + c;
  });
  zip.file('Contents/header.xml', next);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// HWP(구형 바이너리)로 올린 템플릿도 HWPX로 바꿔 보관한다.
export function toHwpx(rhwp, bytes) {
  const doc = new rhwp.HwpDocument(new Uint8Array(bytes));
  return exportHwpx(doc);
}
