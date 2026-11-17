const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../attribution.js'), 'utf8');
function page(href, state = {}, mode = 'normal') {
    const values = state.values ||= new Map();
    const jar = state.jar ||= new Map();
    const handlers = {};
    const nodes = [];
    const document = { readyState: 'loading', documentElement: {}, querySelectorAll: () => nodes, addEventListener: (type, listener) => { handlers[type] = listener; } };
    Object.defineProperty(document, 'cookie', {
        get() { if (mode === 'blocked') throw Error('blocked'); return [...jar].map(([k, v]) => `${k}=${v}`).join('; '); },
        set(value) { if (mode === 'blocked') throw Error('blocked'); const first = value.split(';')[0], at = first.indexOf('='); jar.set(first.slice(0, at), first.slice(at + 1)); }
    });
    const storage = {
        getItem: key => { if (mode === 'blocked' || mode === 'cookie') throw Error('blocked'); return values.get(key) ?? null; },
        setItem: (key, value) => { if (mode !== 'normal') throw Error('blocked'); values.set(key, value); },
        removeItem: key => values.delete(key)
    };
    const historyCalls = [];
    const window = { location: new URL(href), sessionStorage: storage };
    window.history = { state: {}, replaceState(_state, _title, value) { historyCalls.push(value); window.location = new URL(value); } };
    let observer;
    class FakeObserver { constructor(callback) { this.callback = callback; observer = this; } observe() {} }
    const context = vm.createContext({ window, document, URL, URLSearchParams, MutationObserver: FakeObserver });
    vm.runInContext(source, context);
    const get = () => JSON.parse(JSON.stringify(window.RapigenAttribution.get()));
    return { get, window, document, context, state, handlers, nodes, historyCalls, get observer() { return observer; } };
}
const initial = 'https://reservation.rapigenhc.com/index.html?utm_source=Naver&utm_medium=cpc&utm_campaign=November_Check';
const expected = { source: 'Naver', medium: 'cpc', campaign: 'November_Check' };
test('all three values survive multiple menus, refreshes, and later conflicting UTM URLs', () => {
    const state = {};
    for (const href of [initial, 'https://reservation.rapigenhc.com/program.html', 'https://reservation.rapigenhc.com/ambulatorycare.html?utm_source=google&utm_medium=email&utm_campaign=later']) {
        const current = page(href, state);
        assert.deepEqual(current.get(), expected);
        assert.equal(state.values.get('rapi_utm_campaign'), 'November_Check');
    }
});
test('direct and incomplete entries remain a single first-touch tuple', () => {
    let state = {};
    page('https://rapigenhc.github.io/index.html', state);
    assert.deepEqual(page('https://rapigenhc.github.io/program.html?utm_source=naver&utm_medium=cpc', state).get(), { source: 'direct', medium: '-', campaign: 'none' });
    state = {};
    page('https://rapigenhc.github.io/index.html?utm_source=naver', state);
    assert.deepEqual(page('https://rapigenhc.github.io/program.html?utm_medium=cpc&utm_campaign=second', state).get(), { source: 'naver', medium: '-', campaign: 'none' });
});
test('new visits start independently, legacy keys migrate, aliases and case are retained', () => {
    assert.deepEqual(page(initial).get(), expected);
    assert.deepEqual(page('https://rapigenhc.github.io/?source=Partner&medium=QR&campain=Winter_Promo').get(), { source: 'Partner', medium: 'QR', campaign: 'Winter_Promo' });
    const state = { values: new Map([['utm_source', 'legacy'], ['utm_medium', 'email'], ['utm_campaign', 'Legacy_Campaign']]) };
    assert.deepEqual(page('https://rapigenhc.github.io/index.html', state).get(), { source: 'legacy', medium: 'email', campaign: 'Legacy_Campaign' });
    assert.equal(page('https://rapigenhc.github.io/index.html?utm_campain=Typo').get().campaign, 'Typo');
    const campaign = 'A' + '😀'.repeat(201);
    const saved = page('https://rapigenhc.github.io/?utm_campaign=' + encodeURIComponent(campaign)).get().campaign;
    assert.equal(Array.from(saved).length, 200);
    assert.doesNotThrow(() => encodeURIComponent(saved));
});

