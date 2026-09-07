// 사용자가 제공한 기존 공문서 양식(PDF)을 코드로 옮긴 것 — 인쇄/화면 미리보기와 Word 내보내기가
// 이 상수·문구를 공유해서 두 출력물의 문구가 어긋나지 않게 한다.
export const COMPANY = {
  slogan: '"시간을 이기는 투자, 나눔으로 완성되는 성장"',
  name: '주식회사 프래프트',
  zip: '18014',
  address: '경기도 평택시 고덕국제대로 152',
  phone: '010-4262-7242',
  fax: '0504-157-7242',
  email: 'praft.official@gmail.com',
};

// 문서 본문은 공문서 느낌의 바탕체, 슬로건·회사명 같은 표제부는 힘 있는 고딕(견고딕 느낌)으로
// 대비를 준다 — letterheadPrint.js·expenseResolution.js·exportDocx.js가 화면·PDF·Word 세
// 출력물에서 같은 폰트 조합을 쓰도록 여기 한 곳에만 정의한다.
// 경기천년바탕을 웹폰트(style.css @font-face)로 우선 적용한다 — 함초롬바탕은 한컴 번들
// 폰트라 뷰어 PC에 한글이 안 깔려 있으면 안 보이는데, 경기천년바탕은 경기도청이 상업적
// 이용까지 허용해 무료 배포하는 폰트라 웹폰트로 심어두면 누가 봐도 항상 같은 서체로 보인다.
export const FONT_BODY = "'경기천년바탕','함초롬바탕','HCR Batang','Batang','바탕',serif";
export const FONT_TITLE = "'경기천년제목','Pretendard','Malgun Gothic','Apple SD Gothic Neo',sans-serif";

export const DOC_TYPES = ['기안문', '시행문', '지급회의서'];
export const EVIDENCE_TYPES = ['세금계산서', '계산서', '신용카드매출전표', '현금영수증', '기타'];
export const TAX_TREATMENTS = ['손금산입', '접대비', '기타'];

export function docNoLabel(doc) {
  return doc.doc_no ?? '(미상신)';
}

// 발송명의인이 있으면 시행문 성격 — doc_type 자체가 이미 사용자가 고른 값이지만,
// 화면에는 이 규칙을 항상 눈에 보이게 안내한다(폼 쪽 검증에도 같이 씀).
export function requiresIssuer(docType) {
  return docType === '시행문';
}
