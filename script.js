(() => {
  'use strict';

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

  /* -----------------------------
     Envelope intro
  ----------------------------- */
  const envelopeIntro = $('#envelopeIntro');
  const envelopeButton = $('#envelopeButton');
  const envelopeVideo = $('#envelopeVideo');
  const weddingAudio = $('#weddingAudio');

  function finishIntro() {
    if (!envelopeIntro) return;
    envelopeIntro.classList.add('is-opening');
    document.body.classList.remove('intro-locked');
    window.setTimeout(() => {
      envelopeIntro.hidden = true;
    }, 650);

    // The visitor's tap starts the video, so the browser permits
    // the wedding music to start automatically when the video ends.
    if (weddingAudio) {
      weddingAudio.currentTime = 0;
      weddingAudio.play().then(() => {
        const soundToggle = $('#soundToggle');
        const soundIcon = $('#soundIcon');
        if (soundToggle) {
          soundToggle.setAttribute('aria-pressed', 'true');
          soundToggle.setAttribute('aria-label', 'Turn sound off');
        }
        if (soundIcon) soundIcon.src = 'assets/Sound-on.png';
      }).catch(() => {});
    }
  }

  function startEnvelopeVideo() {
    if (!envelopeVideo) return;
    envelopeIntro?.classList.add('video-started');
    envelopeVideo.play().catch(() => {});
  }

  envelopeVideo?.addEventListener('click', startEnvelopeVideo);
  envelopeButton?.addEventListener('click', startEnvelopeVideo);
  envelopeVideo?.addEventListener('ended', finishIntro, { once: true });

  envelopeButton?.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      startEnvelopeVideo();
    }
  });

  /* -----------------------------
     Scroll reveal
  ----------------------------- */
  const revealSections = $$('.reveal-section');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealSections.forEach(el => revealObserver.observe(el));
  } else {
    revealSections.forEach(el => el.classList.add('is-visible'));
  }

  /* -----------------------------
     SCRATCH-TO-REVEAL
     The supplied Heart.svg contains 3 hearts in one 330 x 76 SVG.
     Each canvas displays one 110 x 76 slice.

     Instead of trying to calculate canvas alpha after every pointer move,
     we track scratch coverage on a small grid. This is much more reliable
     on mobile browsers and high-DPI screens.
  ----------------------------- */
  const scratchCards = $$('.scratch-heart canvas');
  const scratchStatus = $('#scratchStatus');
  const revealCountdown = $('#revealCountdown');
  const scratchCard = $('#scratchCard');
  const heartSource = new Image();
  heartSource.decoding = 'async';
  heartSource.src = 'assets/Heart.svg';

  const scratchStates = scratchCards.map(() => ({
    revealed: false,
    drawing: false,
    last: null,
    cells: new Set(),
    cols: 22,
    rows: 16
  }));

  let countdownTimer = null;
  let countdownStarted = false;

  function updateScratchStatus() {
    const completed = scratchStates.filter(state => state.revealed).length;
    if (scratchStatus) scratchStatus.textContent = `${completed} / 3 revealed`;
    return completed;
  }

  function markScratchCoverage(state, x, y, width, height, radius) {
    const col = Math.max(0, Math.min(state.cols - 1, Math.floor((x / width) * state.cols)));
    const row = Math.max(0, Math.min(state.rows - 1, Math.floor((y / height) * state.rows)));
    const cellRadiusX = Math.ceil((radius / width) * state.cols) + 1;
    const cellRadiusY = Math.ceil((radius / height) * state.rows) + 1;

    for (let dy = -cellRadiusY; dy <= cellRadiusY; dy++) {
      for (let dx = -cellRadiusX; dx <= cellRadiusX; dx++) {
        const cx = col + dx;
        const cy = row + dy;
        if (cx < 0 || cx >= state.cols || cy < 0 || cy >= state.rows) continue;
        const px = ((cx + 0.5) / state.cols) * width;
        const py = ((cy + 0.5) / state.rows) * height;
        if (Math.hypot(px - x, py - y) <= radius * 1.35) {
          state.cells.add(cy * state.cols + cx);
        }
      }
    }
  }

  function drawScratchStroke(ctx, x, y, last, radius) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(x, y);
      ctx.lineWidth = radius * 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function resizeScratchCanvas(canvas, index) {
    const state = scratchStates[index];
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width);
    const cssHeight = Math.max(1, rect.height);
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));

    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // The original supplied artwork is exactly 330x76: 3 x 110px hearts.
    const sourceX = index * 110;
    ctx.drawImage(heartSource, sourceX, 0, 110, 76, 0, 0, cssWidth, cssHeight);

    // If the visitor has already scratched this heart, keep it revealed after resize.
    if (state.revealed) {
      ctx.clearRect(0, 0, cssWidth, cssHeight);
    }
  }

  function completeScratch(index) {
    const state = scratchStates[index];
    if (state.revealed) return;

    state.revealed = true;
    const canvas = scratchCards[index];
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    canvas.style.pointerEvents = 'none';
    canvas.style.cursor = 'default';

    const completed = updateScratchStatus();
    if (completed === 3) revealTheCountdown();
  }

  function handleScratch(canvas, index, clientX, clientY) {
    const state = scratchStates[index];
    if (state.revealed) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const radius = Math.max(9, Math.min(rect.width, rect.height) * 0.15);
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScratchStroke(ctx, x, y, state.last, radius);
    markScratchCoverage(state, x, y, rect.width, rect.height, radius);

    // Interpolate between pointer events so fast finger swipes cannot skip cells.
    if (state.last) {
      const distance = Math.hypot(x - state.last.x, y - state.last.y);
      const steps = Math.max(1, Math.ceil(distance / Math.max(4, radius * 0.45)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const ix = state.last.x + (x - state.last.x) * t;
        const iy = state.last.y + (y - state.last.y) * t;
        markScratchCoverage(state, ix, iy, rect.width, rect.height, radius);
      }
    }

    state.last = { x, y };

    const coverage = state.cells.size / (state.cols * state.rows);
    if (coverage >= 0.48) completeScratch(index);
  }

  function setupScratch(canvas, index) {
    resizeScratchCanvas(canvas, index);

    canvas.addEventListener('pointerdown', event => {
      const state = scratchStates[index];
      if (state.revealed) return;
      event.preventDefault();
      state.drawing = true;
      state.last = null;
      try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
      handleScratch(canvas, index, event.clientX, event.clientY);
    });

    canvas.addEventListener('pointermove', event => {
      const state = scratchStates[index];
      if (!state.drawing || state.revealed) return;
      event.preventDefault();
      handleScratch(canvas, index, event.clientX, event.clientY);
    });

    const stop = event => {
      const state = scratchStates[index];
      state.drawing = false;
      state.last = null;
      if (event?.pointerId != null) {
        try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
      }
    };

    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('lostpointercapture', stop);
  }

  function revealTheCountdown() {
    if (!revealCountdown) return;

    // The supplied reveal artwork replaces the entire scratch card.
    if (scratchCard) {
      scratchCard.hidden = true;
    }

    revealCountdown.hidden = false;
    revealCountdown.classList.remove('countdown-revealed');
    void revealCountdown.offsetWidth;
    revealCountdown.classList.add('countdown-revealed');

    // Start the live numbers only after all three hearts are completed.
    startCountdown();

    setTimeout(() => {
      revealCountdown.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 180);
  }

  /*
     Countdown target:
     19 November 2026 at 00:00:00 India Standard Time (UTC+05:30).
     Change only the time in this line if you later want the countdown
     to end at the ceremony start time instead.
  */
  const weddingDate = Date.parse('2026-11-20T00:00:00+05:30');

  function startCountdown() {
    if (countdownStarted) return;
    countdownStarted = true;

    const daysEl = $('#days');
    const hoursEl = $('#hours');
    const minutesEl = $('#minutes');
    const secondsEl = $('#seconds');
    const messageEl = $('.reveal-message');

    const tick = () => {
      const distance = weddingDate - Date.now();

      if (distance <= 0) {
        daysEl.textContent = '00';
        hoursEl.textContent = '00';
        minutesEl.textContent = '00';
        secondsEl.textContent = '00';
        if (messageEl) messageEl.textContent = 'The big day is here! ❤️';
        if (countdownTimer) clearInterval(countdownTimer);
        countdownTimer = null;
        return;
      }

      const totalSeconds = Math.floor(distance / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      daysEl.textContent = String(days).padStart(2, '0');
      hoursEl.textContent = String(hours).padStart(2, '0');
      minutesEl.textContent = String(minutes).padStart(2, '0');
      secondsEl.textContent = String(seconds).padStart(2, '0');
    };

    tick();
    countdownTimer = window.setInterval(tick, 1000);
  }

  updateScratchStatus();
  if (heartSource.complete && heartSource.naturalWidth) {
    scratchCards.forEach(setupScratch);
  } else {
    heartSource.addEventListener('load', () => scratchCards.forEach(setupScratch), { once: true });
    heartSource.addEventListener('error', () => {
      if (scratchStatus) scratchStatus.textContent = 'Heart artwork could not be loaded';
    }, { once: true });
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      scratchCards.forEach((canvas, index) => resizeScratchCanvas(canvas, index));
    }, 100);
  });

  /* -----------------------------
     Gallery
  ----------------------------- */
  const slider = $('#gallerySlider');
  const slides = $('.slides');
  const slideEls = $$('.slide');
  const dots = $('#galleryDots');
  let current = 0;
  let touchStartX = 0;
  let touchDeltaX = 0;

  slideEls.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = `dot${i === 0 ? ' is-active' : ''}`;
    dot.type = 'button';
    dot.setAttribute('aria-label', `Show photo ${i + 1}`);
    dot.addEventListener('click', () => goToSlide(i));
    dots.appendChild(dot);
  });

  function goToSlide(index) {
    current = (index + slideEls.length) % slideEls.length;
    slides.style.transform = `translateX(-${current * 100}%)`;
    [...dots.children].forEach((dot, i) => dot.classList.toggle('is-active', i === current));
    slideEls.forEach((slide, i) => slide.classList.toggle('is-active', i === current));
  }

  $('.slider-btn.prev')?.addEventListener('click', () => goToSlide(current - 1));
  $('.slider-btn.next')?.addEventListener('click', () => goToSlide(current + 1));

  slider?.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchDeltaX = 0;
  }, { passive: true });
  slider?.addEventListener('touchmove', e => {
    touchDeltaX = e.touches[0].clientX - touchStartX;
  }, { passive: true });
  slider?.addEventListener('touchend', () => {
    if (Math.abs(touchDeltaX) > 45) goToSlide(current + (touchDeltaX < 0 ? 1 : -1));
  });
  slider?.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') goToSlide(current + 1);
    if (e.key === 'ArrowLeft') goToSlide(current - 1);
  });

  /* -----------------------------
     Sound button
  ----------------------------- */
  const audio = $('#weddingAudio');
  const soundToggle = $('#soundToggle');
  const soundIcon = $('#soundIcon');
  let soundOn = false;

  soundToggle?.addEventListener('click', async () => {
    if (!audio?.src) {
      soundOn = !soundOn;
      soundToggle.setAttribute('aria-pressed', String(soundOn));
      soundToggle.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
      if (soundIcon) soundIcon.src = soundOn ? 'assets/Sound-on.png' : 'assets/Sound-off.png';
      return;
    }
    try {
      if (audio.paused) await audio.play(); else audio.pause();
      soundOn = !audio.paused;
      soundToggle.setAttribute('aria-pressed', String(soundOn));
      soundToggle.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
      if (soundIcon) soundIcon.src = soundOn ? 'assets/Sound-on.png' : 'assets/Sound-off.png';
    } catch (_) {}
  });

  /* -----------------------------
     RSVP -> WhatsApp
  ----------------------------- */
  const form = $('#rsvpForm');
  const formNote = $('#formNote');
  form?.addEventListener('submit', e => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('guestName') || '').trim();
    const phone = String(data.get('guestPhone') || '').trim();
    const emotional = String(data.get('emotional') || '').trim();
    const moods = data.getAll('mood').join(', ') || 'Not selected';
    const advice = String(data.get('advice') || '').trim() || 'No advice added';

    if (!name || !phone || !emotional) {
      formNote.textContent = 'Please fill your name, phone number and make a guess.';
      return;
    }

    const message = [
      '💍 Lalit & Muskan — Wedding RSVP',
      '',
      `Name: ${name}`,
      `Phone: ${phone}`,
      `Who will get emotional first: ${emotional}`,
      `Wedding mood: ${moods}`,
      `Advice for the couple: ${advice}`
    ].join('\n');

    const whatsappUrl = `https://wa.me/918638956610?text=${encodeURIComponent(message)}`;
    formNote.textContent = 'Opening WhatsApp with your response…';
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  });
})();
