// HWPX 템플릿 처리의 순수 로직. rhwp 모듈·JSZip을 인자로 받아서 브라우저와 Node 양쪽에서 같은
// 코드로 시험할 수 있다(Vite 전용 import는 hwpx.js 쪽에만 둔다).

export const TITLE_FONT = '경기천년제목 Medium';
// 한글 글꼴 목록의 이름은 굵기까지 붙은 형태다(제목 "경기천년제목 Medium", 본문 "경기천년바탕 Regular").
// 이름이 한 글자라도 다르면 한글이 못 찾고 기본 바탕체로 바꿔 보여준다.
export const BODY_FONT = '경기천년바탕 Regular';

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

// 우리 공문서 글꼴 규칙(제목 = 경기천년제목 Medium, 본문 = 경기천년바탕 Regular)을 HWPX에 적용한다.
// rhwp에는 글꼴을 바꾸는 API가 없어서 압축 파일을 열어 header.xml(글꼴·글자모양 정의)을 직접 고친다.
//
// 글꼴 "이름"으로 제목/본문을 가르면 안 된다 — rhwp가 내보낸 HWPX는 거의 모든 글자모양이 같은
// 글꼴 번호(0)를 가리켜서, 이름 기준으로 바꾸면 본문까지 전부 제목체가 된다. 그래서 역할로 나눈다:
//   · 글자가 실제로 들어 있는 글자모양 중 크기가 가장 큰 것 = 문서 제목 → 경기천년제목 Medium
//   · 나머지 전부 = 본문 → 경기천년바탕
// 모든 글자가 같은 크기면 제목이 따로 없는 문서로 보고 전부 본문 글꼴로 둔다.
// Medium/Regular는 굵기라서, 굵게(bold) 표시는 빼야 서식이 의도한 굵기로 나온다(stripBold).
export async function applyHouseFonts(JSZip, hwpxBytes, { stripBold = true } = {}) {
  const zip = await JSZip.loadAsync(hwpxBytes);
  const headerFile = zip.file('Contents/header.xml');
  if (!headerFile) return hwpxBytes;
  let xml = await headerFile.async('string');

  const used = new Set();
  for (const name of Object.keys(zip.files)) {
    if (!/^Contents\/section\d+\.xml$/.test(name)) continue;
    const section = await zip.file(name).async('string');
    for (const m of section.matchAll(/<hp:run charPrIDRef="(\d+)">([\s\S]*?)<\/hp:run>/g)) {
      if (/<hp:t[^>]*>[^<]*\S/.test(m[2])) used.add(m[1]);
    }
  }
  const heights = new Map();
  for (const m of xml.matchAll(/<hh:charPr id="(\d+)"[^>]*\bheight="(\d+)"/g)) heights.set(m[1], Number(m[2]));
  const usedHeights = [...used].map((id) => heights.get(id)).filter((h) => h != null);
  const maxH = Math.max(...usedHeights, 0);
  const minH = Math.min(...usedHeights, Infinity);
  const titleIds = new Set(maxH > minH ? [...used].filter((id) => heights.get(id) === maxH) : []);

  const fontBlock = (lang) =>
    `<hh:fontface lang="${lang}" fontCnt="2">` +
    `<hh:font id="0" face="${TITLE_FONT}" type="TTF" isEmbedded="0"><hh:typeInfo familyType="FCAT_GOTHIC" weight="5" proportion="0" contrast="0" strokeVariation="0" armStyle="0" letterform="0" midline="0" xHeight="0"/></hh:font>` +
    `<hh:font id="1" face="${BODY_FONT}" type="TTF" isEmbedded="0"><hh:typeInfo familyType="FCAT_MYUNGJO" weight="5" proportion="0" contrast="0" strokeVariation="0" armStyle="0" letterform="0" midline="0" xHeight="0"/></hh:font>` +
    `</hh:fontface>`;
  xml = xml.replace(/<hh:fontface lang="(\w+)"[^>]*>[\s\S]*?<\/hh:fontface>/g, (_m, lang) => fontBlock(lang));

  xml = xml.replace(/<hh:charPr id="(\d+)"([\s\S]*?)<\/hh:charPr>/g, (_m, id, rest) => {
    const ref = titleIds.has(id) ? 0 : 1;
    let body = rest.replace(/<hh:fontRef [^/]*\/>/, `<hh:fontRef hangul="${ref}" latin="${ref}" hanja="${ref}" japanese="${ref}" other="${ref}" symbol="${ref}" user="${ref}"/>`);
    if (stripBold) body = body.replace(/<hh:bold\/>/g, '');
    return `<hh:charPr id="${id}"${body}</hh:charPr>`;
  });

  zip.file('Contents/header.xml', xml);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// HWP(구형 바이너리)로 올린 템플릿도 HWPX로 바꿔 보관한다.
export function toHwpx(rhwp, bytes) {
  const doc = new rhwp.HwpDocument(new Uint8Array(bytes));
  return exportHwpx(doc);
}
