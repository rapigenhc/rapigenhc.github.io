/* =========================================
   [통합 모듈] Firebase + GA4 + 트래픽 분석
========================================= */

// 1. GA4 이벤트 전송 함수 (관심사 분리)
const trackGAEvent = (pkgName) => {
    if (typeof gtag === 'function') {
        gtag('event', 'conversion', {
            'event_category': 'reservation',
            'event_label': pkgName,
            'value': 1.0
        });
        console.log(`GA4 Tracked: ${pkgName}`);
    }
};

// 2. 유입 경로(UTM) 추출 함수
const getTrafficSource = () => {
    const params = new URLSearchParams(window.location.search);
    return {
        utm_source: params.get('utm_source') || 'direct',
        utm_medium: params.get('utm_medium') || 'none',
        utm_campaign: params.get('utm_campaign') || 'none'
    };
};

// 3. 폼 접수하기 버튼 클릭 시 (GA4 & Firestore 통합)
window.submitForm = async function() {
    // 🚨 방어책 1: 중복 전송 방지 (메모리 플래그 + localStorage)
    if (window.isSubmitting || localStorage.getItem('last_submit_time') > Date.now() - 60000) {
        showAlert("이미 접수 중이거나 최근에 접수하셨습니다. 잠시 후 다시 시도해주세요.");
        return;
    } 

    const agree = document.getElementById('agree');
    const nameInput = document.getElementById('userName');
    const phoneInput = document.getElementById('userPhone');
    
    // 🚨 방어책 2: 정규식 보안 검증 (XSS/인젝션 차단)
    const nameRegex = /^[가-힣a-zA-Z\s]{2,20}$/; 
    const phoneRegex = /^01[016789]\d{7,8}$/; 

    if (agree && !agree.checked) {
        showAlert("개인정보수집 이용에 동의해주세요.");
        return;
    }
    
    const nameValue = nameInput ? nameInput.value.trim() : '';
    if (!nameRegex.test(nameValue)) {
        showAlert("이름을 올바르게 입력해주세요.");
        nameInput.focus();
        return;
    }

    const phoneValue = phoneInput ? phoneInput.value.trim().replace(/[^0-9]/g, '') : '';
    if (!phoneRegex.test(phoneValue)) {
        showAlert("올바른 휴대폰 번호를 입력해주세요.");
        phoneInput.focus();
        return;
    }

    // 선택된 패키지명 추출
    let selectedPkg = "패키지 선택 안함";
    const checkedBox = document.querySelector('.package-checkbox:checked');
    if (checkedBox) {
        const card = checkedBox.closest('.package-card');
        selectedPkg = card.querySelector('h3').innerText.trim();
    }

    try {
        window.isSubmitting = true;
        setButtonLoading(true); // 버튼 로딩 상태 전환

        const sourceData = getTrafficSource();

        // 🎯 1. Firestore 저장 (유입 경로 포함 7개 필드)
        await addDoc(collection(db, "reservations"), {
            name: nameValue,
            phone: phoneValue,
            package: selectedPkg,
            status: "대기",
            source: sourceData.utm_source,
            medium: sourceData.utm_medium,
            campaign: sourceData.utm_campaign,
            createdAt: serverTimestamp()
        });

        // 🎯 2. GA4 이벤트 전송
        trackGAEvent(selectedPkg);

        // 성공 처리 및 타임스탬프 기록 (도배 방지)
        localStorage.setItem('last_submit_time', Date.now());
        
        const successModal = document.getElementById('successModal');
        if (successModal) {
            successModal.classList.remove('hidden');
            successModal.classList.add('flex');
        }

    } catch (error) {
        console.error("Firebase Error:", error);
        showAlert("접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
        setButtonLoading(false);
        setTimeout(() => { window.isSubmitting = false; }, 1000);
    }
};

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