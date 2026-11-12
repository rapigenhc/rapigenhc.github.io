const test = require('node:test');
const assert = require('node:assert/strict');
const { plan, identity, phoneVariants, CANCELLED } = require('./policy.cjs');
const at = time => ({ seconds: Date.parse(time) / 1000, nanoseconds: 0 });
const row = (id, time, extra = {}) => ({ id, name: '김예시', phone: '01000000001', createdAt: at(time), status: '대기중', ...extra });
test('three requests cancel the first two while late/repeated events keep the true newest', () => {
    const rows = [row('a', '2026-11-12T09:00:00+09:00'), row('b', '2026-11-12T10:00:00+09:00'), row('c', '2026-11-12T11:00:00+09:00')];
    for (const target of [rows[2], rows[0], rows[1]]) {
        const result = plan(rows, target);
        assert.equal(result.latest.id, 'c');
        for (const previous of result.older) previous.status = CANCELLED;
    }
    assert.deepEqual(rows.map(item => item.status), [CANCELLED, CANCELLED, '대기중']);
    assert.equal(plan(rows, rows[0]).older.length, 0);
});
test('both identity fields and the Korean calendar date must match', () => {
    const target = row('a', '2026-11-11T15:00:00Z');
    const rows = [target, row('b', '2026-11-11T14:59:59Z'), row('c', '2026-11-12T01:00:00Z', { name: '박예시' }), row('d', '2026-11-12T01:00:00Z', { phone: '01000000002' })];
    assert.equal(plan(rows, target).latest.id, 'a');
    assert.equal(plan(rows, target).older.length, 0);
    assert.equal(identity({ ...target, name: '김*시' }), null);
    assert.equal(identity({ ...target, phone: '010-****-0001' }), null);
});
test('formatting and nanosecond timestamps preserve the correct identity and newest order', () => {
    const a = row('z', '2026-11-12T10:00:00+09:00');
    const b = { ...a, id: 'a', phone: '010-0000-0001', createdAt: { ...a.createdAt, nanoseconds: 1000 } };
    assert.equal(plan([a, b], a).latest.id, 'a');
    assert.ok(phoneVariants(a).includes(b.phone));
});
