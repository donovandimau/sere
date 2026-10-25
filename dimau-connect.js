/* Dimau Connect v1 — original dependency-free communications launcher.
 * Canonical copy: dimau-platform-standard/communications/dimau-connect.js.
 * This opens the Sota Kece hub; it never forwards account data or starts calls.
 */
(function () {
  'use strict';
  if (window.DimauConnect) return;

  var script = document.currentScript;
  var requestedApp = script && script.getAttribute('data-app') || 'dimau';
  var app = /^[a-z0-9][a-z0-9-]{0,63}$/.test(requestedApp) ? requestedApp : 'dimau';
  var label = String(script && script.getAttribute('data-label') || 'this app').trim().slice(0, 80) || 'this app';
  var triggerOnly = !!(script && script.getAttribute('data-trigger-only') === 'true');
  var host, root, panel, toggle, close, previousFocus;
  var open = false;
  var options = [
    ['chat', 'Chat', 'Continue a conversation'],
    ['groups', 'Groups', 'Meet with your community'],
    ['boards', 'Boards', 'Share updates and ideas'],
    ['calls', 'Audio & video calls', 'Choose a room and call type']
  ];

  function element(tag, text) {
    var node = document.createElement(tag);
    if (text != null) node.textContent = text;
    return node;
  }

  function hubURL(view) {
    var selected = options.some(function (entry) { return entry[0] === view; }) ? view : 'chat';
    // No current-page URL, personal data, fragments or arbitrary destinations.
    return 'https://sotakece.com/communications.html?app=' + encodeURIComponent(app) + '&view=' + selected;
  }

  function stylesheetURL() {
    // The copied stylesheet is always local. Ignore third-party script origins
    // and configuration attributes; strict style-src 'self' remains sufficient.
    var fallback = new URL('/dimau-connect.css', window.location.origin).href;
    try {
      var scriptURL = new URL(script && script.src || '', window.location.href);
      if (!script || !script.src || scriptURL.origin !== window.location.origin) return fallback;
      return new URL('./dimau-connect.css', scriptURL).href;
    } catch (error) { return fallback; }
  }

  function setOpen(value, opener, restoreFocus) {
    if (!panel) return;
    if (value && !open) previousFocus = opener || document.activeElement;
    open = value;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    document.querySelectorAll('[data-dimau-connect]').forEach(function (trigger) {
      trigger.setAttribute('aria-expanded', String(open));
    });
    if (open) close.focus();
    else if (restoreFocus && previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
  }

  function start() {
    if (host || !document.body || !Element.prototype.attachShadow) return;
    host = element('div');
    host.id = 'dimau-connect-launcher';
    host.setAttribute('data-private', '');
    if (triggerOnly) host.setAttribute('data-trigger-only', '');
    root = host.attachShadow({ mode: 'open' });
    var stylesheet = element('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = stylesheetURL();
    root.appendChild(stylesheet);

    panel = element('section');
    panel.className = 'panel';
    panel.id = 'connect-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-labelledby', 'connect-title');
    var heading = element('div');
    heading.className = 'heading';
    var title = element('h2', 'Connect');
    title.id = 'connect-title';
    heading.appendChild(title);
    close = element('button', '×');
    close.type = 'button';
    close.className = 'close';
    close.setAttribute('aria-label', 'Close Connect');
    close.addEventListener('click', function () { setOpen(false, null, true); });
    heading.appendChild(close);
    panel.appendChild(heading);
    panel.appendChild(element('p', 'Open the shared Sota Kece community for ' + label + '.'));
    var links = element('nav');
    links.className = 'links';
    links.setAttribute('aria-label', 'Community tools');
    options.forEach(function (entry) {
      var link = element('a');
      link.href = hubURL(entry[0]);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.referrerPolicy = 'no-referrer';
      link.appendChild(element('strong', entry[1]));
      link.appendChild(element('small', entry[2]));
      links.appendChild(link);
    });
    panel.appendChild(links);
    var privacy = element('p', 'Opens in a new tab. Sota Kece is for ages 16 and over. Sign in there to use shared groups. Your app account and private records are not sent. Camera and microphone stay off until you choose to join a call.');
    privacy.className = 'privacy';
    panel.appendChild(privacy);
    root.appendChild(panel);
    toggle = element('button');
    toggle.type = 'button';
    toggle.className = 'toggle';
    toggle.hidden = triggerOnly;
    toggle.setAttribute('aria-controls', panel.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-haspopup', 'dialog');
    var symbol = element('span', '◌');
    symbol.className = 'symbol';
    symbol.setAttribute('aria-hidden', 'true');
    toggle.appendChild(symbol);
    toggle.appendChild(element('span', 'Connect'));
    toggle.addEventListener('click', function () { setOpen(!open, toggle, true); });
    root.appendChild(toggle);
    document.body.appendChild(host);

    document.addEventListener('keydown', function (event) {
      if (open && event.key === 'Escape') {
        event.preventDefault();
        setOpen(false, null, true);
      }
    });
    document.addEventListener('pointerdown', function (event) {
      if (open && event.composedPath().indexOf(host) === -1 && !(event.target.closest && event.target.closest('[data-dimau-connect]'))) setOpen(false);
    });
    document.addEventListener('click', function (event) {
      var trigger = event.target.closest && event.target.closest('[data-dimau-connect]');
      if (!trigger) return;
      event.preventDefault();
      setOpen(!open, trigger, true);
    });
  }

  window.DimauConnect = Object.freeze({
    version: '1.0.0',
    open: function () { start(); setOpen(true, document.activeElement); },
    close: function () { setOpen(false, null, true); },
    hubURL: hubURL
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
