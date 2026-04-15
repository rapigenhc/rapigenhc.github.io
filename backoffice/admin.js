/**
 * 래피젠헬스케어 Admin JS - 검색 및 1년 필터링 고도화
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, orderBy, limit, startAfter, getDocs, updateDoc, serverTimestamp, where, Timestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

const PAGE_SIZE = 20; // 검색 편의를 위해 페이지당 노출 건수 약간 상향
let pageStack = []; 
let lastVisible = null;
let isFetching = false;
let currentIdx = 1;

// [필터 초기값] 최근 1년(365일) 계산
const setInitialDates = () => {
    const end = new Date();
    const start = new Date();
    start.setFullYear(end.getFullYear() - 1); // 1년 전으로 설정
    
    document.getElementById('filterStartDate').value = start.toISOString().substring(0, 10);
    document.getElementById('filterEndDate').value = end.toISOString().substring(0, 10);
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard-screen').classList.remove('hidden');
        document.getElementById('dashboard-screen').classList.add('flex');
        
        await fetchUserRole(user.uid);
        setInitialDates();
        fetchFromFirestore();
    } else {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('dashboard-screen').classList.add('hidden');
    }
});

async function fetchUserRole(uid) {
    try {
        const snap = await getDoc(doc(db, "admins", uid));
        if (snap.exists()) updateRoleUI(snap.data().role);
    } catch (e) { console.error("Role Fetch Error", e); }
}

async function fetchFromFirestore(isNext = false, isPrev = false) {
    if (isFetching) return;
    isFetching = true;

    const listContainer = document.getElementById('reservation-list');
    const searchTerm = document.getElementById('searchTerm').value.trim();
    
    try {
        const startDate = new Date(document.getElementById('filterStartDate').value + "T00:00:00");
        const endDate = new Date(document.getElementById('filterEndDate').value + "T23:59:59");
        const status = document.getElementById('filterStatus').value;

        let qConstraints = [
            where("createdAt", ">=", Timestamp.fromDate(startDate)),
            where("createdAt", "<=", Timestamp.fromDate(endDate)),
            orderBy("createdAt", "desc")
        ];

        if (status !== '전체') {
            qConstraints.unshift(where("status", "==", status));
        }

        // 검색어가 있을 경우, 더 넓은 범위를 가져와서 필터링 (무료 플랜 쿼터 주의)
        const fetchLimit = searchTerm ? 100 : PAGE_SIZE;
        qConstraints.push(limit(fetchLimit));

        if (isNext && lastVisible) {
            qConstraints.push(startAfter(lastVisible));
        } else if (isPrev && pageStack.length > 1) {
            pageStack.pop(); 
            const prevCursor = pageStack[pageStack.length - 1];
            if (prevCursor) qConstraints.push(startAfter(prevCursor));
        } else if (!isNext && !isPrev) {
            pageStack = [null];
            currentIdx = 1;
        }

        const q = query(collection(db, "reservations"), ...qConstraints);
        const snapshot = await getDocs(q);
        
        let list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // [핵심] 클라이언트 사이드 검색 (이름 또는 전화번호 포함 여부)
        if (searchTerm) {
            list = list.filter(item => 
                (item.name && item.name.includes(searchTerm)) || 
                (item.phone && item.phone.includes(searchTerm))
            );
        }

        lastVisible = snapshot.docs[snapshot.docs.length - 1];
        if (isNext && !isPrev) {
            pageStack.push(lastVisible);
            currentIdx++;
        } else if (isPrev) {
            currentIdx--;
        }

        renderList(list);
        updatePaginationUI(snapshot.docs.length);

    } catch (error) {
        console.error("Fetch Error:", error);
        listContainer.innerHTML = `<tr><td colspan="6" class="p-20 text-center text-gray-400 font-bold">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>`;
    } finally {
        isFetching = false;
    }
}

function renderList(items) {
    const listContainer = document.getElementById('reservation-list');
    listContainer.innerHTML = '';
    
    if (items.length === 0) {
        listContainer.innerHTML = `<tr><td colspan="6" class="p-20 text-center text-gray-400 font-bold">조회된 데이터가 없습니다.</td></tr>`;
        return;
    }

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
            <td class="px-6 py-5 text-center">
                <select data-id="${data.id}" class="status-select text-[11px] font-black pl-4 pr-9 py-2 rounded-xl border-none outline-none cursor-pointer transition-all ${getStatusColor(status)}">
                    <option value="대기중" ${status === '대기중' ? 'selected' : ''}>대기중</option>
                    <option value="확정" ${status === '확정' ? 'selected' : ''}>확정</option>
                    <option value="미응답" ${status === '미응답' ? 'selected' : ''}>미응답</option>
                    <option value="본인취소" ${status === '본인취소' ? 'selected' : ''}>본인취소</option>
                    <option value="예약중복취소" ${status === '예약중복취소' ? 'selected' : ''}>예약중복취소</option>
                    <option value="기타취소" ${status === '기타취소' ? 'selected' : ''}>기타취소</option>
                </select>
            </td>
        `;
        listContainer.appendChild(tr);
    });
}

function getStatusColor(status) {
    switch(status) {
        case '확정': return 'bg-green-100 text-green-700';
        case '미응답': return 'bg-red-100 text-red-700';
        case '본인취소': 
        case '예약중복취소':
        case '기타취소': return 'bg-gray-200 text-gray-500';
        default: return 'bg-orange-50 text-[#F27405]';
    }
}

function updatePaginationUI(count) {
    document.getElementById('currentPage').innerText = currentIdx;
    document.getElementById('prevPageBtn').disabled = (currentIdx === 1);
    document.getElementById('nextPageBtn').disabled = (count < PAGE_SIZE);
}

function updateRoleUI(role) {
    const roleTag = document.getElementById('roleTag');
    if (!roleTag) return;
    roleTag.innerText = role || 'GUEST';
}

// [이벤트 위임]
document.addEventListener('click', async (e) => {
    if (e.target.id === 'filterSearchBtn') fetchFromFirestore();
    if (e.target.closest('#nextPageBtn')) fetchFromFirestore(true, false);
    if (e.target.closest('#prevPageBtn')) fetchFromFirestore(false, true);
    
    if (e.target.id === 'loginBtn') {
        const email = document.getElementById('adminId').value;
        const pw = document.getElementById('adminPw').value;
        try { await signInWithEmailAndPassword(auth, email, pw); } 
        catch (err) { alert("로그인 실패: 정보를 확인하세요."); }
    }

    if (e.target.id === 'logoutBtn') {
        if(confirm("로그아웃 하시겠습니까?")) signOut(auth);
    }
});

document.addEventListener('change', async (e) => {
    if (e.target.classList.contains('status-select')) {
        const id = e.target.dataset.id;
        const newStatus = e.target.value;
        try {
            await updateDoc(doc(db, "reservations", id), { status: newStatus, updatedAt: serverTimestamp() });
            e.target.className = `status-select text-[11px] font-black px-4 py-2 rounded-xl border-none outline-none cursor-pointer transition-all ${getStatusColor(newStatus)}`;
        } catch (err) { alert("수정 권한이 없습니다."); }
    }
});

// 엔터키 검색 지원
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && document.activeElement.id === 'searchTerm') {
        fetchFromFirestore();
    }
});