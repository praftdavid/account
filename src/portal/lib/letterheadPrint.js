import { esc } from '../../lib/util.js';
import { COMPANY, docNoLabel } from './letterhead.js';
import { openPrintWindow } from './printWindow.js';

// 문서 상세 화면(인라인)과 인쇄 팝업이 이 함수 하나를 공유한다 — 둘 다 "PDF 뷰어처럼 바로
// 읽히는" 같은 서식을 보여줘야 하기 때문에, 마크업을 두 곳에서 따로 만들지 않는다.
export function renderLetterheadBody(doc, deptName) {
  const recipient = doc.recipient?.trim() || (doc.doc_type === '시행문' ? '' : '내부결재');
  const issuerLine = doc.issuer_name?.trim()
    ? `<p style="text-align:right;font-size:14px;margin:20px 0 0;font-weight:bold">${esc(COMPANY.name)}&nbsp;&nbsp;${esc(doc.issuer_name)} (인)</p>`
    : '';

  return `
<p style="text-align:center;font-weight:bold;font-size:13px;margin:0 0 6px">${esc(COMPANY.slogan)}</p>
<h1 style="text-align:center;font-size:26px;letter-spacing:14px;margin:10px 0 6px;font-weight:700">${esc(COMPANY.name)}</h1>
<p style="text-align:right;font-size:13px;font-weight:bold;margin:0 0 18px">[${esc(doc.doc_type)}]</p>

<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:6px">
  <tr><td style="width:70px;padding:4px 0;vertical-align:top">수신 :</td><td style="padding:4px 0">${esc(recipient)}</td></tr>
  <tr><td style="padding:4px 0;vertical-align:top">제목 :</td><td style="padding:4px 0;font-weight:bold">${esc(doc.title)}</td></tr>
</table>
<hr style="border:none;border-top:3px solid #000;margin:6px 0 30px">

<div style="white-space:pre-wrap;line-height:2;font-size:14px;min-height:240px">${esc(doc.body)}</div>
${issuerLine}

<p style="margin-top:${doc.issuer_name?.trim() ? '30' : '60'}px;font-size:14px">수신자 : ${esc(recipient || '(내부)')}</p>

<hr style="border:none;border-top:1px solid #000;margin:24px 0 6px">
<table style="width:100%;font-size:12px">
  <tr>
    <td>시행 : ${esc(deptName)}_${esc(docNoLabel(doc))}</td>
    <td style="text-align:right">접수 :</td>
  </tr>
</table>
<p style="font-size:11px;margin-top:4px;line-height:1.6">
  우 ${esc(COMPANY.zip)}&nbsp;&nbsp;${esc(COMPANY.address)} / 전화 ${esc(COMPANY.phone)} / FAX ${esc(COMPANY.fax)}<br>
  (E-mail : ${esc(COMPANY.email)}) / 공개구분 : ${esc(doc.disclosure ?? '공개')}
</p>`;
}

export function openLetterheadPrint(doc, deptName) {
  openPrintWindow(doc.title, renderLetterheadBody(doc, deptName));
}
