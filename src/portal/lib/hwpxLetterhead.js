import { COMPANY, implementationNo, requiresIssuer } from './letterhead.js';
import { applyHouseFonts, exportHwpx } from './hwpxCore.js';

// 서식 없이 화면에서 직접 쓴 기안문·시행문을 공문서 모양(표어·회사명·수신·제목·본문·발송명의인·
// 시행/연락처)의 HWPX로 만든다. 화면 미리보기(letterheadPrint.js)와 같은 내용·순서이고, 글꼴은 hwpxCore의
// 규칙(제목 = 경기천년제목 Medium, 본문 = 경기천년바탕 Regular)을 따른다.

const PT = 100; // rhwp 글자 크기 단위: 1pt = 100
// 문단 앞뒤 간격: rhwp에 넘긴 값의 절반이 HWPX에 저장된다(넘긴 200 → 저장 100, 약 1pt). 그래서 읽기 쉽게
// pt 단위로 적고 넘길 때 ×200으로 바꾼다(1pt = 저장 100 = 넘기는 값 200).
const SP = 200;
const TITLE_MIN = 1300; // 이 크기 이상(표어·회사명·발송명의인)은 제목 글꼴, 그 아래(본문)는 본문 글꼴

function spec(text, o = {}) {
  return { text, align: 'left', size: 12 * PT, before: 0, after: 0, line: 165, ...o };
}

// 정부 공문서 양식처럼 구분선은 가는 실선(0.12mm) 하나씩만 둔다: 제목 아래(머리와 본문 구분), 시행번호 블록 위.
// 문단 테두리가 아니라 표 칸의 테두리로 그린다. 선 굵기 값은 한글 선 굵기 표의 인덱스다.
const THIN = { type: 1, width: 1, color: '#000000' };
const NONE = { type: 0, width: 0, color: '#000000' };

// 위쪽 머리 블록(표어·회사명·수신·제목): 한 칸에 한 줄씩. 선은 제목 아래 한 줄뿐.
export function letterheadHeader(doc) {
  const recipient = doc.recipient?.trim() || (doc.doc_type === '시행문' ? '' : '내부결재');
  return [
    { ...spec(COMPANY.slogan, { align: 'center', size: 13 * PT, line: 130 }), pad: 500, h: 2148 },
    { ...spec(COMPANY.name, { align: 'center', size: 22 * PT, line: 130 }), pad: 500, h: 3614 },
    { ...spec(`수신 : ${recipient}`, { line: 150 }), pad: 450, h: 2331 },
    { ...spec(`제목 : ${doc.title}`, { line: 150 }), bottom: THIN, pad: 450, h: 2331 },
  ];
}

// 본문 + 발송명의인 + 수신자. 빈 줄도 문단이다(본문의 빈 줄 유지). 본문은 줄 간격을 넉넉히(165%) 둔다.
export function letterheadParagraphs(doc, deptName, sealed = false) {
  const recipient = doc.recipient?.trim() || (doc.doc_type === '시행문' ? '' : '내부결재');
  const list = String(doc.body ?? '').split('\n').map((line) => spec(line.replace(/\r$/, '')));
  if (list.length) list[0].before = 16 * SP; // 머리 블록과 본문 사이를 띄운다
  // 외부 발송용(시행문)만 하단에 회사명·발송명의인과 직인(없으면 직인생략)을 둔다. 내부 결재(기안문)는 두지 않는다.
  if (requiresIssuer(doc.doc_type)) list.push(spec(`${COMPANY.name}  ${doc.issuer_name?.trim() ?? ''}${sealed ? '' : '  (직인생략)'}`, { align: 'right', size: 16 * PT, before: 26 * SP, after: 8 * SP, issuerLine: true }));
  list.push(spec(`수신자 : ${recipient || '(내부)'}`, { before: 10 * SP, after: 10 * SP }));
  return list;
}

// 시행번호·연락처 블록은 본문 뒤에 이어 붙이지 않고 쪽 맨 아래에 고정하는(용지 기준) 표로 둔다 — 본문이
// 짧아도 항상 쪽 아래에 있어야 한다. 위에 가는 선 한 줄.
export function letterheadFooter(doc, deptName) {
  return [
    { ...spec(`시행 : ${implementationNo(doc, deptName)}`, { size: 10 * PT, line: 140 }), top: THIN, pad: 350, h: 1848 },
    { ...spec(`우 ${COMPANY.zip}  ${COMPANY.address} / 전화 ${COMPANY.phone} / FAX ${COMPANY.fax}`, { size: 9 * PT, line: 140 }), pad: 150, h: 1748 },
    { ...spec(`(E-mail : ${COMPANY.email}) / 공개구분 : ${doc.disclosure ?? '공개'}`, { size: 9 * PT, line: 140 }), pad: 350, h: 1748 },
  ];
}

