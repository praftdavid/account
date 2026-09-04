import { esc } from '../../lib/util.js';

// 문서 종류별 인쇄 미리보기(letterheadPrint.js, expenseResolution.js)가 공유하는 팝업 창 로직.
export function openPrintWindow(title, bodyHtml) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('팝업이 차단되었습니다. 브라우저의 팝업 차단을 해제해주세요.');
    return;
  }
  win.document.write(`<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<title>${esc(title)}</title>
<style>
  body{font-family:'Batang','바탕','Malgun Gothic',serif;margin:0;padding:40px 50px;color:#000}
  .sheet{max-width:800px;margin:0 auto}
  @media print{body{padding:20px 30px}}
</style>
</head><body><div class="sheet">${bodyHtml}</div></body></html>`);
  win.document.close();
  win.onload = () => win.print();
}
