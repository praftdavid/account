import * as XLSX from 'xlsx';

// 화면에 이미 렌더링된 <table> DOM 엘리먼트를 그대로 엑셀 시트로 변환해 다운로드한다.
export function exportTableToExcel(table, filename) {
  exportTablesToExcel([table], ['Sheet1'], filename);
}

// 재무상태표처럼 화면이 여러 <table>(좌/우)로 나뉜 경우 시트를 나눠 한 파일로 내려받는다.
export function exportTablesToExcel(tables, sheetNames, filename) {
  const wb = XLSX.utils.book_new();
  tables.forEach((table, i) => {
    const ws = XLSX.utils.table_to_sheet(table);
    XLSX.utils.book_append_sheet(wb, ws, sheetNames[i] ?? `Sheet${i + 1}`);
  });
  XLSX.writeFile(wb, filename);
}

export function exportButtonHtml(id, label = '엑셀 다운로드') {
  return `<button type="button" class="btn ghost sm" id="${id}">${label}</button>`;
}
