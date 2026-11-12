const zone = 'Asia/Seoul';
const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});
const statuses = ['대기중', '고민중', '부재', '확정', '미응답', '본인취소', '예약중복취소', '기타취소'];
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

export function reservationTime(item) {
    const value = item.createdAt;
    if (value == null || value === '') return null;
    const time = typeof value?.toMillis === 'function' ? value.toMillis()
        : typeof value?.seconds === 'number' ? value.seconds * 1000
        : value instanceof Date ? value.getTime()
        : typeof value === 'number' ? value : Date.parse(value);
    return Number.isFinite(time) ? time : null;
}

function parts(time) {
    return Object.fromEntries(dateParts.formatToParts(time).map(part => [part.type, part.value]));
}

export function formatReservationTime(item) {
    const time = reservationTime(item);
    if (time === null) return '-';
    const p = parts(time);
    return `${p.year}.${p.month}.${p.day}. ${p.hour}:${p.minute}:${p.second}`;
}

export function groupReservations(items) {
    const groups = new Map();
    items.forEach((item, index) => {
        const name = String(item.name ?? '').trim();
        const phone = String(item.phone ?? '').replace(/[-\s]/g, '');
        const time = reservationTime(item);
        const p = time === null ? null : parts(time);
        // Masked values cannot establish identity. Use the server/raw-data group ID when supplied.
        const identity = name && /^\d{10,11}$/.test(phone) && !name.includes('*') && p
            ? [p.year, p.month, p.day, name, phone] : ['record', index];
        const key = JSON.stringify(item.displayGroupId ? ['group', item.displayGroupId] : identity);
        if (!groups.has(key)) groups.set(key, { records: [] });
        groups.get(key).records.push(item);
    });
    return [...groups.values()].map(group => {
        group.records.sort((a, b) => (reservationTime(a) ?? 0) - (reservationTime(b) ?? 0)
            || String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
        group.id = String(group.records[0].id);
        group.latest = reservationTime(group.records.at(-1)) ?? 0;
        return group;
    }).sort((a, b) => b.latest - a.latest
        || String(b.records.at(-1).id).localeCompare(String(a.records.at(-1).id), 'en', { numeric: true }));
}

export function paginateReservationGroups(items, page = 1, pageSize = 10) {
    const groups = groupReservations(items);
    const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
    const safePage = Math.max(1, Math.min(page, totalPages));
    return {
        items: groups.slice((safePage - 1) * pageSize, safePage * pageSize).flatMap(group => group.records),
        page: safePage, totalPages, groupTotal: groups.length
    };
}

function fields(item) {
    return {
        package: String(item.package || '-'), pageName: String(item.pageName || '-'),
        source: String(item.source || item.utm_source || 'direct'),
        medium: String(item.medium || item.utm_medium || '-')
    };
}

function fieldValue(key, value) {
    const source = /^[a-zA-Z0-9_-]+$/.test(value) ? value : 'direct';
    const style = key === 'source' ? `source-${source}` : `reservation-tag-${key}`;
    return `<span class="reservation-tag ${style}">${escape(value)}</span>`;
}

export function renderReservationTable(container, items, { selection = false, statusColor = () => '' } = {}) {
    if (!items.length) {
        container.innerHTML = `<tr><td colspan="${selection ? 9 : 8}" class="reservation-empty">조회된 데이터가 없습니다.</td></tr>`;
        return;
    }
    container.innerHTML = groupReservations(items).map(group => {
        const count = group.records.length;
        return group.records.map((item, index) => {
            const current = fields(item);
            const previous = index ? fields(group.records[index - 1]) : null;
            const status = item.status === '보류' ? '고민중' : String(item.status || '대기중');
            let html = `<tr class="${index ? 'reservation-history' : 'reservation-group-start'}">`;
            if (selection) html += `<td data-selection-column class="reservation-selection"><input type="checkbox" class="reservation-checkbox" value="${escape(item.id)}" aria-label="${escape(item.name)} ${escape(formatReservationTime(item))} 예약 선택"></td>`;
            html += `<td class="reservation-time">${escape(formatReservationTime(item))}</td>`;
            if (!index) {
                html += `<td rowspan="${count}" class="reservation-person"><strong>${escape(item.name)}</strong>${count > 1 ? `<span class="reservation-repeat">같은 날 신청 ${count}회</span>` : ''}</td>`;
                html += `<td rowspan="${count}" class="reservation-phone">${escape(item.phone)}</td>`;
            }
            for (const key of ['package', 'pageName', 'source', 'medium']) {
                const value = fieldValue(key, current[key]);
                html += `<td class="reservation-field${key === 'package' ? '' : ' reservation-centered'}">`;
                html += previous ? (previous[key] === current[key]
                    ? '<span class="reservation-unchanged" aria-label="변경 없음">—</span>'
                    : `<span class="reservation-change"><span class="reservation-change-label">(변경)</span>${value}</span>`) : value;
                html += '</td>';
            }
            // Keep the original record ID on every control; a visual group never changes stored statuses together.
            html += `<td class="reservation-status"><select data-id="${escape(item.id)}" data-status="${escape(status)}" aria-label="${escape(item.name)} ${escape(formatReservationTime(item))} 처리 상태" class="status-select text-[11px] font-black pl-4 pr-9 py-2 rounded-xl border-none outline-none cursor-pointer transition-all ${escape(statusColor(status))}">${statuses.map(option => `<option value="${option}"${status === option ? ' selected' : ''}>${option}</option>`).join('')}</select></td></tr>`;
            return html;
        }).join('');
    }).join('');
}
