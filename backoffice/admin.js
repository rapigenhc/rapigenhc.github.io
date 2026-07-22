/**
 * 래피젠헬스케어 Admin JS - 스마트 커서 및 Flatpickr 날짜 최적화
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, orderBy, limit, startAfter, getDocs, updateDoc, serverTimestamp, where, Timestamp, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

const PAGE_SIZE = 10; 
const BLOCK_SIZE = 10; 
let currentIdx = 1;
let totalPages = 1;
let currentBaseConstraints = [];
let pageCursors = {}; 
let isFetching = false;

// [핵심] 현재 날짜 선택 모드 (일별/주간/월간)
let currentDateMode = 'week'; 
let fpInstance = null; // Flatpickr 인스턴스

// 1. 초기 셋업 (Flatpickr 연동)
const setInitialDates = (range = 'week') => {
    const end = new Date();
    const start = new Date();
    
    if(range === 'day') {
        start.setDate(end.getDate());
    } else if(range === 'week') {
        start.setDate(end.getDate() - 6);
    } else if(range === 'month') {
        start.setDate(1); // 이달 1일
        end.setMonth(start.getMonth() + 1);
        end.setDate(0); // 이달 말일
    }
    
    document.getElementById('filterStartDate').value = start.toISOString().substring(0, 10);
    document.getElementById('filterEndDate').value = end.toISOString().substring(0, 10);
    
    if(fpInstance) {
        fpInstance.setDate([start, end], false); // 달력 UI 동기화
    }
};

// [신규] Flatpickr 달력 초기화 함수 (Auto-Snap 알고리즘)
const initFlatpickr = () => {
    fpInstance = flatpickr("#dateRangeDisplay", {
        mode: "range",
        locale: "ko", // 한국어 패치
        dateFormat: "Y-m-d",
        onChange: function(selectedDates, dateStr, instance) {
            // 사용자가 달력에서 첫 번째 날짜를 클릭하는 순간 발동
            if (selectedDates.length === 1) {
                const start = selectedDates[0];
                if (currentDateMode === 'day') {
                    // 일별: 하루만 선택되도록 스냅
                    instance.setDate([start, start], true);
                } else if (currentDateMode === 'week') {
                    // 주간: 클릭한 날짜부터 강제로 7일간 드래그
                    const end = new Date(start);
                    end.setDate(start.getDate() + 6);
                    instance.setDate([start, end], true);
                } else if (currentDateMode === 'month') {
                    // 월간: 클릭한 날짜가 속한 월의 1일부터 말일까지 전체 드래그
                    const firstDay = new Date(start.getFullYear(), start.getMonth(), 1);
                    const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0);
                    instance.setDate([firstDay, lastDay], true);
                }
            } 
            // 2개의 날짜가 스냅되어 최종 범위가 완성되면 즉시 DB 갱신
            else if (selectedDates.length === 2) {
                const startIso = instance.formatDate(selectedDates[0], "Y-m-d");
                const endIso = instance.formatDate(selectedDates[1], "Y-m-d");
                
                // 무한 루프 방지 및 갱신
                if(document.getElementById('filterStartDate').value !== startIso || 
                   document.getElementById('filterEndDate').value !== endIso) {
                    document.getElementById('filterStartDate').value = startIso;
                    document.getElementById('filterEndDate').value = endIso;
                    fetchFromFirestore(1, true); 
                }
            }
        }
    });
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard-screen').classList.remove('hidden');
        document.getElementById('dashboard-screen').classList.add('flex');
        
        await fetchUserRole(user.uid);
        initFlatpickr(); // 달력 엔진 시동
        setInitialDates('week'); 
        fetchFromFirestore(1, true); 
    } else {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('dashboard-screen').classList.add('hidden');
    }
});

async function fetchUserRole(uid) {
    try {
        const snap = await getDoc(doc(db, "admins", uid));
        if (snap.exists()) updateRoleUI(snap.data().role);
    } catch (e) {}
}

window.fetchFromFirestore = async function(targetPage = 1, isNewSearch = false) {
    if (isFetching) return;
    isFetching = true;

    const listContainer = document.getElementById('reservation-list');
    const searchTerm = document.getElementById('searchTerm').value.trim();
    
    try {
        if (isNewSearch) {
            pageCursors = {}; 
            currentIdx = 1;
            targetPage = 1;
        }

        const startDate = new Date(document.getElementById('filterStartDate').value + "T00:00:00");
        const endDate = new Date(document.getElementById('filterEndDate').value + "T23:59:59");
        const status = document.getElementById('filterStatus').value;

        currentBaseConstraints = [
            where("createdAt", ">=", Timestamp.fromDate(startDate)),
            where("createdAt", "<=", Timestamp.fromDate(endDate))
        ];

        if (isNewSearch) updateSummaryCounts(currentBaseConstraints);

        let listConstraints = [...currentBaseConstraints];
        if (status !== '전체') listConstraints.push(where("status", "==", status));

        if (isNewSearch) {
            if (searchTerm) {
                totalPages = 1;
            } else {
                const countSnap = await getCountFromServer(query(collection(db, "reservations"), ...listConstraints));
                totalPages = Math.max(1, Math.ceil(countSnap.data().count / PAGE_SIZE));
            }
        }

        let qConstraints = [...listConstraints, orderBy("createdAt", "desc")];
        
        if (searchTerm) {
            qConstraints.push(limit(100)); 
            const snapshot = await getDocs(query(collection(db, "reservations"), ...qConstraints));
            let list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            list = list.filter(item => (item.name && item.name.includes(searchTerm)) || (item.phone && item.phone.includes(searchTerm)));
            renderList(list);
            currentIdx = 1;
            updatePaginationUI();
            isFetching = false;
            return;
        }

        if (targetPage > 1 && pageCursors[targetPage - 1]) {
            qConstraints.push(startAfter(pageCursors[targetPage - 1]));
            qConstraints.push(limit(PAGE_SIZE));
        } else {
            qConstraints.push(limit(targetPage * PAGE_SIZE));
        }

        const snapshot = await getDocs(query(collection(db, "reservations"), ...qConstraints));
        const docs = snapshot.docs;

        for (let i = 1; i <= targetPage; i++) {
            let lastIdx = (i * PAGE_SIZE) - 1;
            if (lastIdx < docs.length) pageCursors[i] = docs[lastIdx];
            else pageCursors[i] = docs[docs.length - 1]; 
        }

        let pageDocs = [];
        if (targetPage > 1 && pageCursors[targetPage - 1] && docs.length <= PAGE_SIZE) {
            pageDocs = docs;
        } else {
            const startIndex = (targetPage - 1) * PAGE_SIZE;
            pageDocs = docs.slice(startIndex, startIndex + PAGE_SIZE);
        }

        currentIdx = targetPage;
        renderList(pageDocs.map(d => ({ id: d.id, ...d.data() })));
        updatePaginationUI();

    } catch (error) {
        listContainer.innerHTML = `<tr><td colspan="6" class="p-20 text-center font-bold">오류가 발생했습니다.</td></tr>`;
    } finally {
        isFetching = false;
    }
}

async function updateSummaryCounts(baseConstraints) {
    try {
        const statuses = ['대기중', '확정', '미응답', '본인취소', '예약중복취소', '기타취소'];
        const counts = {};
        let totalCount = 0;

        await Promise.all(statuses.map(async (st) => {
            const snap = await getCountFromServer(query(collection(db, "reservations"), ...baseConstraints, where("status", "==", st)));
            counts[st] = snap.data().count;
            totalCount += counts[st];
        }));

        const cancelCount = (counts['본인취소'] || 0) + (counts['예약중복취소'] || 0) + (counts['기타취소'] || 0);

        const ids = { 'count-total': totalCount, 'count-waiting': counts['대기중']||0, 'count-confirmed': counts['확정']||0, 'count-noresponse': counts['미응답']||0, 'count-cancel': cancelCount };
        for (let [id, val] of Object.entries(ids)) { if(document.getElementById(id)) document.getElementById(id).innerText = val; }
    } catch (error) {}
}

function renderList(items) {
    const listContainer = document.getElementById('reservation-list');
    listContainer.innerHTML = '';
    
    if (items.length === 0) {
        listContainer.innerHTML = `<tr><td colspan="7" class="p-20 text-center text-gray-400 font-bold">조회된 데이터가 없습니다.</td></tr>`;
        return;
    }

    items.forEach(data => {
        const timeStr = data.createdAt?.seconds ? new Date(data.createdAt.seconds * 1000).toLocaleString('ko-KR', { year: '2-digit', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12: false }) : '방금 전';
        const source = data.source || 'direct';
        const status = data.status || '대기중';
        const pageName = data.pageName || 'index.html'; // 저장된 페이지명이 없으면 기본 index.html로 표시

        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50/80 transition-all border-b border-gray-50";
        tr.innerHTML = `
            <td class="px-8 py-5 text-[12px] text-gray-400 font-bold">${timeStr}</td>
            <td class="px-6 py-5 text-[14px] font-black text-gray-900">${data.name}</td>
            <td class="px-6 py-5 text-center text-[13px] font-bold text-gray-500">${data.phone}</td>
            <td class="px-6 py-5"><span class="bg-white border border-gray-100 px-3 py-1 rounded-lg font-black text-[12px] text-gray-600">${data.package}</span></td>
            <td class="px-6 py-5 text-center"><span class="bg-indigo-50 text-indigo-600 border border-indigo-100 px-2.5 py-1 rounded-lg text-[11px] font-bold">${pageName}</span></td>
            <td class="px-6 py-5 text-center"><span class="source-${source} px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border">${source}</span></td>
            <td class="px-6 py-5 text-center">
                <select data-id="${data.id}" class="status-select text-[11px] font-black pl-4 pr-9 py-2 rounded-xl border-none outline-none cursor-pointer transition-all ${getStatusColor(status)}">
                    <option value="대기중" ${status === '대기중' ? 'selected' : ''}>대기중</option>
                    <option value="확정" ${status === '확정' ? 'selected' : ''}>확정</option>
                    <option value="미응답" ${status === '미응답' ? 'selected' : ''}>미응답</option>
                    <option value="본인취소" ${status === '본인취소' ? 'selected' : ''}>취소</option>
                </select>
            </td>
        `;
        listContainer.appendChild(tr);
    });
}

function getStatusColor(status) {
    if(status === '확정') return 'bg-green-100 text-green-700';
    if(status === '미응답') return 'bg-red-100 text-red-700';
    if(status.includes('취소')) return 'bg-gray-200 text-gray-500';
    return 'bg-orange-50 text-[#F27405]';
}

function updatePaginationUI() {
    const box = document.getElementById('pageNumbers');
    if (!box) return;
    box.innerHTML = '';
    
    const startPage = Math.floor((currentIdx - 1) / BLOCK_SIZE) * BLOCK_SIZE + 1;
    const endPage = Math.min(startPage + BLOCK_SIZE - 1, totalPages);
    
    for(let i = startPage; i <= endPage; i++) {
        const btn = document.createElement('button');
        const isCurrent = (i === currentIdx);
        btn.className = `min-w-[40px] h-10 flex items-center justify-center rounded-xl font-black text-[14px] transition-all ${isCurrent ? 'bg-gray-900 text-white shadow-md' : 'bg-transparent text-gray-400 hover:bg-gray-100 hover:text-gray-900'}`;
        btn.innerText = i;
        btn.onclick = () => fetchFromFirestore(i);
        box.appendChild(btn);
    }
    
    const prevBtn = document.getElementById('prevBlockBtn');
    if(prevBtn) {
        prevBtn.disabled = (startPage === 1);
        prevBtn.onclick = () => fetchFromFirestore(startPage - 1);
    }
    
    const nextBtn = document.getElementById('nextBlockBtn');
    if(nextBtn) {
        nextBtn.disabled = (endPage === totalPages);
        nextBtn.onclick = () => fetchFromFirestore(endPage + 1);
    }
}

function updateRoleUI(role) {
    const roleTag = document.getElementById('roleTag');
    if (roleTag) roleTag.innerText = role || 'GUEST';
}

document.addEventListener('click', async (e) => {
    if (e.target.id === 'filterSearchBtn') fetchFromFirestore(1, true);
    
    if (e.target.classList.contains('date-quick-btn')) {
        document.querySelectorAll('.date-quick-btn').forEach(b => {
            b.classList.remove('bg-white', 'text-[#F27405]');
            b.classList.add('text-gray-500');
        });
        e.target.classList.remove('text-gray-500');
        e.target.classList.add('bg-white', 'text-[#F27405]');
        
        currentDateMode = e.target.dataset.range; // 모드 업데이트
        setInitialDates(currentDateMode); // 즉시 Flatpickr 달력에 반영
        fetchFromFirestore(1, true); 
    }

    if (e.target.id === 'loginBtn') {
        try { await signInWithEmailAndPassword(auth, document.getElementById('adminId').value, document.getElementById('adminPw').value); } 
        catch (err) { alert("로그인 실패"); }
    }
    if (e.target.id === 'logoutBtn') if(confirm("로그아웃 하시겠습니까?")) signOut(auth);
});

document.addEventListener('change', async (e) => {
    if (e.target.classList.contains('status-select')) {
        const id = e.target.dataset.id;
        const newStatus = e.target.value;
        try {
            await updateDoc(doc(db, "reservations", id), { status: newStatus, updatedAt: serverTimestamp() });
            e.target.className = `status-select text-[11px] font-black px-4 py-2 rounded-xl border-none outline-none cursor-pointer transition-all ${getStatusColor(newStatus)}`;
            updateSummaryCounts(currentBaseConstraints);
        } catch (err) { alert("수정 권한이 없습니다."); }
    }
});

document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && document.activeElement.id === 'searchTerm') fetchFromFirestore(1, true);
});