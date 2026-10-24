import { esc } from '../../lib/util.js';
import { COMPANY, implementationNo, FONT_TITLE } from './letterhead.js';

// 문서 상세 화면(인라인)과 인쇄 팝업이 이 함수 하나를 공유한다 — 둘 다 "PDF 뷰어처럼 바로
// 읽히는" 같은 서식을 보여줘야 하기 때문에, 마크업을 두 곳에서 따로 만들지 않는다.
export function renderLetterheadBody(doc, deptName, sealDataUrl = null) {
  const recipient = doc.recipient?.trim() || (doc.doc_type === '시행문' ? '' : '내부결재');
  // 날인된 문서는 "(인)" 글자 대신 이름 끝에 직인 이미지가 살짝 겹치도록 찍는다(PNG는 배경이
  // 투명하게 저장돼 있다). 글자를 가리지 않게 이름 뒤에 빈 자리를 두고 그 한가운데에 얹는다.
  const sealMark = sealDataUrl
    ? `<span style="position:relative;display:inline-block;width:46px;height:1em;vertical-align:baseline"><img src="${sealDataUrl}" alt="직인" style="position:absolute;left:50%;top:50%;width:62px;height:62px;margin:-31px 0 0 -26px"></span>`
    : '(인)';
  const issuerLine = doc.issuer_name?.trim()
    ? `<p style="text-align:right;font-size:14px;margin:${sealDataUrl ? '34px 20px 0 0' : '20px 0 0'};font-weight:bold">${esc(COMPANY.name)}&nbsp;&nbsp;${esc(doc.issuer_name)} ${sealMark}</p>`
    : '';

  // 시행번호·연락처 박스는 본문 길이와 상관없이 문서(A4 비율) 맨 아래에 고정한다 — 본문이 짧다고 박스가
  // 중간에 뜨면 안 된다. 카드 높이를 A4 비율 이상으로 잡고 박스에 margin-top:auto를 준다.
  return `
<div style="display:flex;flex-direction:column;min-height:1040px">
<div>
<p style="text-align:center;font-family:${FONT_TITLE};font-weight:500;font-size:13px;margin:0 0 6px">${esc(COMPANY.slogan)}</p>
<h1 style="text-align:center;font-family:${FONT_TITLE};font-size:26px;letter-spacing:4px;margin:10px 0 18px;font-weight:500">${esc(COMPANY.name)}</h1>

<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:6px">
  <tr><td style="width:70px;padding:4px 0;vertical-align:top">수신 :</td><td style="padding:4px 0">${esc(recipient)}</td></tr>
  <tr><td style="padding:4px 0;vertical-align:top">제목 :</td><td style="padding:4px 0">${esc(doc.title)}</td></tr>
</table>
<hr style="border:none;border-top:3px solid #000;margin:6px 0 30px">

<div style="white-space:pre-wrap;line-height:2;font-size:14px;min-height:240px">${esc(doc.body)}</div>
${issuerLine}

<p style="margin-top:${doc.issuer_name?.trim() ? '30' : '60'}px;font-size:14px">수신자 : ${esc(recipient || '(내부)')}</p>

</div>
<div style="margin-top:auto">
<hr style="border:none;border-top:1px solid #000;margin:24px 0 6px">
<table style="width:100%;font-size:12px">
  <tr>
    <td>시행 : ${esc(implementationNo(doc, deptName))}</td>
  </tr>
</table>
<p style="font-size:11px;margin-top:4px;line-height:1.6">
  우 ${esc(COMPANY.zip)}&nbsp;&nbsp;${esc(COMPANY.address)} / 전화 ${esc(COMPANY.phone)} / FAX ${esc(COMPANY.fax)}<br>
  (E-mail : ${esc(COMPANY.email)}) / 공개구분 : ${esc(doc.disclosure ?? '공개')}
</p>
</div>
</div>`;
}
