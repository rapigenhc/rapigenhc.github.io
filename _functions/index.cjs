const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { identity, phoneVariants, plan, CANCELLED } = require('./policy.cjs');
initializeApp();
const db = getFirestore();
const options = { region: 'asia-northeast3', maxInstances: 2, memory: '256MiB' };
const allowedStatuses = new Set(['대기중', '고민중', '부재', '확정', '미응답', '본인취소', '예약중복취소', '기타취소']);
const records = snapshot => snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, ref: doc.ref }));
const people = data => db.collection('reservations').where('phone', 'in', phoneVariants(data));

function cancelOlder(transaction, latest, older) {
    for (const previous of older) {
            transaction.update(previous.ref, { status: CANCELLED, supersededBy: latest.id, updatedAt: FieldValue.serverTimestamp() });
            transaction.create(db.collection('reservation_status_audit').doc(), {
                action: 'reservation.duplicate_cancelled', reservationId: previous.id,
                previousStatus: previous.status || '대기중', status: CANCELLED,
                latestReservationId: latest.id, createdAt: FieldValue.serverTimestamp()
            });
        }
}

// Delivery can repeat or arrive out of order: always select the actual newest stored application.
exports.cancelSupersededReservations = onDocumentCreated({ ...options, document: 'reservations/{id}', retry: true }, async event => {
    if (!event.data) return;
    const target = { ...event.data.data(), id: event.data.id };
    if (!identity(target)) return;
    await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(people(target));
        const { latest, older } = plan(records(snapshot), target);
        cancelOlder(transaction, latest, older);
    });
});

// Activate the callable client only after both functions have been deployed successfully.
exports.updateLatestReservationStatus = onCall(options, async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', '관리자 로그인이 필요합니다.');
    const admin = await db.collection('admins').doc(request.auth.uid).get();
    if (!admin.exists || admin.data().active === false || !admin.data().role) {
        throw new HttpsError('permission-denied', '관리자 권한이 필요합니다.');
    }
    const id = request.data?.id;
    const status = request.data?.status;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || !allowedStatuses.has(status)) {
        throw new HttpsError('invalid-argument', '올바르지 않은 신청 또는 상태입니다.');
    }
    await db.runTransaction(async transaction => {
        const ref = db.collection('reservations').doc(id);
        const current = await transaction.get(ref);
        if (!current.exists) throw new HttpsError('not-found', '신청을 찾을 수 없습니다.');
        const target = { ...current.data(), id, ref };
        if (identity(target)) {
            const snapshot = await transaction.get(people(target));
            const { latest, older } = plan(records(snapshot), target);
            if (latest.id !== id) {
                throw new HttpsError('failed-precondition', 'reservation_superseded');
            }
            cancelOlder(transaction, latest, older);
        }
        transaction.update(ref, { status, updatedAt: FieldValue.serverTimestamp() });
        transaction.create(db.collection('reservation_status_audit').doc(), {
            action: 'reservation.status_changed', adminId: request.auth.uid, reservationId: id,
            previousStatus: target.status || '대기중', status, createdAt: FieldValue.serverTimestamp()
        });
    });
    return { ok: true };
});
