// 사용자가 제공한 기존 공문서 양식(PDF)을 코드로 옮긴 것 — 인쇄/화면 미리보기와 Word 내보내기가
// 이 상수·문구를 공유해서 두 출력물의 문구가 어긋나지 않게 한다.
export const COMPANY = {
  slogan: '"시간을 이기는 투자, 나눔으로 완성되는 성장"',
  name: '주식회사 프래프트',
  zip: '18014',
  address: '경기도 평택시 고덕국제대로 152',
  phone: '010-4262-7242',
  fax: '',
  email: 'praft.official@gmail.com',
};

export const DOC_TYPES = ['기안문', '시행문', '지급회의서'];

export function docNoLabel(doc) {
  return doc.doc_no ?? '(미상신)';
}

// 발송명의인이 있으면 시행문 성격 — doc_type 자체가 이미 사용자가 고른 값이지만,
// 화면에는 이 규칙을 항상 눈에 보이게 안내한다(폼 쪽 검증에도 같이 씀).
export function requiresIssuer(docType) {
  return docType === '시행문';
}
