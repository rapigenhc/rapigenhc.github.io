/* ==========================================================================
   래피젠헬스케어 (Rapigen Healthcare) - 통합 비즈니스 로직 (최적화 버전)
   특징: 보안(XSS) 강화, 비용 효율적 알림, 네이티브 UI/UX, UTM 추적, GEO 최적화
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 1. 파이어베이스 구성
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
   [보안] XSS 방어를 위한 HTML 이스케이프 함수
   --------------------------------------------------------- */
const escapeHTML = (str) => {
    if (!str) return "";
    return str.replace(/[&<>"']/g, (m) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
};

/* ---------------------------------------------------------
   [알림] EmailJS 발송 로직 (CC 활용으로 쿼터 절약)
   --------------------------------------------------------- */
const sendEmailNotification = async (data) => {
    try {
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
   [UI] 로딩 상태 제어 함수
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

/* ---------------------------------------------------------
   [전역 함수 바인딩] ReferenceError 해결 (가장 중요)
   - 모듈 환경에서 HTML 인라인 onclick 이벤트가 함수를 찾을 수 있게 브릿지 역할
   --------------------------------------------------------- */
window.showAlert = (message) => {
    const modal = document.getElementById('alertModal');
    const msgArea = document.getElementById('alertMessage');
    if (modal && msgArea) {
        msgArea.innerText = message;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } else { alert(message); }
};

window.closeAlertModal = function() {
    const alertModal = document.getElementById('alertModal');
    if (alertModal) {
        alertModal.classList.remove('flex');
        alertModal.classList.add('hidden');
    }
};

window.openGuideModal = function() {
    const guideModal = document.getElementById('guideModal');
    if (guideModal) {
        guideModal.classList.remove('hidden');
        guideModal.classList.add('flex');
        document.body.style.overflow = 'hidden'; 
    }
};

window.closeGuideModal = function() {
    const guideModal = document.getElementById('guideModal');
    if (guideModal) {
        guideModal.classList.remove('flex');
        guideModal.classList.add('hidden');
        document.body.style.overflow = ''; 
    }
};

// [오류 해결] 개인정보 동의 모달 전역 바인딩
window.openPrivacyModal = function() {
    const privacyModal = document.getElementById('privacyModal');
    if (privacyModal) {
        privacyModal.classList.remove('hidden');
        privacyModal.classList.add('flex');
        document.body.style.overflow = 'hidden'; 
    }
};

window.closePrivacyModal = function() {
    const privacyModal = document.getElementById('privacyModal');
    if (privacyModal) {
        privacyModal.classList.remove('flex');
        privacyModal.classList.add('hidden');
        document.body.style.overflow = ''; 
    }
};

window.closeModal = function() {
    const successModal = document.getElementById('successModal');
    if (successModal) {
        successModal.classList.remove('flex');
        successModal.classList.add('hidden');
        document.body.style.overflow = '';
    }
};

/* ---------------------------------------------------------
   [이벤트 위임] 전역 클릭 리스너 (동적 로드된 요소의 이중 안전장치)
   --------------------------------------------------------- */
document.body.addEventListener('click', (e) => {
    // 텍스트를 클릭했을 경우에도 모달이 뜨도록 보장
    if (e.target.innerText && e.target.innerText.includes('개인정보수집 이용 동의 (필수)')) {
        window.openPrivacyModal();
    }
});

/* ---------------------------------------------------------
   [핵심] 폼 제출 로직
   --------------------------------------------------------- */
window.submitForm = async function() {
    const lastSubmit = localStorage.getItem('last_submit_time');
    if (window.isSubmitting || (lastSubmit && Date.now() - lastSubmit < 60000)) {
        return window.showAlert("잠시 후 다시 시도해주세요.");
    }

    const nameInput = document.getElementById('userName');
    const phoneInput = document.getElementById('userPhone');
    const agree = document.getElementById('agree');
    
    if (!agree?.checked) return window.showAlert("개인정보 수집에 동의해주세요.");
    if (!/^[가-힣a-zA-Z\s]{2,20}$/.test(nameInput?.value.trim())) return window.showAlert("성함을 정확히 입력해주세요.");
    if (!/^01[016789]\d{7,8}$/.test(phoneInput?.value.trim().replace(/[^0-9]/g, ''))) return window.showAlert("휴대폰 번호를 확인해주세요.");

    const checkedBox = document.querySelector('.package-checkbox:checked');
    const selectedPkg = checkedBox?.closest('.package-card')?.querySelector('h3')?.innerText.trim() || "기본 패키지";

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

        await addDoc(collection(db, "reservations"), formData);
        sendEmailNotification(formData);

        if (typeof gtag === 'function') gtag('event', 'generate_lead', { 'event_label': selectedPkg });

        localStorage.setItem('last_submit_time', Date.now());
        const successModal = document.getElementById('successModal');
        if (successModal) {
            successModal.classList.remove('hidden');
            successModal.classList.add('flex');
            document.body.style.overflow = 'hidden';
        }
        
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
   [GEO 최적화] JSON-LD 구조화 데이터 동적 주입 로직
   --------------------------------------------------------- */
const injectGEOSchema = () => {
    const pageTitle = document.title || "래피젠헬스케어 종합건강검진";
    
    const schema = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "MedicalBusiness",
                "name": "래피젠헬스케어",
                "url": window.location.origin,
                "telephone": "1644-0000",
                "address": {
                    "@type": "PostalAddress",
                    "streetAddress": "가산디지털2로 135 가산어반워크1차 2층",
                    "addressLocality": "금천구",
                    "addressRegion": "서울특별시",
                    "addressCountry": "KR"
                },
                "medicalSpecialty": "Health Checkup",
                "description": pageTitle
            }
        ]
    };

    const scriptObj = document.createElement('script');
    scriptObj.type = 'application/ld+json';
    scriptObj.text = JSON.stringify(schema);
    document.head.appendChild(scriptObj);
};

/* ---------------------------------------------------------
   [DOM Load] 초기화 및 UX 인터랙션 로직
   --------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    injectGEOSchema();

    /* 1. 메인 카로셀(Carousel) 제어 로직 */
    const slides = document.querySelectorAll('.carousel-slide');
    const indicator = document.getElementById('slide-indicator');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (slides.length > 0) {
        let currentIdx = 0;
        let slideInterval;

        const updateSlides = (index) => {
            slides.forEach((slide, i) => {
                if (i === index) {
                    slide.classList.add('active');
                    slide.classList.remove('opacity-0', 'pointer-events-none');
                    slide.classList.add('opacity-100');
                    slide.style.zIndex = '20';
                } else {
                    slide.classList.remove('active', 'opacity-100');
                    slide.classList.add('opacity-0', 'pointer-events-none');
                    slide.style.zIndex = '10';
                }
            });
            if (indicator) indicator.innerText = `${index + 1} / ${slides.length}`;
        };

        const nextSlide = () => {
            currentIdx = (currentIdx + 1) % slides.length;
            updateSlides(currentIdx);
        };

        const prevSlide = () => {
            currentIdx = (currentIdx - 1 + slides.length) % slides.length;
            updateSlides(currentIdx);
        };

        const startAutoSlide = () => {
            if (slideInterval) clearInterval(slideInterval);
            slideInterval = setInterval(nextSlide, 4000);
        };

        nextBtn?.addEventListener('click', () => { nextSlide(); startAutoSlide(); });
        prevBtn?.addEventListener('click', () => { prevSlide(); startAutoSlide(); });

        updateSlides(currentIdx);
        startAutoSlide();

        const container = document.getElementById('carousel-container')?.parentElement;
        container?.addEventListener('mouseenter', () => clearInterval(slideInterval));
        container?.addEventListener('mouseleave', startAutoSlide);
    }

    /* 2. UTM 파라미터 저장 */
    const params = new URLSearchParams(window.location.search);
    if (params.get('utm_source')) sessionStorage.setItem('rapi_utm_source', params.get('utm_source').toLowerCase());
    if (params.get('utm_medium')) sessionStorage.setItem('rapi_utm_medium', params.get('utm_medium').toLowerCase());

    /* 3. 푸터 동적 로드 */
    const fContainer = document.getElementById('common-footer-container');
    if (fContainer) {
        fetch(`footer.html?v=${Date.now()}`)
            .then(r => r.text())
            .then(html => fContainer.innerHTML = html);
    }

    /* 4. 카카오톡 상담 텍스트 페이드 애니메이션 */
    const bubble = document.getElementById('bubble-text');
    if (bubble) {
        const msgs = ["빠른 채팅 상담하기", "어떤 걸 선택해야하나요?", "진행 중인 이벤트는?", "어떤 검사인지 궁금해요"];
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

    /* 5. [이벤트 위임] 체크박스 및 카드 선택 효과 */
    document.body.addEventListener('change', (e) => {
        if (e.target.classList.contains('package-checkbox')) {
            const boxes = document.querySelectorAll('.package-checkbox');
            boxes.forEach(cb => { if (cb !== e.target) cb.checked = false; });
            if (![...boxes].some(cb => cb.checked)) e.target.checked = true; 
            
            document.querySelectorAll('.package-card').forEach(card => {
                const isChecked = card.querySelector('.package-checkbox').checked;
                card.classList.toggle('border-[#F27405]', isChecked);
                card.classList.toggle('bg-orange-50/30', isChecked);
            });
        }
    });

    /* 6. 부드러운 탭 필터링 로직 */
    const tabBtns = document.querySelectorAll('.tab-btn');
    const eventItems = document.querySelectorAll('.event-item');

    if (eventItems.length > 0) {
        eventItems.forEach(item => {
            item.style.transition = 'opacity 0.3s ease-out, max-height 0.5s ease-in-out, padding 0.5s ease-in-out, margin 0.5s ease-in-out, border-width 0.5s ease-in-out';
            item.style.overflow = 'hidden';
            item.style.maxHeight = '500px'; 
            item.style.opacity = '1';
        });

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(t => {
                    t.classList.remove('border-[#F27405]', 'text-[#F27405]');
                    t.classList.add('border-transparent', 'text-gray-500');
                });
                btn.classList.remove('border-transparent', 'text-gray-500');
                btn.classList.add('border-[#F27405]', 'text-[#F27405]');

                const target = btn.getAttribute('data-target');

                eventItems.forEach(item => {
                    const category = item.getAttribute('data-category');
                    if (target !== 'all' && category !== target) {
                        item.style.opacity = '0'; 
                    }
                });

                setTimeout(() => {
                    eventItems.forEach(item => {
                        const category = item.getAttribute('data-category');
                        if (target !== 'all' && category !== target) {
                            item.style.maxHeight = '0px';
                            item.style.paddingTop = '0px';
                            item.style.paddingBottom = '0px';
                            item.style.borderWidth = '0px';
                            item.style.margin = '0px';
                        } else {
                            item.style.maxHeight = '500px'; 
                            item.style.paddingTop = ''; 
                            item.style.paddingBottom = '';
                            item.style.borderWidth = '';
                            item.style.margin = '';
                            setTimeout(() => { item.style.opacity = '1'; }, 100); 
                        }
                    });
                    if (typeof AOS !== 'undefined') {
                        setTimeout(() => { AOS.refresh(); }, 500); 
                    }
                }, 300); 
            });
        });
    }
});