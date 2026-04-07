/**
 * 래피젠헬스케어 Admin JS - 고도화 버전
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
    
    // 로딩 텍스트 노출 과정을 생략하고 깔끔하게 초기화만 수행
    if(!isNext) listContainer.innerHTML = ``;

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
        // 에러 알림창을 띄우지 않고, 인덱스 부재 등으로 실패 시 자연스럽게 데이터가 없는 상태로 표시
        if (!isNext) {
            listContainer.innerHTML = `<tr><td colspan="6" class="p-20 text-center text-gray-400 font-bold">조건에 맞는 데이터가 없습니다.</td></tr>`;
        }
    } finally {
        isFetching = false;
    }
}

function renderList(items) {
    const listContainer = document.getElementById('reservation-list');
    listContainer.innerHTML = '';
    
    // 조회된 데이터가 없을 경우 처리
    if (items.length === 0) {
        listContainer.innerHTML = `<tr><td colspan="6" class="p-20 text-center text-gray-400 font-bold">신규 예약이 없습니다.</td></tr>`;
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
        const medium = data.medium || ''; 
        const status = data.status || '대기중';

        // 세부 매체(medium)가 존재할 경우에만 하단에 작은 서브 뱃지 추가 생성
        let sourceHtml = `<span class="source-${source} px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter border">${source.toUpperCase()}</span>`;
        if (medium) {
            sourceHtml += `<div class="mt-1.5"><span class="inline-block bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">${medium.toUpperCase()}</span></div>`;
        }

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
                ${sourceHtml}
            </td>
            <td class="px-6 py-5">
                <div class="flex items-center justify-center gap-3">
                    <select data-id="${data.id}" class="status-select text-[11px] font-black pl-4 pr-9 py-2 rounded-xl border-none outline-none cursor-pointer transition-all ${getStatusColor(status)}">
                        <option value="대기중" ${status === '대기중' ? 'selected' : ''}>대기중</option>
                        <option value="확정" ${status === '확정' ? 'selected' : ''}>확정</option>
                        <option value="미응답" ${status === '미응답' ? 'selected' : ''}>미응답</option>
                        <option value="본인취소" ${status === '본인취소' ? 'selected' : ''}>본인취소</option>
                        <option value="예약중복취소" ${status === '예약중복취소' ? 'selected' : ''}>예약중복취소</option>
                        <option value="기타취소" ${status === '기타취소' ? 'selected' : ''}>기타취소</option>
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

// 권한별 UI 업데이트 헬퍼 함수
function updateRoleUI(role) {
    const roleTag = document.getElementById('roleTag');
    const masterBtn = document.querySelector('.role-master-only');
    
    if (!roleTag) return;

    // 기본 태그 클래스 초기화 (App-like UI)
    roleTag.className = "text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-widest transition-colors";

    switch(role) {
        case 'ROOT':
            roleTag.classList.add('bg-purple-100', 'text-purple-700');
            roleTag.innerText = 'ROOT';
            if(masterBtn) masterBtn.classList.remove('hidden'); // 마스터 전용 버튼 노출
            break;
        case 'B2C':
            roleTag.classList.add('bg-blue-100', 'text-blue-700');
            roleTag.innerText = 'B2C';
            if(masterBtn) masterBtn.classList.add('hidden');
            break;
        case 'CRM':
            roleTag.classList.add('bg-green-100', 'text-green-700');
            roleTag.innerText = '콜센터';
            if(masterBtn) masterBtn.classList.add('hidden');
            break;
        case 'MARKETING':
            roleTag.classList.add('bg-pink-100', 'text-pink-700');
            roleTag.innerText = '마케팅';
            if(masterBtn) masterBtn.classList.add('hidden');
            break;
        case 'MANAGER':
            roleTag.classList.add('bg-orange-100', 'text-orange-700');
            roleTag.innerText = '관리자';
            if(masterBtn) masterBtn.classList.add('hidden');
            break;    
        default:
            roleTag.classList.add('bg-gray-100', 'text-gray-500');
            roleTag.innerText = 'GUEST';
            if(masterBtn) masterBtn.classList.add('hidden');
            break;
    }
}

// 2. Auth 상태 감지 옵저버 수정
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // [업데이트] Firestore에서 관리자 권한 정보 1회 로드 (비용 최적화)
        let currentRole = 'GUEST';
        try {
            const adminDocRef = doc(db, "admins", user.uid);
            const adminSnap = await getDoc(adminDocRef);
            
            if (adminSnap.exists()) {
                currentRole = adminSnap.data().role || 'GUEST';
            }
        } catch (error) {
            console.error("권한 정보를 불러오지 못했습니다.", error);
        }

        // UI 렌더링
        updateRoleUI(currentRole);

        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard-screen').classList.remove('hidden');
        document.getElementById('dashboard-screen').classList.add('flex');
        
        setInitialDates();
        fetchFromFirestore(); // 대시보드 리스트 로드
    } else {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('dashboard-screen').classList.add('hidden');
        updateRoleUI('GUEST'); // 로그아웃 시 초기화
    }
});

// [이벤트] 통합 클릭 리스너 (이벤트 위임)
document.addEventListener('click', async (e) => {
    
    // 1. 검색 및 필터링 (조건 조회)
    if (e.target.id === 'filterSearchBtn') {
        lastVisible = null;
        fetchFromFirestore();
        return;
    }

    // 2. 관리자 로그인 로직
    if (e.target.id === 'loginBtn') {
        const emailInput = document.getElementById('adminId');
        const passwordInput = document.getElementById('adminPw');
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !password) {
            alert("아이디(이메일)와 비밀번호를 모두 입력해주세요.");
            if(!email) emailInput.focus();
            else passwordInput.focus();
            return;
        }

        const loginBtn = document.getElementById('loginBtn');
        const originalText = loginBtn.innerText;
        
        loginBtn.innerText = "인증 진행 중...";
        loginBtn.disabled = true;
        loginBtn.classList.add('opacity-70', 'cursor-not-allowed');

        try {
            await signInWithEmailAndPassword(auth, email, password);
            emailInput.value = '';
            passwordInput.value = '';
        } catch (error) {
            console.error("Login Error:", error.code);
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                alert("아이디 또는 비밀번호가 일치하지 않습니다.");
            } else {
                alert("로그인 처리 중 문제가 발생했습니다. 네트워크 상태를 확인해주세요.");
            }
        } finally {
            loginBtn.innerText = originalText;
            loginBtn.disabled = false;
            loginBtn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
        return;
    }

    // 3. 로그아웃 로직
    if (e.target.id === 'logoutBtn') {
        if (confirm("시스템에서 안전하게 로그아웃 하시겠습니까?")) {
            try {
                await signOut(auth);
            } catch (error) {
                console.error("Logout Error:", error);
                alert("로그아웃 중 오류가 발생했습니다.");
            }
        }
        return;
    }
});

// [이벤트] 상태값 변경 로직
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