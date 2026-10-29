/* Veragentic: GA4 loader, CTA focus + tracking, inquiry form. No dependencies. */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  var CFG = window.VERAGENTIC || {};
  var EMAIL = 'hello@veragentic.ai';
  var SUBJECT = 'Inquiry from veragentic.ai';

  /* ---- GA4: loads only when a valid measurement ID is set in config.js ---- */
  var gaId = String(CFG.MEASUREMENT_ID || '').trim();
  if (/^G-[A-Z0-9]+$/i.test(gaId)) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', gaId);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gaId);
    document.head.appendChild(s);
  }
  function track(name, params) {
    if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
  }

  /* ---- CTAs: track, let the anchor scroll, then move focus to the form heading ---- */
  var target = document.getElementById('inquiry-title');
  Array.prototype.forEach.call(document.querySelectorAll('[data-cta]'), function (a) {
    a.addEventListener('click', function () {
      track('cta_click', { location: a.getAttribute('data-cta') });
      if (target) {
        requestAnimationFrame(function () { target.focus({ preventScroll: true }); });
      }
    });
  });

  /* ---- Inquiry form ---- */
  var form = document.getElementById('inquiry-form');
  if (!form) return;

  var accessKey = String(CFG.FORM_ACCESS_KEY || '').trim();
  var endpoint = accessKey ? String(CFG.FORM_ENDPOINT || '').trim() : '';
  var summary = document.getElementById('error-summary');
  var summaryList = summary.querySelector('ul');
  var failure = document.getElementById('form-failure');
  var button = form.querySelector('button[type="submit"]');
  var buttonLabel = button.textContent;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var validateOnBlur = false;
  var sending = false;

  var fields = {
    email: {
      el: document.getElementById('email'),
      check: function (el) {
        var v = el.value.trim();
        if (!v) return 'Enter your email address';
        if (!el.validity.valid && !el.validity.valueMissing) return 'Enter an email address in the correct format, like name@example.com';
        if (!EMAIL_RE.test(v)) return 'Enter an email address in the correct format, like name@example.com';
        return '';
      }
    },
    message: {
      el: document.getElementById('message'),
      check: function (el) { return el.value.trim() ? '' : 'Enter a message'; }
    }
  };

  function setError(name, msg) {
    var el = fields[name].el;
    var box = document.getElementById(name + '-error');
    if (msg) {
      box.lastElementChild.textContent = msg;
      box.hidden = false;
      el.setAttribute('aria-invalid', 'true');
    } else {
      box.hidden = true;
      box.lastElementChild.textContent = '';
      el.removeAttribute('aria-invalid');
    }
  }

  function renderSummary(errors) {
    summaryList.textContent = '';
    errors.forEach(function (e) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + e.name;
      a.textContent = e.msg;
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        fields[e.name].el.focus();
        fields[e.name].el.scrollIntoView({ block: 'center' });
      });
      li.appendChild(a);
      summaryList.appendChild(li);
    });
    summary.hidden = errors.length === 0;
  }

  function validateAll() {
    var errors = [];
    Object.keys(fields).forEach(function (name) {
      var msg = fields[name].check(fields[name].el);
      setError(name, msg);
      if (msg) errors.push({ name: name, msg: msg });
    });
    return errors;
  }

  Object.keys(fields).forEach(function (name) {
    fields[name].el.addEventListener('blur', function () {
      if (!validateOnBlur) return;
      setError(name, fields[name].check(fields[name].el));
      var errors = [];
      Object.keys(fields).forEach(function (n) {
        var box = document.getElementById(n + '-error');
        if (!box.hidden) errors.push({ name: n, msg: box.lastElementChild.textContent });
      });
      renderSummary(errors);
    });
  });

  function setSending(on) {
    sending = on;
    // aria-disabled, not disabled: a disabled button drops keyboard focus to <body>. `sending` blocks resubmits.
    if (on) {
      button.setAttribute('aria-disabled', 'true');
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Sending…';
    } else {
      button.removeAttribute('aria-disabled');
      button.removeAttribute('aria-busy');
      button.textContent = buttonLabel;
    }
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (sending) return;

    var errors = validateAll();
    if (errors.length) {
      validateOnBlur = true;
      renderSummary(errors);
      summary.focus();
      return;
    }
    renderSummary([]);

    var email = fields.email.el.value.trim();
    var message = fields.message.el.value.trim();

    // No endpoint configured: hand off to the visitor's email client. Nothing was sent, so no success state.
    if (!endpoint) {
      track('mailto_open');
      window.location.href = 'mailto:' + EMAIL +
        '?subject=' + encodeURIComponent(SUBJECT) +
        '&body=' + encodeURIComponent(message + '\n\nReply to: ' + email);
      // Many desktops have no mail app registered, so the line above can do nothing. Always show the direct address.
      var link = document.createElement('a');
      link.href = 'mailto:' + EMAIL;
      link.textContent = EMAIL;
      failure.textContent = 'If your email app did not open, email ';
      failure.appendChild(link);
      failure.appendChild(document.createTextNode(' directly.'));
      failure.hidden = false;
      return;
    }

    setSending(true);
    failure.hidden = true;

    // Web3Forms relays the inquiry by email. FormData + Accept keeps this a simple CORS request (no preflight).
    var fd = new FormData(form);
    fd.append('access_key', accessKey);
    fd.append('subject', SUBJECT);
    fd.append('from_name', 'veragentic.ai');
    fd.append('replyto', email);

    fetch(endpoint, { method: 'POST', body: fd, headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.json().catch(function () { throw new Error('HTTP ' + res.status); });
      })
      .then(function (data) {
        if (!data || data.success !== true) throw new Error((data && data.message) || 'not sent');
        var done = document.createElement('div');
        done.className = 'form-success';
        done.setAttribute('role', 'status');
        done.setAttribute('aria-live', 'polite');
        done.tabIndex = -1;
        var h = document.createElement('h3');
        h.textContent = 'Thank you.';
        var p = document.createElement('p');
        p.textContent = 'Your inquiry has been received. We will reply by email.';
        done.appendChild(h);
        done.appendChild(p);
        form.replaceWith(done);
        done.focus();
        track('generate_lead');
      })
      .catch(function (err) {
        console.warn('Inquiry not sent:', err && err.message ? err.message : 'network error');
        failure.hidden = false;
        setSending(false);
      });
  });
})();
