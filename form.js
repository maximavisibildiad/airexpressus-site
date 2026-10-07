// Sends the site forms to GoHighLevel (Inbound Webhook) without changing the visible form (A2P consent block untouched).
(function () {
  var WEBHOOK_URL = 'https://services.leadconnectorhq.com/hooks/oQSGd8a3ZT22ofzOjSrC/webhook-trigger/fad7b00b-dc51-4eea-9e62-d9ca7ed388be';
  var THANKS = "Thanks! We'll text or call you shortly to schedule your free visit.";

  function utm(name) {
    return new URLSearchParams(location.search).get(name) || '';
  }

  function consentText(input) {
    var p = input && input.parentNode.querySelector('p');
    return p ? p.textContent.trim() : '';
  }

  function send(payload) {
    return fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(function () {
      // Fallback if the browser blocks the JSON request (CORS): simple form-encoded POST.
      return fetch(WEBHOOK_URL, { method: 'POST', mode: 'no-cors', body: new URLSearchParams(payload) });
    });
  }

  document.querySelectorAll('form.contact-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var trap = form.querySelector('[name="company_website"]');
      if (trap && trap.value) return;

      var nonMkt = form.querySelector('[name="consent_nonmarketing"]');
      var mkt = form.querySelector('[name="consent_marketing"]');
      var now = new Date().toISOString();
      var field = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };

      var payload = {
        name: field('name'),
        phone: field('phone'),
        email: field('email'),
        service_type: field('service_type'),
        emergency: field('emergency') || 'no',
        zip: field('zip'),
        message: field('message'),
        consent_nonmarketing: nonMkt && nonMkt.checked ? 'yes' : 'no',
        consent_marketing: mkt && mkt.checked ? 'yes' : 'no',
        consent_timestamp: now,
        consent_text_nonmarketing: consentText(nonMkt),
        consent_text_marketing: consentText(mkt),
        page_url: location.href,
        utm_source: utm('utm_source'),
        utm_medium: utm('utm_medium'),
        utm_campaign: utm('utm_campaign'),
        utm_content: utm('utm_content'),
        fbclid: utm('fbclid')
      };

      var button = form.querySelector('button[type="submit"]');
      if (button) { button.disabled = true; button.textContent = 'Sending...'; }

      send(payload).finally(function () {
        var msg = document.createElement('p');
        msg.className = 'form-thanks';
        msg.textContent = THANKS;
        form.replaceWith(msg);
      });
    });
  });
})();
