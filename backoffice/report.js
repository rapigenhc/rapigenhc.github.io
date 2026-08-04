/**
 * 래피젠헬스케어 Report JS - 주간 스냅 엔진
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, query, getDocs, where, Timestamp, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

Chart.defaults.font.family = "'Pretendard', -apple-system, sans-serif";

let trendChartInstance = null;
let channelChartInstance = null;
let fpThisWeek = null;
let fpLastWeek = null;

const CHANNEL_COLORS = {
    'dangn': '#F27405',     
    'naver': '#16A34A',     
    'google': '#6b16a3',    
    'homepage': '#2563EB',  
    'qr': 'rgb(150, 1, 176)',
    'direct': '#6B7280'     
};

// [신규] 리포트 페이지는 '주간 비교'이므로 항상 7일이 강제로 스냅되는 공통 설정 사용
const reportFlatpickrConfig = {
    mode: "range",
    locale: "ko",
    dateFormat: "Y-m-d",
    onChange: function(selectedDates, dateStr, instance) {
        if (selectedDates.length === 1) {
            // 한 날짜를 클릭하면 무조건 그날부터 7일(1주)을 강제 지정
            const start = selectedDates[0];
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            instance.setDate([start, end], true);
        } else if (selectedDates.length === 2) {
            const elId = instance.element.id;
            const prefix = elId === 'thisWeekPicker' ? 'thisWeek' : 'lastWeek';
            document.getElementById(prefix + 'Start').value = instance.formatDate(selectedDates[0], "Y-m-d");
            document.getElementById(prefix + 'End').value = instance.formatDate(selectedDates[1], "Y-m-d");
        }
    }
};

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        alert("접근 권한이 없습니다.");
        window.location.href = "index.html";
        return;
    }
    try {
        const snap = await getDoc(doc(db, "admins", user.uid));
        if (snap.exists() && document.getElementById('roleTag')) {
            document.getElementById('roleTag').innerText = snap.data().role;
        }
    } catch(e){}

    initDateInputs();
    await buildReportData();
});

function initDateInputs() {
    // 달력 인스턴스 생성
    fpThisWeek = flatpickr("#thisWeekPicker", reportFlatpickrConfig);
    fpLastWeek = flatpickr("#lastWeekPicker", reportFlatpickrConfig);

    const today = new Date();
    
    const thisEnd = new Date(today);
    const thisStart = new Date(today);
    thisStart.setDate(thisEnd.getDate() - 6); 

    const lastEnd = new Date(thisStart);
    lastEnd.setDate(lastEnd.getDate() - 1);
    const lastStart = new Date(lastEnd);
    lastStart.setDate(lastStart.getDate() - 6); 

    document.getElementById('thisWeekStart').value = thisStart.toISOString().substring(0,10);
    document.getElementById('thisWeekEnd').value = thisEnd.toISOString().substring(0,10);
    document.getElementById('lastWeekStart').value = lastStart.toISOString().substring(0,10);
    document.getElementById('lastWeekEnd').value = lastEnd.toISOString().substring(0,10);

    // UI 동기화
    fpThisWeek.setDate([thisStart, thisEnd], false);
    fpLastWeek.setDate([lastStart, lastEnd], false);
}

function getMMDD(dateObj) {
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${mm}/${dd}`;
}

function generateDateLabels(startStr, endStr) {
    const labels = [];
    const curr = new Date(startStr);
    const end = new Date(endStr);
    while (curr <= end) {
        labels.push(getMMDD(curr));
        curr.setDate(curr.getDate() + 1);
    }
    return labels;
}

async function buildReportData() {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('report-main').classList.add('hidden');

    try {
        const thisStart = new Date(document.getElementById('thisWeekStart').value + "T00:00:00");
        const thisEnd = new Date(document.getElementById('thisWeekEnd').value + "T23:59:59");
        
        const lastStart = new Date(document.getElementById('lastWeekStart').value + "T00:00:00");
        const lastEnd = new Date(document.getElementById('lastWeekEnd').value + "T23:59:59");

        const fetchStart = lastStart < thisStart ? lastStart : thisStart;
        const fetchEnd = lastEnd > thisEnd ? lastEnd : thisEnd;

        const qPeriod = query(collection(db, "reservations"), 
            where("createdAt", ">=", Timestamp.fromDate(fetchStart)),
            where("createdAt", "<=", Timestamp.fromDate(fetchEnd))
        );
        const qAll = query(collection(db, "reservations"));

        const [snapPeriod, snapAll] = await Promise.all([getDocs(qPeriod), getDocs(qAll)]);
        
        const periodDocs = snapPeriod.docs.map(d => d.data());
        const allDocs = snapAll.docs.map(d => d.data());

        let thisWeekCount = 0;
        let lastWeekCount = 0;
        
        let totalWaiting = 0, totalConfirmed = 0, totalCancel = 0;
        let channelMap = {}; 
        let packageMap = {}; 

        const thisLabels = generateDateLabels(thisStart, thisEnd);
        const lastLabels = generateDateLabels(lastStart, lastEnd);
        
        let trendThisWeek = new Array(thisLabels.length).fill(0);
        let trendLastWeek = new Array(lastLabels.length).fill(0);

        periodDocs.forEach(data => {
            if(!data.createdAt) return;
            const docDate = new Date(data.createdAt.seconds * 1000);
            
            if (docDate >= thisStart && docDate <= thisEnd) {
                thisWeekCount++;
                const mmdd = getMMDD(docDate);
                const idx = thisLabels.indexOf(mmdd);
                if (idx !== -1) trendThisWeek[idx]++;
                
                const src = data.source || 'direct';
                channelMap[src] = (channelMap[src] || 0) + 1;
            }
            
            if (docDate >= lastStart && docDate <= lastEnd) {
                lastWeekCount++;
                const mmdd = getMMDD(docDate);
                const idx = lastLabels.indexOf(mmdd);
                if (idx !== -1) trendLastWeek[idx]++;
            }
        });

        allDocs.forEach(data => {
            if (data.status === '대기중') totalWaiting++;
            if (data.status === '확정') totalConfirmed++;
            if (data.status && data.status.includes('취소')) totalCancel++;
            
            const pkg = data.package || '기타';
            packageMap[pkg] = (packageMap[pkg] || 0) + 1;
        });

        document.getElementById('stat-this-week').innerText = `${thisWeekCount}건`;
        document.getElementById('stat-total-waiting').innerText = totalWaiting;
        document.getElementById('stat-total-confirmed').innerText = totalConfirmed;
        
        const cancelRate = allDocs.length === 0 ? 0 : Math.round((totalCancel / allDocs.length) * 100);
        document.getElementById('stat-cancel-rate').innerText = `${cancelRate}%`;

        const growthEl = document.getElementById('stat-growth-rate');
        if(lastWeekCount === 0) {
            growthEl.innerText = "비교 주간 데이터 부족";
            growthEl.className = "text-gray-400 block mt-2 text-[11px] font-bold";
        } else {
            const growth = Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100);
            if(growth >= 0) {
                growthEl.innerHTML = `비교 주간 대비 <span class="text-blue-500">▲ ${growth}% 성장</span>`;
            } else {
                growthEl.innerHTML = `비교 주간 대비 <span class="text-red-500">▼ ${Math.abs(growth)}% 감소</span>`;
            }
        }

        renderTrendLine(thisLabels, trendThisWeek, lastLabels, trendLastWeek);
        renderChannelDoughnut(channelMap);
        renderPackageRanking(packageMap);

    } catch(err) {
        alert("데이터를 집계하는 중 오류가 발생했습니다.");
    } finally {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('report-main').classList.remove('hidden');
    }
}

function renderTrendLine(thisLabels, thisData, lastLabels, lastData) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    if (trendChartInstance) trendChartInstance.destroy();

    const maxLength = Math.max(thisLabels.length, lastLabels.length);
    const combinedLabels = [];
    for(let i=0; i<maxLength; i++) {
        const d1 = thisLabels[i] || '';
        const d2 = lastLabels[i] || '';
        combinedLabels.push(d1 ? d1 : `(비교: ${d2})`); 
    }

    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: combinedLabels,
            datasets: [
                {
                    label: '기준 주간 (이번 주)',
                    data: thisData,
                    borderColor: '#0047FF',
                    backgroundColor: 'rgba(0, 71, 255, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true
                },
                {
                    label: '비교 주간 (저번 주)',
                    data: lastData,
                    borderColor: '#E5E7EB',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.4
                }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            const idx = context[0].dataIndex;
                            if(context[0].datasetIndex === 0) return `기준: ${thisLabels[idx] || '-'}`;
                            return `비교: ${lastLabels[idx] || '-'}`;
                        }
                    }
                }
            } 
        }
    });
}

function renderChannelDoughnut(channelMap) {
    const ctx = document.getElementById('channelChart').getContext('2d');
    if (channelChartInstance) channelChartInstance.destroy();

    const labels = Object.keys(channelMap).map(k => k.toUpperCase());
    const data = Object.values(channelMap);
    
    const bgColors = Object.keys(channelMap).map(k => CHANNEL_COLORS[k] || CHANNEL_COLORS['direct']);
    
    channelChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: bgColors,
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            cutout: '70%', 
            plugins: { legend: { position: 'right' } } 
        }
    });
}

function renderPackageRanking(packageMap) {
    const ul = document.getElementById('packageRankingList');
    ul.innerHTML = ''; 

    const sorted = Object.entries(packageMap).sort((a, b) => b[1] - a[1]);
    const top5 = sorted.slice(0, 5);

    if (top5.length === 0) {
        ul.innerHTML = '<li class="text-center text-gray-400 font-bold text-[13px] py-10">데이터가 없습니다.</li>';
        return;
    }

    top5.forEach((item, index) => {
        const rank = index + 1;
        const pkgName = item[0];
        const count = item[1];
        
        let rankClass = 'rank-other';
        if (rank === 1) rankClass = 'rank-1';
        else if (rank === 2) rankClass = 'rank-2';
        else if (rank === 3) rankClass = 'rank-3';

        const li = document.createElement('li');
        li.className = "flex items-center justify-between p-3 rounded-xl bg-gray-50/50 hover:bg-gray-50 transition-colors";
        li.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="w-7 h-7 flex items-center justify-center rounded-lg text-[12px] font-black ${rankClass}">${rank}</span>
                <span class="text-[14px] font-bold text-gray-800">${pkgName}</span>
            </div>
            <span class="text-[14px] font-black text-gray-900">${count}<span class="text-[11px] font-bold text-gray-400 ml-1">건</span></span>
        `;
        ul.appendChild(li);
    });
}

document.getElementById('applyDateBtn').addEventListener('click', buildReportData);

document.getElementById('logoutBtn').addEventListener('click', () => {
    if(confirm("로그아웃 하시겠습니까?")) signOut(auth);
});

/**
 * [신규] 7일 단위 날짜 이동 함수 (사이드 화살표용)
 * @param {string} target - 'this' 또는 'last'
 * @param {number} direction - -1(이전주) 또는 1(다음주)
 */
window.shiftWeek = function(target, direction) {
    const startInput = document.getElementById(target + 'Start');
    
    // 타겟에 맞는 인스턴스 선택
    const picker = (target === 'this') ? fpThisWeek : fpLastWeek;

    if (!startInput || !picker) {
        console.error("날짜 인스턴스를 찾을 수 없습니다.");
        return;
    }

    const startDate = new Date(startInput.value);
    startDate.setDate(startDate.getDate() + (direction * 7));
    
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    // Flatpickr 업데이트 (화면 UI와 Hidden Input이 동시에 갱신됨)
    picker.setDate([startDate, endDate], true); 
};

// [주의] report.js 하단의 이벤트 핸들러 부분에 '적용' 버튼 클릭 이벤트와 충돌하지 않도록 보강하십시오.
// 기존 buildReportData 함수가 모든 기간 입력(Hidden Input)을 읽어오므로, 
// shiftWeek 함수만 호출해도 정상적으로 재집계됩니다.