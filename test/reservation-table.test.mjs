import test from 'node:test';
import assert from 'node:assert/strict';
import { groupReservations, paginateReservationGroups, renderReservationTable, formatReservationTime } from '../backoffice/reservation-table.js';

const row = (id, time, extra = {}) => ({ id: String(id), name: '김예시', phone: '01000000001',
    createdAt: Date.parse(time), package: '종합검진 상담', pageName: 'program.html',
    source: 'homepage', medium: 'direct', status: '대기중', ...extra });

test('identity requires both name and phone on the same Korean calendar day', () => {
    const items = [row(1, '2026-11-11T15:00:00Z'), row(2, '2026-11-12T01:00:00Z', { phone: '010-0000-0001' }),
        row(3, '2026-11-11T14:59:59Z'), row(4, '2026-11-12T02:00:00Z', { name: '박예시' }),
        row(5, '2026-11-12T03:00:00Z', { phone: '01000000002' })];
    const groups = groupReservations(items);
    assert.equal(groups.length, 4);
    assert.deepEqual(groups.find(g => g.records.length === 2).records.map(r => r.id), ['1', '2']);
    assert.equal(formatReservationTime(items[0]), '2026.11.12. 00:00:00');
    assert.equal(formatReservationTime({ createdAt: { seconds: items[0].createdAt / 1000 } }), '2026.11.12. 00:00:00');
});

test('masked and missing identities stay separate; trusted display IDs preserve pre-mask grouping', () => {
    const a = row(1, '2026-09-12T10:00:00+09:00', { name: '김*시', phone: '010-****-0001' });
    const b = { ...a, id: '2' };
    assert.equal(groupReservations([a, b]).length, 2);
    assert.equal(groupReservations([{ ...a, displayGroupId: '1' }, { ...b, displayGroupId: '1' }]).length, 1);
    assert.equal(groupReservations([{ ...a, name: '', phone: '' }, { ...b, name: '', phone: '' }]).length, 2);
    assert.equal(groupReservations([row(1, 'invalid'), row(2, 'invalid')]).length, 2);
});

test('pagination retains a complete interleaved history rather than cutting at ten raw records', () => {
    const items = Array.from({ length: 23 }, (_, i) => row(i + 1, `2026-11-12T10:${String(i).padStart(2, '0')}:00+09:00`));
    for (let i = 0; i < 11; i++) items.push(row(100 + i, '2026-11-12T11:00:00+09:00', { name: `예시${i}` }));
    const pages = [1, 2].map(page => paginateReservationGroups(items, page));
    assert.equal(pages[0].totalPages, 2);
    assert.equal(pages[0].groupTotal, 12);
    assert.equal(pages.flatMap(page => page.items).length, items.length);
    assert.equal(new Set(pages.flatMap(page => page.items.map(r => r.id))).size, items.length);
    const historyPage = pages.find(page => page.items.some(r => r.id === '1'));
    assert.equal(historyPage.items.filter(r => r.name === '김예시').length, 23);
});

test('table retains every timestamp, original controls, changed fields and escaped content', () => {
    const container = { innerHTML: '' };
    const items = [row(3, '2026-11-12T13:05:40+09:00', { package: '프리미엄 검진', pageName: 'national.html', source: 'naver', medium: 'cpc' }),
        row(1, '2026-11-12T09:12:05+09:00'),
        row(2, '2026-11-12T10:24:18+09:00', { package: '프리미엄 검진', source: 'naver', medium: 'cpc' })];
    renderReservationTable(container, items, { selection: true });
    const html = container.innerHTML;
    assert.equal((html.match(/reservation-change-label/g) || []).length, 4);
    assert.equal((html.match(/reservation-unchanged/g) || []).length, 4);
    assert.equal((html.match(/class="reservation-checkbox"/g) || []).length, 3);
    assert.equal((html.match(/class="status-select /g) || []).length, 3);
    assert.equal((html.match(/rowspan="3"/g) || []).length, 2);
    for (const item of items) {
        assert.ok(html.includes(`data-id="${item.id}"`));
        assert.ok(html.includes(formatReservationTime(item)));
    }
    assert.ok(html.indexOf('09:12:05') < html.indexOf('10:24:18'));
    renderReservationTable(container, [row('x" onfocus="bad', '2026-11-12T10:00:00+09:00', { package: '<img src=x onerror=bad>' })]);
    assert.ok(!container.innerHTML.includes('<img'));
    assert.ok(container.innerHTML.includes('&lt;img'));
    assert.ok(!container.innerHTML.includes('class="reservation-checkbox"'));
    renderReservationTable(container, [], { selection: true });
    assert.ok(container.innerHTML.includes('colspan="9"'));
});
