// CDP-driven behaviour test for the Veragentic page. Usage: node form-test.mjs http://127.0.0.1:8765/
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2];
const PORT = 9333;
const prof = mkdtempSync(join(tmpdir(), 'vt-'));
const chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let results = [];
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); };

async function connect() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const l = await r.json(); const p = l.find(t => t.type === 'page'); if (p) return p.webSocketDebuggerUrl; } catch {}
    await sleep(200);
  }
  throw new Error('no chrome');
}

const ws = new WebSocket(await connect());
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const handlers = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else handlers.forEach(h => h(m));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result?.result?.value; };

let consoleMsgs = [], requests = [], navs = [], posts = [];
// Default run: GA off and no endpoint (mailto fallback path), regardless of the shipped config.js.
const BASE_CONFIG = 'window.VERAGENTIC=Object.freeze({MEASUREMENT_ID:"",FORM_ENDPOINT:"",FORM_ACCESS_KEY:""});';
let configOverride = BASE_CONFIG, postStatus = 200;
handlers.push(async (m) => {
  if (m.method === 'Runtime.consoleAPICalled') consoleMsgs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  if (m.method === 'Log.entryAdded') consoleMsgs.push(m.params.entry.level + ': ' + m.params.entry.text);
  if (m.method === 'Runtime.exceptionThrown') consoleMsgs.push('exception: ' + m.params.exceptionDetails.text);
  if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  if (m.method === 'Page.frameRequestedNavigation') navs.push(m.params.url);
  if (m.method === 'Fetch.requestPaused') {
    const { requestId, request } = m.params;
    if (request.url.endsWith('/assets/js/config.js') && configOverride) {
      return send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from(configOverride).toString('base64') });
    }
    if (request.url.includes('/mock-endpoint')) {
      posts.push(request);
      await sleep(300);
      return send('Fetch.fulfillRequest', { requestId, responseCode: postStatus, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(postStatus === 200 ? '{"success":true,"message":"Email sent successfully!"}' : '{"success":false,"message":"error"}').toString('base64') });
    }
    if (request.url.startsWith('https://www.googletagmanager.com/')) {
      return send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from('/*stub*/').toString('base64') });
    }
    return send('Fetch.continueRequest', { requestId });
  }
});
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }); await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Emulation.setFocusEmulationEnabled', { enabled: true });

