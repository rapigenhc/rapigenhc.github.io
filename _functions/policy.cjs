const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
const CANCELLED = '예약중복취소';
function timestamp(record) {
    const value = record.createdAt;
    if (typeof value?.seconds === 'number') return [value.seconds, value.nanoseconds || 0];
    const millis = typeof value?.toMillis === 'function' ? value.toMillis() : value instanceof Date ? value.getTime() : NaN;
    return Number.isFinite(millis) ? [Math.floor(millis / 1000), (millis % 1000) * 1e6] : null;
}
function identity(record) {
    const name = String(record.name || '').trim();
    const phone = String(record.phone || '').replace(/[-\s]/g, '');
    const at = timestamp(record);
    if (!name || name.includes('*') || !/^\d{10,11}$/.test(phone) || !at) return null;
    return [name, phone, dayFormatter.format(at[0] * 1000 + Math.floor(at[1] / 1e6))];
}
function phoneVariants(record) {
    const phone = String(record.phone || '').replace(/[-\s]/g, '');
    const formatted = phone.length === 11 ? `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`
        : `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
    return [...new Set([String(record.phone || '').trim(), phone, formatted])];
}
function plan(records, target) {
    const key = identity(target);
    if (!key) return { latest: target, older: [] };
    const group = records.filter(record => JSON.stringify(identity(record)) === JSON.stringify(key));
    group.sort((a, b) => {
        const x = timestamp(a), y = timestamp(b);
        return y[0] - x[0] || y[1] - x[1] || String(b.id).localeCompare(String(a.id), 'en', { numeric: true });
    });
    if (!group.length) return { latest: target, older: [] };
    return { latest: group[0], older: group.slice(1).filter(record => record.status !== CANCELLED) };
}
module.exports = { CANCELLED, identity, phoneVariants, plan };
