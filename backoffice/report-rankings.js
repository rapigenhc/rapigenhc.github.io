const firstValue = (...values) => values.map(value => String(value ?? '').trim()).find(Boolean);

export const RANKING_DIMENSIONS = [
    { id: 'package', label: '패키지', value: data => firstValue(data.package) || '미선택' },
    { id: 'page', label: '예약페이지', value: data => firstValue(data.pageName) || '미확인' },
    { id: 'channel', label: '유입채널', value: data => firstValue(data.source, data.utm_source) || 'direct' },
    { id: 'medium', label: '매체', value: data => firstValue(data.utm_medium, data.medium) || '미지정' }
];

function rankRecords(records, dimension) {
    const counts = new Map();
    records.forEach(record => {
        const name = dimension.value(record);
        counts.set(name, (counts.get(name) || 0) + 1);
    });
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
        .map(([name, count], index) => ({ name, count, rank: index + 1 }));
}

function compareTopFive(ranking, otherRanking) {
    const others = new Map(otherRanking.map(item => [item.name, item]));
    return ranking.slice(0, 5).map(item => {
        const other = others.get(item.name);
        return {
            ...item,
            otherRank: other?.rank ?? null,
            otherCount: other?.count ?? 0,
            countChange: item.count - (other?.count ?? 0),
            rankChange: other ? other.rank - item.rank : null
        };
    });
}

export function buildWeeklyRankings(thisWeekRecords, lastWeekRecords) {
    return RANKING_DIMENSIONS.map(dimension => {
        const thisWeek = rankRecords(thisWeekRecords, dimension);
        const lastWeek = rankRecords(lastWeekRecords, dimension);
        return {
            id: dimension.id,
            label: dimension.label,
            thisWeek: compareTopFive(thisWeek, lastWeek),
            lastWeek: compareTopFive(lastWeek, thisWeek)
        };
    });
}
