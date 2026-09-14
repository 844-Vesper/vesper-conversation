'use strict';

(() => {
  const byId = id => document.getElementById(id);
  const form = byId('invitation-form');
  const input = byId('invitation-code');
  const continueButton = byId('continue-button');
  const invitationFeedback = byId('invitation-feedback');
  const scheduleButton = byId('schedule-button');
  const schedulingFeedback = byId('scheduling-feedback');
  const dialog = byId('scheduling-dialog');
  const embedFeedback = byId('embed-feedback');
  const embedFallback = byId('embed-fallback');
  let activeState = byId('invitation-state');
  let requestVersion = 0;
  let embedLoaded = false;
  let calendarReady = false;
  let embedTimer;
  let cooldownTimer;
  let calScriptPromise;

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin', cache: 'no-store',
      signal: AbortSignal.timeout(15000), ...options,
    });
    const data = await response.json();
    return { response, data };
  }

  async function showState(id, focus = true) {
    const next = byId(id);
    if (next === activeState) return;
    activeState.classList.remove('is-entering');
    activeState.classList.add('is-leaving');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    activeState.hidden = true;
    activeState.classList.remove('is-leaving');
    next.classList.add('is-entering');
    next.hidden = false;
    activeState = next;
    if (focus) next.querySelector('h2, input')?.focus({ preventScroll: true });
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (continueButton.disabled) return;
    requestVersion++;
    const code = input.value.trim();
    if (!code) {
      invitationFeedback.textContent = 'Please enter your invitation code.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    continueButton.disabled = true;
    continueButton.textContent = 'One moment…';
    form.setAttribute('aria-busy', 'true');
    invitationFeedback.textContent = '';
    input.removeAttribute('aria-invalid');
    let coolingDown = false;
    try {
      const { response, data } = await api('/api/verify-invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
      });
      if (response.ok && data.valid === true) {
        input.value = '';
        await showState('scheduling-state');
      } else if (response.status === 429) {
        invitationFeedback.textContent = 'That invitation code was not recognized. Please wait a minute before trying again.';
        input.setAttribute('aria-invalid', 'true');
        const seconds = Math.min(60, Math.max(1, Number(response.headers.get('Retry-After')) || 60));
        coolingDown = true;
        cooldownTimer = setTimeout(() => { continueButton.disabled = false; }, seconds * 1000);
      } else if (response.ok || response.status === 400) {
        invitationFeedback.textContent = 'That invitation code was not recognized.';
        input.setAttribute('aria-invalid', 'true');
        input.focus();
      } else {
        invitationFeedback.textContent = 'We could not check your invitation just now. Please try again shortly.';
      }
    } catch {
      invitationFeedback.textContent = 'We could not check your invitation just now. Please try again shortly.';
    } finally {
      if (!coolingDown) continueButton.disabled = false;
      continueButton.textContent = 'Continue';
      form.removeAttribute('aria-busy');
    }
  });

  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    if (!continueButton.disabled) invitationFeedback.textContent = '';
  });

  function showEmbedFailure() {
    calendarReady = false;
    clearTimeout(embedTimer);
    embedFeedback.hidden = false;
    embedFeedback.textContent = 'The calendar is taking longer than expected. You can open it below.';
    embedFallback.hidden = false;
  }

  function loadCalScript() {
    if (calScriptPromise) return calScriptPromise;
    // Cal's supported queue/bootstrap, loaded only when scheduling is requested.
    window.Cal = window.Cal || function () { (window.Cal.q = window.Cal.q || []).push(arguments); };
    window.Cal.q = window.Cal.q || [];
    window.Cal.ns = window.Cal.ns || {};
    window.Cal.loaded = true;
    calScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://app.cal.com/embed/embed.js';
      script.async = true;
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        calScriptPromise = null;
        reject(new Error('Calendar unavailable'));
      };
      const timer = setTimeout(fail, 15000);
      script.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
      script.addEventListener('error', fail, { once: true });
      document.head.append(script);
    });
    return calScriptPromise;
  }

  async function openCalendar(url) {
    byId('cal-fallback-link').href = url.href;
    embedFeedback.hidden = calendarReady;
    if (!calendarReady) embedFeedback.textContent = 'Opening the calendar…';
    embedFallback.hidden = true;
    dialog.showModal();
    clearTimeout(embedTimer);
    if (!calendarReady) embedTimer = setTimeout(showEmbedFailure, 15000);
    if (embedLoaded) return;
    try {
      await loadCalScript();
      if (embedLoaded) return;
      window.Cal('init', { origin: 'https://cal.com' });
      window.Cal('on', { action: 'linkReady', callback: () => {
        calendarReady = true;
        clearTimeout(embedTimer);
        embedFeedback.hidden = true;
        embedFallback.hidden = true;
      } });
      window.Cal('on', { action: 'linkFailed', callback: showEmbedFailure });
      // Deliberately ignore the callback payload: Vesper never reads booking details.
      window.Cal('on', { action: 'bookingSuccessfulV2', callback: () => {
        clearTimeout(embedTimer);
        dialog.close();
        void showState('confirmation-state');
      } });
      window.Cal('inline', {
        elementOrSelector: '#cal-embed',
        calLink: url.pathname.replace(/^\/+|\/+$/g, ''),
        config: { theme: 'dark', layout: 'month_view' },
      });
      window.Cal('ui', { theme: 'dark', hideEventTypeDetails: true, showTimezoneWhenEventDetailsHidden: true });
      embedLoaded = true;
    } catch {
      showEmbedFailure();
    }
  }

  scheduleButton.addEventListener('click', async () => {
    scheduleButton.disabled = true;
    schedulingFeedback.textContent = '';
    try {
      // Recheck the session on every opening, including after a tab has been left idle.
      const { response, data } = await api('/api/scheduling');
      if (response.status === 401) {
        invitationFeedback.textContent = 'Please enter your invitation code again.';
        await showState('invitation-state');
        return;
      }
      if (!response.ok || !data.url) throw new Error('Scheduling unavailable');
      const url = new URL(data.url);
      if (url.origin !== 'https://cal.com') throw new Error('Unexpected calendar host');
      scheduleButton.disabled = false;
      await openCalendar(url);
    } catch {
      schedulingFeedback.textContent = 'The calendar is unavailable just now. Please try again shortly.';
    } finally {
      scheduleButton.disabled = false;
    }
  });

  byId('close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    clearTimeout(embedTimer);
    if (!byId('scheduling-state').hidden) scheduleButton.focus({ preventScroll: true });
  });

  async function restoreSession() {
    const version = requestVersion;
    try {
      const { response, data } = await api('/api/verify-invite');
      if (version === requestVersion && response.ok && data.valid === true) {
        input.value = '';
        await showState('scheduling-state', false);
      }
    } catch { /* Static previews and outages keep the invitation form available. */ }
  }

  // Do not retain invitation text in the browser's back/forward snapshot.
  window.addEventListener('pagehide', () => { input.value = ''; });
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      if (dialog.open) dialog.close();
      clearTimeout(cooldownTimer);
      location.reload();
    }
  });
  void restoreSession();
})();
