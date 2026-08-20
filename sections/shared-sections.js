(async function () {
    const loaderScript = document.currentScript;
    const root = new URL('.', loaderScript.src);
    const requestedSections = loaderScript.dataset.sharedSections || 'all';
    if (!document.querySelector('link[data-shared-sections-style]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = new URL('shared-sections.css', root).href;
        link.dataset.sharedSectionsStyle = '';
        document.head.appendChild(link);
    }

    const load = async name => {
        const response = await fetch(new URL(name, root));
        if (!response.ok) throw new Error(`${name} 로드 실패: ${response.status}`);
        const template = document.createElement('template');
        template.innerHTML = await response.text();
        return template.content.firstElementChild;
    };
    const findSectionByText = text => Array.from(document.querySelectorAll('section')).find(section => section.textContent.includes(text));

    try {
        if (requestedSections === 'tour') {
            const tour = await load('healthcare-tour.html');
            const placeholder = document.querySelector('[data-shared-section="healthcare-tour"]');
            const oldTour = document.querySelector('.tour-section');
            const oldFacility = findSectionByText('센터 주요 시설') || findSectionByText('센터 주요시설');
            const target = placeholder || oldTour || oldFacility;

            if (target) target.replaceWith(tour);
            else (document.querySelector('main') || document.body).appendChild(tour);

            initTour();
            if (window.AOS) window.AOS.refreshHard();
            return;
        }

        const includeInjections = requestedSections !== 'core';
        const sectionNames = [
            'healthcare-features.html', 'healthcare-tour.html', 'operating-hours.html'
        ];
        if (includeInjections) sectionNames.unshift('healthcare-injections.html');

        const loadedSections = await Promise.all(sectionNames.map(load));
        const [injections, feature, tour, hours] = includeInjections
            ? loadedSections
            : [null, ...loadedSections];
        const main = document.querySelector('main') || document.body;
        const oldFacility = findSectionByText('센터 주요 시설') || findSectionByText('센터 주요시설');
        const oldInjections = document.querySelector('.injection-section');
        const oldFeature = document.querySelector('.feature-carousel-section');
        const featurePlaceholder = document.querySelector('[data-shared-section="healthcare-features"]');
        const oldTour = document.querySelector('.tour-section');
        const oldHours = document.getElementById('location-section');

        if (oldFeature) oldFeature.replaceWith(feature); else if (oldFacility) oldFacility.replaceWith(feature);
        else if (featurePlaceholder) featurePlaceholder.replaceWith(feature); else main.appendChild(feature);
        if (injections) {
            if (oldInjections) oldInjections.replaceWith(injections); else feature.before(injections);
        }
        if (oldTour) oldTour.replaceWith(tour); else feature.after(tour);
        if (oldHours) oldHours.replaceWith(hours); else tour.after(hours);

        if (injections) initInjections();
        initFeature();
        initTour();
        if (window.AOS) window.AOS.refreshHard();
    } catch (error) {
        console.error('[공용 섹션]', error);
    }

    function initInjections() {
        const section = document.querySelector('.injection-section');
        const button = section?.querySelector('.injection-more-button');
        const label = button?.querySelector('.injection-more-label');
        if (!section || !button || !label) return;

        button.addEventListener('click', () => {
            const isCollapsed = section.classList.toggle('is-collapsed');
            button.setAttribute('aria-expanded', String(!isCollapsed));
            label.textContent = isCollapsed ? '수액 메뉴 더보기' : '수액 메뉴 접기';
        });
    }

    function initFeature() {
        const carousel = document.getElementById('feature-carousel');
        const status = document.getElementById('feature-carousel-status');
        if (!carousel || !status) return;
        const cards = Array.from(carousel.querySelectorAll('.feature-card'));
        let index = 0, timer, scrollTimer;
        status.replaceChildren(...cards.map((_, i) => { const dot = document.createElement('span'); dot.className = 'feature-carousel-dot'; dot.setAttribute('aria-label', `${i + 1}번째 특징`); return dot; }));
        const updateActiveCard = next => {
            index = (next + cards.length) % cards.length;
            cards.forEach((card, i) => { card.classList.toggle('is-active', i === index); card.setAttribute('aria-hidden', String(i !== index)); });
            status.querySelectorAll('.feature-carousel-dot').forEach((dot, i) => dot.classList.toggle('is-active', i === index));
        };
        const move = (next, smooth = true) => {
            updateActiveCard(next);
            const card = cards[index];
            carousel.scrollTo({ left: card.offsetLeft - (carousel.clientWidth - card.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
        };
        const activateCenteredCard = () => {
            const viewportCenter = carousel.scrollLeft + carousel.clientWidth / 2;
            let nearestIndex = 0;
            let nearestDistance = Infinity;
            cards.forEach((card, cardIndex) => {
                const cardCenter = card.offsetLeft + card.offsetWidth / 2;
                const distance = Math.abs(cardCenter - viewportCenter);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestIndex = cardIndex;
                }
            });
            updateActiveCard(nearestIndex);
        };
        const start = () => { clearInterval(timer); timer = setInterval(() => move(index + 1), 3000); };
        carousel.addEventListener('pointerdown', () => clearInterval(timer));
        carousel.addEventListener('pointerup', () => {
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(activateCenteredCard, 120);
            start();
        });
        carousel.addEventListener('scroll', () => {
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(activateCenteredCard, 120);
        }, { passive: true });
        window.addEventListener('resize', () => move(index, false));
        requestAnimationFrame(() => { move(0, false); start(); });
    }

    function initTour() {
        const tabs = document.querySelectorAll('.tour-tab');
        const panels = document.querySelectorAll('.tour-panel');
        const setup = panel => {
            if (panel.dataset.sharedInitialized) return;
            panel.dataset.sharedInitialized = 'true';
            const carousel = panel.querySelector('.tour-carousel');
            const cards = Array.from(panel.querySelectorAll('.tour-card'));
            const prev = panel.querySelector('[data-tour-direction="prev"]');
            const next = panel.querySelector('[data-tour-direction="next"]');
            const progress = panel.querySelector('.tour-progress-bar');
            let index = 0;
            const move = target => { index = Math.max(0, Math.min(target, cards.length - 1)); const card = cards[index]; carousel.scrollTo({ left: card.offsetLeft - (carousel.clientWidth - card.offsetWidth) / 2, behavior: 'smooth' }); cards.forEach((item, i) => item.classList.toggle('is-active', i === index)); prev.disabled = index === 0; next.disabled = index === cards.length - 1; progress.style.width = `${(index + 1) / cards.length * 100}%`; };
            prev.addEventListener('click', () => move(index - 1)); next.addEventListener('click', () => move(index + 1)); requestAnimationFrame(() => move(0));
        };
        tabs.forEach(tab => tab.addEventListener('click', () => { tabs.forEach(item => { const active = item === tab; item.classList.toggle('is-active', active); item.setAttribute('aria-selected', String(active)); }); panels.forEach(panel => { const active = panel.dataset.tourPanel === tab.dataset.tourTarget; panel.hidden = !active; if (active) setup(panel); }); }));
        const initial = document.querySelector('.tour-panel:not([hidden])'); if (initial) setup(initial);
    }
})();
