import test from 'node:test';
import assert from 'node:assert/strict';
import { decorateReservationStatuses, reconcileDuplicateReservations } from '../backoffice/reservation-duplicates.js';

const row = (id, time, extra = {}) => ({ id: String(id), name: '김예시', phone: '01000000001',
    createdAt: { seconds: Date.parse(time) / 1000, nanoseconds: 0 }, status: '대기중', ...extra });

function store(items) {
    const records = new Map(items.map(item => [item.id, { ...item }]));
    const commits = [];
    const adapter = {
        reference: String, timestamp: () => 'server-time',
        async transact(callback) {
            const pending = [];
            const count = await callback({
                get: async id => ({ id, exists: () => records.has(id), data: () => ({ ...records.get(id) }) }),
                update: (id, data) => pending.push({ id, data })
            });
            for (const { id, data } of pending) records.set(id, { ...records.get(id), ...data });
            commits.push(pending);
            return count;
        }
    };
    return { records, commits, adapter };
}

test('legacy statuses are normalized before summary filters, exports and identity masking', () => {
    const items = [row(1, '2026-11-27T09:00:00+09:00'),
        row(2, '2026-11-27T10:00:00+09:00'), row(3, '2026-11-27T11:00:00+09:00', { status: '확정' })];
    const normalized = decorateReservationStatuses(items);
    assert.deepEqual(normalized.map(item => item.status), ['예약중복취소', '예약중복취소', '확정']);
    assert.equal(normalized.filter(item => item.status === '대기중').length, 0);
    assert.equal(normalized.filter(item => item.status.includes('취소')).length, 2);
    assert.deepEqual(normalized.map(item => item.canEditStatus), [false, false, true]);
    assert.ok(normalized.every(item => item.latestReservationId === '3' && item.displayGroupId === '1'));
    assert.equal(items[0].status, '대기중');
});

test('dates, exact names/phones, masked identities and Firestore nanoseconds stay independent', () => {
    const at = { seconds: Date.parse('2026-11-26T14:59:59Z') / 1000, nanoseconds: 999999998 };
    const items = [row('z', 'invalid', { createdAt: at }),
        row('a', 'invalid', { createdAt: { ...at, nanoseconds: 999999999 }, status: '본인취소' }),
        row(3, '2026-11-27T00:00:00+09:00', { phone: '010-0000-0001', status: '보류' }),
        row(4, '2026-11-27T00:01:00+09:00', { name: '박예시' }),
        row(5, '2026-11-27T00:02:00+09:00', { phone: '01000000002' }),
        row(6, '2026-11-27T00:03:00+09:00', { name: '김*시', phone: '010-****-0001' }),
        row(7, '2026-11-27T00:04:00+09:00', { name: '김*시', phone: '010-****-0001' })];
    const normalized = new Map(decorateReservationStatuses(items).map(item => [item.id, item]));
    assert.equal(normalized.get('z').status, '예약중복취소');
    assert.equal(normalized.get('a').status, '본인취소');
    assert.equal(normalized.get('3').status, '고민중');
    for (const id of ['4', '5', '6', '7']) assert.equal(normalized.get(id).canEditStatus, true);
});

test('transactions repair stale waiting states, preserve the latest manual status/time and are idempotent', async () => {
    const items = [row(1, '2026-11-27T09:00:00+09:00'), row(2, '2026-11-27T10:00:00+09:00'),
        row(3, '2026-11-27T11:00:00+09:00')];
    const { records, commits, adapter } = store(items);
    records.get('3').status = '확정';
    records.get('2').status = '예약중복취소';
    assert.equal(await reconcileDuplicateReservations(items, adapter), 1);
    assert.deepEqual([...records.values()].map(item => item.status), ['예약중복취소', '예약중복취소', '확정']);
    assert.deepEqual([...records.values()].map(item => item.createdAt), items.map(item => item.createdAt));
    assert.deepEqual(commits.flat().map(change => change.id), ['1']);
    assert.equal(await reconcileDuplicateReservations(items, adapter), 0);
    assert.equal(commits.flat().length, 1);
});

test('a deleted or changed latest identity cannot cancel the remaining valid application', async () => {
    const items = [row(1, '2026-11-27T09:00:00+09:00'), row(2, '2026-11-27T10:00:00+09:00')];
    for (const deleted of [true, false]) {
        const { records, adapter } = store(items);
        if (deleted) records.delete('2');
        else records.get('2').phone = '01000000002';
        assert.equal(await reconcileDuplicateReservations(items, adapter), 0);
        assert.equal(records.get('1').status, '대기중');
    }
});

test('long histories use bounded transactions while preserving the latest application', async () => {
    const items = Array.from({ length: 451 }, (_, i) => row(i, '2026-11-27T09:00:00+09:00'));
    const { records, commits, adapter } = store(items);
    assert.equal(await reconcileDuplicateReservations(items, adapter), 450);
    assert.deepEqual(commits.map(changes => changes.length), [200, 200, 50]);
    assert.equal(records.get('450').status, '대기중');
});
