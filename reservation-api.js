import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js';
import { getFirestore, collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

const app = getApps().length ? getApp() : initializeApp({
    apiKey: 'AIzaSyAeIIzAdvwcedR6zyrvQVCHH1S0T8ROLvI',
    authDomain: 'rapigenhc-event.firebaseapp.com',
    projectId: 'rapigenhc-event',
    storageBucket: 'rapigenhc-event.firebasestorage.app',
    messagingSenderId: '893881210369',
    appId: '1:893881210369:web:e92344136212280e589200'
});
const db = getFirestore(app);
let pending = false;
let lastSuccess = 0;

async function notify(data) {
    try {
        if (typeof window.emailjs === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
        await window.emailjs.send('service_event-github', 'template_NEW-Reserve', {
            ...data,
            date: new Date().toLocaleDateString('ko-KR'),
            time: new Date().toLocaleTimeString('ko-KR'),
            received_at: new Date().toLocaleString('ko-KR')
        }, 'UYYZlMnSnF3BsSOfK');
    } catch { console.warn('예약은 저장됐지만 알림 이메일 전송에 실패했습니다.'); }
}

// Static GitHub Pages forms store through Firebase; they cannot execute PHP.
export async function submitReservation(_url, options) {
    if (pending) throw new Error('reservation_busy');
    if (lastSuccess && Date.now() - lastSuccess < 60000) throw new Error('too_many_requests');
    const data = JSON.parse(options.body);
    if (!/^[가-힣a-zA-Z\s]{2,20}$/.test(data.name)) throw new Error('invalid_name');
    const phone = String(data.phone).replace(/-/g, '');
    if (!/^01[016789]\d{7,8}$/.test(phone)) throw new Error('invalid_phone');
    pending = true;
    try {
        await addDoc(collection(db, 'reservations'), {
            name: data.name, phone, package: data.package, pageName: data.pageName,
            source: data.source || 'direct', medium: data.medium || '-',
            userAgent: data.userAgent || '', status: '대기중',
            createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        lastSuccess = Date.now();
        try { localStorage.setItem('last_submit_time', String(lastSuccess)); } catch {}
        void notify({ ...data, phone });
        return { ok: true, status: 201, json: async () => ({ ok: true }) };
    } finally { pending = false; }
}
