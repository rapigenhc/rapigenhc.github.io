// 1. 파이어베이스 최신 모듈 불러오기
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 2. 파이어베이스 설정
const firebaseConfig = {
  apiKey: "AIzaSyDXL8vuvgnNJmHU0fZwjquIgfD7bHZdA6c",
  authDomain: "rapigenhc-event.firebaseapp.com",
  projectId: "rapigenhc-event",
  storageBucket: "rapigenhc-event.firebasestorage.app",
  messagingSenderId: "893881210369",
  appId: "1:893881210369:web:e92344136212280e589200",
  measurementId: "G-GM4ZWH6XEY"
};

// 3. 파이어베이스 앱 및 데이터베이스 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DOM 로드 시 실행될 통합 로직
document.addEventListener('DOMContentLoaded', () => {

    /* =========================================
       [핵심] URL 유입 경로(UTM) 세션 저장
    ========================================= */
    const urlParams = new URLSearchParams(window.location.search);
    const utmSource = urlParams.get('utm_source');
    const utmMedium = urlParams.get('utm_medium');
    
    // URL에 utm_source가 있다면 SessionStorage에 소문자로 저장 (창 닫기 전까지 유지)
    if (utmSource) {
        sessionStorage.setItem('rapi_utm_source', utmSource.toLowerCase());
    }
    if (utmMedium) {
        sessionStorage.setItem('rapi_utm_medium', utmMedium.toLowerCase());
    }

    /* =========================================
       0. 공통 푸터 불러오기 (fetch)
    ========================================= */
    const footerContainer = document.getElementById('common-footer-container');
    if (footerContainer) {
        fetch('footer.html?v=' + new Date().getTime())
            .then(response => response.text())
            .then(data => {
                footerContainer.innerHTML = data;
            })
            .catch(error => console.error('푸터를 불러오는데 실패했습니다:', error));
    }

    /* =========================================
       1. 메인 배너 카로셀 로직
    ========================================= */
    const slides = document.querySelectorAll('.carousel-slide');
    const indicator = document.getElementById('slide-indicator');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    let currentIndex = 0;
    let slideTimer;

    if (slides.length > 0) {
        function goToSlide(index) {
            slides[currentIndex].classList.remove('opacity-100', 'z-20');
            slides[currentIndex].classList.add('opacity-0', 'z-10');
            
            currentIndex = index;
            if (currentIndex < 0) currentIndex = slides.length - 1;
            if (currentIndex >= slides.length) currentIndex = 0;
            
            slides[currentIndex].classList.remove('opacity-0', 'z-10');
            slides[currentIndex].classList.add('opacity-100', 'z-20');
            
            indicator.innerText = `${currentIndex + 1} / ${slides.length}`;
        }

        function startTimer() {
            slideTimer = setInterval(() => {
                goToSlide(currentIndex + 1);
            }, 3000);
        }

        function resetTimer() {
            clearInterval(slideTimer);
            startTimer();
        }

        if(prevBtn) prevBtn.addEventListener('click', () => { goToSlide(currentIndex - 1); resetTimer(); });
        if(nextBtn) nextBtn.addEventListener('click', () => { goToSlide(currentIndex + 1); resetTimer(); });

        startTimer();
    }

    /* =========================================
       2 & 3. 탭 분류 및 마감임박 필터 통합 로직
    ========================================= */
    const tabBtns = document.querySelectorAll('.tab-btn');
    const sortBtns = document.querySelectorAll('.sort-btn');
    const eventContainer = document.getElementById('event-list-container');

    if (eventContainer) {
        let currentCategory = 'all';
        let currentSort = 'newest';

        function updateEventList() {
            const items = Array.from(eventContainer.querySelectorAll('.event-item'));

            items.forEach(item => {
                const matchCategory = (currentCategory === 'all' || item.dataset.category === currentCategory);
                const matchUrgent = (currentSort === 'urgent') ? (item.dataset.urgent === 'true') : true;

                if (matchCategory && matchUrgent) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });

            items.sort((a, b) => {
                if (currentSort === 'newest') {
                    return new Date(b.dataset.date) - new Date(a.dataset.date);
                } else if (currentSort === 'urgent') {
                    return parseInt(a.dataset.days) - parseInt(b.dataset.days);
                }
            });

            items.forEach(item => eventContainer.appendChild(item));
        }

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(t => {
                    t.classList.remove('border-[#F27405]', 'text-[#F27405]');
                    t.classList.add('border-transparent', 'text-gray-500');
                });
                btn.classList.add('border-[#F27405]', 'text-[#F27405]');
                btn.classList.remove('border-transparent', 'text-gray-500');

                currentCategory = btn.dataset.target;
                updateEventList();
            });
        });

        sortBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                sortBtns.forEach(b => {
                    b.classList.remove('bg-gray-800', 'text-white', 'border-transparent');
                    b.classList.add('bg-white', 'text-gray-600', 'border-gray-200');
                });
                btn.classList.remove('bg-white', 'text-gray-600', 'border-gray-200');
                btn.classList.add('bg-gray-800', 'text-white', 'border-transparent');

                currentSort = btn.dataset.sort;
                updateEventList();
            });
        });

        updateEventList();
    }

    /* =========================================
       4. 체크박스 & 아코디언 UI 제어
    ========================================= */
    const cards = document.querySelectorAll('.package-card');
    const checkboxes = document.querySelectorAll('.package-checkbox');

    checkboxes.forEach((checkbox, index) => {
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                checkboxes.forEach((cb, cbIndex) => {
                    if (index !== cbIndex) cb.checked = false;
                });
            } else {
                checkbox.checked = true; // 최소 1개 필수 선택 방어
            }

            cards.forEach((card, cardIndex) => {
                if (checkboxes[cardIndex].checked) {
                    card.classList.remove('border', 'border-gray-200', 'bg-white');
                    card.classList.add('border-2', 'border-[#F27405]', 'bg-orange-50/30');
                } else {
                    card.classList.remove('border-2', 'border-[#F27405]', 'bg-orange-50/30');
                    card.classList.add('border', 'border-gray-200', 'bg-white');
                }
            });
        });
    });

    const accordionToggles = document.querySelectorAll('.accordion-toggle');
    accordionToggles.forEach(toggle => {
        toggle.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            this.parentElement.toggleAttribute('open');
        });
    });

    /* =========================================
    8. 카카오톡 말풍선 텍스트 로테이션 (UX 최적화)
    ========================================= */
    const bubbleText = document.getElementById('bubble-text');
    if (bubbleText) {
        const messages = [
            "빠른 채팅 상담하기", 
            "어떤 검사인지 궁금해요", 
            "2주후에 예약되나요?",
            "검진 전 금식해야 하나요?"
        ];
        let msgIdx = 0;

        setInterval(() => {
            // 페이드 아웃 효과를 위한 투명도 조절 (선택사항)
            bubbleText.style.opacity = 0;
            
            setTimeout(() => {
                msgIdx = (msgIdx + 1) % messages.length;
                bubbleText.innerText = messages[msgIdx];
                bubbleText.style.opacity = 1;
            }, 300); // 0.3초 후 텍스트 교체 및 페이드 인
        }, 4000);
    }
});

