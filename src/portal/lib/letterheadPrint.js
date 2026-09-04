import { esc } from '../../lib/util.js';
import { COMPANY, SCOPE_LABEL, docNoLabel } from './letterhead.js';

function letterheadBodyHtml(doc, deptName) {
  const scopeLabel = SCOPE_LABEL[doc.doc_scope] ?? SCOPE_LABEL.internal;
  const recipient = doc.recipient?.trim() || (doc.doc_scope === 'external' ? '' : '내부결재');

  return `
<p style="text-align:center;font-weight:bold;font-size:13px;margin:0 0 6px">${esc(COMPANY.slogan)}</p>
<h1 style="text-align:center;font-size:26px;letter-spacing:14px;margin:10px 0 6px;font-weight:700">${esc(COMPANY.name)}</h1>
<p style="text-align:right;font-size:13px;font-weight:bold;margin:0 0 18px">[${esc(scopeLabel)}]</p>

<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:6px">
  <tr><td style="width:70px;padding:4px 0;vertical-align:top">수신 :</td><td style="padding:4px 0">${esc(recipient)}</td></tr>
  <tr><td style="padding:4px 0;vertical-align:top">제목 :</td><td style="padding:4px 0;font-weight:bold">${esc(doc.title)}</td></tr>
</table>
<hr style="border:none;border-top:3px solid #000;margin:6px 0 30px">

<div style="white-space:pre-wrap;line-height:2;font-size:14px;min-height:280px">${esc(doc.body)}</div>

<p style="margin-top:60px;font-size:14px">수신자 : ${esc(recipient || '(내부)')}</p>

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
  const win = window.open('', '_blank');
  if (!win) {
    alert('팝업이 차단되었습니다. 브라우저의 팝업 차단을 해제해주세요.');
    return;
  }
  win.document.write(`<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<title>${esc(doc.title)}</title>
<style>
  body{font-family:'Batang','바탕','Malgun Gothic',serif;margin:0;padding:40px 50px;color:#000}
  .sheet{max-width:800px;margin:0 auto}
  @media print{body{padding:20px 30px}}
</style>
</head><body><div class="sheet">${letterheadBodyHtml(doc, deptName)}</div></body></html>`);
  win.document.close();
  win.onload = () => win.print();
}
