(() => {
  const tabs = document.querySelector('.caution-tabs');
  const navigation = document.querySelector('.caution-nav');
  const links = Array.from(tabs.querySelectorAll('a'));
  const sections = links.map(link => document.getElementById(link.hash.slice(1)));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let current = links[0];
  let requestedLink;
  let settleTimer;
  let frame;

  const activate = link => {
    links.forEach(item => {
      if (item === link) item.setAttribute('aria-current', 'location');
      else item.removeAttribute('aria-current');
    });
    if (current !== link) {
      const start = link.offsetLeft - tabs.offsetLeft;
      if (start < tabs.scrollLeft || start + link.offsetWidth > tabs.scrollLeft + tabs.clientWidth) {
        tabs.scrollTo({ left: start - (tabs.clientWidth - link.offsetWidth) / 2, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
      }
      current = link;
    }
  };
  const syncActive = () => {
    frame = undefined;
    if (requestedLink) return;
    const threshold = navigation.getBoundingClientRect().bottom + 28;
    let index = 0;
    sections.forEach((section, position) => {
      if (section.getBoundingClientRect().top <= threshold) index = position;
    });
    activate(links[index]);
  };
  const scheduleSync = () => { if (!frame) frame = requestAnimationFrame(syncActive); };
  const finishNavigation = () => {
    clearTimeout(settleTimer);
    requestedLink = undefined;
    scheduleSync();
  };
  links.forEach(link => link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const section = document.getElementById(link.hash.slice(1));
    if (location.hash !== link.hash) history.pushState(null, '', link.hash);
    requestedLink = link;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(finishNavigation, 2000);
    activate(link);
    section.focus({ preventScroll: true });
    section.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
  }));
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--caution-tabs-height', `${navigation.offsetHeight}px`);
    scheduleSync();
  }).observe(navigation);
  addEventListener('scroll', () => {
    if (requestedLink) {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(finishNavigation, 160);
    }
    scheduleSync();
  }, { passive: true });
  addEventListener('wheel', finishNavigation, { passive: true });
  addEventListener('touchstart', finishNavigation, { passive: true });
  addEventListener('keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) finishNavigation();
  });
  addEventListener('resize', scheduleSync);
  addEventListener('hashchange', finishNavigation);
  syncActive();

  const bmiForm = document.querySelector('#bmi-form');
  const bmiHeight = document.querySelector('#bmi-height');
  const bmiWeight = document.querySelector('#bmi-weight');
  const bmiResult = document.querySelector('#bmi-result');
  const bmiError = document.querySelector('#bmi-error');
  const calculateBMI = (submitted = false) => {
    bmiError.textContent = '';
    bmiHeight.removeAttribute('aria-invalid');
    bmiWeight.removeAttribute('aria-invalid');
    const height = bmiHeight.valueAsNumber;
    const weight = bmiWeight.valueAsNumber;
    const invalidInput = !Number.isFinite(height) || height <= 0
      ? bmiHeight
      : !Number.isFinite(weight) || weight <= 0 ? bmiWeight : null;
    if (invalidInput) {
      bmiResult.value = '—';
      if (submitted) {
        bmiError.textContent = `${invalidInput === bmiHeight ? '키' : '몸무게'}를 0보다 큰 숫자로 입력해 주세요.`;
        invalidInput.setAttribute('aria-invalid', 'true');
        invalidInput.focus();
      }
      return;
    }
    const bmi = weight / ((height / 100) ** 2);
    if (!Number.isFinite(bmi) || bmi <= 0) {
      bmiResult.value = '—';
      bmiError.textContent = '키와 몸무게를 다시 확인해 주세요.';
      return;
    }
    bmiResult.value = bmi.toFixed(1);
  };
  bmiForm.addEventListener('input', () => calculateBMI());
  bmiForm.addEventListener('submit', event => {
    event.preventDefault();
    calculateBMI(true);
  });

  const form = document.querySelector('#booking-form');
  const phone = document.querySelector('#user-phone');
  const message = document.querySelector('#form-message');
  const dialog = document.querySelector('#privacy-dialog');
  phone.addEventListener("input", () => {
    const d = phone.value.replace(/\D/g, "").slice(0, 11);
    phone.value =
      d.length < 4
        ? d
        : d.length < 8
          ? `${d.slice(0, 3)}-${d.slice(3)}`
          : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  });
  document
    .querySelector("#privacy-open")
    .addEventListener("click", () => dialog.showModal());
  document
    .querySelector("#footer-privacy")
    .addEventListener("click", (e) => {
      e.preventDefault();
      dialog.showModal();
    });
  document
    .querySelector("#privacy-close")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  let reservationPending = false;
  let reservationSubmittedAt = 0;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (reservationPending) return;
    if (Date.now() - reservationSubmittedAt < 60000) {
      message.textContent = "이미 접수되었습니다. 담당자가 순차적으로 연락드리겠습니다.";
      return;
    }
    message.className = "form-message";
    const name = document.querySelector("#user-name").value.trim(),
      digits = phone.value.replace(/\D/g, ""),
      agreed = document.querySelector("#privacy-consent").checked;
    if (!/^[가-힣a-zA-Z\s]{2,20}$/.test(name)) {
      message.textContent = "성함을 두 글자 이상 입력해 주세요.";
      message.classList.add("error");
      return;
    }
    if (!/^010\d{8}$/.test(digits)) {
      message.textContent = "휴대전화번호를 정확히 입력해 주세요.";
      message.classList.add("error");
      return;
    }
    if (!agreed) {
      message.textContent = "개인정보 수집 및 이용에 동의해 주세요.";
      message.classList.add("error");
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    reservationPending = true;
    submit.disabled = true;
    submit.textContent = "신청 중입니다…";
    try {
      const response = await (await import("./reservation-api.js?v=20261117-2")).submitReservation("/api/reservations.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            phone: digits,
            package: "건강검진 상담",
            pageName: "caution.html",
            source: window.RapigenAttribution.get().source,
            medium: window.RapigenAttribution.get().medium,
            campaign: window.RapigenAttribution.get().campaign,
            userAgent: navigator.userAgent,
          }),
        }),
        result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok)
        throw new Error(result.error || "request_failed");
      reservationSubmittedAt = Date.now();
      form.reset();
      message.textContent =
        "예약 신청이 접수되었습니다. 담당자가 순차적으로 연락드리겠습니다.";
      message.classList.add("success");
    } catch (error) {
      message.textContent =
        error.message === "too_many_requests"
          ? "신청 횟수가 많습니다. 잠시 후 다시 시도해 주세요."
          : "신청을 완료하지 못했습니다. 1544-5189로 연락해 주세요.";
      message.classList.add("error");
    } finally {
      reservationPending = false;
      submit.disabled = false;
      submit.textContent = "예약 신청하기";
    }
  });
})();