/* =========================================
   전역 함수 (Window Object 바인딩) - 폼 제출 및 모달
========================================= */

// 로딩 상태 UI 헬퍼
const setButtonLoading = (isLoading) => {
    const btn = document.querySelector('button[onclick="submitForm()"]');
    if (!btn) return;

    if (isLoading) {
        btn.disabled = true;
        btn.innerHTML = `<svg class="animate-spin h-4 w-4 text-white inline mr-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> 접수 중...`;
        btn.classList.add('opacity-70', 'cursor-not-allowed');
    } else {
        btn.disabled = false;
        btn.innerText = '상담 접수하기';
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
    }
};

window.showAlert = function(message) {
    const alertModal = document.getElementById('alertModal');
    const alertMessage = document.getElementById('alertMessage');
    if (alertModal && alertMessage) {
        alertMessage.innerText = message;
        alertModal.classList.remove('hidden');
        alertModal.classList.add('flex');
    } else {
        alert(message);
    }
};

window.closeAlertModal = function() {
    const alertModal = document.getElementById('alertModal');
    if (alertModal) {
        alertModal.classList.add('hidden');
        alertModal.classList.remove('flex');
    }
};

// [핵심] 폼 접수하기 로직
window.submitForm = async function() {
    // 도배 방지 (현재 로딩 중이거나 60초 내 재접수 시단)
    if (window.isSubmitting || localStorage.getItem('last_submit_time') > Date.now() - 60000) {
        window.showAlert("이미 접수 중이거나 최근에 접수하셨습니다. 잠시 후 다시 시도해주세요.");
        return;
    }

    const agree = document.getElementById('agree');
    const nameInput = document.getElementById('userName');
    const phoneInput = document.getElementById('userPhone');
    
    // 정규식 보안 검증
    const nameRegex = /^[가-힣a-zA-Z\s]{2,20}$/; 
    const phoneRegex = /^01[016789]\d{7,8}$/; 

    if (agree && !agree.checked) {
        window.showAlert("개인정보수집 이용에 동의해주세요.");
        return;
    }
    
    const nameValue = nameInput ? nameInput.value.trim() : '';
    if (!nameRegex.test(nameValue)) {
        window.showAlert("이름을 특수문자나 숫자 없이 올바르게 입력해주세요.");
        if(nameInput) nameInput.focus();
        return;
    }

    const phoneValue = phoneInput ? phoneInput.value.trim().replace(/[^0-9]/g, '') : '';
    if (!phoneRegex.test(phoneValue)) {
        window.showAlert("올바른 휴대폰 번호를 입력해주세요.");
        if(phoneInput) phoneInput.focus();
        return;
    }

    // 선택된 패키지 추출
    let selectedPkg = "패키지 선택 안함";
    const checkedBox = document.querySelector('.package-checkbox:checked');
    if (checkedBox) {
        const card = checkedBox.closest('.package-card');
        if(card) selectedPkg = card.querySelector('h3').innerText.trim();
    }

    try {
        window.isSubmitting = true;
        setButtonLoading(true);

        // 세션에서 UTM 소스 가져오기
        const sourceData = sessionStorage.getItem('rapi_utm_source') || 'direct';
        const mediumData = sessionStorage.getItem('rapi_utm_medium') || '';

        // Firestore 저장 (어드민 연동을 위해 status: "대기중")
        await addDoc(collection(db, "reservations"), {
            name: nameValue,
            phone: phoneValue,
            package: selectedPkg,
            status: "대기중",
            source: sourceData, 
            medium: mediumData,
            createdAt: serverTimestamp(),
            userAgent: navigator.userAgent
        });

        // GA4 이벤트 전송 방어코드
        if (typeof gtag === 'function') {
            gtag('event', 'generate_lead', {
                event_category: 'Reservation',
                event_label: selectedPkg,
                value: 1
            });
        }

        // 성공 처리 및 타임스탬프 기록
        localStorage.setItem('last_submit_time', Date.now());
        
        // 성공 모달 노출 및 폼 초기화
        const successModal = document.getElementById('successModal');
        if (successModal) {
            successModal.classList.remove('hidden');
            successModal.classList.add('flex');
        }
        if (nameInput) nameInput.value = '';
        if (phoneInput) phoneInput.value = '';
        if (agree) agree.checked = false;

    } catch (error) {
        console.error("Firebase Error:", error);
        window.showAlert("접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
        setButtonLoading(false);
        setTimeout(() => { window.isSubmitting = false; }, 1000);
    }
};

window.closeModal = function() {
    const successModal = document.getElementById('successModal');
    if (successModal) {
        successModal.classList.add('hidden');
        successModal.classList.remove('flex');
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
        guideModal.classList.add('hidden');
        guideModal.classList.remove('flex');
        document.body.style.overflow = '';
    }
};

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
        privacyModal.classList.add('hidden');
        privacyModal.classList.remove('flex');
        document.body.style.overflow = '';
    }
};