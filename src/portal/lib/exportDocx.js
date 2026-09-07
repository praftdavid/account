import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } from 'docx';
import { fmt } from '../../lib/util.js';
import { COMPANY, docNoLabel } from './letterhead.js';

// 화면(letterheadPrint.js·expenseResolution.js는 FONT_BODY/FONT_TITLE 사용)과 같은 톤으로,
// 본문은 공문서 느낌의 경기천년바탕, 슬로건·회사명 표제부는 견고딕으로 대비를 준다.
// Word는 CSS 웹폰트를 못 쓰고 열람자 PC에 설치된 폰트만 쓸 수 있다 — 두 폰트 다 무료
// 배포라 화면(웹폰트)보다는 설치율이 낮을 수 있고, 없으면 워드가 알아서 대체 폰트로 보여준다.
const FONT_BODY = '경기천년바탕';
const FONT_TITLE = '경기천년바탕';

// 인쇄/화면 미리보기(letterheadPrint.js·expenseResolution.js)와 같은 내용·구조를 Word(.docx)로
// 다시 만든다. 글자간격은 docx의 letter-spacing 지원이 불안정해서, 한글자씩 띄어써서 맞춘다.
function spacedOut(text) {
  return text.split('').join(' ');
}

function hr() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: '000000' } },
    spacing: { after: 200 },
  });
}

async function downloadDocx(children, filename) {
  const wordDoc = new Document({
    styles: { default: { document: { run: { font: FONT_BODY } } } },
    sections: [{ children }],
  });
  const blob = await Packer.toBlob(wordDoc);

  const url = URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportDocumentToDocx(doc, deptName) {
  const recipient = doc.recipient?.trim() || (doc.doc_type === '시행문' ? '' : '내부결재');

  const bodyParagraphs = doc.body.split('\n').map(
    (line) => new Paragraph({ children: [new TextRun({ text: line || ' ', size: 22 })], spacing: { line: 400 } })
  );

  const issuerParagraphs = doc.issuer_name?.trim()
    ? [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: `${COMPANY.name}  ${doc.issuer_name} (인)`, bold: true, size: 22 })],
          spacing: { before: 400, after: 200 },
        }),
      ]
    : [];

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: COMPANY.slogan, font: FONT_TITLE, size: 20 })],
      spacing: { after: 100 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: spacedOut(COMPANY.name), font: FONT_TITLE, size: 36 })],
      spacing: { after: 300 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `수신 : ${recipient}`, size: 22 })],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `제목 : ${doc.title}`, size: 22 })],
      spacing: { after: 100 },
    }),
    hr(),
    ...bodyParagraphs,
    ...issuerParagraphs,
    new Paragraph({ text: '', spacing: { after: issuerParagraphs.length ? 200 : 600 } }),
    new Paragraph({
      children: [new TextRun({ text: `수신자 : ${recipient || '(내부)'}`, size: 22 })],
      spacing: { after: 400 },
    }),
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: '000000' } },
      spacing: { after: 100 },
      children: [new TextRun({ text: `시행 : ${deptName}_${docNoLabel(doc)}`, size: 18 })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `우 ${COMPANY.zip}  ${COMPANY.address} / 전화 ${COMPANY.phone} / FAX ${COMPANY.fax}`,
          size: 16,
        }),
      ],
    }),
    new Paragraph({
      children: [new TextRun({ text: `(E-mail : ${COMPANY.email}) / 공개구분 : ${doc.disclosure ?? '공개'}`, size: 16 })],
    }),
  ];

  await downloadDocx(children, `${doc.doc_no ?? doc.title}.docx`);
}

function infoRow(label, value) {
  return new Paragraph({
    children: [new TextRun({ text: `${label} : ${value}`, size: 22 })],
    spacing: { after: 100 },
  });
}

export async function exportExpenseResolutionToDocx(doc, deptName, accountLabel) {
  const bodyParagraphs = doc.body.split('\n').map(
    (line) => new Paragraph({ children: [new TextRun({ text: line || ' ', size: 22 })], spacing: { line: 400 } })
  );

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: COMPANY.slogan, font: FONT_TITLE, size: 20 })],
      spacing: { after: 100 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: spacedOut(COMPANY.name), font: FONT_TITLE, size: 32 })],
      spacing: { after: 300 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: doc.title, bold: true, size: 26 })],
      spacing: { after: 300 },
    }),
    infoRow('기안부서', deptName),
    infoRow('기안자', doc.drafter_email),
    infoRow('계정과목', accountLabel || '(미지정)'),
    infoRow('지출일자', doc.expense_date ?? ''),
    infoRow('지출금액', `${fmt(doc.expense_amount)}원`),
    infoRow('지출처', doc.payee ?? ''),
    infoRow('증빙유형', doc.evidence_type ?? ''),
    infoRow('세무처리', doc.tax_treatment ?? ''),
    hr(),
    new Paragraph({
      children: [new TextRun({ text: '지출 사유 및 내용', bold: true, size: 22 })],
      spacing: { after: 100 },
    }),
    ...bodyParagraphs,
    new Paragraph({ text: '', spacing: { after: 400 } }),
    new Paragraph({
      children: [new TextRun({ text: `문서번호 : ${deptName}_${docNoLabel(doc)}`, size: 18 })],
    }),
  ];

  await downloadDocx(children, `${doc.doc_no ?? doc.title}.docx`);
}
