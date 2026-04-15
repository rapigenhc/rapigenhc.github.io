/* ==========================================================================
   래피젠헬스케어 (Rapigen Healthcare) - 통합 비즈니스 로직 (최적화 버전)
   특징: 보안(XSS) 강화, 비용 효율적 알림, 네이티브 UI/UX, UTM 추적 통합
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 1. 파이어베이스 구성 [cite: 86]
const firebaseConfig = {
  apiKey: "AIzaSyDXL8vuvgnNJmHU0fZwjquIgfD7bHZdA6c",
  authDomain: "rapigenhc-event.firebaseapp.com",
  projectId: "rapigenhc-event",
  storageBucket: "rapigenhc-event.firebasestorage.app",
  messagingSenderId: "893881210369",
  appId: "1:893881210369:web:e92344136212280e589200",
  measurementId: "G-GM4ZWH6XEY"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ---------------------------------------------------------
   [보안] XSS 방어를 위한 HTML 이스케이프 함수 [cite: 8, 108, 119]
   --------------------------------------------------------- */
const escapeHTML = (str) => {
    if (!str) return "";
    return str.replace(/[&<>"']/g, (m) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
};

/* ---------------------------------------------------------
   [알림] EmailJS 발송 로직 (CC 활용으로 쿼터 절약) [cite: 43, 44, 77, 110]
   --------------------------------------------------------- */
const sendEmailNotification = async (data) => {
    try {
        // template_NEW-Reserve 템플릿의 변수와 일치시킴 [cite: 68, 106]
        await emailjs.send('service_event-github', 'template_NEW-Reserve', {
            name: data.name,
            phone: data.phone,
            package: data.package,
            date: new Date().toLocaleDateString('ko-KR'),
            time: new Date().toLocaleTimeString('ko-KR'),
            received_at: new Date().toLocaleString('ko-KR')
        });
        console.log("관리자 알림 발송 성공");
    } catch (err) {
        console.error("EmailJS 발송 실패:", err);
    }
};

/* ---------------------------------------------------------
   [UI] 로딩 상태 및 모달 제어 함수 [cite: 90, 91, 100, 109]
   --------------------------------------------------------- */
const setButtonLoading = (isLoading) => {
    const btn = document.querySelector('button[onclick="submitForm()"]');
    if (!btn) return;
    btn.disabled = isLoading;
    btn.innerHTML = isLoading ? 
        `<svg class="animate-spin h-4 w-4 text-white inline mr-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> 접수 중...` : 
        '상담 접수하기';
    btn.classList.toggle('opacity-70', isLoading);
};

window.showAlert = (message) => {
    const modal = document.getElementById('alertModal');
    const msgArea = document.getElementById('alertMessage');
    if (modal && msgArea) {
        msgArea.innerText = message;
        modal.classList.replace('hidden', 'flex');
    } else { alert(message); }
};

window.closeAlertModal = () => document.getElementById('alertModal')?.classList.replace('flex', 'hidden');
window.closeModal = () => document.getElementById('successModal')?.classList.replace('flex', 'hidden');

/* ---------------------------------------------------------
   [핵심] 폼 제출 로직 [cite: 26, 94, 129]
   --------------------------------------------------------- */
window.submitForm = async function() {
    // 도배 방지 (60초 쿨타임) [cite: 51, 94, 132]
    const lastSubmit = localStorage.getItem('last_submit_time');
    if (window.isSubmitting || (lastSubmit && Date.now() - lastSubmit < 60000)) {
        return window.showAlert("잠시 후 다시 시도해주세요.");
    }

    const nameInput = document.getElementById('userName');
    const phoneInput = document.getElementById('userPhone');
    const agree = document.getElementById('agree');
    
    // 유효성 검사 (Regex) [cite: 8, 119]
    if (!agree?.checked) return window.showAlert("개인정보 수집에 동의해주세요.");
    if (!/^[가-힣a-zA-Z\s]{2,20}$/.test(nameInput?.value.trim())) return window.showAlert("성함을 정확히 입력해주세요.");
    if (!/^01[016789]\d{7,8}$/.test(phoneInput?.value.trim().replace(/[^0-9]/g, ''))) return window.showAlert("휴대폰 번호를 확인해주세요.");

    // 패키지 정보 추출 [cite: 88]
    const checkedBox = document.querySelector('.package-checkbox:checked');
    const selectedPkg = checkedBox?.closest('.package-card')?.querySelector('h3')?.innerText.trim() || "기본 패키지";

    // 데이터 가공 (XSS 방어 및 UTM 포함) [cite: 108, 129]
    const formData = {
        name: escapeHTML(nameInput.value.trim()),
        phone: escapeHTML(phoneInput.value.trim()),
        package: escapeHTML(selectedPkg),
        status: "대기중",
        source: sessionStorage.getItem('rapi_utm_source') || 'direct',
        medium: sessionStorage.getItem('rapi_utm_medium') || '',
        createdAt: serverTimestamp(),
        userAgent: navigator.userAgent
    };

    try {
        window.isSubmitting = true;
        setButtonLoading(true);

        // 1. Firestore 저장 [cite: 85, 120]
        await addDoc(collection(db, "reservations"), formData);

        // 2. 관리자 이메일 알림 (비동기) [cite: 38, 81]
        sendEmailNotification(formData);

        // 3. 마케팅 성과 추적 (GA4) [cite: 133]
        if (typeof gtag === 'function') gtag('event', 'generate_lead', { 'event_label': selectedPkg });

        // 4. 완료 처리
        localStorage.setItem('last_submit_time', Date.now());
        document.getElementById('successModal')?.classList.replace('hidden', 'flex');
        
        // 필드 초기화
        nameInput.value = ''; phoneInput.value = ''; agree.checked = false;

    } catch (err) {
        console.error("DB Error:", err);
        window.showAlert("오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
        setButtonLoading(false);
        setTimeout(() => { window.isSubmitting = false; }, 1000);
    }
};

/* ---------------------------------------------------------
   [DOM Load] 초기화 및 UX 인터랙션 로직 [cite: 88, 118, 128]
   --------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    // UTM 파라미터 저장 [cite: 129]
    const params = new URLSearchParams(window.location.search);
    if (params.get('utm_source')) sessionStorage.setItem('rapi_utm_source', params.get('utm_source').toLowerCase());
    if (params.get('utm_medium')) sessionStorage.setItem('rapi_utm_medium', params.get('utm_medium').toLowerCase());

    // 푸터 동적 로드 [cite: 7, 118, 126]
    const fContainer = document.getElementById('common-footer-container');
    if (fContainer) {
        fetch(`footer.html?v=${Date.now()}`)
            .then(r => r.text())
            .then(html => fContainer.innerHTML = html);
    }

    // 카카오톡 상담 텍스트 로테이션 [cite: 128]
    const bubble = document.getElementById('bubble-text');
    if (bubble) {
        const msgs = ["빠른 채팅 상담하기", "어떤 검사인지 궁금해요", "검진 전 금식 안내"];
        let mIdx = 0;
        setInterval(() => {
            bubble.style.opacity = 0;
            setTimeout(() => {
                mIdx = (mIdx + 1) % msgs.length;
                bubble.innerText = msgs[mIdx];
                bubble.style.opacity = 1;
            }, 300);
        }, 4000);
    }

    // [이벤트 위임] 체크박스 및 아코디언 제어 [cite: 12, 123]
    document.body.addEventListener('change', (e) => {
        if (e.target.classList.contains('package-checkbox')) {
            const boxes = document.querySelectorAll('.package-checkbox');
            boxes.forEach(cb => { if (cb !== e.target) cb.checked = false; });
            if (![...boxes].some(cb => cb.checked)) e.target.checked = true; // 최소 1개 유지
            
            // 카드 스타일 업데이트
            document.querySelectorAll('.package-card').forEach(card => {
                const isChecked = card.querySelector('.package-checkbox').checked;
                card.classList.toggle('border-[#F27405]', isChecked);
                card.classList.toggle('bg-orange-50/30', isChecked);
            });
        }
    });
});

// 모달 유틸리티
window.openPrivacyModal = () => document.getElementById('privacyModal')?.classList.replace('hidden', 'flex');
window.closePrivacyModal = () => document.getElementById('privacyModal')?.classList.replace('flex', 'hidden');