async function load() {
  consoleMsgs = []; requests = []; navs = []; posts = [];
  await send('Page.navigate', { url: 'about:blank' }); await sleep(100); await send('Page.navigate', { url: URL0 });
  for (let i = 0; i < 50; i++) { await sleep(100); if (await ev("document.readyState==='complete' && !!document.querySelector('main')")) break; }
  await sleep(300);
}
const setVal = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.focus();e.value=${JSON.stringify(v)};e.blur();})()`);
const submit = () => ev(`document.querySelector('#inquiry-form button[type=submit]').click()`);
const state = () => ev(`(()=>({
  summaryHidden: document.getElementById('error-summary')?.hidden,
  focused: document.activeElement && (document.activeElement.id || document.activeElement.className || document.activeElement.tagName),
  summaryLinks: [...document.querySelectorAll('#error-summary a')].map(a=>a.getAttribute('href')+'|'+a.textContent),
  emailErr: document.getElementById('email-error')?.hidden ? null : document.getElementById('email-error')?.textContent,
  msgErr: document.getElementById('message-error')?.hidden ? null : document.getElementById('message-error')?.textContent,
  emailInvalid: document.getElementById('email')?.getAttribute('aria-invalid'),
  msgInvalid: document.getElementById('message')?.getAttribute('aria-invalid'),
  emailVal: document.getElementById('email')?.value, msgVal: document.getElementById('message')?.value,
  failureHidden: document.getElementById('form-failure')?.hidden,
  btn: document.querySelector('#inquiry-form button')?.textContent, btnDisabled: document.querySelector('#inquiry-form button')?.getAttribute('aria-disabled') === 'true',
  success: document.querySelector('.form-success')?.textContent?.trim()||null,
  cookie: document.cookie, htmlClass: document.documentElement.className,
  dl: (window.dataLayer||[]).map(a=>JSON.stringify([...a]))
}))()`);

// 1. Default config (GA off, no endpoint)
await load();
let s = await state();
ok('js class swapped', s.htmlClass === 'js', s.htmlClass);
ok('no cookies with GA off', s.cookie === '');
const hosts = [...new Set(requests.map(u => new URL(u).host))];
ok('only local requests with GA off', hosts.every(h => h === '127.0.0.1:8765'), hosts.join(','));
ok('font loaded', await ev(`document.fonts.ready.then(()=>document.fonts.check('400 72px "Source Serif 4"') && [...document.fonts].some(f=>f.family.includes('Source Serif')&&f.status==='loaded'))`));
ok('h1 uses Source Serif', (await ev(`getComputedStyle(document.querySelector('h1')).fontFamily`)).startsWith('"Source Serif 4"'));

// CTA focus
await ev(`document.querySelector('[data-cta=hero]').click()`);
await sleep(200);
ok('CTA focuses inquiry heading', (await ev('document.activeElement.id')) === 'inquiry-title');

// empty submit
await submit(); await sleep(100); s = await state();
ok('empty: summary shown + focused', !s.summaryHidden && s.focused === 'error-summary', s.focused);
ok('empty: summary links', JSON.stringify(s.summaryLinks) === JSON.stringify(['#email|Enter your email address', '#message|Enter a message']), s.summaryLinks.join(' / '));
ok('empty: inline errors w/ hidden prefix', s.emailErr === 'Error: Enter your email address' && s.msgErr === 'Error: Enter a message');
ok('empty: aria-invalid', s.emailInvalid === 'true' && s.msgInvalid === 'true');
ok('summary link focuses field', await ev(`(()=>{document.querySelector('#error-summary a').click();return document.activeElement.id})()`) === 'email');

// bad format, then fix via blur
await setVal('#email', 'name@example'); s = await state();
ok('blur after failure: format error', s.emailErr === 'Error: Enter an email address in the correct format, like name@example.com', s.emailErr);
await setVal('#message', 'We want an agent for invoices.'); s = await state();
ok('blur fixes message error', s.msgErr === null && s.msgInvalid === null && s.summaryLinks.length === 1);
await submit(); await sleep(100); s = await state();
ok('values kept after failed submit', s.emailVal === 'name@example' && s.msgVal === 'We want an agent for invoices.');
await setVal('#email', '  name@example.com '); s = await state();
ok('valid email clears error + summary', s.emailErr === null && s.summaryHidden && s.emailInvalid === null);

// mailto path: synthetic submit to capture the exact URL...
await submit(); await sleep(400);
// ...then a real mouse click (genuine user gesture) to prove the browser allows the launch
consoleMsgs = [];
const r = await ev(`(()=>{const b=document.querySelector('#inquiry-form button');b.scrollIntoView({block:'center'});const q=b.getBoundingClientRect();return {x:q.x+q.width/2,y:q.y+q.height/2}})()`);
await sleep(100);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
await sleep(400);
ok('mailto navigation requested', navs.some(u => u.startsWith('mailto:')), navs.join(' '));
const mt = navs.find(u => u.startsWith('mailto:')) || '';
ok('mailto exact', mt === 'mailto:hello@veragentic.ai?subject=Inquiry%20from%20veragentic.ai&body=' + encodeURIComponent('We want an agent for invoices.\n\nReply to: name@example.com'), mt);
s = await state();
ok('real click: no user-gesture error', !consoleMsgs.some(m=>m.includes('user gesture')), consoleMsgs.join(' | '));
ok('mailto: no success block, fallback address shown', s.success === null && !s.failureHidden && (await ev(`document.getElementById('form-failure').textContent`)).includes('hello@veragentic.ai'));
ok('no console errors (default)', !consoleMsgs.some(m => /^(error|exception)/.test(m)), consoleMsgs.join(' | '));

// blur does NOT validate before first failed submit
await load();
await setVal('#email', 'bad'); s = await state();
ok('no validation on blur before first submit', s.emailErr === null);

// 2. Endpoint + GA on, success path
configOverride = 'window.VERAGENTIC=Object.freeze({MEASUREMENT_ID:"G-TEST000000",FORM_ENDPOINT:"/mock-endpoint",FORM_ACCESS_KEY:"test-key"});';
postStatus = 200;
await load();
ok('GA script requested when ID set', requests.some(u => u.startsWith('https://www.googletagmanager.com/gtag/js?id=G-TEST000000')));
await ev(`document.querySelector('[data-cta=hero]').click()`); await sleep(100);
await setVal('#email', 'name@example.com'); await setVal('#message', 'Hello there');
await ev(`(()=>{const b=document.querySelector('#inquiry-form button');b.focus();b.click();b.click();document.getElementById('inquiry-form').requestSubmit();})()`);
await sleep(50); s = await state();
ok('sending state, focus kept on button', s.btn === 'Sending…' && s.btnDisabled === true && s.focused === 'button', s.btn + ' ' + s.focused);
await sleep(700); s = await state();
ok('one POST on double submit', posts.length === 1, String(posts.length));
ok('POST carries email, message, _subject', posts[0] && /name="email"/.test(posts[0].postData || '') && /name="message"/.test(posts[0].postData || '') && /Inquiry from veragentic.ai/.test(posts[0].postData || ''), (posts[0]?.postData || '').replace(/\r?\n/g, ' ').slice(0, 200));
ok('Accept: application/json', posts[0]?.headers?.Accept === 'application/json');
ok('success block shown + focused', s.success && s.success.startsWith('Thank you.') && (await ev(`document.activeElement.className`)) === 'form-success', s.success);
ok('GA events: cta_click hero, generate_lead, no PII', s.dl.some(d => d.includes('"cta_click"') && d.includes('"hero"')) && s.dl.some(d => d.includes('"generate_lead"')) && !s.dl.some(d => d.includes('name@example.com') || d.includes('Hello there')), s.dl.join(' '));

// 3. failure path
postStatus = 500;
await load();
await setVal('#email', 'name@example.com'); await setVal('#message', 'Hello there');
await submit(); await sleep(900); s = await state();
ok('failure: alert shown, button restored, values kept, no lead', !s.failureHidden && s.btn === 'Send inquiry' && !s.btnDisabled && s.emailVal === 'name@example.com' && s.msgVal === 'Hello there' && !s.dl.some(d => d.includes('generate_lead')));
ok('failure console has no PII', !consoleMsgs.some(m => m.includes('name@example.com')), consoleMsgs.join(' | '));

// 4. 404 page
configOverride = BASE_CONFIG;
await send('Page.navigate', { url: URL0 + 'nope' }); await sleep(800);
ok('404 page loads without errors', !consoleMsgs.some(m => /exception/.test(m)));

for (const r of results) console.log(r.join('  '));
console.log(results.filter(r => r[0] === 'FAIL').length + ' failures of ' + results.length);
ws.close(); chrome.kill();
process.exit(0);
