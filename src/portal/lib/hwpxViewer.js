import { renderPagesToCanvases, canvasesToPdf } from './hwpx.js';

// HWP/HWPX 첨부를 화면 위에 띄워 쪽별로 보여준다. 읽기 전용이며 [PDF 저장]으로 내려받을 수 있다.
export async function openHwpxViewer(bytes, fileName) {
  const overlay = document.createElement('div');
  overlay.className = 'hwp-viewer';
  overlay.innerHTML = `
    <div class="hwp-viewer-bar">
      <b class="hwp-viewer-title"></b>
      <span class="hwp-viewer-status note"></span>
      <button class="btn sm" data-pdf disabled>PDF 저장</button>
      <button class="btn ghost sm" data-close>닫기</button>
    </div>
    <div class="hwp-viewer-body"><p class="note" style="text-align:center">문서를 불러오는 중…</p></div>`;
  overlay.querySelector('.hwp-viewer-title').textContent = fileName;
  document.body.appendChild(overlay);
  const body = overlay.querySelector('.hwp-viewer-body');
  const statusEl = overlay.querySelector('.hwp-viewer-status');
  const pdfBtn = overlay.querySelector('[data-pdf]');
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (ev) => ev.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  overlay.querySelector('[data-close]').onclick = close;

  try {
    const canvases = await renderPagesToCanvases(bytes, 2);
    body.innerHTML = '';
    canvases.forEach((c, i) => {
      c.className = 'hwp-page';
      c.setAttribute('aria-label', `${i + 1}쪽`);
      body.appendChild(c);
    });
    statusEl.textContent = `${canvases.length}쪽`;
    pdfBtn.disabled = false;
    pdfBtn.onclick = async () => {
      pdfBtn.disabled = true;
      try {
        await canvasesToPdf(canvases, fileName.replace(/\.hwpx?$/i, '') + '.pdf');
      } catch (err) {
        alert('PDF 생성 실패: ' + err.message);
      }
      pdfBtn.disabled = false;
    };
  } catch (err) {
    body.innerHTML = `<p class="err" style="text-align:center">문서를 열지 못했습니다: ${String(err.message ?? err).replace(/[<>&]/g, '')}</p>`;
  }
}
