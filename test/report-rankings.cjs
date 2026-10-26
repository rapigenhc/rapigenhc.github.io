const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

// Keep date navigation and initial values consistent with the Korean dashboard.
process.env.TZ = 'Asia/Seoul';
const root = path.resolve(__dirname, '..');

async function main() {
    const source = fs.readFileSync(path.join(root, 'backoffice/report-rankings.js'), 'utf8');
    const { buildWeeklyRankings, RANKING_DIMENSIONS } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const repeat = (count, fields) => Array.from({ length: count }, () => ({ ...fields }));
    const current = [
        ...repeat(9, { package: 'F' }), ...repeat(8, { package: '신규' }),
        ...repeat(7, { package: 'A' }), ...repeat(6, { package: 'B' }),
        ...repeat(5, { package: 'C' }), ...repeat(4, { package: 'D' })
    ];
    const previous = ['A', 'B', 'C', 'D', 'E', 'F'].flatMap((name, i) => repeat(10 - i, { package: name }));
    const ranking = buildWeeklyRankings(current, previous)[0];
    assert.deepEqual(ranking.thisWeek.map(item => item.name), ['F', '신규', 'A', 'B', 'C']);
    assert.deepEqual(ranking.lastWeek.map(item => item.name), ['A', 'B', 'C', 'D', 'E']);
    assert.equal(ranking.thisWeek[0].otherRank, 6, 'compare against full ranking, including outside TOP 5');
    assert.equal(ranking.thisWeek[0].rankChange, 5);
    assert.equal(ranking.thisWeek[0].countChange, 4);
    assert.equal(ranking.thisWeek[1].otherRank, null);
    assert.equal(ranking.thisWeek[1].otherCount, 0);
    assert.equal(ranking.thisWeek[2].rankChange, -2);
    assert.equal(ranking.thisWeek[2].countChange, -3);
    assert.equal(ranking.lastWeek[4].otherRank, null, 'comparison-only item stays visible');

    const fallbacks = buildWeeklyRankings([
        { source: ' ', utm_source: 'naver', medium: 'cpc', pageName: '예약' },
        { source: 'naver', utm_source: 'ignored', utm_medium: 'cpc', medium: 'ignored', pageName: '예약' },
        { source: '__proto__', package: '<img src=x onerror=alert(1)>' },
        { source: 'constructor' }, {}
    ], []);
    assert.equal(fallbacks[1].thisWeek.find(item => item.name === '예약').count, 2);
    assert.equal(fallbacks[2].thisWeek.find(item => item.name === 'naver').count, 2);
    assert.equal(fallbacks[2].thisWeek.find(item => item.name === '__proto__').count, 1);
    assert.equal(fallbacks[2].thisWeek.find(item => item.name === 'direct').count, 1);
    assert.equal(fallbacks[3].thisWeek.find(item => item.name === 'cpc').count, 2);
    assert.equal(fallbacks[0].thisWeek[0].name, '미선택');
    assert.equal(fallbacks[3].thisWeek[0].name, '미지정');
    assert.ok(buildWeeklyRankings([], []).every(item => !item.thisWeek.length && !item.lastWeek.length));
    const tied = buildWeeklyRankings([{ package: 'B' }, { package: 'A' }], [{ package: 'A' }, { package: 'B' }])[0];
    assert.deepEqual(tied.thisWeek.map(item => item.name), ['A', 'B']);
    assert.ok(tied.thisWeek.every(item => item.rankChange === 0 && item.countChange === 0));

    class Element {
        constructor(tag = 'div') {
            this.tagName = tag;
            this.children = [];
            this.value = '';
            this.textContent = '';
            this.attributes = {};
            this.classList = { add() {}, remove() {}, contains() { return false; } };
        }
        appendChild(child) { this.children.push(child); return child; }
        replaceChildren(...children) { this.children = children; }
        setAttribute(key, value) { this.attributes[key] = value; }
        addEventListener() {}
        getContext() { return {}; }
    }
    const elements = new Map();
    const get = id => {
        if (!elements.has(id)) {
            const element = new Element();
            element.id = id;
            elements.set(id, element);
        }
        return elements.get(id);
    };
    const text = node => [node.textContent, ...node.children.map(text)].join(' ');
    let records = [];
    let capturedRankings;
    const charts = [];
    const timestamp = input => {
        const millis = Date.parse(input);
        return { seconds: Math.floor(millis / 1000), nanoseconds: (millis % 1000) * 1e6, toDate: () => new Date(millis) };
    };
    const record = (time, fields = {}) => ({ createdAt: timestamp(time), ...fields });
    const RealDate = Date;
    class MorningDate extends RealDate {
        constructor(...args) { super(...(args.length ? args : ['2026-10-26T00:30:00+09:00'])); }
    }
    const context = {
        Date: MorningDate, console, setTimeout,
        document: { getElementById: get, createElement: tag => new Element(tag), addEventListener() {}, body: { style: {} } },
        window: {},
        alert(message) { throw new Error(message); },
        initializeApp: () => ({}), getAuth: () => ({}), getFirestore: () => ({}), onAuthStateChanged() {},
        anonymizeReservation: data => data,
        RANKING_DIMENSIONS,
        buildWeeklyRankings: (...args) => (capturedRankings = buildWeeklyRankings(...args)),
        Chart: Object.assign(function(ctx, config) { charts.push(config); this.destroy = () => {}; }, { defaults: { font: {} } }),
        flatpickr(selector, config) {
            const element = get(selector.slice(1));
            return {
                element,
                formatDate: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
                setDate(dates, trigger) { if (trigger) config.onChange(dates, '', this); }
            };
        },
        collection: (db, name) => name,
        query: (collection, ...conditions) => ({ conditions }),
        where: (field, op, date) => ({ field, op, date }),
        Timestamp: { fromDate: date => date },
        async getDocs(query) {
            const filtered = records.filter(record => query.conditions.every(condition => {
                const time = BigInt(record.createdAt.seconds) * 1000000000n + BigInt(record.createdAt.nanoseconds);
                const boundary = BigInt(condition.date.getTime()) * 1000000n;
                return condition.op === '>=' ? time >= boundary : time < boundary;
            }));
            return { docs: filtered.map((item, id) => ({ id: String(id), data: () => item })) };
        }
    };
    vm.createContext(context);
    const reportSource = fs.readFileSync(path.join(root, 'backoffice/report.js'), 'utf8').replace(/^import .*;\r?\n/gm, '');
    vm.runInContext(reportSource, context);
    vm.runInContext('initDateInputs()', context);
    assert.equal(get('thisWeekStart').value, '2026-10-20', 'initial range uses Korean local day even before 09:00');
    assert.equal(get('thisWeekEnd').value, '2026-10-26');
    context.window.shiftWeek('this', -1);
    assert.equal(get('thisWeekStart').value, '2026-10-13');
    assert.equal(get('thisWeekEnd').value, '2026-10-19');
    context.window.shiftWeek('this', 1);
    context.window.shiftWeek('last', -1);
    assert.equal(get('lastWeekStart').value, '2026-10-06');
    context.window.shiftWeek('last', 1);

    records = [
        record('2026-10-20T00:00:00+09:00', { package: '기준', utm_source: 'naver', medium: 'cpc' }),
        record('2026-10-26T23:59:59.999+09:00', { package: '기준', source: 'naver' }),
        record('2026-10-13T00:00:00+09:00', { package: '비교' }),
        record('2026-10-19T23:59:59.999+09:00', { package: '비교' }),
        record('2026-10-27T00:00:00+09:00', { package: '다음날 제외' }),
        ...repeat(30, record('2026-10-01T12:00:00+09:00', { package: '전체 누적 제외' }))
    ];
    // Firestore's final sub-millisecond timestamp must also pass the exclusive query boundary.
    records[1].createdAt.nanoseconds = 999999999;
    records[1].createdAt.toDate = () => new RealDate('2026-10-26T23:59:59.999+09:00');
    await vm.runInContext('buildReportData()', context);
    assert.equal(get('stat-this-week').innerText, '2건');
    assert.equal(capturedRankings[0].thisWeek[0].name, '기준');
    assert.equal(capturedRankings[0].thisWeek[0].count, 2);
    assert.equal(capturedRankings[0].lastWeek[0].count, 2);
    assert.equal(capturedRankings[2].thisWeek[0].count, 2);
    assert.equal(charts.at(-1).data.datasets[0].data[0], 2, 'channel doughnut shares source fallback');
    assert.equal(charts.at(-2).data.labels.length, 7);
    assert.equal(get('weeklyRankings').children.length, 4);
    assert.match(text(get('weeklyRankings')), /2026-10-20 ~ 2026-10-26/);
    assert.match(text(get('weeklyRankings')), /신규 · \+2건/);
    assert.doesNotMatch(text(get('weeklyRankings')), /전체 누적 제외|다음날 제외/);

    get('lastWeekStart').value = get('thisWeekStart').value;
    get('lastWeekEnd').value = get('thisWeekEnd').value;
    await vm.runInContext('buildReportData()', context);
    assert.equal(capturedRankings[0].lastWeek[0].count, 2, 'overlapping weeks are aggregated independently');
    assert.match(text(get('weeklyRankings')), /순위 유지 · 0건/);
    assert.equal(get('weeklyRankings').children.length, 4, 'reaggregation replaces old cards');

    records = [];
    await vm.runInContext('buildReportData()', context);
    assert.equal(get('weeklyRankings').children.length, 4);
    assert.equal(text(get('weeklyRankings')).match(/해당 주간 신청 데이터가 없습니다\./g).length, 8);

    // Untrusted category names are assigned as text, never parsed as HTML.
    context.unsafeRankings = fallbacks;
    vm.runInContext('renderWeeklyRankings(unsafeRankings)', context);
    assert.match(text(get('weeklyRankings')), /<img src=x onerror=alert\(1\)>/);
    const walk = node => [node, ...node.children.flatMap(walk)];
    assert.ok(walk(get('weeklyRankings')).every(node => node.tagName !== 'img'));
    console.log('Weekly rankings: TOP 5, full-rank changes, field fallbacks, ties, safe rendering, local dates, week navigation, period boundaries, overlapping weeks and empty states passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
