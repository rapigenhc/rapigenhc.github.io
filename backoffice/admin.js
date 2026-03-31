/**
 * 래피젠헬스케어(Rapigen Healthcare) - 전담 시니어 개발자
 * 관리자 대시보드 (Admin Dashboard) 핵심 로직
 * 주요기능: RBAC 권한 제어, 캐시 우선 렌더링, 할당량 방어 페이지네이션
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, 
    setPersistence, browserSessionPersistence 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, collection, query, orderBy, limit, 
    startAfter, getDocs, updateDoc, deleteDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// [환경설정] Firebase SDK 초기화
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

// [보안] 세션 유지 설정: 브라우저 탭 종료 시 세션 만료
setPersistence(auth, browserSessionPersistence);

// [상수] 시스템 설정 및 할당량 방어
const RESERVATION_CACHE_KEY = 'rapi_res_cache';
const CACHE_EXPIRE_TIME = 300000; // 5분
const PAGE_SIZE = 15;

let lastVisible = null; // 페이지네이션용 커서
let isFetching = false; // 중복 호출 방지 플래그

/**
 * [보안] 권한 가드 (RBAC)
 * Authentication 상태 변화를 감지하여 화면 권한을 제어합니다.
 */
onAuthStateChanged(auth, async (user) => {
    const loginScreen = document.getElementById('login-screen');
    const dashboardScreen = document.getElementById('dashboard-screen');

    if (user) {
        // 1. 세션 스토리지에서 역할(Role) 확인 (Firestore Read 비용 절감 전략)
        let adminInfo = JSON.parse(sessionStorage.getItem('rphc_admin_info'));

        if (!adminInfo || adminInfo.uid !== user.uid) {
            try {
                // 세션 정보가 없으면 Firestore에서 권한 확인
                const adminDoc = await getDoc(doc(db, "admins", user.uid));
                if (adminDoc.exists()) {
                    adminInfo = { ...adminDoc.data(), uid: user.uid };
                    sessionStorage.setItem('rphc_admin_info', JSON.stringify(adminInfo));
                } else {
                    throw new Error("UNAUTHORIZED_ACCESS");
                }
            } catch (err) {
                alert("인가되지 않은 계정입니다. 접근이 차단됩니다.");
                signOut(auth);
                return;
            }
        }

        // 전역 상태 및 UI 반영
        window.userRole = adminInfo.role;
        applyRoleUI(adminInfo.role, adminInfo.name || '관리자');
        
        loginScreen.classList.add('hidden');
        dashboardScreen.classList.remove('hidden');
        dashboardScreen.classList.add('flex');
        
        // 2. 데이터 로드 시작
        loadInitialData(); 
    } else {
        // 비로그인 상태 UI
        loginScreen.classList.remove('hidden');
        dashboardScreen.classList.add('hidden');
        dashboardScreen.classList.remove('flex');
        sessionStorage.removeItem('rphc_admin_info');
    }
});

/**
 * [UI] 권한별 UI 렌더링 분기
 */
function applyRoleUI(role, name) {
    const roleTag = document.getElementById('roleTag');
    const adminNameDisplay = document.getElementById('adminNameDisplay');
    
    if(roleTag) {
        roleTag.innerText = role;
        roleTag.className = `px-3 py-1 rounded-full text-[10px] font-black ${
            role === 'MASTER' ? 'bg-black text-white' : 'bg-blue-100 text-blue-600'
        }`;
    }
    if(adminNameDisplay) adminNameDisplay.innerText = name;
    
    // MASTER 전용 기능 (삭제 등) 노출/숨김
    document.querySelectorAll('.role-master-only').forEach(el => {
        role === 'MASTER' ? el.classList.remove('hidden') : el.classList.add('hidden');
    });
}

/**
 * [로직] 데이터 로드 전략 (Cache-First)
 */
async function loadInitialData() {
    const now = Date.now();
    const cachedData = JSON.parse(localStorage.getItem(RESERVATION_CACHE_KEY));

    // 유효한 캐시가 존재할 경우 즉시 렌더링 (Spark 플랜 Read 0회 달성)
    if (cachedData && (now - cachedData.timestamp < CACHE_EXPIRE_TIME)) {
        console.log("⚡ [CACHE_HIT] 로컬 데이터를 사용합니다.");
        renderList(cachedData.list);
    } else {
        // 캐시 만료 혹은 부재 시 서버 통신
        fetchFromFirestore();
    }
}

/**
 * [통신] Firestore 데이터 취득
 */
async function fetchFromFirestore(isNext = false) {
    if (isFetching) return;
    isFetching = true;

    const listContainer = document.getElementById('reservation-list');
    if(!isNext) listContainer.innerHTML = `
        <tr><td colspan="4" class="p-20 text-center animate-pulse text-gray-400 font-bold">
            데이터 동기화 중...
        </td></tr>`;

    try {
        let q = query(collection(db, "reservations"), orderBy("createdAt", "desc"), limit(PAGE_SIZE));
        
        // 페이지네이션 처리
        if (isNext && lastVisible) {
            q = query(collection(db, "reservations"), orderBy("createdAt", "desc"), startAfter(lastVisible), limit(PAGE_SIZE));
        }

        const snapshot = await getDocs(q);
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // 다음 페이지를 위한 커서 저장
        lastVisible = snapshot.docs[snapshot.docs.length - 1];

        if (!isNext) {
            // 초기 로딩 시 캐시 업데이트
            localStorage.setItem(RESERVATION_CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                list: list
            }));
            renderList(list);
        } else {
            appendToList(list);
        }
    } catch (error) {
        console.error("Fetch Error:", error);
        alert("Firestore 보안 규칙 또는 네트워크 오류로 인해 데이터를 불러올 수 없습니다.");
    } finally {
        isFetching = false;
    }
}

