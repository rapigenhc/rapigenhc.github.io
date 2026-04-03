/**
 * 래피젠헬스케어 Admin JS - 고도화 버전
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, orderBy, limit, startAfter, getDocs, updateDoc, deleteDoc, serverTimestamp, where, Timestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDXL8vuvgnNJmHU0fZwjquIgfD7bHZdA6c",
    authDomain: "rapigenhc-event.firebaseapp.com",
    projectId: "rapigenhc-event",
    storageBucket: "rapigenhc-event.firebasestorage.app",
    messagingSenderId: "893881210369",
    appId: "1:893881210369:web:e92344136212280e589200"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

setPersistence(auth, browserSessionPersistence);

const RESERVATION_CACHE_KEY = 'rapi_res_cache';
const PAGE_SIZE = 15;
let lastVisible = null;
let isFetching = false;

// [필터 초기값] 최근 7일 계산
const setInitialDates = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);
    
    document.getElementById('filterStartDate').value = start.toISOString().substring(0, 10);
    document.getElementById('filterEndDate').value = end.toISOString().substring(0, 10);
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // ... (권한 체크 로직 동일) ...
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard-screen').classList.remove('hidden');
        document.getElementById('dashboard-screen').classList.add('flex');
        
        setInitialDates();
        fetchFromFirestore(); // 초기 로드
    } else {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('dashboard-screen').classList.add('hidden');
    }
});

/**
 * [통신] 조건별 Firestore 조회 로직 (요금제 최적화)
 */
async function fetchFromFirestore(isNext = false) {
    if (isFetching) return;
    isFetching = true;

    const listContainer = document.getElementById('reservation-list');
    if(!isNext) listContainer.innerHTML = `<tr><td colspan="6" class="p-20 text-center animate-pulse text-gray-400 font-bold">조건에 맞는 데이터를 찾는 중...</td></tr>`;

    try {
        const startDate = new Date(document.getElementById('filterStartDate').value + "T00:00:00");
        const endDate = new Date(document.getElementById('filterEndDate').value + "T23:59:59");
        const status = document.getElementById('filterStatus').value;

        // 기본 쿼리: 날짜 범위 기반 정렬
        let qConstraints = [
            where("createdAt", ">=", Timestamp.fromDate(startDate)),
            where("createdAt", "<=", Timestamp.fromDate(endDate)),
            orderBy("createdAt", "desc"),
            limit(PAGE_SIZE)
        ];

        // 상태 필터링 추가 (전체가 아닐 경우에만)
        if (status !== '전체') {
            qConstraints.unshift(where("status", "==", status));
        }

        if (isNext && lastVisible) {
            qConstraints.push(startAfter(lastVisible));
        }

        const q = query(collection(db, "reservations"), ...qConstraints);
        const snapshot = await getDocs(q);
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        lastVisible = snapshot.docs[snapshot.docs.length - 1];

        if (!isNext) {
            renderList(list);
        } else {
            appendToList(list);
        }
    } catch (error) {
        console.error("Fetch Error:", error);
        alert("조회 중 오류가 발생했습니다. (인덱스 생성 확인 필요)");
    } finally {
        isFetching = false;
    }
}

function renderList(items) {
    const listContainer = document.getElementById('reservation-list');
    listContainer.innerHTML = '';
    if (items.length === 0) {
        listContainer.innerHTML = `<tr><td colspan="6" class="p-20 text-center text-gray-300 font-bold">조건에 해당하는 내역이 없습니다.</td></tr>`;
        return;
    }
    appendToList(items);
}

function appendToList(items) {
    const listContainer = document.getElementById('reservation-list');
    items.forEach(data => {
        const timeStr = data.createdAt?.seconds 
            ? new Date(data.createdAt.seconds * 1000).toLocaleString('ko-KR', { 
                year: 'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12: false 
              }) : '방금 전';
            
        const source = data.source || 'direct'; 
        const status = data.status || '대기중';

        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50/80 transition-all group border-b border-gray-50";
        tr.innerHTML = `
            <td class="px-8 py-5 text-[12px] text-gray-400 font-bold">${timeStr}</td>
            <td class="px-6 py-5 text-[15px] font-black text-gray-900">${data.name}</td>
            <td class="px-6 py-5 text-center text-[13px] font-bold text-gray-500">${data.phone}</td>
            <td class="px-6 py-5">
                <span class="inline-block bg-white border border-gray-100 px-3 py-1 rounded-lg font-black text-[12px] text-gray-600">${data.package}</span>
            </td>
            <td class="px-6 py-5 text-center">
                <span class="source-${source} px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter border">${source.toUpperCase()}</span>
            </td>
            <td class="px-6 py-5">
                <div class="flex items-center justify-center gap-3">
                    <select data-id="${data.id}" class="status-select text-[11px] font-black px-4 py-2 rounded-xl border-none outline-none cursor-pointer transition-all ${getStatusColor(status)}">
                        <option value="대기중" ${status === '대기중' ? 'selected' : ''}>대기중</option>
                        <option value="확정" ${status === '확정' ? 'selected' : ''}>확정</option>
                        <option value="미응답" ${status === '미응답' ? 'selected' : ''}>미응답</option>
                    </select>
                </div>
            </td>
        `;
        listContainer.appendChild(tr);
    });
}

function getStatusColor(status) {
    switch(status) {
        case '확정': return 'bg-green-100 text-green-700';
        case '미응답': return 'bg-red-100 text-red-700';
        default: return 'bg-gray-100 text-gray-600';
    }
}

// [이벤트] 검색 및 필터링
document.addEventListener('click', (e) => {
    if (e.target.id === 'filterSearchBtn') {
        lastVisible = null;
        fetchFromFirestore();
    }
    // ... (기존 로그인/로그아웃 로직 유지) ...
});

document.addEventListener('change', async (e) => {
    if (e.target.classList.contains('status-select')) {
        const id = e.target.dataset.id;
        const newStatus = e.target.value;
        try {
            await updateDoc(doc(db, "reservations", id), { status: newStatus, updatedAt: serverTimestamp() });
            e.target.className = `status-select text-[11px] font-black px-4 py-2 rounded-xl border-none outline-none cursor-pointer transition-all ${getStatusColor(newStatus)}`;
        } catch (err) { alert("권한이 없습니다."); }
    }
});