/**
 * 래피젠헬스케어 Admin JS - 스마트 커서 및 Flatpickr 날짜 최적화
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, orderBy, getDocs, updateDoc, serverTimestamp, where, Timestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

const PAGE_SIZE = 10; 
const BLOCK_SIZE = 10; 
let currentIdx = 1;
let totalPages = 1;
let periodReservations = [];
let loadedPeriod = null;
let fetchVersion = 0;

let currentDateMode = 'week'; 
let fpInstance = null;

const formatLocalDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const setInitialDates = (range = 'week') => {
    const end = new Date();
    const start = new Date();
    
    if(range === 'day') {
        start.setDate(end.getDate());
    } else if(range === 'week') {
        start.setDate(end.getDate() - 6);
    } else if(range === 'month') {
        start.setDate(1); 
        end.setMonth(start.getMonth() + 1);
        end.setDate(0); 
    }
    
    document.getElementById('filterStartDate').value = formatLocalDate(start);
    document.getElementById('filterEndDate').value = formatLocalDate(end);
    
    if(fpInstance) {
        fpInstance.setDate([start, end], false); 
    }
};

const initFlatpickr = () => {
    fpInstance = flatpickr("#dateRangeDisplay", {
        mode: "range",
        locale: "ko", 
        dateFormat: "Y-m-d",
        onChange: function(selectedDates, dateStr, instance) {
            if (selectedDates.length === 1) {
                const start = selectedDates[0];
                if (currentDateMode === 'day') {
                    instance.setDate([start, start], true);
                } else if (currentDateMode === 'week') {
                    const end = new Date(start);
                    end.setDate(start.getDate() + 6);
                    instance.setDate([start, end], true);
                } else if (currentDateMode === 'month') {
                    const firstDay = new Date(start.getFullYear(), start.getMonth(), 1);
                    const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0);
                    instance.setDate([firstDay, lastDay], true);
                }
            } 
            else if (selectedDates.length === 2) {
                const startIso = instance.formatDate(selectedDates[0], "Y-m-d");
                const endIso = instance.formatDate(selectedDates[1], "Y-m-d");
                
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
        initFlatpickr(); 
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
    } catch (e) {
        console.error("권한 조회 실패:", e);
    }
}

const CANCEL_STATUSES = ['본인취소', '예약중복취소', '기타취소'];
const SUMMARY_STATUSES = {
    'count-total': '전체',
    'count-waiting': '대기중',
    'count-considering': '고민중',
    'count-absent': '부재',
    'count-confirmed': '확정',
    'count-noresponse': '미응답',
    'count-cancel': '취소합계'
};

function normalizeStatus(status) {
    return status === '보류' ? '고민중' : (status || '대기중');
}

function matchesStatus(item, status) {
    const value = normalizeStatus(item.status);
    return status === '전체' || (status === '취소합계'
        ? CANCEL_STATUSES.includes(value) : value === status);
}

function renderFilteredReservations(targetPage = 1) {
    const searchTerm = document.getElementById('searchTerm').value.trim();
    const status = document.getElementById('filterStatus').value;
    const searched = periodReservations.filter(item => !searchTerm ||
        (item.name || '').includes(searchTerm) || (item.phone || '').includes(searchTerm));

    for (const [id, summaryStatus] of Object.entries(SUMMARY_STATUSES)) {
        document.getElementById(id).innerText = searched.filter(item => matchesStatus(item, summaryStatus)).length;
    }
    document.querySelectorAll('.status-summary').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.status === status));
    });

    const filtered = searched.filter(item => matchesStatus(item, status));
    totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentIdx = Math.max(1, Math.min(targetPage, totalPages));
    renderList(filtered.slice((currentIdx - 1) * PAGE_SIZE, currentIdx * PAGE_SIZE));
    document.getElementById('list-result-count').innerText = `조회 결과 ${filtered.length}명 · ${currentIdx} / ${totalPages}페이지`;
    updatePaginationUI();
}

window.fetchFromFirestore = async function(targetPage = 1, isNewSearch = false) {
    const version = ++fetchVersion;
    const start = document.getElementById('filterStartDate').value;
    const end = document.getElementById('filterEndDate').value;
    const period = `${start}/${end}`;
    try {
        if (isNewSearch || loadedPeriod !== period) {
            const startDate = new Date(start + 'T00:00:00');
            const endExclusive = new Date(end + 'T00:00:00');
            endExclusive.setDate(endExclusive.getDate() + 1);
            const snapshot = await getDocs(query(collection(db, 'reservations'),
                where('createdAt', '>=', Timestamp.fromDate(startDate)),
                where('createdAt', '<', Timestamp.fromDate(endExclusive)),
                orderBy('createdAt', 'desc')));
            if (version !== fetchVersion) return;
            periodReservations = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
            loadedPeriod = period;
        }
        renderFilteredReservations(isNewSearch ? 1 : targetPage);
    } catch (error) {
        if (version !== fetchVersion) return;
        loadedPeriod = null;
        periodReservations = [];
        for (const id of Object.keys(SUMMARY_STATUSES)) document.getElementById(id).innerText = '—';
        document.getElementById('reservation-list').innerHTML = `<tr><td colspan="8" class="p-20 text-center font-bold">오류가 발생했습니다. 조건 조회를 눌러 다시 시도해주세요.</td></tr>`;
        document.getElementById('list-result-count').innerText = '조회 실패';
        currentIdx = 1;
        totalPages = 1;
        updatePaginationUI();
        console.error('예약 조회 실패:', error);
    }
};

// [수정 2] renderList 함수 전체 교체 (데이터 매핑 및 td 8개로 확장)
function renderList(items) {
    const listContainer = document.getElementById('reservation-list');
    listContainer.innerHTML = '';
    
    if (items.length === 0) {
        // colspan을 7에서 8로 수정
        listContainer.innerHTML = `<tr><td colspan="8" class="p-20 text-center text-gray-400 font-bold">조회된 데이터가 없습니다.</td></tr>`;
        return;
    }

    items.forEach(data => {
        const timeStr = data.createdAt?.seconds ? new Date(data.createdAt.seconds * 1000).toLocaleString('ko-KR', { year: '2-digit', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12: false }) : '방금 전';
        
        // 💡 추가된 데이터 맵핑 로직
        const page = data.pageName || '-'; // 예약페이지 데이터 (Firestore 필드명에 맞게 조정 가능)
        const source = data.source || data.utm_source || 'direct';
        const medium = data.utm_medium || data.medium || '-';
        const status = normalizeStatus(data.status);

        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50/80 transition-all border-b border-gray-50";
        tr.innerHTML = `
            <td class="px-8 py-5 text-[12px] text-gray-400 font-bold">${timeStr}</td>
            <td class="px-6 py-5 text-[14px] font-black text-gray-900">${data.name}</td>
            <td class="px-6 py-5 text-center text-[13px] font-bold text-gray-500">${data.phone}</td>
            <td class="px-6 py-5"><span class="bg-white border border-gray-100 px-3 py-1 rounded-lg font-black text-[12px] text-gray-600">${data.package || '-'}</span></td>
            <td class="px-6 py-5 text-center text-[12px] font-bold text-gray-600">${page}</td>            
            <td class="px-6 py-5 text-center"><span class="source-${source} px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border">${source}</span></td>            
            <td class="px-6 py-5 text-center"><span class="bg-gray-50 text-gray-500 px-2.5 py-1 rounded-md text-[10px] font-bold border border-gray-100 uppercase">${medium}</span></td>          
            <td class="px-6 py-5 text-center">
                <select data-id="${data.id}" data-status="${status}" class="status-select text-[11px] font-black pl-4 pr-9 py-2 rounded-xl border-none outline-none cursor-pointer transition-all ${getStatusColor(status)}">
                    <option value="대기중" ${status === '대기중' ? 'selected' : ''}>대기중</option>
                    <option value="고민중" ${status === '고민중' ? 'selected' : ''}>고민중</option>
                    <option value="부재" ${status === '부재' ? 'selected' : ''}>부재</option>
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
    if(status === '확정') return 'bg-green-100 text-green-700';
    if(status === '미응답') return 'bg-red-100 text-red-700';
    if(status === '고민중') return 'bg-purple-100 text-purple-700';
    if(status === '부재') return 'bg-blue-100 text-blue-700';
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

// 로그인 핸들러 함수
async function handleLogin(e) {
    if (e) e.preventDefault(); // 폼 제출로 인한 브라우저 새로고침 강제 차단

    const email = document.getElementById('adminId').value.trim();
    const password = document.getElementById('adminPw').value.trim();

    if (!email || !password) {
        alert("아이디와 비밀번호를 모두 입력해주세요.");
        return;
    }

    try {
        // 세션 유지 설정 후 로그인 시도 (네이티브 앱 수준의 세션 관리)
        await setPersistence(auth, browserSessionPersistence);
        await signInWithEmailAndPassword(auth, email, password);
        // 로그인 성공 시 onAuthStateChanged에서 화면 전환 처리됨
    } catch (err) {
        console.error("Firebase Auth Error:", err.code, err.message);
        
        let errorMsg = "로그인에 실패했습니다.";
        switch (err.code) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                errorMsg = "아이디 또는 비밀번호가 올바르지 않습니다.";
                break;
            case 'auth/operation-not-allowed':
                errorMsg = "Firebase 콘솔에서 '이메일/비밀번호' 인증 방식이 꺼져있습니다.";
                break;
            case 'auth/invalid-email':
                errorMsg = "올바른 이메일 형식이 아닙니다.";
                break;
            case 'auth/too-many-requests':
                errorMsg = "접속 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.";
                break;
            default:
                errorMsg = `서버 오류 (${err.code}): 관리자에게 문의하세요.`;
        }
        alert(errorMsg);
    }
}

// 클릭 이벤트 위임
document.addEventListener('click', async (e) => {
    const summary = e.target.closest('.status-summary');
    if (summary) {
        document.getElementById('filterStatus').value = summary.dataset.status;
        fetchFromFirestore(1);
        return;
    }
    if (e.target.id === 'filterSearchBtn') fetchFromFirestore(1, true);
    
    if (e.target.classList.contains('date-quick-btn')) {
        document.querySelectorAll('.date-quick-btn').forEach(b => {
            b.classList.remove('bg-white', 'text-[#F27405]');
            b.classList.add('text-gray-500');
        });
        e.target.classList.remove('text-gray-500');
        e.target.classList.add('bg-white', 'text-[#F27405]');
        
        currentDateMode = e.target.dataset.range; 
        setInitialDates(currentDateMode); 
        fetchFromFirestore(1, true); 
    }

    if (e.target.id === 'loginBtn') {
        handleLogin(e);
    }
    
    if (e.target.id === 'logoutBtn') {
        if(confirm("로그아웃 하시겠습니까?")) signOut(auth);
    }
});

// 상태 변경 이벤트 위임
document.addEventListener('change', async (e) => {
    if (e.target.id === 'filterStatus') {
        fetchFromFirestore(1);
        return;
    }
    if (e.target.classList.contains('status-select')) {
        const id = e.target.dataset.id;
        const newStatus = e.target.value;
        const previousStatus = e.target.dataset.status;
        e.target.disabled = true;
        try {
            await updateDoc(doc(db, "reservations", id), { status: newStatus, updatedAt: serverTimestamp() });
            const item = periodReservations.find(item => item.id === id);
            if (item) item.status = newStatus;
            renderFilteredReservations(currentIdx);
            await fetchFromFirestore(1, true);
        } catch (err) {
            e.target.value = previousStatus;
            alert("상태 저장에 실패했습니다. 권한 또는 네트워크 연결을 확인해주세요.");
        } finally {
            e.target.disabled = false;
        }
    }
});

// 키보드 엔터키 이벤트 (검색창 및 로그인창 지원)
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        if (document.activeElement.id === 'searchTerm') {
            e.preventDefault();
            fetchFromFirestore(1, true);
        } else if (document.activeElement.id === 'adminId' || document.activeElement.id === 'adminPw') {
            e.preventDefault();
            handleLogin(e);
        }
    }
});
