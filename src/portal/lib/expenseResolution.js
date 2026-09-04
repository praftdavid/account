import { esc, fmt } from '../../lib/util.js';
import { COMPANY, docNoLabel } from './letterhead.js';
import { openPrintWindow } from './printWindow.js';

// 지급회의서는 기안문/시행문의 공문서 레터헤드와 성격이 달라(대외 발송용이 아니라 내부 지출
// 승인용) 별도 서식을 쓴다 — 회계 계정과목·지출처·금액·증빙유형·세무처리를 표로 보여준다.
export function renderExpenseResolutionBody(doc, deptName, accountLabel) {
  return `
<p style="text-align:center;font-weight:bold;font-size:13px;margin:0 0 6px">${esc(COMPANY.slogan)}</p>
<h1 style="text-align:center;font-size:22px;letter-spacing:10px;margin:10px 0 6px;font-weight:700">${esc(COMPANY.name)}</h1>
<p style="text-align:right;font-size:13px;font-weight:bold;margin:0 0 18px">[지급회의서]</p>

<h2 style="text-align:center;font-size:18px;margin:0 0 20px">${esc(doc.title)}</h2>

<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
  <tr>
    <th style="width:110px;text-align:left;background:#f2f4f6;padding:8px 10px;border:1px solid #ccc">기안부서</th>
    <td style="padding:8px 10px;border:1px solid #ccc">${esc(deptName)}</td>
    <th style="width:110px;text-align:left;background:#f2f4f6;padding:8px 10px;border:1px solid #ccc">기안자</th>
    <td style="padding:8px 10px;border:1px solid #ccc">${esc(doc.drafter_email)}</td>
  </tr>
  <tr>
    <th style="text-align:left;background:#f2f4f6;padding:8px 10px;border:1px solid #ccc">계정과목</th>
    <td style="padding:8px 10px;border:1px solid #ccc">${esc(accountLabel || '(미지정)')}</td>
    <th style="text-align:left;background:#f2f4f6;padding:8px 10px;border:1px solid #ccc">지출금액</th>
    <td style="padding:8px 10px;border:1px solid #ccc;font-weight:bold">${fmt(doc.expense_amount)}원</td>
  </tr>
  <tr>
    <th style="text-align:left;background:#f2f4f6;padding:8px 10px;border:1px solid #ccc">지출처</th>
    <td style="padding:8px 10px;border:1px solid #ccc">${esc(doc.payee ?? '')}</td>
    <th style="text-align:left;background:#f2f4f6;padding:8px 10px;border:1px solid #ccc">증빙유형</th>
    <td style="padding:8px 10px;border:1px solid #ccc">${esc(doc.evidence_type ?? '')}</td>
  </tr>
  <tr>
    <th style="text-align:left;background:#f2f4f6;padding:8px 10px;border:1px solid #ccc">세무처리</th>
    <td style="padding:8px 10px;border:1px solid #ccc" colspan="3">${esc(doc.tax_treatment ?? '')}</td>
  </tr>
</table>

<p style="font-size:14px;font-weight:bold;margin:0 0 6px">지출 사유 및 내용</p>
<hr style="border:none;border-top:2px solid #000;margin:0 0 16px">
<div style="white-space:pre-wrap;line-height:2;font-size:14px;min-height:160px">${esc(doc.body)}</div>

<hr style="border:none;border-top:1px solid #000;margin:30px 0 6px">
<table style="width:100%;font-size:12px">
  <tr><td>문서번호 : ${esc(deptName)}_${esc(docNoLabel(doc))}</td></tr>
</table>
<p class="note" style="font-size:11px;margin-top:6px">증빙서류는 아래 첨부파일로 확인하세요.</p>`;
}

export function openExpensePrint(doc, deptName, accountLabel) {
  openPrintWindow(doc.title, renderExpenseResolutionBody(doc, deptName, accountLabel));
}
