(function () {
    'use strict';
    if (window.RapigenAttribution) return;

    const key = 'rapigen_first_touch_v1';
    const cookieKey = 'rapigen_first_touch';
    const defaults = { source: 'direct', medium: '-', campaign: 'none' };
    const aliases = {
        source: ['utm_source', 'source'], medium: ['utm_medium', 'medium'],
        campaign: ['utm_campaign', 'campaign', 'utm_campain', 'campain']
    };
    const clean = (value, maximum) => Array.from(String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, maximum).join('');
    function normalize(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        if (typeof value.source !== 'string' || typeof value.medium !== 'string' || typeof value.campaign !== 'string') return null;
        return { source: clean(value.source, 40) || defaults.source,
            medium: clean(value.medium, 40) || defaults.medium,
            campaign: clean(value.campaign, 200) || defaults.campaign, tagged: value.tagged === true };
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
        const params = new URLSearchParams(window.location.search);
        const read = field => aliases[field].map(name => params.get(name)).find(value => value && value.trim());
        const tagged = Object.keys(aliases).some(field => Boolean(read(field)));
        const values = {};
        for (const field of Object.keys(aliases)) {
            let value = read(field);
            if (!tagged && storage) {
                try { value = storage.getItem('rapi_utm_' + field) || storage.getItem('utm_' + field); } catch {}
            }
            values[field] = clean(value, field === 'campaign' ? 200 : 40) || defaults[field];
        }
        first = normalize({ ...values, tagged: tagged || values.source !== defaults.source || values.medium !== defaults.medium || values.campaign !== defaults.campaign });
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
        try {
            const url = new URL(href, window.location.href);
            if (!['http:', 'https:'].includes(url.protocol)) return href;
            if (url.origin !== window.location.origin && !firstPartyHosts.has(url.hostname)) return href;
            if (/\/(backoffice|api)(\/|$)/.test(url.pathname)) return href;
            if (!url.pathname.endsWith('/') && !/\.html?$/i.test(url.pathname)) return href;
            for (const field of Object.keys(aliases)) {
                for (const name of aliases[field]) url.searchParams.delete(name);
                url.searchParams.set('utm_' + field, first[field]);
            }
            return url.href;
        } catch { return href; }
    }
    function preserveLink(event) {
        const link = event.target.closest?.('a[href]');
        if (!link || link.hasAttribute('download')) return;
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#')) return;
        try {
            const destination = new URL(href, window.location.href);
            const newContext = link.target === '_blank' || event.ctrlKey || event.metaKey || event.button === 1 || event.type === 'contextmenu';
            if (!writable || destination.origin !== window.location.origin || newContext) {
                link.setAttribute('href', withAttribution(href));
            }
        } catch {}
    }
    document.addEventListener('click', preserveLink, true);
    document.addEventListener('auxclick', preserveLink, true);
    document.addEventListener('contextmenu', preserveLink, true);

    window.RapigenAttribution = Object.freeze({
        get: () => ({ source: first.source, medium: first.medium, campaign: first.campaign }),
        gaConfig: () => first.tagged ? {
            campaign_source: first.source, campaign_medium: first.medium === '-' ? 'none' : first.medium,
            campaign_name: first.campaign
        } : {},
        withAttribution
    });
})();
