/* =====================================================
   MediFind - frontend application
   Talks to the Java backend through /api/*
===================================================== */
'use strict';

const API = location.protocol === 'file:' ? 'http://localhost:8080' : '';
const S = { meds: [], pharmacies: [], stock: [], stats: {}, cat: 'All', session: null, loginRole: 'admin', tab: 'overview', connected: true };
const $ = (id) => document.getElementById(id);

/* ---------- helpers ---------- */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '\u20B9' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const ICON = {
  pill: '<svg viewBox="0 0 24 24"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7z"/><path d="m8.5 8.5 7 7"/></svg>',
  shop: '<svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  box: '<svg viewBox="0 0 24 24"><path d="m21 8-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M12 5v14M5 12h14"/></svg>',
};

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, type = 'success') {
  const t = $('toast');
  t.className = 'toast show ' + type;
  $('toastIc').textContent = type === 'success' ? '\u2713' : type === 'error' ? '!' : 'i';
  $('toastMsg').textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------- API ---------- */
async function api(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  if (S.session) headers.Authorization = 'Bearer ' + S.session.token;
  let res;
  try {
    res = await fetch(API + '/api/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    S.connected = false;
    throw new Error('Cannot connect to the MediFind server. Please make sure it is running.');
  }
  S.connected = true;
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (res.status === 401 && S.session && path !== 'login') {
    clearSession(); closeDash(); updateNav();
    throw new Error('Your session expired. Please login again.');
  }
  if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
  return data;
}

/* =====================================================
   DATA LOADING
===================================================== */
async function loadPublic() {
  try {
    const [m, p, s, st] = await Promise.all([api('medicines'), api('pharmacies'), api('stock'), api('stats')]);
    S.meds = m; S.pharmacies = p; S.stock = s; S.stats = st;
    renderAll();
  } catch (e) {
    renderOffline(e.message);
  }
}

function renderOffline(msg) {
  const html = `<div class="empty"><b>Server not reachable</b>${esc(msg)}<br><br><button class="btn btn-primary" onclick="loadPublic()">Try again</button></div>`;
  $('medGrid').innerHTML = html;
  $('phGrid').innerHTML = html;
  $('availBody').innerHTML = `<tr><td colspan="6">${html}</td></tr>`;
}

function renderAll() {
  renderCounts(); renderChips(); renderCats(); renderMedicines(); renderPharmacies(); renderAvailability();
}

/* =====================================================
   PUBLIC WEBSITE
===================================================== */
function renderCounts() {
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(S.stats[el.dataset.count] || 0);
    const start = Number(el.textContent) || 0;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 800);
      el.textContent = Math.round(start + (target - start) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function renderChips() {
  const names = ['Paracetamol', 'Dolo', 'Cetirizine', 'Vitamin C', 'ORS'];
  $('heroChips').innerHTML = names.map((n) => `<button class="chip" onclick="quickSearch('${n}')">${n}</button>`).join('');
}

function quickSearch(q) {
  $('searchInput').value = q;
  S.cat = 'All'; renderCats(); renderMedicines();
  $('search').scrollIntoView({ behavior: 'smooth' });
}

function heroSearch(e) {
  e.preventDefault();
  quickSearch($('heroInput').value.trim());
}

function stockStatus(q) {
  if (q <= 0) return { cls: 'out', text: 'Out of stock' };
  if (q <= 5) return { cls: 'low', text: 'Low stock' };
  return { cls: 'available', text: 'Available' };
}

function renderCats() {
  const cats = ['All', ...new Set(S.meds.map((m) => m.category))];
  $('catRow').innerHTML = cats.map((c) =>
    `<button class="cat ${c === S.cat ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  $('catRow').querySelectorAll('.cat').forEach((b) => b.addEventListener('click', () => {
    S.cat = b.dataset.cat; renderCats(); renderMedicines();
  }));
}

function renderMedicines() {
  const q = $('searchInput').value.trim().toLowerCase();
  const sort = $('sortSelect').value;
  const only = $('inStockOnly').checked;
  let list = S.meds.filter((m) =>
    (S.cat === 'All' || m.category === S.cat) &&
    (!q || m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)) &&
    (!only || m.availableAt > 0));
  if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'price') list.sort((a, b) => (a.minPrice ?? 1e9) - (b.minPrice ?? 1e9));
  if (sort === 'avail') list.sort((a, b) => b.availableAt - a.availableAt);

  if (!list.length) {
    $('medGrid').innerHTML = `<div class="empty"><b>No medicines found</b>Try a different name or category.</div>`;
    return;
  }
  $('medGrid').innerHTML = list.map((m, i) => `
    <article class="med" style="animation-delay:${Math.min(i, 12) * 35}ms" onclick="openMedicine(${m.id})" tabindex="0" onkeydown="if(event.key==='Enter')openMedicine(${m.id})">
      <div class="med-top"><div class="med-ic">${ICON.pill}</div><span class="cat-tag">${esc(m.category)}</span></div>
      <h3>${esc(m.name)}</h3>
      <p>${esc(m.description || 'Available through MediFind partner pharmacies.')}</p>
      <div class="med-foot">
        <div class="price"><small>${m.minPrice != null ? 'Starting from' : 'Price'}</small><b>${m.minPrice != null ? money(m.minPrice) : '\u2014'}</b></div>
        <span class="avail ${m.availableAt ? 'y' : 'n'}">${m.availableAt ? 'In stock at ' + m.availableAt + (m.availableAt > 1 ? ' pharmacies' : ' pharmacy') : 'Out of stock'}</span>
      </div>
    </article>`).join('');
}

function openMedicine(id) {
  const m = S.meds.find((x) => x.id === id);
  if (!m) return;
  const rows = S.stock.filter((s) => s.medicineId === id)
    .sort((a, b) => (b.quantity > 0) - (a.quantity > 0) || a.price - b.price);
  const bestId = rows.find((r) => r.quantity > 0)?.id;
  const list = rows.length ? rows.map((r) => {
    const st = stockStatus(r.quantity);
    return `<div class="pl ${r.id === bestId ? 'best' : ''}">
      <div><b>${esc(r.pharmacy)}${r.id === bestId ? '<span class="best-tag">Best price</span>' : ''}</b><small>${esc(r.location)}</small>
        <div style="margin-top:6px"><span class="badge ${st.cls}">${st.text}</span> <small>${r.quantity} units</small></div></div>
      <div class="r"><b>${money(r.price)}</b><a class="btn btn-ghost btn-sm" style="margin-top:6px" href="tel:${esc(r.phone)}">${ICON.phone.replace('<svg', '<svg style="width:14px;height:14px"')} Call</a></div>
    </div>`;
  }).join('') : '<div class="empty"><b>Not stocked yet</b>No pharmacy has listed this medicine.</div>';
  openModal(`<div class="m-ic">${ICON.pill}</div><h3>${esc(m.name)}</h3>
    <p class="sub">${esc(m.category)} &bull; ${esc(m.description || '')}</p>
    <b style="font-size:14px">Available at</b><div class="pharm-list">${list}</div>`, true);
}

function renderPharmacies() {
  if (!S.pharmacies.length) { $('phGrid').innerHTML = '<div class="empty"><b>No pharmacies yet</b></div>'; return; }
  $('phGrid').innerHTML = S.pharmacies.map((p) => `
    <article class="ph">
      <div class="ph-ic">${ICON.shop}</div>
      <h3>${esc(p.name)}</h3>
      <div class="row">${ICON.pin} ${esc(p.location)}</div>
      <div class="row">${ICON.phone} ${esc(p.phone)}</div>
      <div class="ph-foot"><span class="muted">${p.stockItems} medicines listed</span><a class="btn btn-ghost btn-sm" href="tel:${esc(p.phone)}">Call now</a></div>
    </article>`).join('');
}

function renderAvailability() {
  const q = $('availSearch').value.trim().toLowerCase();
  const f = $('availStatus').value;
  const rows = S.stock.filter((s) =>
    (!q || s.medicine.toLowerCase().includes(q) || s.pharmacy.toLowerCase().includes(q) || s.location.toLowerCase().includes(q)) &&
    (!f || stockStatus(s.quantity).cls === f));
  $('availBody').innerHTML = rows.length ? rows.map((s) => {
    const st = stockStatus(s.quantity);
    return `<tr><td><b>${esc(s.medicine)}</b></td><td>${esc(s.pharmacy)}</td><td>${esc(s.location)}</td>
      <td><b>${money(s.price)}</b></td><td>${s.quantity}</td><td><span class="badge ${st.cls}">${st.text}</span></td></tr>`;
  }).join('') : `<tr><td colspan="6"><div class="empty"><b>No records found</b>Try changing your filters.</div></td></tr>`;
}

/* ---------- navbar / scroll ---------- */
function toggleMenu() { $('links').classList.toggle('open'); }
document.querySelectorAll('#links a').forEach((a) => a.addEventListener('click', () => $('links').classList.remove('open')));

window.addEventListener('scroll', () => {
  $('nav').classList.toggle('scrolled', window.scrollY > 10);
  const ids = ['home', 'search', 'pharmacies', 'availability', 'how'];
  let cur = 'home';
  ids.forEach((id) => { const el = $(id); if (el && el.getBoundingClientRect().top < 140) cur = id; });
  document.querySelectorAll('#links a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
}, { passive: true });

/* =====================================================
   MODAL HELPERS
===================================================== */
function openModal(html, wide = false) {
  $('modalContent').innerHTML = html;
  $('modalBox').classList.toggle('wide', wide);
  $('modal').hidden = false;
  document.body.style.overflow = 'hidden';
  const first = $('modalContent').querySelector('input,select,textarea');
  if (first) setTimeout(() => first.focus(), 60);
}
function closeModal() {
  $('modal').hidden = true;
  if ($('dash').hidden) document.body.style.overflow = '';
}
$('modal').addEventListener('mousedown', (e) => { if (e.target === $('modal')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });

/** Generic form modal. fields: [{name,label,type,options,value,placeholder,min,step,required,half}] */
function openForm({ title, sub = '', fields, submit = 'Save', onSubmit, icon = ICON.plus }) {
  const html = fields.map((f) => {
    let input;
    if (f.type === 'select') {
      input = `<select name="${f.name}" ${f.required === false ? '' : 'required'}>${f.options.map((o) =>
        `<option value="${esc(o.value)}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea name="${f.name}" placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>`;
    } else {
      input = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}"
        ${f.min != null ? `min="${f.min}"` : ''} ${f.step ? `step="${f.step}"` : ''} ${f.required === false ? '' : 'required'} ${f.readonly ? 'readonly' : ''} autocomplete="off">`;
    }
    return `<div class="field" ${f.half ? 'data-half' : ''}><label>${esc(f.label)}</label>${input}</div>`;
  }).join('');
  openModal(`<div class="m-ic">${icon}</div><h3>${esc(title)}</h3><p class="sub">${esc(sub)}</p>
    <form id="genForm" novalidate>${html}<div class="form-msg" id="genMsg"></div>
    <div class="m-actions"><button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" type="submit">${esc(submit)}</button></div></form>`);
  $('genForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target, msg = $('genMsg'), btn = form.querySelector('[type=submit]');
    const values = {};
    for (const f of fields) {
      const el = form.elements[f.name];
      values[f.name] = el.value.trim();
      if (f.required !== false && !values[f.name]) { msg.className = 'form-msg err'; msg.textContent = f.label + ' is required'; el.focus(); return; }
      if (f.type === 'number' && values[f.name] !== '') {
        const n = Number(values[f.name]);
        if (isNaN(n) || (f.min != null && n < f.min)) { msg.className = 'form-msg err'; msg.textContent = f.label + ' must be ' + (f.min != null ? 'at least ' + f.min : 'a valid number'); el.focus(); return; }
      }
    }
    btn.disabled = true; msg.textContent = '';
    try { await onSubmit(values); closeModal(); }
    catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; btn.disabled = false; }
  });
}

function confirmBox(title, text, okLabel = 'Delete') {
  return new Promise((resolve) => {
    openModal(`<div class="m-ic" style="background:var(--out-bg);color:var(--out)"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></div>
      <h3>${esc(title)}</h3><p class="sub">${esc(text)}</p>
      <div class="m-actions"><button class="btn btn-ghost" id="cNo">Cancel</button><button class="btn btn-danger" id="cYes">${esc(okLabel)}</button></div>`);
    $('cNo').onclick = () => { closeModal(); resolve(false); };
    $('cYes').onclick = () => { closeModal(); resolve(true); };
  });
}

/* =====================================================
   LOGIN / SESSION
===================================================== */
function saveSession(s) { S.session = s; sessionStorage.setItem('medifind.session', JSON.stringify(s)); }
function clearSession() { S.session = null; sessionStorage.removeItem('medifind.session'); }
function restoreSession() {
  try { S.session = JSON.parse(sessionStorage.getItem('medifind.session')); } catch (e) { S.session = null; }
}

function openLogin(role) {
  if (S.session) { openDash(); return; }
  if (role) S.loginRole = role;
  openModal(`<div class="m-ic">${ICON.lock}</div><h3>Welcome back</h3><p class="sub">Login to manage stock, requests and more.</p>
    <div class="tabs"><button type="button" id="tAdmin" onclick="setLoginRole('admin')">Admin</button><button type="button" id="tPh" onclick="setLoginRole('pharmacy')">Pharmacy</button></div>
    <form id="loginForm" novalidate>
      <div class="field"><label>Username</label><input id="lUser" required autocomplete="username" placeholder="Enter username"></div>
      <div class="field"><label>Password</label><div class="pw"><input id="lPass" type="password" required autocomplete="current-password" placeholder="Enter password"><button type="button" onclick="togglePw()" id="pwBtn">Show</button></div></div>
      <button class="btn btn-primary btn-block" type="submit" id="lBtn">Login</button>
      <div class="form-msg" id="lMsg"></div>
    </form>
    <div class="hint" id="lHint"></div>`);
  setLoginRole(S.loginRole);
  $('loginForm').addEventListener('submit', doLogin);
}

function setLoginRole(r) {
  S.loginRole = r;
  $('tAdmin').classList.toggle('on', r === 'admin');
  $('tPh').classList.toggle('on', r === 'pharmacy');
  $('lHint').innerHTML = r === 'admin'
    ? 'Demo admin: <b>admin</b> / <b>admin@123</b>'
    : 'Demo pharmacy: <b>healthplus</b> / <b>1234</b> (also medcare, wellness, apollo)';
  $('lMsg').textContent = '';
  $('lUser').focus();
}

function togglePw() {
  const i = $('lPass'), show = i.type === 'password';
  i.type = show ? 'text' : 'password';
  $('pwBtn').textContent = show ? 'Hide' : 'Show';
}

async function doLogin(e) {
  e.preventDefault();
  const user = $('lUser').value.trim(), pass = $('lPass').value, msg = $('lMsg'), btn = $('lBtn');
  if (!user || !pass) { msg.className = 'form-msg err'; msg.textContent = 'Please enter username and password'; return; }
  btn.disabled = true; btn.textContent = 'Signing in...'; msg.textContent = '';
  try {
    const r = await api('login', 'POST', { role: S.loginRole, username: user, password: pass });
    saveSession({ token: r.token, role: r.role, name: r.name, pharmacyId: r.pharmacyId });
    closeModal(); updateNav(); toast('Welcome, ' + r.name + '!');
    openDash();
  } catch (err) {
    msg.className = 'form-msg err'; msg.textContent = err.message;
    btn.disabled = false; btn.textContent = 'Login';
  }
}

async function logout() {
  try { await api('logout', 'POST'); } catch (e) { /* ignore */ }
  clearSession(); closeDash(); updateNav(); toast('Logged out successfully', 'info');
}

function updateNav() {
  const box = $('navActions');
  if (!S.session) { box.innerHTML = '<button class="btn btn-primary" onclick="openLogin()">Login</button>'; return; }
  box.innerHTML = `<div class="user-chip"><span class="avatar">${esc(initials(S.session.name))}</span><span>${esc(S.session.name)}</span></div>
    <button class="btn btn-primary" onclick="openDash()">Dashboard</button>`;
}

/* =====================================================
   DASHBOARD
===================================================== */
const MENU = {
  admin: [['overview', 'Overview', 'grid'], ['stock', 'Stock', 'box'], ['medicines', 'Medicines', 'pill'], ['pharmacies', 'Pharmacies', 'shop'], ['requests', 'Requests', 'bell']],
  pharmacy: [['overview', 'Overview', 'grid'], ['stock', 'My Stock', 'box'], ['requests', 'Medicine Requests', 'bell']],
};
let requests = [];

async function openDash() {
  if (!S.session) return openLogin();
  S.tab = 'overview';
  $('dash').hidden = false;
  document.body.style.overflow = 'hidden';
  $('who').innerHTML = `<span class="avatar">${esc(initials(S.session.name))}</span><div><b>${esc(S.session.name)}</b><small>${S.session.role === 'admin' ? 'Admin Panel' : 'Pharmacy Panel'}</small></div>`;
  await refreshDash();
}

function closeDash() {
  $('dash').hidden = true;
  $('side').classList.remove('open');
  document.body.style.overflow = '';
}

async function refreshDash() {
  try {
    const [m, p, s, st, r] = await Promise.all([api('medicines'), api('pharmacies'), api('stock'), api('stats'), api('requests')]);
    S.meds = m; S.pharmacies = p; S.stock = s; S.stats = st; requests = r;
  } catch (e) { if (S.session) toast(e.message, 'error'); return; }
  renderAll();
  renderSide(); renderTab();
}

function renderSide() {
  const pending = requests.filter((r) => r.status === 'PENDING').length;
  $('sideNav').innerHTML = MENU[S.session.role].map(([id, label, ic]) => `
    <button class="side-link ${S.tab === id ? 'on' : ''}" onclick="setTab('${id}')">${ICON[ic]}${label}
    ${id === 'requests' && pending && S.session.role === 'admin' ? `<span class="n">${pending}</span>` : ''}</button>`).join('');
}

function setTab(t) { S.tab = t; $('side').classList.remove('open'); renderSide(); renderTab(); $('dashBody').parentElement.scrollTop = 0; }

function myStock() { return S.stock.filter((s) => s.pharmacyId === S.session.pharmacyId); }
function dashAction(html) { $('dashAction').innerHTML = html; }

function renderTab() {
  const isAdmin = S.session.role === 'admin';
  const titles = { overview: 'Overview', stock: isAdmin ? 'Stock Management' : 'My Stock', medicines: 'Medicines', pharmacies: 'Pharmacies', requests: isAdmin ? 'Medicine Requests' : 'My Requests' };
  $('dashTitle').textContent = titles[S.tab];
  dashAction('');
  ({ overview: tabOverview, stock: tabStock, medicines: tabMedicines, pharmacies: tabPharmacies, requests: tabRequests })[S.tab]();
}

/* ----- overview ----- */
function tabOverview() {
  const isAdmin = S.session.role === 'admin';
  const stock = isAdmin ? S.stock : myStock();
  const low = stock.filter((s) => s.quantity > 0 && s.quantity <= 5);
  const out = stock.filter((s) => s.quantity === 0);
  const reqs = requests;
  const pending = reqs.filter((r) => r.status === 'PENDING');
  const kpis = isAdmin
    ? [['Medicines', S.stats.medicines, ''], ['Pharmacies', S.stats.pharmacies, ''], ['Stock records', S.stats.stock, ''], ['Pending requests', pending.length, pending.length ? 'warn' : 'good']]
    : [['My medicines', stock.length, ''], ['Low stock', low.length, low.length ? 'warn' : 'good'], ['Out of stock', out.length, out.length ? 'bad' : 'good'], ['My pending requests', pending.length, pending.length ? 'warn' : '']];
  const alerts = [...out, ...low].slice(0, 8);
  $('dashBody').innerHTML = `
    <div class="kpis">${kpis.map(([l, v, c]) => `<div class="kpi ${c}"><small>${l}</small><h3>${v ?? 0}</h3></div>`).join('')}</div>
    <div class="panels">
      <div class="panel"><div class="panel-h">Stock alerts</div>
        ${alerts.length ? alerts.map((s) => { const st = stockStatus(s.quantity); return `<div class="li"><div><b>${esc(s.medicine)}</b><small>${esc(s.pharmacy)}</small></div><div><span class="badge ${st.cls}">${s.quantity === 0 ? 'Out of stock' : s.quantity + ' left'}</span></div></div>`; }).join('')
          : '<div class="empty"><b>All good</b>No low or out-of-stock items.</div>'}
      </div>
      <div class="panel"><div class="panel-h">Recent requests</div>
        ${reqs.slice(0, 6).map((r) => `<div class="li"><div><b>${esc(r.medicine)}</b><small>${isAdmin ? esc(r.pharmacy) + ' &bull; ' : ''}${r.quantity} units &bull; ${esc(r.createdAt)}</small></div><span class="badge ${r.status.toLowerCase()}">${r.status}</span></div>`).join('')
          || '<div class="empty"><b>No requests yet</b></div>'}
      </div>
    </div>`;
}

/* ----- stock ----- */
function tabStock() {
  const isAdmin = S.session.role === 'admin';
  dashAction(`<button class="btn btn-primary" onclick="stockForm()">${ICON.plus} Add stock</button>`);
  const rows = isAdmin ? S.stock : myStock();
  $('dashBody').innerHTML = `
    <div class="dash-tools"><div class="search-box"><svg class="ico" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="dsSearch" placeholder="Filter stock..." oninput="filterDash()"></div></div>
    <div class="table-card"><div class="table-scroll"><table>
      <thead><tr><th>Medicine</th>${isAdmin ? '<th>Pharmacy</th>' : ''}<th>Price</th><th>Qty</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
      <tbody id="dsBody"></tbody></table></div></div>`;
  window._dsRows = rows;
  filterDash();
}

function filterDash() {
  const q = ($('dsSearch')?.value || '').toLowerCase();
  const isAdmin = S.session.role === 'admin';
  const rows = window._dsRows.filter((s) => !q || s.medicine.toLowerCase().includes(q) || s.pharmacy.toLowerCase().includes(q));
  $('dsBody').innerHTML = rows.length ? rows.map((s) => {
    const st = stockStatus(s.quantity);
    return `<tr><td><b>${esc(s.medicine)}</b></td>${isAdmin ? `<td>${esc(s.pharmacy)}</td>` : ''}<td>${money(s.price)}</td><td>${s.quantity}</td>
      <td><span class="badge ${st.cls}">${st.text}</span></td>
      <td><div class="row-actions" style="justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="editStock(${s.id})">Edit</button><button class="btn btn-danger btn-sm" onclick="deleteStock(${s.id})">Delete</button></div></td></tr>`;
  }).join('') : `<tr><td colspan="6"><div class="empty"><b>No stock found</b>Click "Add stock" to create one.</div></td></tr>`;
}

function stockForm() {
  const isAdmin = S.session.role === 'admin';
  const fields = [];
  if (isAdmin) fields.push({ name: 'pharmacyId', label: 'Pharmacy', type: 'select', options: S.pharmacies.map((p) => ({ value: p.id, label: p.name })) });
  const taken = new Set(myStock().map((s) => s.medicineId));
  const medOpts = S.meds.filter((m) => isAdmin || !taken.has(m.id)).map((m) => ({ value: m.id, label: m.name }));
  if (!medOpts.length) { toast('You already have every medicine in your stock', 'info'); return; }
  fields.push({ name: 'medicineId', label: 'Medicine', type: 'select', options: medOpts });
  fields.push({ name: 'price', label: 'Price (\u20B9)', type: 'number', min: 0, step: '0.01', placeholder: '0.00', half: true });
  fields.push({ name: 'quantity', label: 'Quantity', type: 'number', min: 0, step: '1', placeholder: '0', half: true });
  openForm({
    title: 'Add stock', sub: 'Add a medicine to the pharmacy inventory.', fields, submit: 'Add stock', icon: ICON.box,
    onSubmit: async (v) => {
      await api('stock', 'POST', { pharmacyId: Number(v.pharmacyId || 0), medicineId: Number(v.medicineId), price: Number(v.price), quantity: Number(v.quantity) });
      toast('Stock added'); await refreshDash();
    },
  });
}

function editStock(id) {
  const s = S.stock.find((x) => x.id === id);
  openForm({
    title: 'Update stock', sub: s.medicine + ' \u2022 ' + s.pharmacy, submit: 'Save changes', icon: ICON.box,
    fields: [
      { name: 'price', label: 'Price (\u20B9)', type: 'number', min: 0, step: '0.01', value: s.price },
      { name: 'quantity', label: 'Quantity', type: 'number', min: 0, step: '1', value: s.quantity },
    ],
    onSubmit: async (v) => { await api('stock/' + id, 'PUT', { price: Number(v.price), quantity: Number(v.quantity) }); toast('Stock updated'); await refreshDash(); },
  });
}

async function deleteStock(id) {
  const s = S.stock.find((x) => x.id === id);
  if (!(await confirmBox('Delete stock?', `Remove ${s.medicine} from ${s.pharmacy}? This cannot be undone.`))) return;
  try { await api('stock/' + id, 'DELETE'); toast('Stock deleted'); await refreshDash(); } catch (e) { toast(e.message, 'error'); }
}

/* ----- medicines (admin) ----- */
function tabMedicines() {
  dashAction(`<button class="btn btn-primary" onclick="medicineForm()">${ICON.plus} Add medicine</button>`);
  $('dashBody').innerHTML = `<div class="table-card"><div class="table-scroll"><table>
    <thead><tr><th>Name</th><th>Category</th><th>Description</th><th>Pharmacies</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${S.meds.map((m) => `<tr><td><b>${esc(m.name)}</b></td><td><span class="cat-tag">${esc(m.category)}</span></td><td style="max-width:300px;color:var(--muted)">${esc(m.description)}</td><td>${m.availableAt}</td>
      <td><div class="row-actions" style="justify-content:flex-end"><button class="btn btn-danger btn-sm" onclick="deleteMedicine(${m.id})">Delete</button></div></td></tr>`).join('')
      || '<tr><td colspan="5"><div class="empty"><b>No medicines</b></div></td></tr>'}</tbody></table></div></div>`;
}

function medicineForm() {
  openForm({
    title: 'Add medicine', sub: 'Add a new medicine to the catalogue.', icon: ICON.pill, submit: 'Add medicine',
    fields: [
      { name: 'name', label: 'Medicine name', placeholder: 'e.g. Paracetamol 500mg' },
      { name: 'category', label: 'Category', placeholder: 'e.g. Pain Relief' },
      { name: 'description', label: 'Description', type: 'textarea', required: false, placeholder: 'Short description (optional)' },
    ],
    onSubmit: async (v) => { await api('medicines', 'POST', v); toast('Medicine added'); await refreshDash(); },
  });
}

async function deleteMedicine(id) {
  const m = S.meds.find((x) => x.id === id);
  if (!(await confirmBox('Delete medicine?', `Delete "${m.name}" from the catalogue?`))) return;
  try { await api('medicines/' + id, 'DELETE'); toast('Medicine deleted'); await refreshDash(); } catch (e) { toast(e.message, 'error'); }
}

/* ----- pharmacies (admin) ----- */
function tabPharmacies() {
  dashAction(`<button class="btn btn-primary" onclick="pharmacyForm()">${ICON.plus} Add pharmacy</button>`);
  $('dashBody').innerHTML = `<div class="table-card"><div class="table-scroll"><table>
    <thead><tr><th>Pharmacy</th><th>Location</th><th>Phone</th><th>Username</th><th>Items</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${S.pharmacies.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.location)}</td><td>${esc(p.phone)}</td><td><code>${esc(p.username)}</code></td><td>${p.stockItems}</td>
      <td><div class="row-actions" style="justify-content:flex-end"><button class="btn btn-danger btn-sm" onclick="deletePharmacy(${p.id})">Delete</button></div></td></tr>`).join('')
      || '<tr><td colspan="6"><div class="empty"><b>No pharmacies</b></div></td></tr>'}</tbody></table></div></div>`;
}

function pharmacyForm() {
  openForm({
    title: 'Add pharmacy', sub: 'Register a pharmacy and create its login.', icon: ICON.shop, submit: 'Add pharmacy',
    fields: [
      { name: 'name', label: 'Pharmacy name', placeholder: 'e.g. CityCare Pharmacy' },
      { name: 'location', label: 'Location', placeholder: 'e.g. Baner, Pune' },
      { name: 'phone', label: 'Phone number', type: 'tel', placeholder: '10 digit number' },
      { name: 'username', label: 'Login username', placeholder: 'e.g. citycare' },
      { name: 'password', label: 'Login password', type: 'password', placeholder: 'At least 4 characters' },
    ],
    onSubmit: async (v) => { await api('pharmacies', 'POST', v); toast('Pharmacy added'); await refreshDash(); },
  });
}

async function deletePharmacy(id) {
  const p = S.pharmacies.find((x) => x.id === id);
  if (!(await confirmBox('Delete pharmacy?', `Delete "${p.name}" along with all its stock and requests?`))) return;
  try { await api('pharmacies/' + id, 'DELETE'); toast('Pharmacy deleted'); await refreshDash(); } catch (e) { toast(e.message, 'error'); }
}

/* ----- requests ----- */
function tabRequests() {
  const isAdmin = S.session.role === 'admin';
  if (!isAdmin) dashAction(`<button class="btn btn-primary" onclick="requestForm()">${ICON.plus} New request</button>`);
  $('dashBody').innerHTML = `<div class="table-card"><div class="table-scroll"><table>
    <thead><tr><th>#</th><th>Medicine</th>${isAdmin ? '<th>Pharmacy</th>' : ''}<th>Qty</th><th>Date</th><th>Status</th>${isAdmin ? '<th style="text-align:right">Actions</th>' : ''}</tr></thead>
    <tbody>${requests.map((r) => `<tr><td>${r.id}</td><td><b>${esc(r.medicine)}</b></td>${isAdmin ? `<td>${esc(r.pharmacy)}</td>` : ''}<td>${r.quantity}</td><td>${esc(r.createdAt)}</td>
      <td><span class="badge ${r.status.toLowerCase()}">${r.status}</span></td>
      ${isAdmin ? `<td><div class="row-actions" style="justify-content:flex-end">${r.status === 'PENDING'
        ? `<button class="btn btn-primary btn-sm" onclick="setRequest(${r.id},'APPROVED')">Approve</button><button class="btn btn-danger btn-sm" onclick="setRequest(${r.id},'REJECTED')">Reject</button>`
        : `<button class="btn btn-ghost btn-sm" onclick="setRequest(${r.id},'PENDING')">Reopen</button>`}</div></td>` : ''}</tr>`).join('')
      || `<tr><td colspan="7"><div class="empty"><b>No requests yet</b>${isAdmin ? 'Pharmacy requests will appear here.' : 'Click "New request" to ask for a medicine.'}</div></td></tr>`}</tbody></table></div></div>`;
}

function requestForm() {
  openForm({
    title: 'Request medicine', sub: 'Ask the admin to supply a medicine to your pharmacy.', icon: ICON.bell, submit: 'Submit request',
    fields: [
      { name: 'medicineId', label: 'Medicine', type: 'select', options: S.meds.map((m) => ({ value: m.id, label: m.name })) },
      { name: 'quantity', label: 'Quantity needed', type: 'number', min: 1, step: '1', placeholder: 'e.g. 50' },
    ],
    onSubmit: async (v) => { await api('requests', 'POST', { medicineId: Number(v.medicineId), quantity: Number(v.quantity) }); toast('Request submitted'); await refreshDash(); },
  });
}

async function setRequest(id, status) {
  try { await api('requests/' + id, 'PUT', { status }); toast('Request ' + status.toLowerCase()); await refreshDash(); } catch (e) { toast(e.message, 'error'); }
}

/* =====================================================
   START
===================================================== */
restoreSession();
updateNav();
loadPublic();
if (S.session) api('me').catch(() => { clearSession(); updateNav(); });
