// Live-network check of the Calendly popup (needs internet). Usage: node calendly-test.mjs http://127.0.0.1:8765/
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2];
const PORT = 9334;
const prof = mkdtempSync(join(tmpdir(), 'vc-'));
const chrome = spawn(process.env.CHROME || 'google-chrome', ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let p;
for (let i = 0; i < 50 && !p; i++) { try { p = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page'); } catch {} await sleep(200); }
const ws = new WebSocket(p.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const logs = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Log.entryAdded') logs.push(m.params.entry.level + ': ' + m.params.entry.text); else if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' ')); });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true, userGesture: true })).result?.result?.value;
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Page.navigate', { url: URL0 }); await sleep(2000);
let fails = 0; const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${x}`); };
ok('three Calendly buttons', await ev(`document.querySelectorAll('[data-calendly]').length`) === 3);
ok('widget not loaded before click', await ev(`!window.Calendly`));
for (const loc of ['hero', 'approach', 'founder']) {
  if (await ev(`!!document.querySelector('.calendly-overlay')`)) { await ev(`(document.querySelector('.calendly-popup-close')||{click(){}}).click()`); for (let i = 0; i < 20 && await ev(`!!document.querySelector('.calendly-overlay')`); i++) await sleep(150); }
  await ev(`document.querySelector('[data-calendly=${loc}]').click()`);
  let src = '';
  for (let i = 0; i < 40 && !src; i++) { await sleep(250); src = await ev(`(document.querySelector('.calendly-overlay iframe')||{}).src||''`); }
  ok(`${loc}: popup iframe opens Calendly`, src.includes('calendly.com/veragentic/consult'), src.slice(0, 80));
}
await sleep(1500);
const csp = logs.filter(l => /Content Security Policy|Refused/i.test(l));
ok('no CSP violations', csp.length === 0, csp.slice(0, 3).join(' || '));
console.log(fails ? `${fails} failures` : 'all calendly checks passed');
chrome.kill(); process.exit(fails ? 1 : 0);
