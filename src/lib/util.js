export function fmt(n) {
  const v = Number(n) || 0;
  if (v === 0) return '-';
  return v < 0 ? `(${Math.abs(v).toLocaleString()})` : v.toLocaleString();
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// 금액 입력칸에 입력하는 즉시 천단위 콤마를 붙여준다(재무 데이터라 자릿수 파악이 중요).
// type="number"는 브라우저가 콤마 표시를 허용하지 않으므로, type="text" input에 붙여 쓰고
// 실제 숫자값을 읽을 때는 parseThousands로 콤마를 다시 벗겨낸다.
export function wireThousandsInput(input) {
  const reformat = () => {
    const oldPos = input.selectionStart;
    const digitsBeforeCursor = input.value.slice(0, oldPos).replace(/[^\d]/g, '').length;
    const digits = input.value.replace(/[^\d]/g, '');
    input.value = digits ? Number(digits).toLocaleString() : '';
    let count = 0;
    let newPos = input.value.length;
    if (digitsBeforeCursor === 0) {
      newPos = 0;
    } else {
      for (let i = 0; i < input.value.length; i++) {
        if (/\d/.test(input.value[i])) count++;
        if (count === digitsBeforeCursor) { newPos = i + 1; break; }
      }
    }
    input.setSelectionRange(newPos, newPos);
  };
  input.addEventListener('input', reformat);
}

export function parseThousands(str) {
  return Number(String(str ?? '').replace(/,/g, '')) || 0;
}
