import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } from 'docx';
import { COMPANY, docNoLabel } from './letterhead.js';

// 인쇄/화면 미리보기(letterheadPrint.js)와 같은 내용·구조를 Word(.docx)로 다시 만든다.
// 글자간격은 docx의 letter-spacing 지원이 불안정해서, 한글자씩 띄어써서 시각적으로 맞춘다.
function spacedOut(text) {
  return text.split('').join(' ');
}

function hr() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: '000000' } },
    spacing: { after: 200 },
  });
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
      children: [new TextRun({ text: COMPANY.slogan, bold: true, size: 20 })],
      spacing: { after: 100 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: spacedOut(COMPANY.name), bold: true, size: 36 })],
      spacing: { after: 100 },
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: `[${doc.doc_type}]`, bold: true, size: 22 })],
      spacing: { after: 300 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `수신 : ${recipient}`, size: 22 })],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `제목 : ${doc.title}`, bold: true, size: 22 })],
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

  const wordDoc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(wordDoc);

  const url = URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = url;
  a.download = `${doc.doc_no ?? doc.title}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
