import JSZip from 'jszip';
import wasmUrl from '@rhwp/core/rhwp_bg.wasm?url';
import { buildLetterheadHwpx } from './hwpxLetterhead.js';
import { BODY_FONT, TITLE_FONT, docText, findPlaceholders, fillPlaceholders, exportHwpx, applyHouseFonts, toHwpx } from './hwpxCore.js';

// rhwp(HWP/HWPX 파서·렌더러, WASM 약 11.8MB)는 한글 문서를 실제로 다룰 때만 내려받는다.
// 앱 기본 번들에는 들어가지 않고, 처음 한 번만 초기화해서 이후엔 재사용한다.
let ready = null;

export function loadRhwp() {
  if (!ready) {
    ready = (async () => {
      const rhwp = await import('@rhwp/core');
      let ctx = null;
      let lastFont = '';
      // rhwp가 줄바꿈을 계산하려고 글자 폭을 물어보는 함수(필수). 화면의 실제 글꼴로 잰다.
      globalThis.measureTextWidth = (font, text) => {
        if (!ctx) ctx = document.createElement('canvas').getContext('2d');
        if (font !== lastFont) {
          ctx.font = font;
          lastFont = font;
        }
        return ctx.measureText(text).width;
      };
      await rhwp.default({ module_or_path: wasmUrl });
      return rhwp;
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

// 글자 폭을 재기 전에 경기천년체 웹폰트가 로드돼 있어야 줄바꿈 위치가 맞는다.
async function ensureFonts() {
  if (!document.fonts) return;
  await Promise.allSettled([document.fonts.load(`400 16px "${BODY_FONT}"`), document.fonts.load(`400 16px "${TITLE_FONT}"`)]);
}

async function openDoc(bytes) {
  const rhwp = await loadRhwp();
  await ensureFonts();
  return new rhwp.HwpDocument(new Uint8Array(bytes));
}

export async function templatePlaceholders(bytes) {
  return findPlaceholders(await openDoc(bytes));
}

// 템플릿의 {{자리표시}}를 값으로 바꿔 HWPX를 만든다. text는 문서 본문 글자(목록·검색용),
// loss는 저장 중 빠진 내용(있으면 호출한 쪽이 사용자에게 알려야 한다), missed는 문서에서 못 찾은 자리표시.
export async function buildHwpxFromTemplate(templateBytes, values) {
  const doc = await openDoc(templateBytes);
  const missed = fillPlaceholders(doc, values);
  const { bytes, loss } = exportHwpx(doc);
  const fonted = await applyHouseFonts(JSZip, bytes);
  const text = docText(await openDoc(fonted)).replace(/[ \t]+\n/g, '\n').trim();
  return { bytes: fonted, loss, missed, text };
}

// 템플릿으로 올린 .hwp/.hwpx를 보관용 HWPX 바이트로 정리한다.
export async function normalizeTemplate(bytes, fileName) {
  if (/\.hwpx$/i.test(fileName)) {
    await openDoc(bytes); // 열리는 파일인지 확인
    return { bytes: new Uint8Array(bytes), loss: [] };
  }
  const rhwp = await loadRhwp();
  await ensureFonts();
  return toHwpx(rhwp, bytes);
}

// 쪽마다 캔버스에 그린다. 캔버스 렌더러는 페이지에 로드된 웹폰트를 그대로 써서
// (SVG를 이미지로 쓰면 웹폰트가 적용되지 않는다) 화면과 PDF 모두 경기천년체가 나온다.
export async function renderPagesToCanvases(bytes, scale = 2) {
  const doc = await openDoc(bytes);
  const canvases = [];
  for (let i = 0; i < doc.pageCount(); i++) {
    const canvas = document.createElement('canvas');
    doc.renderPageToCanvas(i, canvas, scale);
    canvases.push(canvas);
  }
  return canvases;
}

export async function canvasesToPdf(canvases, filename) {
  const { jsPDF } = await import('jspdf');
  let pdf = null;
  for (const canvas of canvases) {
    const wMm = 210;
    const hMm = (canvas.height / canvas.width) * wMm;
    const orientation = hMm >= wMm ? 'p' : 'l';
    if (!pdf) pdf = new jsPDF({ orientation, unit: 'mm', format: [wMm, hMm] });
    else pdf.addPage([wMm, hMm], orientation);
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, wMm, hMm);
  }
  pdf?.save(filename);
}

// 화면에서 직접 쓴 기안문·시행문을 공문서 모양의 HWPX로 만들어 내려받는다. sealDataUrl이 있으면
// (날인된 문서) 발송명의인 줄 끝에 직인 그림을 넣는다.
export async function downloadLetterheadHwpx(doc, deptName, sealDataUrl, filename) {
  const rhwp = await loadRhwp();
  await ensureFonts();
  const sealBytes = sealDataUrl ? new Uint8Array(await (await fetch(sealDataUrl)).arrayBuffer()) : null;
  const { bytes, loss } = await buildLetterheadHwpx(rhwp, JSZip, doc, deptName, sealBytes);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return loss;
}
