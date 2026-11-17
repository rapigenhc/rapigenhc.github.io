(function () {
    'use strict';
    if (window.RapigenAttribution) return;

    const key = 'rapigen_first_touch_v1';
    const cookieKey = 'rapigen_first_touch';
    const defaults = { source: 'direct', medium: '-', campaign: 'none' };
    const aliases = {
        source: ['utm_source', 'source'], medium: ['utm_medium', 'medium', 'utm_medim', 'medim'],
        campaign: ['utm_campaign', 'campaign', 'utm_campain', 'campain']
    };
    const clean = (value, maximum) => Array.from(String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, maximum).join('');
    function cleanParams(values) {
        const result = {};
        if (!values || typeof values !== 'object' || Array.isArray(values)) return result;
        for (const [rawName, rawValue] of Object.entries(values).filter(([name]) => /^utm_/i.test(name)).slice(0, 20)) {
            let name = rawName.toLowerCase();
            if (!/^utm_[a-z0-9_]{1,64}$/.test(name) || typeof rawValue !== 'string') continue;
            if (name === 'utm_medim') name = 'utm_medium';
            if (name === 'utm_campain') name = 'utm_campaign';
            const value = clean(rawValue, name === 'utm_source' || name === 'utm_medium' ? 40 : 200);
            if (value) result[name] = value;
        }
        return result;
    }
    function normalize(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        if (typeof value.source !== 'string' || typeof value.medium !== 'string' || typeof value.campaign !== 'string') return null;
        const tuple = { source: clean(value.source, 40) || defaults.source,
            medium: clean(value.medium, 40) || defaults.medium,
            campaign: clean(value.campaign, 200) || defaults.campaign };
        // Keep existing first-touch records from the earlier storage-only implementation.
        const params = cleanParams(value.params || (value.tagged === true ? {
            utm_source: tuple.source, utm_medium: tuple.medium, utm_campaign: tuple.campaign
        } : {}));
        for (const field of Object.keys(aliases)) {
            if (Object.prototype.hasOwnProperty.call(params, 'utm_' + field)) params['utm_' + field] = tuple[field];
        }
        return { ...tuple, params, tagged: value.tagged === true || Object.keys(params).length > 0 };
    }

    let storage = null;
    let writable = false;
    try {
        storage = window.sessionStorage;
        storage.getItem(key);
    } catch { storage = null; }
    try {
        if (storage) {
            storage.setItem(key + '_probe', '1');
            storage.removeItem(key + '_probe');
            writable = true;
        }
    } catch { /* Existing storage can remain readable even when writes are blocked. */ }

    let first = null;
    try { if (storage) first = normalize(JSON.parse(storage.getItem(key))); } catch {}
    if (!first && !writable) {
        try {
            const raw = document.cookie.split('; ').find(value => value.startsWith(cookieKey + '='))?.slice(cookieKey.length + 1);
            first = normalize(JSON.parse(decodeURIComponent(raw || 'null')));
        } catch { /* Ignore malformed/expired legacy attribution. */ }
    }

    if (!first) {
        const query = new URLSearchParams(window.location.search);
        const entries = {};
        for (const [name, value] of query) {
            if (!Object.prototype.hasOwnProperty.call(entries, name.toLowerCase())) entries[name.toLowerCase()] = value;
        }
        const params = cleanParams(entries);
        const read = field => aliases[field].map(name => entries[name]).find(value => value && value.trim());
        const tagged = Object.keys(params).length > 0 || Object.keys(aliases).some(field => Boolean(read(field)));
        const values = {};
        for (const field of Object.keys(aliases)) {
            let value = read(field);
            if (!tagged && storage) {
                try { value = storage.getItem('rapi_utm_' + field) || storage.getItem('utm_' + field); } catch {}
            }
            values[field] = clean(value, field === 'campaign' ? 200 : 40) || defaults[field];
            if (value && String(value).trim()) params['utm_' + field] = values[field];
        }
        first = normalize({ ...values, params, tagged: tagged || Object.keys(params).length > 0 });
    }

    // Store the complete first-touch tuple once, never mix fields from later URLs.
    try {
        if (writable) {
            storage.setItem(key, JSON.stringify(first));
            for (const field of Object.keys(aliases)) {
                storage.setItem('rapi_utm_' + field, first[field]);
                storage.setItem('utm_' + field, first[field]);
            }
        } else {
            document.cookie = cookieKey + '=' + encodeURIComponent(JSON.stringify(first)) + '; Path=/; SameSite=Lax' + (window.location.protocol === 'https:' ? '; Secure' : '');
        }
    } catch { /* The in-memory snapshot and link fallback remain available. */ }

    const firstPartyHosts = new Set(['reservation.rapigenhc.com', 'rapigenhc.github.io']);
    function withAttribution(href) {
        if (!first.tagged) return href;
        try {
            const url = new URL(href, window.location.href);
            if (!['http:', 'https:'].includes(url.protocol)) return href;
            if (url.origin !== window.location.origin && !firstPartyHosts.has(url.hostname)) return href;
            if (/\/(backoffice|api)(\/|$)/.test(url.pathname)) return href;
            if (!url.pathname.endsWith('/') && !/\.html?$/i.test(url.pathname)) return href;
            const shortNames = new Set(Object.values(aliases).flat().filter(name => !name.startsWith('utm_')));
            for (const name of [...url.searchParams.keys()]) {
                if (/^utm_/i.test(name) || shortNames.has(name.toLowerCase())) url.searchParams.delete(name);
            }
            for (const [name, value] of Object.entries(first.params)) url.searchParams.set(name, value);
            return url.href;
        } catch { return href; }
    }
    function preserveAnchor(link) {
        if (!link || link.hasAttribute('download')) return;
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#')) return;
        const updated = withAttribution(href);
        if (updated !== href) link.setAttribute('href', updated);
    }
    function preserveLink(event) {
        preserveAnchor(event.target.closest?.('a[href]'));
    }
    document.addEventListener('click', preserveLink, true);
    document.addEventListener('auxclick', preserveLink, true);
    document.addEventListener('contextmenu', preserveLink, true);

    window.RapigenAttribution = Object.freeze({
        get: () => ({ source: first.source, medium: first.medium, campaign: first.campaign }),
        getUtmParams: () => ({ ...first.params }),
        gaConfig: () => {
            const fields = { utm_source: 'campaign_source', utm_medium: 'campaign_medium', utm_campaign: 'campaign_name',
                utm_content: 'campaign_content', utm_term: 'campaign_term', utm_id: 'campaign_id' };
            const config = {};
            for (const [name, field] of Object.entries(fields)) {
                if (first.params[name]) config[field] = name === 'utm_medium' && first.params[name] === '-' ? 'none' : first.params[name];
            }
            return config;
        },
        withAttribution
    });

    // Restore the address even after a JS redirect or an older, undecorated HTML link.
    try {
        const address = withAttribution(window.location.href);
        if (address !== window.location.href && window.history?.replaceState) {
            window.history.replaceState(window.history.state, '', address);
        }
    } catch {}

    function preserveLinks(root) {
        if (root?.matches?.('a[href]')) preserveAnchor(root);
        root?.querySelectorAll?.('a[href]').forEach(preserveAnchor);
    }
    function initialiseLinks() {
        preserveLinks(document);
        if (typeof MutationObserver === 'function') {
            const observer = new MutationObserver(changes => {
                for (const change of changes) {
                    if (change.type === 'attributes') preserveLinks(change.target);
                    else change.addedNodes.forEach(preserveLinks);
                }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialiseLinks, { once: true });
    else initialiseLinks();
})();
