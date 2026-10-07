// 신청일 기준 2026년 4~8월 고객정보는 한국시간으로 익명 처리합니다.
const START = Date.parse('2026-04-01T00:00:00+09:00');
const END = Date.parse('2026-09-01T00:00:00+09:00');

export function maskName(name) {
    const chars = Array.from(String(name ?? '').trim());
    if (!chars.length) return '-';
    if (chars.length === 1) return '*';
    if (chars.length === 2) return `${chars[0]}*`;
    return `${chars[0]}${'*'.repeat(chars.length - 2)}${chars.at(-1)}`;
}

export function maskPhone(phone) {
    const value = String(phone ?? '').trim();
    if (!value) return '-';
    // 이미 처리된 번호를 다시 가려도 뒷자리가 변하지 않도록 유지합니다.
    if (/^\d{2,3}-\*{4}-\d{4}$/.test(value)) return value;
    const digits = value.replace(/\D/g, '');
    if (/^\d{10,11}$/.test(digits)) {
        return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
    }
    // 예상하지 못한 형식은 원문을 노출하지 않습니다.
    return '****';
}

export function anonymizeReservation(data) {
    const timestamp = data.createdAt;
    const millis = typeof timestamp?.toMillis === 'function'
        ? timestamp.toMillis()
        : typeof timestamp?.seconds === 'number' ? timestamp.seconds * 1000 : NaN;
    if (millis >= START && millis < END) {
        return { ...data, name: maskName(data.name), phone: maskPhone(data.phone) };
    }
    return data;
}