// 칸 높이(h)는 한글에서 직접 맞춘 값이다. 한 칸짜리 열(1열) 표를 만들고 칸마다 글자·서식·테두리를 채운다. 표를 둔 문단 번호를 돌려준다.
function fillTable(hwp, at, rows, floating) {
  const made = JSON.parse(
    hwp.createTableEx(JSON.stringify({ sectionIdx: 0, paraIdx: at, charOffset: 0, rowCount: rows.length, colCount: 1, treatAsChar: !floating }))
  );
  const { paraIdx: p, controlIdx: c } = made;
  if (floating) {
    hwp.setTableProperties(
      0,
      p,
      c,
      JSON.stringify({ treatAsChar: false, textWrap: 'TopAndBottom', vertRelTo: 'Paper', vertAlign: 'Bottom', vertOffset: 10491, horzRelTo: 'Page', horzAlign: 'Center' })
    );
  }
  rows.forEach((r, i) => {
    hwp.insertTextInCell(0, p, c, i, 0, 0, r.text);
    hwp.applyParaFormatInCell(0, p, c, i, 0, JSON.stringify({ alignment: r.align, lineSpacing: r.line, spacingBefore: r.before, spacingAfter: r.after }));
    const len = [...r.text].length;
    if (len > 0) hwp.applyCharFormatInCell(0, p, c, i, 0, 0, len, JSON.stringify({ fontSize: r.size, bold: false }));
    // 이웃 칸과 맞닿는 선은 양쪽 칸이 같아야 한쪽 값에 덮이지 않는다.
    const top = r.top ?? rows[i - 1]?.bottom ?? NONE;
    const bottom = r.bottom ?? rows[i + 1]?.top ?? NONE;
    hwp.setCellProperties(
      0,
      p,
      c,
      i,
      JSON.stringify({ borderLeft: NONE, borderRight: NONE, borderTop: top, borderBottom: bottom, height: r.h, paddingTop: r.pad, paddingBottom: r.pad, paddingLeft: 200, paddingRight: 200, verticalAlign: 1 })
    );
  });
  return made;
}

// rhwp가 넣는 그림은 용지 왼쪽 위 기준의 떠 있는 그림(treatAsChar=0, PAPER 기준)이라 문서 맨 위
// 모서리에 찍힌다. 글자처럼 취급(treatAsChar=1)하도록 바꿔 발송명의인 줄 끝에 놓이게 한다.
async function placeSealInline(JSZip, bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const name = 'Contents/section0.xml';
  const file = zip.file(name);
  if (!file) return bytes;
  // 그림(<hp:pic>) 안의 위치만 바꾼다 — 하단 고정 표의 위치(용지 기준)까지 바뀌면 안 된다.
  const inline = (_m, rest) =>
    `<hp:pos treatAsChar="1"${rest.replace('vertRelTo="PAPER"', 'vertRelTo="PARA"').replace('horzRelTo="PAPER"', 'horzRelTo="PARA"')}>`;
  const xml = (await file.async('string')).replace(/<hp:pic[ >][\s\S]*?<\/hp:pic>/g, (pic) => pic.replace(/<hp:pos treatAsChar="0"([^>]*)>/, inline));
  zip.file(name, xml);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export async function buildLetterheadHwpx(rhwp, JSZip, doc, deptName, sealBytes = null) {
  const hwp = rhwp.HwpDocument.createEmpty();
  hwp.createBlankDocument();
  // 쪽 여백(표 너비가 여기서 정해지므로 표를 만들기 전에 먼저). 아래 여백은 하단 고정 블록 자리까지 비워 둔다.
  hwp.setPageDef(
    0,
    JSON.stringify({ ...JSON.parse(hwp.getPageDef(0)), marginLeft: 7000, marginRight: 7000, marginTop: 6000, marginBottom: 8503, marginHeader: 2000, marginFooter: 0 })
  );

  // 1) 머리 블록(표)은 0번 문단에 놓고, 그 뒤로 본문 문단을 이어 붙인다.
  fillTable(hwp, 0, letterheadHeader(doc), false);
  const paras = letterheadParagraphs(doc, deptName, !!sealBytes);
  const first = 1;
  hwp.splitParagraph(0, 0, 1); // 표 글자 자리(1) 뒤에서 나눠야 표가 0번 문단에 남는다
  paras.forEach((p, i) => {
    const idx = first + i;
    if (i > 0) hwp.splitParagraph(0, idx - 1, hwp.getParagraphLength(0, idx - 1));
    if (p.text) hwp.insertText(0, idx, 0, p.text);
  });

  // 2) 본문 문단·글자 서식
  paras.forEach((p, i) => {
    const idx = first + i;
    hwp.applyParaFormat(0, idx, JSON.stringify({ alignment: p.align, lineSpacing: p.line, spacingBefore: p.before, spacingAfter: p.after }));
    const len = hwp.getParagraphLength(0, idx);
    if (len > 0) hwp.applyCharFormat(0, idx, 0, len, JSON.stringify({ fontSize: p.size, bold: false }));
  });

  // 3) 직인: 발송명의인 줄 끝에 그림으로 넣는다(표를 만들기 전에 넣어 문단 번호가 밀리지 않게).
  if (sealBytes) {
    const i = paras.findIndex((p) => p.issuerLine);
    if (i >= 0) {
      const idx = first + i;
      const size = 4600; // 한글 단위(1/7200인치) ≈ 16mm
      hwp.insertPicture(0, idx, hwp.getParagraphLength(0, idx), '', sealBytes, size, size, 200, 200, 'png', '직인');
    }
  }

  // 4) 하단 고정 블록: 마지막 본문 뒤에 닻이 될 빈 문단을 하나 두고 거기에 표를 단다.
  const last = first + paras.length - 1;
  hwp.splitParagraph(0, last, hwp.getParagraphLength(0, last));
  fillTable(hwp, last + 1, letterheadFooter(doc, deptName), true);

  const { bytes, loss } = exportHwpx(hwp);
  const sealed = sealBytes ? await placeSealInline(JSZip, bytes) : bytes;
  const fonted = await applyHouseFonts(JSZip, sealed, { titleAtLeast: TITLE_MIN });
  return { bytes: fonted, loss };
}
