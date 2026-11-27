import { groupReservations } from './reservation-table.js?v=20261127-1';

const CANCELLED = '예약중복취소';
const rawGroups = items => groupReservations(items.map(item => ({ ...item, displayGroupId: undefined })));

// Establish identity and effective status before filtering, counting, exporting or masking.
export function decorateReservationStatuses(items) {
    return rawGroups(items).flatMap(group => {
        const latestId = String(group.records.at(-1).id);
        return group.records.map(item => ({
            ...item, displayGroupId: group.id, latestReservationId: latestId,
            canEditStatus: String(item.id) === latestId,
            status: String(item.id) === latestId
                ? (item.status === '보류' ? '고민중' : (item.status || '대기중')) : CANCELLED
        }));
    });
}

// Use the existing authenticated admin's Firestore permissions. No Functions deployment is needed.
export async function reconcileDuplicateReservations(items, { transact, reference, timestamp }) {
    let cancelled = 0;
    for (const group of rawGroups(items)) {
        const latest = group.records.at(-1);
        const pending = group.records.slice(0, -1).filter(item => item.status !== CANCELLED);
        // Keep each transaction below Firestore's write limit even for long application histories.
        for (let offset = 0; offset < pending.length; offset += 200) {
            const previous = pending.slice(offset, offset + 200);
            const candidateIds = new Set(previous.map(item => String(item.id)));
            cancelled += await transact(async transaction => {
                const snapshots = await Promise.all([...previous, latest].map(item => transaction.get(reference(item.id))));
                const fresh = snapshots.filter(snapshot => snapshot.exists()).map(snapshot => ({ ...snapshot.data(), id: snapshot.id }));
                // Never cancel against a deleted latest document or an identity that changed since lookup.
                const currentGroup = rawGroups(fresh).find(item => item.records.some(record => String(record.id) === String(latest.id)));
                if (!currentGroup) return 0;
                let changed = 0;
                for (const item of currentGroup.records.slice(0, -1)) {
                    if (!candidateIds.has(String(item.id)) || item.status === CANCELLED) continue;
                    transaction.update(reference(item.id), {
                        status: CANCELLED, updatedAt: timestamp()
                    });
                    changed++;
                }
                return changed;
            });
        }
    }
    return cancelled;
}
