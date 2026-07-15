/* ==========================================================================
   래피젠헬스케어 (Rapigen Healthcare) - 통합 비즈니스 로직 (최적화 버전)
   특징: Fallback 모달 인젝션, 이벤트 위임 충돌 방어, XSS 차단
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
   [전역 함수 바인딩] 모달 및 UI 제어 (최우선 로드)
--------------------------------------------------------- */
window.showAlert = (message) => {
    const modal = document.getElementById('alertModal');
    const msgArea = document.getElementById('alertMessage');
    if (modal && msgArea) {
        msgArea.innerText = message;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } else { 
        alert(message); 
    }
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

// [핵심 보완] 개인정보 동의 모달 강제 전역 바인딩 및 동적 인젝션(Fallback)
window.openPrivacyModal = function() {
    let privacyModal = document.getElementById('privacyModal') || document.getElementById('PrivacyModal');
    
    // 방어 로직: footer.html에서 모달을 불러오지 못했을 경우 즉시 DOM에 주입
    if (!privacyModal) {
        console.warn("DOM에서 모달 요소를 찾지 못해 동적으로 생성합니다.");
        const modalHTML = `
        <div id="privacyModal" class="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-2xl p-6 md:p-8 max-w-sm w-full mx-4 relative shadow-2xl" onclick="event.stopPropagation()">
                <button onclick="closePrivacyModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-900 transition-colors p-1">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
                <h3 class="text-[17px] font-bold mb-4 text-gray-900 pr-6">개인정보 수집 및 이용 동의</h3>
                <div class="text-[13px] text-gray-600 space-y-3 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100 leading-relaxed break-keep">
                    <p><strong class="text-gray-800">1. 수집 항목:</strong> 이름, 휴대폰 번호</p>
                    <p><strong class="text-gray-800">2. 수집 및 이용 목적:</strong> 건강검진 이벤트 상담, 예약 확인 및 안내</p>
                    <p><strong class="text-gray-800">3. 보유 및 이용 기간:</strong> 상담 완료 후 6개월 보관 후 파기</p>
                    <p class="text-[11px] text-gray-400 mt-3">* 동의를 거부할 권리가 있으나, 거부 시 이벤트 상담 및 예약이 제한될 수 있습니다.</p>
                </div>
                <button onclick="closePrivacyModal()" class="w-full bg-[#F27405] text-white font-bold py-3.5 rounded-xl hover:bg-orange-600 transition-colors active:scale-95">확인했습니다</button>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        privacyModal = document.getElementById('privacyModal');
    } else {
        privacyModal.classList.remove('hidden');
        privacyModal.classList.add('flex');
    }
    
    document.body.style.overflow = 'hidden'; 
};

window.closePrivacyModal = function() {
    const privacyModal = document.getElementById('privacyModal') || document.getElementById('PrivacyModal');
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
   [이벤트 위임] 모달 강제 팝업 및 방어 코드
--------------------------------------------------------- */
document.body.addEventListener('click', (e) => {
    if (!e.target) return;

    // 1. 네이티브 앱 UX: 어두운 배경(Dimmed) 터치 시 모달 자동 닫기
    const pModal = document.getElementById('privacyModal');
    if (pModal && e.target === pModal) {
        window.closePrivacyModal();
        return;
    }

    // 2. 인라인 onclick이 있는 요소는 위임 이벤트 중복 실행 방지
    if (e.target.closest('[onclick*="openPrivacyModal"]')) return;

    // 3. 텍스트 기반 스마트 감지
    const text = (e.target.innerText || e.target.textContent || '').trim();
    if (text.length > 0 && text.length < 50 && text.includes('개인정보') && text.includes('동의')) {
        window.openPrivacyModal();
    }
});

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
   [알림] EmailJS 발송 로직
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
   [GEO 최적화] JSON-LD 동적 주입 로직
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
                "telephone": "1544-5189",
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

    /* 1. 카로셀 터치/자동 슬라이드 최적화 로직 */
    const track = document.querySelector('.carousel-track');
    const originalSlides = document.querySelectorAll('.carousel-item');
    const indicator = document.getElementById('slide-indicator');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (originalSlides.length > 0 && track) {
        const totalItems = originalSlides.length;

        const firstClone = originalSlides[0].cloneNode(true);
        const lastClone = originalSlides[totalItems - 1].cloneNode(true);
        
        track.appendChild(firstClone);
        track.insertBefore(lastClone, originalSlides[0]);
        
        let currentIdx = 1; 
        let slideInterval;
        let isTransitioning = false;
        const itemWidthPercent = 90; 

        let isDragging = false;
        let startX = 0;
        let currentX = 0;

        const updateSlides = (animate = true) => {
            if (animate) {
                track.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
            } else {
                track.style.transition = 'none';
            }
            
            const finalOffset = currentIdx * itemWidthPercent;
            track.style.transform = `translateX(-${finalOffset}%)`;
            
            let displayIdx = currentIdx;
            if (currentIdx === 0) displayIdx = totalItems;
            if (currentIdx === totalItems + 1) displayIdx = 1;
            
            if (indicator) indicator.innerText = `${displayIdx} / ${totalItems}`;
        };

        const nextSlide = () => {
            if (isTransitioning) return;
            isTransitioning = true;
            currentIdx++;
            updateSlides(true);
        };

        const prevSlide = () => {
            if (isTransitioning) return;
            isTransitioning = true;
            currentIdx--;
            updateSlides(true);
        };

        track.addEventListener('transitionend', () => {
            isTransitioning = false;
            if (currentIdx === totalItems + 1) {
                currentIdx = 1;
                updateSlides(false);
            }
            if (currentIdx === 0) {
                currentIdx = totalItems;
                updateSlides(false);
            }
        });

        const startAutoSlide = () => {
            if (slideInterval) clearInterval(slideInterval);
            slideInterval = setInterval(nextSlide, 2000); 
        };

        nextBtn?.addEventListener('click', () => { nextSlide(); startAutoSlide(); });
        prevBtn?.addEventListener('click', () => { prevSlide(); startAutoSlide(); });

        const getPositionX = (event) => event.type.includes('mouse') ? event.pageX : event.touches[0].clientX;

        const touchStart = (event) => {
            if (isTransitioning) return;
            isDragging = true;
            startX = getPositionX(event);
            if (slideInterval) clearInterval(slideInterval);
            track.style.transition = 'none'; 
        };

        const touchMove = (event) => {
            if (!isDragging) return;
            currentX = getPositionX(event);
            const diffX = currentX - startX;
            const baseOffset = currentIdx * itemWidthPercent;
            track.style.transform = `translateX(calc(-${baseOffset}% + ${diffX}px))`;
        };

        const touchEnd = (event) => {
            if (!isDragging) return;
            isDragging = false;
            
            const diffX = currentX !== 0 ? currentX - startX : 0;
            const threshold = 50; 
            
            if (Math.abs(diffX) > threshold && currentX !== 0) {
                if (diffX > 0) prevSlide(); 
                else nextSlide();           
            } else {
                updateSlides(true); 
            }
            
            currentX = 0; 
            startAutoSlide(); 
        };

        track.addEventListener('touchstart', touchStart, { passive: true });
        track.addEventListener('touchmove', touchMove, { passive: true });
        track.addEventListener('touchend', touchEnd);
        
        track.addEventListener('mousedown', touchStart);
        track.addEventListener('mousemove', touchMove);
        track.addEventListener('mouseup', touchEnd);
        track.addEventListener('mouseleave', () => {
            if (isDragging) touchEnd();
        });

        updateSlides(false);
        startAutoSlide();

        const container = document.getElementById('hero-carousel');
        if(container) {
            container.addEventListener('mouseenter', () => { if(!isDragging) clearInterval(slideInterval); });
            container.addEventListener('mouseleave', () => { if(!isDragging) startAutoSlide(); });
        }
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

    /* 4. 체크박스 선택 효과 */
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

    /* 5. 부드러운 탭 필터링 로직 */
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