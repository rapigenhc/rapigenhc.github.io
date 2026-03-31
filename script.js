// 1. 파이어베이스 최신 모듈 불러오기 (파일 맨 윗줄에 추가)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 2. 파이어베이스 설정 (아까 메모장에 복사해둔 내 설정값으로 덮어쓰세요!)
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


document.addEventListener('DOMContentLoaded', () => {
          
    /* =========================================
       0. 공통 푸터 불러오기 (fetch)
    ========================================= */
    const footerContainer = document.getElementById('common-footer-container');
    if (footerContainer) {
        // 뒤에 '?v=시간'을 붙여서 브라우저가 무조건 최신 footer.html을 다시 가져오도록 강제
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

    // 슬라이드가 존재할 때만 실행
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

        prevBtn.addEventListener('click', () => {
            goToSlide(currentIndex - 1);
            resetTimer();
        });

        nextBtn.addEventListener('click', () => {
            goToSlide(currentIndex + 1);
            resetTimer();
        });

        startTimer();
    }

    /* =========================================
       2 & 3. 탭 분류 및 마감임박 필터 통합 로직
    ========================================= */
    const tabBtns = document.querySelectorAll('.tab-btn');
    const sortBtns = document.querySelectorAll('.sort-btn');
    const eventContainer = document.getElementById('event-list-container');

    if (eventContainer) {
        // 현재 선택된 필터 상태 저장
        let currentCategory = 'all';
        let currentSort = 'newest';

        function updateEventList() {
            const items = Array.from(eventContainer.querySelectorAll('.event-item'));

            // 1. 조건에 맞춰 숨기거나 보여주기 (필터링)
            items.forEach(item => {
                // 카테고리 탭 확인
                const matchCategory = (currentCategory === 'all' || item.dataset.category === currentCategory);
                // 마감임박 버튼을 눌렀을 땐 data-urgent="true"인 것만 보여줌
                const matchUrgent = (currentSort === 'urgent') ? (item.dataset.urgent === 'true') : true;

                // 두 조건 모두 만족해야 화면에 표시
                if (matchCategory && matchUrgent) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });

            // 2. 보여주는 김에 정렬(위치 재배치)도 수행
            items.sort((a, b) => {
                if (currentSort === 'newest') {
                    // 전체보기 시: 최신 날짜순
                    return new Date(b.dataset.date) - new Date(a.dataset.date);
                } else if (currentSort === 'urgent') {
                    // 마감임박 시: 남은 일수 짧은 순
                    return parseInt(a.dataset.days) - parseInt(b.dataset.days);
                }
            });

            // 정렬된 순서대로 HTML에 다시 그리기
            items.forEach(item => eventContainer.appendChild(item));
        }

        // 🎯 상단 탭 (전체/국가/종합) 클릭 시
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(t => {
                    t.classList.remove('border-[#F27405]', 'text-[#F27405]');
                    t.classList.add('border-transparent', 'text-gray-500');
                });
                btn.classList.add('border-[#F27405]', 'text-[#F27405]');
                btn.classList.remove('border-transparent', 'text-gray-500');

                // 현재 카테고리 업데이트 후 리스트 새로고침
                currentCategory = btn.dataset.target;
                updateEventList();
            });
        });

        // 🎯 서브 필터 (전체보기/마감임박) 클릭 시
        sortBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                sortBtns.forEach(b => {
                    b.classList.remove('bg-gray-800', 'text-white', 'border-transparent');
                    b.classList.add('bg-white', 'text-gray-600', 'border-gray-200');
                });
                btn.classList.remove('bg-white', 'text-gray-600', 'border-gray-200');
                btn.classList.add('bg-gray-800', 'text-white', 'border-transparent');

                // 현재 필터 상태 업데이트 후 리스트 새로고침
                currentSort = btn.dataset.sort;
                updateEventList();
            });
        });

        // 페이지 최초 진입 시 리스트 기본 세팅
        updateEventList();
    }

    /* =========================================
       4. 상세 페이지 폼 제출 및 모달 관련 (Firebase DB 연동)
    ========================================= */
    // 커스텀 알림 모달 띄우기 함수
    window.showAlert = function(message) {
        const alertModal = document.getElementById('alertModal');
        const alertMessage = document.getElementById('alertMessage');
        if (alertModal && alertMessage) {
            alertMessage.innerText = message;
            alertModal.classList.remove('hidden');
            alertModal.classList.add('flex');
        } else {
            // 모달 HTML이 없는 페이지를 위한 기본 알림
            alert(message);
        }
    }

    // 커스텀 알림 모달 닫기 함수
    window.closeAlertModal = function() {
        const alertModal = document.getElementById('alertModal');
        if (alertModal) {
            alertModal.classList.add('hidden');
            alertModal.classList.remove('flex');
        }
    }

    // 폼 접수하기 버튼 클릭 시 (보안 및 유효성 검사 강화)
    window.submitForm = async function() {
        // 🚨 방어책 1: 중복 전송(도배) 방지용 플래그
        if (window.isSubmitting) return; 

        const agree = document.getElementById('agree');
        const nameInput = document.getElementById('userName');
        const phoneInput = document.getElementById('userPhone');
        
        // 🚨 방어책 2: 악성 스크립트(XSS) 차단을 위한 정규식 패턴
        const nameRegex = /^[가-힣a-zA-Z\s]{2,20}$/; // 한글, 영문, 띄어쓰기만 2~20자 허용 (특수문자 원천 차단)
        const phoneRegex = /^01[016789]\d{7,8}$/; // 01로 시작하는 10~11자리 숫자만 허용

        // 유효성 검사
        if (agree && !agree.checked) {
            showAlert("개인정보수집 이용에 동의해주세요.");
            return;
        }
        
        // 이름 검증
        const nameValue = nameInput ? nameInput.value.trim() : '';
        if (!nameRegex.test(nameValue)) {
            showAlert("이름은 특수문자나 숫자 없이 올바르게 입력해주세요.");
            nameInput.focus();
            return;
        }

        // 연락처 검증
        const phoneValue = phoneInput ? phoneInput.value.trim().replace(/[^0-9]/g, '') : '';
        if (!phoneRegex.test(phoneValue)) {
            showAlert("올바른 휴대폰 번호를 입력해주세요.");
            phoneInput.focus();
            return;
        }

        let selectedPackageName = "패키지 선택 안함";
        const checkedBox = document.querySelector('.package-checkbox:checked');
        if (checkedBox) {
            const titleElement = checkedBox.closest('.package-card').querySelector('h3');
            selectedPackageName = titleElement.childNodes[0].textContent.trim();
        }

        try {
            // 접수 시작 (버튼 무력화)
            window.isSubmitting = true;
            const submitBtn = document.querySelector('button[onclick="submitForm()"]');
            let originalBtnText = "상담 접수하기";
            
            if (submitBtn) {
                originalBtnText = submitBtn.innerText;
                submitBtn.innerText = "접수 중...";
                submitBtn.disabled = true;
            }

            // DB 저장
            await addDoc(collection(db, "reservations"), {
                name: nameValue, // 검증이 끝난 안전한 값만 전송
                phone: phoneValue, // 검증이 끝난 안전한 값만 전송
                package: selectedPackageName,
                status: "대기",
                createdAt: serverTimestamp()
            });

            const successModal = document.getElementById('successModal');
            if (successModal) {
                successModal.classList.remove('hidden');
                successModal.classList.add('flex');
            }

            if (submitBtn) {
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
            }

        } catch (error) {
            showAlert("접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
            const submitBtn = document.querySelector('button[onclick="submitForm()"]');
            if (submitBtn) {
                submitBtn.innerText = "상담 접수하기";
                submitBtn.disabled = false;
            }
        } finally {
            // 완료되거나 에러가 나면 1초 뒤에 다시 버튼을 누를 수 있게 해제 (매크로 방어)
            setTimeout(() => {
                window.isSubmitting = false;
            }, 1000);
        }
    }

    // submitForm 내부 버튼 상태 처리 (Tailwind 활용)
    const setButtonLoading = (isLoading) => {
        const btn = document.querySelector('button[onclick="submitForm()"]');
        if (!btn) return;

        if (isLoading) {
            btn.disabled = true;
            btn.innerHTML = `
                <svg class="animate-spin h-5 w-5 text-white inline mr-2" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg> 접수 중...`;
            btn.classList.replace('bg-[#F27405]', 'bg-orange-300');
        } else {
            btn.disabled = false;
            btn.innerText = '상담 접수하기';
            btn.classList.replace('bg-orange-300', 'bg-[#F27405]');
        }
    };

    // 접수 완료 모달 닫기 (초기화)
    window.closeModal = function() {
        const successModal = document.getElementById('successModal');
        if (successModal) {
            successModal.classList.add('hidden');
            successModal.classList.remove('flex');
        }
        
        // 닫을 때 폼 초기화
        const nameInput = document.getElementById('userName');
        const phoneInput = document.getElementById('userPhone');
        const agree = document.getElementById('agree');
        
        if (nameInput) nameInput.value = '';
        if (phoneInput) phoneInput.value = '';
        if (agree) agree.checked = false;
        
    }

    // 체크박스 (하나만 선택되도록 동작 + 스타일 업데이트)
    const cards = document.querySelectorAll('.package-card');
    const checkboxes = document.querySelectorAll('.package-checkbox');

    checkboxes.forEach((checkbox, index) => {
        checkbox.addEventListener('change', () => {
            
            if (checkbox.checked) {
                // 1. 방금 체크한 항목을 제외한 나머지 체크박스들은 모두 체크 해제
                checkboxes.forEach((cb, cbIndex) => {
                    if (index !== cbIndex) {
                        cb.checked = false;
                    }
                });
            } else {
                // 2. 이미 선택된 항목을 눌러서 체크 해제하려고 할 때 방어 (최소 1개는 무조건 선택 유지)
                checkbox.checked = true;
            }

            // 3. UI 스타일 (주황색 테두리) 업데이트
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

    /* =========================================
       5. 메인 화면 - 가이드 모달 제어
    ========================================= */
    // 가이드 모달 열기
    window.openGuideModal = function() {
        const guideModal = document.getElementById('guideModal');
        if (guideModal) {
            guideModal.classList.remove('hidden');
            guideModal.classList.add('flex');
            // 스크롤 방지 (선택사항)
            document.body.style.overflow = 'hidden';
        }
    }

    // 가이드 모달 닫기
    window.closeGuideModal = function() {
        const guideModal = document.getElementById('guideModal');
        if (guideModal) {
            guideModal.classList.add('hidden');
            guideModal.classList.remove('flex');
            // 스크롤 방지 해제
            document.body.style.overflow = '';
        }
    }

    /* =========================================
       6. 개인정보 동의 모달 제어
    ========================================= */
    window.openPrivacyModal = function() {
        const privacyModal = document.getElementById('privacyModal');
        if (privacyModal) {
            privacyModal.classList.remove('hidden');
            privacyModal.classList.add('flex');
            // 모달 떴을 때 배경 스크롤 방지
            document.body.style.overflow = 'hidden';
        } else {
            console.error("privacyModal 요소를 찾을 수 없습니다. footer.html에 모달 코드가 있는지 확인해주세요.");
        }
    }

    window.closePrivacyModal = function() {
        const privacyModal = document.getElementById('privacyModal');
        if (privacyModal) {
            privacyModal.classList.add('hidden');
            privacyModal.classList.remove('flex');
            // 배경 스크롤 방지 해제
            document.body.style.overflow = '';
        }
    }

    /* =========================================
       7. 이벤트 상세 패키지 아코디언 토글 제어
    ========================================= */
    // 'accordion-toggle' 클래스를 가진 모든 summary 태그를 찾습니다.
    const accordionToggles = document.querySelectorAll('.accordion-toggle');
    
    accordionToggles.forEach(toggle => {
        toggle.addEventListener('click', function(event) {
            // label 태그 안에서 클릭 시 체크박스가 풀려버리는 기본 동작 방지
            event.preventDefault();
            event.stopPropagation();
            
            // 클릭한 summary의 부모인 details 태그를 열고 닫음
            this.parentElement.toggleAttribute('open');
        });
    });
    
});