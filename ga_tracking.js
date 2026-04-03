/**
 * Rapigen Healthcare - GA4 Tracking Module
 */

// 1. GA4 스크립트 동적 로드
const GA_MEASUREMENT_ID = 'G-WZQ4SEMFQK'; // 본인의 측정 ID

function loadGAScript() {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID, {
        'send_page_view': true,
        'cookie_flags': 'SameSite=None;Secure' // 보안 설정
    });
}

// 2. URL 파라미터에서 유입 경로(UTM) 추출 유틸리티
export const getTrafficSource = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        utm_source: urlParams.get('utm_source') || 'direct',
        utm_medium: urlParams.get('utm_medium') || 'none',
        utm_campaign: urlParams.get('utm_campaign') || 'none',
        referrer: document.referrer || 'none'
    };
};

// 3. 전환 이벤트 전송 함수 (예약 완료 시 호출)
export const trackConversion = (packageName) => {
    if (typeof gtag === 'function') {
        gtag('event', 'generate_lead', {
            'event_category': 'engagement',
            'event_label': packageName,
            'value': 1
        });
        console.log(`📊 GA4 Event: generate_lead [${packageName}]`);
    }
};

// 초기화 실행
loadGAScript();