/**
 * [UI] 리스트 렌더링 엔진
 */
function renderList(items) {
    const listContainer = document.getElementById('reservation-list');
    listContainer.innerHTML = '';
    
    if (items.length === 0) {
        listContainer.innerHTML = `
            <tr><td colspan="4" class="p-20 text-center text-gray-300 font-bold">
                접수된 예약 내역이 없습니다.
            </td></tr>`;
        return;
    }
    appendToList(items);
}

function appendToList(items) {
    const listContainer = document.getElementById('reservation-list');
    items.forEach(data => {
        const date = data.createdAt?.seconds 
            ? new Date(data.createdAt.seconds * 1000).toLocaleString('ko-KR', { 
                month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' 
              }) 
            : '방금 전';
            
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50/80 transition-all group border-b border-gray-50";
        tr.innerHTML = `
            <td class="px-8 py-5">
                <div class="font-black text-[15px] text-gray-900">${data.name}</div>
                <div class="text-[11px] text-gray-400 font-bold mt-1 uppercase tracking-tighter">${date}</div>
            </td>
            <td class="px-6 py-5">
                <span class="inline-block bg-white border border-gray-100 px-3 py-1 rounded-lg font-black text-[12px] text-gray-600">
                    ${data.package}
                </span>
            </td>
            <td class="px-6 py-5 font-bold text-[13px] text-gray-500">${data.phone}</td>
            <td class="px-6 py-5">
                <div class="flex items-center justify-end gap-3">
                    <select data-id="${data.id}" class="status-select text-[11px] font-black px-4 py-2 rounded-xl border-none outline-none cursor-pointer transition-all ${getStatusColor(data.status)}">
                        <option value="대기" ${data.status === '대기' ? 'selected' : ''}>⏳ 대기</option>
                        <option value="예약완료" ${data.status === '예약완료' ? 'selected' : ''}>✅ 완료</option>
                        <option value="미응답" ${data.status === '미응답' ? 'selected' : ''}>❌ 미응답</option>
                    </select>
                    ${window.userRole === 'MASTER' ? `
                        <button class="del-btn opacity-0 group-hover:opacity-100 p-2 text-red-400 transition-all hover:text-red-600 font-bold text-[12px]" data-id="${data.id}">
                            삭제
                        </button>` : ''}
                </div>
            </td>
        `;
        listContainer.appendChild(tr);
    });
}

function getStatusColor(status) {
    switch(status) {
        case '예약완료': return 'bg-green-100 text-green-700';
        case '미응답': return 'bg-red-100 text-red-700';
        default: return 'bg-gray-100 text-gray-600';
    }
}

/**
 * [이벤트] 위임 처리 (Event Delegation)
 */
document.addEventListener('click', async (e) => {
    // 1. 로그인
    if (e.target.id === 'loginBtn') {
        const email = document.getElementById('adminId').value.trim();
        const pw = document.getElementById('adminPw').value.trim();
        
        if(!email || !pw) return alert("아이디와 비밀번호를 입력해주세요.");

        try {
            e.target.disabled = true;
            e.target.innerText = "인증 중...";
            await signInWithEmailAndPassword(auth, email, pw);
        } catch (err) {
            console.error("Login Error:", err);
            alert("관리자 정보가 일치하지 않거나 권한이 없습니다.");
            e.target.disabled = false;
            e.target.innerText = "시스템 접속";
        }
    }

    // 2. 삭제 (MASTER 전용)
    if (e.target.classList.contains('del-btn')) {
        if (!confirm("해당 예약 정보를 영구 삭제하시겠습니까?\n이 작업은 Firestore에서 즉시 삭제되며 복구할 수 없습니다.")) return;
        
        const id = e.target.dataset.id;
        try {
            await deleteDoc(doc(db, "reservations", id));
            localStorage.removeItem(RESERVATION_CACHE_KEY); // 캐시 무효화
            fetchFromFirestore(); // 리스트 동기화
        } catch (err) {
            alert("삭제 권한이 없습니다. (MASTER 전용 기능)");
        }
    }

    // 3. 로그아웃
    if (e.target.id === 'logoutBtn') {
        if(confirm("시스템을 종료하시겠습니까?")) {
            sessionStorage.clear();
            signOut(auth);
        }
    }
});

/**
 * [이벤트] 상태 변경 (MANAGER/MASTER 공통)
 */
document.addEventListener('change', async (e) => {
    if (e.target.classList.contains('status-select')) {
        const id = e.target.dataset.id;
        const newStatus = e.target.value;
        
        try {
            // Firestore 규칙에 의해 MANAGER는 status 필드만 수정 가능
            await updateDoc(doc(db, "reservations", id), { 
                status: newStatus,
                updatedAt: serverTimestamp() 
            });
            
            // 캐시 무효화 및 UI 업데이트
            localStorage.removeItem(RESERVATION_CACHE_KEY);
            e.target.className = `status-select text-[11px] font-black px-4 py-2 rounded-xl border-none outline-none cursor-pointer transition-all ${getStatusColor(newStatus)}`;
            console.log(`✅ ID: ${id} 의 상태가 ${newStatus}로 변경되었습니다.`);
        } catch (err) {
            alert("수정 권한이 없거나 네트워크 오류입니다.");
            location.reload(); // 불일치 방지를 위한 강제 리로드
        }
    }
});