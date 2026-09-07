import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// 상세화면에 이미 그려진 레터헤드/지급회의서 카드(letterheadPrint.js·expenseResolution.js가
// 만든 것과 동일한 마크업)를 그대로 캡처해 PDF로 저장한다 — 브라우저 인쇄창(window.print)에
// 의존하지 않아 팝업 차단이나 인쇄 대화상자 문제 없이 항상 같은 결과가 나온다.
export async function exportElementToPdf(element, filename) {
  // 경기천년바탕 등 @font-face 웹폰트가 비동기로 로드되므로, 다 받아지기 전에 캡처하면
  // 잠깐 대체 폰트로 찍힐 수 있다 — 캡처 직전에 폰트 로딩 완료를 기다린다.
  await document.fonts.ready;
  const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgHeight = (canvas.height * pageWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}
