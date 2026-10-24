import { COMPANY, docNoLabel } from './letterhead.js';
import { applyHouseFonts, exportHwpx } from './hwpxCore.js';

// 서식 없이 화면에서 직접 쓴 기안문·시행문을 공문서 모양(표어·회사명·수신·제목·본문·발송명의인·
// 시행/연락처)의 HWPX로 만든다. 화면 미리보기(letterheadPrint.js)와 같은 내용·순서이고, 글꼴은 hwpxCore의
// 규칙(제목 = 경기천년제목 Medium, 본문 = 경기천년바탕 Regular)을 따른다.

const PT = 100; // rhwp 글자 크기 단위: 1pt = 100
const TITLE_MIN = 1200; // 이 크기 이상(표어·회사명)은 제목 글꼴, 그 아래(본문)는 본문 글꼴

function spec(text, o = {}) {
  return { text, align: 'left', size: 11 * PT, before: 0, after: 0, line: 160, ...o };
}

// 문서 내용을 문단 목록으로 푼다. 빈 줄도 문단이다(본문의 빈 줄 유지).
export function letterheadParagraphs(doc, deptName) {
  const recipient = doc.recipient?.trim() || (doc.doc_type === '시행문' ? '' : '내부결재');
  const issuer = doc.issuer_name?.trim();
  const list = [
    spec(COMPANY.slogan, { align: 'center', size: 12 * PT, after: 200 }),
    spec(COMPANY.name, { align: 'center', size: 20 * PT, after: 1000 }),
    spec(`수신 : ${recipient}`, { after: 200 }),
    // 굵은 줄: 제목 문단의 아래 테두리
    spec(`제목 : ${doc.title}`, { after: 600, border: 'bottom-heavy' }),
    ...String(doc.body ?? '').split('\n').map((line) => spec(line.replace(/\r$/, ''), { line: 200 })),
  ];
  if (issuer) list.push(spec(`${COMPANY.name}  ${issuer}`, { align: 'right', before: 1200, after: 400, issuerLine: true }));
  list.push(spec(`수신자 : ${recipient || '(내부)'}`, { before: 800, after: 800 }));
  list.push(spec(`시행 : ${deptName}_${docNoLabel(doc)}`, { size: 9 * PT, border: 'top-thin' }));
  list.push(spec(`우 ${COMPANY.zip}  ${COMPANY.address} / 전화 ${COMPANY.phone} / FAX ${COMPANY.fax}`, { size: 8 * PT }));
  list.push(spec(`(E-mail : ${COMPANY.email}) / 공개구분 : ${doc.disclosure ?? '공개'}`, { size: 8 * PT }));
  return list;
}

// 선 굵기 값은 rhwp(한글) 선 굵기 표의 인덱스다. 테두리는 네 변을 모두 명시해야 한다 — 한 변만
// 주면 나머지 변도 선이 그려져 문단이 상자처럼 보인다.
const NONE = { type: 0, width: 0, color: '#000000' };
const border = (side, line) => ({ borderLeft: NONE, borderRight: NONE, borderTop: NONE, borderBottom: NONE, [`border${side}`]: line });
const BORDERS = {
  'bottom-heavy': border('Bottom', { type: 1, width: 7, color: '#000000' }),
  'top-thin': border('Top', { type: 1, width: 1, color: '#000000' }),
};

// rhwp가 넣는 그림은 용지 왼쪽 위 기준의 떠 있는 그림(treatAsChar=0, PAPER 기준)이라 문서 맨 위
// 모서리에 찍힌다. 글자처럼 취급(treatAsChar=1)하도록 바꿔 발송명의인 줄 끝에 놓이게 한다.
async function placeSealInline(JSZip, bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const name = 'Contents/section0.xml';
  const file = zip.file(name);
  if (!file) return bytes;
  const xml = (await file.async('string')).replace(/<hp:pos treatAsChar="0"([^>]*)>/g, (_m, rest) =>
    `<hp:pos treatAsChar="1"${rest.replace('vertRelTo="PAPER"', 'vertRelTo="PARA"').replace('horzRelTo="PAPER"', 'horzRelTo="PARA"')}>`
  );
  zip.file(name, xml);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export async function buildLetterheadHwpx(rhwp, JSZip, doc, deptName, sealBytes = null) {
  const hwp = rhwp.HwpDocument.createEmpty();
  hwp.createBlankDocument();
  const paras = letterheadParagraphs(doc, deptName);

  // 1) 글자 넣기: 문단을 끝에서 나눠 가며 채운다.
  paras.forEach((p, i) => {
    if (i > 0) hwp.splitParagraph(0, i - 1, hwp.getParagraphLength(0, i - 1));
    if (p.text) hwp.insertText(0, i, 0, p.text);
  });

  // 2) 문단·글자 서식
  paras.forEach((p, i) => {
    hwp.applyParaFormat(
      0,
      i,
      JSON.stringify({ alignment: p.align, lineSpacing: p.line, spacingBefore: p.before, spacingAfter: p.after, ...(BORDERS[p.border] ?? {}) })
    );
    const len = hwp.getParagraphLength(0, i);
    if (len > 0) hwp.applyCharFormat(0, i, 0, len, JSON.stringify({ fontSize: p.size, bold: false }));
  });

  // 3) 직인: 발송명의인 줄 끝에 그림으로 넣는다.
  if (sealBytes) {
    const idx = paras.findIndex((p) => p.issuerLine);
    if (idx >= 0) {
      const size = 4600; // 한글 단위(1/7200인치) ≈ 16mm
      hwp.insertPicture(0, idx, hwp.getParagraphLength(0, idx), '', sealBytes, size, size, 200, 200, 'png', '직인');
    }
  }

  const { bytes, loss } = exportHwpx(hwp);
  const sealed = sealBytes ? await placeSealInline(JSZip, bytes) : bytes;
  const fonted = await applyHouseFonts(JSZip, sealed, { titleAtLeast: TITLE_MIN });
  return { bytes: fonted, loss };
}
