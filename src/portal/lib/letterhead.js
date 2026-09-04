// 사용자가 제공한 기존 공문서 양식(PDF)을 코드로 옮긴 것 — 인쇄 미리보기(HTML)와 Word 내보내기가
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

export const SCOPE_LABEL = { internal: '기안문', external: '시행문' };

export function docNoLabel(doc) {
  return doc.doc_no ?? '(미상신)';
}