test('Firebase inline-form adapter and family export both save the first tuple', async t => {
    const root = path.join(__dirname, '..');
    const adapterPath = path.join(root, 'reservation-api.js');
    if (!fs.existsSync(adapterPath)) { t.skip('PHP site does not use the Firebase adapter'); return; }
    for (const type of ['adapter', 'family']) {
        const current = page(initial);
        current.window.location = new URL('https://rapigenhc.github.io/rapigen-family.html?utm_source=later');
        let saved;
        Object.assign(current.context, {
            initializeApp: () => ({}), getApps: () => [], getApp: () => ({}),
            getFirestore: () => ({}), collection: () => ({}), serverTimestamp: () => null,
            addDoc: async (_, data) => { saved = data; },
            localStorage: { setItem() {} }, escapeHTML: value => value, sendEmailNotification() {}, console
        });
        current.window.emailjs = { send: async () => ({ status: 200 }) };
        let code;
        if (type === 'adapter') code = fs.readFileSync(adapterPath, 'utf8').replace(/^import .*\n/gm, '').replace('export async function', 'async function');
        else {
            const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
            code = 'const db = {};\n' + script.slice(script.indexOf('export async function submitFamilyReservation')).replace('export async function', 'async function');
        }
        vm.runInContext(code, current.context);
        const input = { name: '김예시', phone: '01000000001', package: '가상 상담', pageName: 'index.html', source: 'later', medium: 'email', campaign: 'Wrong' };
        if (type === 'adapter') await current.context.submitReservation('/api/reservations.php', { body: JSON.stringify(input) });
        else await current.context.submitFamilyReservation(input);
        for (const field of ['source', 'medium', 'campaign']) assert.equal(saved[field], expected[field], type + ':' + field);
    }
});
test('blocked storage uses a session cookie; readable full storage still preserves its first record', () => {
    const state = {};
    page(initial, state, 'cookie');
    assert.deepEqual(page('https://reservation.rapigenhc.com/program.html', state, 'cookie').get(), expected);
    const existing = {};
    page(initial, existing);
    assert.deepEqual(page('https://reservation.rapigenhc.com/program.html', existing, 'read-only').get(), expected);
});
test('fully blocked storage still carries attribution through first-party links and preserves unrelated parameters/hash', () => {
    const current = page(initial, {}, 'blocked');
    const href = current.window.RapigenAttribution.withAttribution('/program.html?item=check&source=other#booking');
    const url = new URL(href);
    assert.equal(url.searchParams.get('item'), 'check');
    assert.equal(url.searchParams.get('source'), null);
    assert.equal(url.hash, '#booking');
    assert.deepEqual(page(href, {}, 'blocked').get(), expected);
    for (const external of ['https://example.com/program.html', 'mailto:test@example.invalid', 'tel:15445189', '/api/reservations.php', '/backoffice/index.html', '/files/guide.pdf']) {
        assert.equal(current.window.RapigenAttribution.withAttribution(external), external);
    }
});
test('every ordinary HTML click, new tab and first-party cross-origin link carries the first tuple', () => {
    const current = page(initial);
    function click(href, extra = {}, type = 'click') {
        let value = href;
        const link = { target: '', hasAttribute: () => false, getAttribute: () => value, setAttribute: (_, next) => { value = next; } };
        Object.assign(link, extra);
        current.handlers[type]({ target: { closest: () => link }, type, button: 0 });
        return value;
    }
    assert.equal(new URL(click('/program.html')).searchParams.get('utm_source'), 'Naver');
    assert.equal(new URL(click('/program.html')).searchParams.get('utm_campaign'), 'November_Check');
    assert.ok(click('/program.html', { target: '_blank' }).includes('utm_campaign=November_Check'));
    assert.ok(click('/program.html', {}, 'contextmenu').includes('utm_source=Naver'));
    assert.ok(click('https://rapigenhc.github.io/national.html').includes('utm_medium=cpc'));
    assert.equal(click('#booking'), '#booking');
    const snapshot = current.window.RapigenAttribution.get(); snapshot.source = 'mutated';
    vm.runInContext(source, current.context);
    assert.deepEqual(current.get(), expected);
});
test('GA uses the saved first tuple and does not force organic/direct visits to a campaign', () => {
    const current = page(initial);
    assert.deepEqual(JSON.parse(JSON.stringify(current.window.RapigenAttribution.gaConfig())), { campaign_source: 'Naver', campaign_medium: 'cpc', campaign_name: 'November_Check' });
    assert.deepEqual(JSON.parse(JSON.stringify(page('https://rapigenhc.github.io/').window.RapigenAttribution.gaConfig())), {});
});
test('all original UTM fields travel together, replacing later UTM values but preserving destination filters/hash', () => {
    const current = page(initial + '&utm_content=Hero_A&utm_term=건강검진&utm_id=ad_42');
    const url = new URL(current.window.RapigenAttribution.withAttribution('/national.html?package=premium&utm_source=wrong&utm_content=Later&utm_extra=Not_First#booking'));
    assert.equal(url.searchParams.get('utm_source'), 'Naver');
    assert.equal(url.searchParams.get('utm_medium'), 'cpc');
    assert.equal(url.searchParams.get('utm_campaign'), 'November_Check');
    assert.equal(url.searchParams.get('utm_content'), 'Hero_A');
    assert.equal(url.searchParams.get('utm_term'), '건강검진');
    assert.equal(url.searchParams.get('utm_id'), 'ad_42');
    assert.equal(url.searchParams.get('utm_extra'), null);
    assert.equal(url.searchParams.get('package'), 'premium');
    assert.equal(url.hash, '#booking');
    const copy = current.window.RapigenAttribution.getUtmParams(); copy.utm_source = 'changed';
    assert.equal(current.window.RapigenAttribution.getUtmParams().utm_source, 'Naver');
});
test('restores the visible address after a plain HTML redirect and retains legacy first-touch records', () => {
    const state = {};
    page(initial, state);
    const next = page('https://reservation.rapigenhc.com/program.html?package=a&utm_source=wrong#booking', state);
    assert.equal(next.window.location.search.includes('utm_source=Naver'), true);
    assert.equal(next.window.location.search.includes('utm_campaign=November_Check'), true);
    assert.equal(next.window.location.search.includes('package=a'), true);
    assert.equal(next.window.location.hash, '#booking');
    assert.equal(next.historyCalls.length, 1);
    const legacy = { values: new Map([['rapigen_first_touch_v1', JSON.stringify({ source: 'Partner', medium: 'qr', campaign: 'Saved', tagged: true })]]) };
    const restored = page('https://rapigenhc.github.io/injection.html?utm_source=wrong', legacy);
    assert.equal(restored.window.location.search.includes('utm_source=Partner'), true);
    assert.equal(restored.window.location.search.includes('utm_campaign=Saved'), true);
});
test('updates normal DOM links before clicks and dynamically inserted or changed banner/footer links', () => {
    const current = page(initial);
    function anchor(href, download = false) {
        return { href, writes: 0, matches: () => true, querySelectorAll: () => [], hasAttribute: name => name === 'download' && download,
            getAttribute() { return this.href; }, setAttribute(_name, value) { this.href = value; this.writes++; } };
    }
    const menu = anchor('program.html?package=a#booking');
    const external = anchor('https://example.com/program.html');
    const download = anchor('national.html', true);
    current.nodes.push(menu, external, download);
    current.handlers.DOMContentLoaded();
    assert.equal(new URL(menu.href).searchParams.get('utm_campaign'), 'November_Check');
    assert.equal(external.href, 'https://example.com/program.html');
    assert.equal(download.href, 'national.html');
    const banner = anchor('ambulatorycare.html');
    current.observer.callback([{ type: 'childList', addedNodes: [banner] }]);
    assert.equal(new URL(banner.href).searchParams.get('utm_medium'), 'cpc');
    banner.href = 'injection.html?utm_source=Later';
    current.observer.callback([{ type: 'attributes', target: banner }]);
    assert.equal(new URL(banner.href).searchParams.get('utm_source'), 'Naver');
    const writes = banner.writes;
    current.observer.callback([{ type: 'attributes', target: banner }]);
    assert.equal(banner.writes, writes, 'Observer must stop after the URL is already correct');
});
test('missing UTM fields are not filled from the next page and ordinary direct visits get no fabricated UTM', () => {
    const current = page('https://rapigenhc.github.io/?utm_source=naver');
    const url = new URL(current.window.RapigenAttribution.withAttribution('program.html?utm_medium=email&utm_campaign=Later'));
    assert.equal(url.searchParams.get('utm_source'), 'naver');
    assert.equal(url.searchParams.get('utm_medium'), null);
    assert.equal(url.searchParams.get('utm_campaign'), null);
    assert.equal(page('https://rapigenhc.github.io/').window.RapigenAttribution.withAttribution('program.html'), 'program.html');
    assert.deepEqual(page('https://rapigenhc.github.io/?utm_source=naver&utm_medim=cpc&utm_campain=First').get(), { source: 'naver', medium: 'cpc', campaign: 'First' });
});
test('every public document captures before its forms and no inline form writes URL-only attribution', () => {
    const root = path.join(__dirname, '..');
    for (const name of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
        const html = fs.readFileSync(path.join(root, name), 'utf8');
        if (!/<head[\s>]/i.test(html)) continue;
        assert.ok(html.includes('attribution.js?v=20261117-2'), name);
        assert.ok(html.indexOf('attribution.js') < html.indexOf('</head>'), name);
        assert.ok(!/source:\s*query\.get\("utm_source"\)/.test(html), name);
        if (/source:\s*window.RapigenAttribution/.test(html)) assert.ok(html.includes('campaign: window.RapigenAttribution.get().campaign'), name);
    }
});
