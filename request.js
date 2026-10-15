// Multi-step request flow (request.html): ZIP, contact + consent, then project details. Sends the lead to the same GoHighLevel Inbound Webhook as form.js.
// The two A2P consent checkboxes keep the exact site text, start unchecked and are optional.
(function () {
  var WEBHOOK_URL = 'https://services.leadconnectorhq.com/hooks/oQSGd8a3ZT22ofzOjSrC/webhook-trigger/fad7b00b-dc51-4eea-9e62-d9ca7ed388be';
  var HQ = { lat: 39.9612, lng: -82.9988 }; // Columbus, OH
  var RADIUS_MILES = 70;

  var DETAIL = {
    furnace: { q: 'What type of furnace project is this?', label: 'furnace', opts: [
      ['replace', 'Replace my current furnace'], ['new', 'New furnace (no furnace today)'], ['not_sure', 'Not sure, need recommendations']] },
    ac: { q: 'What type of A/C project is this?', label: 'central A/C', opts: [
      ['replace', 'Replace my current central A/C'], ['new', 'New central A/C connected to ductwork'], ['not_sure', 'Not sure, need recommendations']] },
    full_system: { q: 'What type of project is this?', label: 'furnace and A/C', opts: [
      ['replace', 'Replace my furnace and A/C'], ['new', 'New furnace and A/C'], ['not_sure', 'Not sure, need recommendations']] },
    repair: { q: "What's going on with your system?", opts: [
      ['no_heat', 'No heat'], ['no_cooling', 'No cooling'], ['noise_smell', 'Strange noise or smell'], ['leak', 'Water leak'], ['other', 'Other problem']] },
    maintenance: { q: 'Which system needs maintenance?', opts: [
      ['furnace', 'Furnace'], ['ac', 'A/C'], ['both', 'Both']] }
  };
  var TIMELINE = {
    urgent: 'I need it done in the next 1-2 days.',
    within_2_weeks: "I'd like it done within the next 2 weeks.",
    more_than_2_weeks: "There's no rush; more than 2 weeks works for me.",
    not_sure: "I'm still planning and budgeting."
  };
  var PROGRESS = { zip: 10, contact: 22, service: 35, detail: 45, timeline: 55, building: 65, message: 72, address: 85, thanks: 100 };

  var form = document.getElementById('flow');
  var state = { service_type: '', project_detail: '', timeline: '', zipOk: false, city: '', state: '' };
  var history = [];
  var current = 'zip';

  // Conversions API: GoHighLevel workflow "AIRE - CAPI - Lead sitio" forwards the same Lead to Meta from the server.
  // The browser Pixel and the server event share event_id for deduplication.
  var CAPI_WEBHOOK_URL = 'https://services.leadconnectorhq.com/hooks/oQSGd8a3ZT22ofzOjSrC/webhook-trigger/888dd531-e808-46cc-b5dc-e5ad37f3c222';

  function $(id) { return document.getElementById(id); }
  function utm(name) { return new URLSearchParams(location.search).get(name) || ''; }

  function cookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  // SHA-256 hex of a value normalized as Meta requires; empty input stays empty.
  function sha256(value) {
    if (!value || !window.crypto || !crypto.subtle) return Promise.resolve('');
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  function metaUserData(p) {
    var digits = p.phone.replace(/\D/g, '');
    if (digits.length === 10) digits = '1' + digits;
    var fields = {
      em: p.email.toLowerCase(),
      ph: digits,
      fn: p.first_name.toLowerCase(),
      ln: p.last_name.toLowerCase(),
      ct: p.city.toLowerCase().replace(/[^a-z]/g, ''),
      st: (p.state || '').toLowerCase(),
      zp: (p.zip || '').slice(0, 5),
      country: 'us'
    };
    var keys = Object.keys(fields);
    return Promise.all(keys.map(function (k) { return sha256(fields[k]); })).then(function (hashes) {
      var out = {};
      keys.forEach(function (k, i) { out['meta_' + k] = hashes[i]; });
      return out;
    });
  }

  // Funnel measurement: one Pixel custom event per step reached, once per visit, to see where visitors drop off.
  var STEP_ORDER = ['zip', 'contact', 'service', 'detail', 'timeline', 'building', 'message', 'address', 'thanks'];
  var reached = {};
  function trackStep(step) {
    if (reached[step] || !window.fbq) return;
    reached[step] = true;
    fbq('trackCustom', 'RequestStep', { step: step, step_number: STEP_ORDER.indexOf(step) + 1 });
  }

  function show(step, push) {
    trackStep(step);
    if (push !== false && current !== 'building') history.push(current);
    form.querySelectorAll('.step').forEach(function (s) { s.classList.toggle('on', s.dataset.step === step); });
    current = step;
    $('bar').style.width = (PROGRESS[step] || 10) + '%';
    window.scrollTo(0, 0);
    var first = form.querySelector('.step.on input:not([type=checkbox]), .step.on textarea');
    if (first && step !== 'service') setTimeout(function () { first.focus(); }, 50);
  }
  function back() {
    var prev = history.pop();
    if (prev) show(prev, false);
  }

  // ---- ZIP check (city + distance from Columbus) ----
  function miles(a, b) {
    var r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  function checkZip(zip, field, out, done) {
    state.zipOk = false;
    field.classList.remove('valid');
    out.classList.remove('bad');
    out.textContent = '';
    if (!/^\d{5}$/.test(zip)) { if (done) done(false); return; }
    fetch('https://api.zippopotam.us/us/' + zip).then(function (r) {
      if (!r.ok) throw new Error('not found');
      return r.json();
    }).then(function (d) {
      var p = d.places[0];
      var dist = miles(HQ, { lat: parseFloat(p.latitude), lng: parseFloat(p.longitude) });
      if (dist > RADIUS_MILES) {
        out.classList.add('bad');
        out.textContent = 'Sorry, ' + p['place name'] + ', ' + p['state abbreviation'] + ' is outside our 70-mile service area around Columbus.';
        if (done) done(false);
        return;
      }
      state.zipOk = true; state.city = p['place name']; state.state = p['state abbreviation'];
      field.classList.add('valid');
      out.textContent = state.city + ', ' + state.state;
      if (done) done(true);
    }).catch(function () {
      // Lookup unavailable: accept Ohio ZIP codes (430-458) so no lead is lost.
      var ok = /^4[3-5]\d{3}$/.test(zip) && parseInt(zip.slice(0, 3), 10) <= 458;
      if (ok) { state.zipOk = true; state.state = 'OH'; field.classList.add('valid'); out.textContent = 'Ohio'; }
      else { out.classList.add('bad'); out.textContent = 'Please enter a valid Ohio ZIP code.'; }
      if (done) done(ok);
    });
  }
  $('zip').addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 5);
    if (this.value.length === 5) checkZip(this.value, $('zipField'), $('zipCity'));
    else { state.zipOk = false; $('zipField').classList.remove('valid'); $('zipCity').textContent = ''; }
  });

  // ---- Option lists ----
  function bindOpts(group) {
    group.querySelectorAll('.opt').forEach(function (b) {
      b.addEventListener('click', function () {
        group.querySelectorAll('.opt').forEach(function (o) { o.classList.remove('sel'); });
        b.classList.add('sel');
        state[group.dataset.group] = b.dataset.value;
        if (group.dataset.group === 'service_type') $('otherBox').classList.toggle('on', b.dataset.value === 'other');
        if (group.dataset.mode === 'auto') setTimeout(function () { next(); }, 180);
      });
    });
  }
  bindOpts(form.querySelector('[data-group="service_type"]'));
  bindOpts(form.querySelector('[data-group="timeline"]'));

  function buildDetail() {
    var d = DETAIL[state.service_type];
    $('detailQ').textContent = d.q;
    var box = $('detailOpts');
    box.innerHTML = '';
    d.opts.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'opt'; b.dataset.value = o[0];
      b.innerHTML = o[1] + '<span class="chev">›</span>';
      box.appendChild(b);
    });
    state.project_detail = '';
    bindOpts(box);
  }

  function detailText() {
    var d = DETAIL[state.service_type];
    if (!d) return '';
    var o = d.opts.filter(function (x) { return x[0] === state.project_detail; })[0];
    return o ? o[1] : '';
  }

  function projectLine() {
    var s = state.service_type, p = state.project_detail;
    if (s === 'repair') return 'Repair: ' + (detailText() || 'heating or cooling').toLowerCase();
    if (s === 'maintenance') return 'Maintenance: ' + (detailText() || 'tune-up').toLowerCase();
    if (s === 'other') return 'Other: ' + ($('other_text').value.trim() || 'HVAC service');
    var what = DETAIL[s].label;
    if (p === 'replace') return 'Replace my ' + what;
    if (p === 'new') return 'Install a new ' + what;
    return 'Install a ' + what + ' (need recommendations)';
  }

  function draftMessage() {
    var s = state.service_type, p = state.project_detail, t = [];
    if (s === 'repair') {
      t.push('My heating or cooling system needs a repair. The problem: ' + (detailText() || 'not working properly').toLowerCase() + '.');
      t.push("I'd like a technician to come take a look and fix it.");
    } else if (s === 'maintenance') {
      t.push("I'd like to schedule maintenance for my " + ({ furnace: 'furnace', ac: 'A/C', both: 'furnace and A/C' }[p] || 'system') + '.');
    } else if (s === 'other') {
      t.push('I need help with: ' + ($('other_text').value.trim() || 'an HVAC service') + '.');
    } else {
      var what = DETAIL[s].label;
      if (p === 'replace') t.push('I want to replace my current ' + what + '.');
      else if (p === 'new') t.push('I want to install a new ' + what + ' in my home.');
      else t.push("I'm interested in a new " + what + ' and would like a recommendation.');
      t.push("I'm looking for a professional to handle the installation, and I'm open to guidance on the right equipment for my home.");
    }
    if (TIMELINE[state.timeline]) t.push(TIMELINE[state.timeline]);
    var own = [$('own_words').value.trim(), $('own_words_2').value.trim()].filter(Boolean).join(' ');
    if (own) t.push(own);
    t.push("I'd like to book a free in-home visit.");
    return t.join(' ');
  }

  function runBuilding() {
    show('building');
    var bar = $('buildBar'), w = 0;
    var iv = setInterval(function () {
      w += 4; bar.style.width = Math.min(w, 100) + '%';
      if (w >= 100) {
        clearInterval(iv);
        $('message').value = draftMessage();
        $('msgCount').textContent = $('message').value.length;
        show('message');
      }
    }, 80);
  }
  $('message').addEventListener('input', function () { $('msgCount').textContent = this.value.length; });

  function next() {
    if (current === 'zip') {
      var z = $('zip').value;
      if (state.zipOk) return show('contact');
      checkZip(z, $('zipField'), $('zipCity'), function (ok) {
        if (ok) show('contact');
        else if (!$('zipCity').textContent) { $('zipCity').classList.add('bad'); $('zipCity').textContent = 'Please enter your 5-digit ZIP code.'; }
      });
      return;
    }
    if (current === 'service') {
      if (!state.service_type) return;
      if (state.service_type === 'other') return show('timeline');
      buildDetail();
      return show('detail');
    }
    if (current === 'detail') return show('timeline');
    if (current === 'timeline') return runBuilding();
    if (current === 'message') {
      $('city').value = $('city').value || state.city;
      $('zip2').value = $('zip').value;
      if (state.zipOk) { $('zipField2').classList.add('valid'); $('zipCity2').textContent = $('zipCity').textContent; }
      return show('address');
    }
    if (current === 'address') {
      if (!$('street').value.trim() || !$('city').value.trim() || !/^\d{5}$/.test($('zip2').value)) {
        $('addrErr').textContent = 'Please complete your street, city and ZIP code.';
        return;
      }
      $('addrErr').textContent = '';
      var go = finish;
      if ($('zip2').value !== $('zip').value) {
        $('zip').value = $('zip2').value;
        return checkZip($('zip2').value, $('zipField2'), $('zipCity2'), function (ok) { if (ok) go(); });
      }
      return go();
    }
  }

  $('zip2').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 5); });
  form.querySelectorAll('[data-next]').forEach(function (b) { b.addEventListener('click', next); });
  form.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', back); });
  $('zip').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); next(); } });

  function consentText(input) {
    var p = input.parentNode.querySelector('p');
    return p ? p.textContent.trim() : '';
  }

  // GoHighLevel workflow "AIRE - Datos sitio": waits 1 minute and saves address, project, consent and UTM fields on the contact.
  var DATA_WEBHOOK_URL = 'https://services.leadconnectorhq.com/hooks/oQSGd8a3ZT22ofzOjSrC/webhook-trigger/8dc5c152-6734-418a-abe7-9671345c9b55';

  function send(payload) {
    if (CAPI_WEBHOOK_URL) post(CAPI_WEBHOOK_URL, payload);
    if (DATA_WEBHOOK_URL) post(DATA_WEBHOOK_URL, payload);
    return post(WEBHOOK_URL, payload);
  }

  function post(url, payload) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(function () {
      return fetch(url, { method: 'POST', mode: 'no-cors', body: new URLSearchParams(payload) });
    });
  }

  // The lead is sent once per visit. With at least one consent box checked it is sent at the contact step
  // (step 2), so it is captured even if the visitor leaves the rest of the form. Without consent it is sent
  // only when the form is completed, as before: Speed to Lead texts every new contact and must not text a
  // visitor who did not opt in and did not finish.
  var sent = false;

  function buildPayload(stage) {
    var first = $('first_name').value.trim(), last = $('last_name').value.trim();
    var nonMkt = $('consent_nonmarketing'), mkt = $('consent_marketing');
    var emergency = state.service_type === 'repair' && (state.project_detail === 'no_heat' || state.project_detail === 'no_cooling');
    return {
      name: (first + ' ' + last).trim(),
      first_name: first,
      last_name: last,
      phone: $('phone').value.trim(),
      email: $('email').value.trim(),
      service_type: state.service_type,
      project: state.service_type ? projectLine() : '',
      project_detail: state.project_detail,
      timeline: state.timeline,
      emergency: emergency ? 'yes' : 'no',
      street: $('street').value.trim(),
      city: $('city').value.trim() || state.city,
      state: state.state || 'OH',
      zip: $('zip2').value || $('zip').value,
      message: $('message').value.trim(),
      consent_nonmarketing: nonMkt.checked ? 'yes' : 'no',
      consent_marketing: mkt.checked ? 'yes' : 'no',
      consent_timestamp: new Date().toISOString(),
      consent_text_nonmarketing: consentText(nonMkt),
      consent_text_marketing: consentText(mkt),
      lead_form: 'request_multistep',
      lead_stage: stage,
      page_url: location.href,
      utm_source: utm('utm_source'),
      utm_medium: utm('utm_medium'),
      utm_campaign: utm('utm_campaign'),
      utm_content: utm('utm_content'),
      fbclid: utm('fbclid'),
      event_id: 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
      event_time: String(Math.floor(Date.now() / 1000)),
      fbp: cookie('_fbp'),
      fbc: cookie('_fbc') || (utm('fbclid') ? 'fb.1.' + Date.now() + '.' + utm('fbclid') : ''),
      client_user_agent: navigator.userAgent
    };
  }

  function deliver(stage) {
    if (sent) return Promise.resolve();
    sent = true;
    var payload = buildPayload(stage);
    if (window.fbq) fbq('track', 'Lead', { content_name: payload.service_type || 'estimate' }, { eventID: payload.event_id });
    return metaUserData(payload).catch(function () { return {}; }).then(function (hashed) {
      Object.keys(hashed).forEach(function (k) { payload[k] = hashed[k]; });
      return send(payload);
    });
  }

  function finish() {
    var btn = form.querySelector('section[data-step="address"] [data-next]');
    btn.disabled = true; btn.textContent = 'Sending...';
    // Lead already sent at the contact step: only the data workflow gets the completed answers (no second Lead, no Speed to Lead).
    var done = sent && DATA_WEBHOOK_URL ? post(DATA_WEBHOOK_URL, buildPayload('completed')) : deliver('completed');
    done.finally(function () { show('thanks'); history = []; });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (current !== 'contact') return next();
    if ($('company_website').value) return;
    var first = $('first_name').value.trim();
    var phone = $('phone').value.trim();
    if (!first || phone.replace(/\D/g, '').length < 10) {
      $('contactErr').textContent = 'Please enter your first name and a 10-digit phone number.';
      return;
    }
    $('contactErr').textContent = '';
    if ($('consent_nonmarketing').checked || $('consent_marketing').checked) deliver('contact_step');
    show('service');
  });

  trackStep('zip');
})();
