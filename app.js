import * as S from './store.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const ELEMENTS = [['Fogo', '🔥', '#ff6b4a'], ['Água', '💧', '#4ab8ff'], ['Vento', '🌪', '#ffd23f'], ['Luz', '☀️', '#ffe9a8'], ['Escuridão', '🌑', '#a46cff']];
const EL_COLOR = Object.fromEntries(ELEMENTS.map(([n, , c]) => [n, c]));
const CATS = ['Ataque', 'Defesa', 'HP', 'Suporte'];
const NATS = [2, 3, 4, 5];
const FLAGS = [
  ['s5', '5★', '5 estrelas'], ['s6', '6★', '6 estrelas'], ['skill', 'Skill', 'Skill Max'], ['runa', 'Runa', 'Runa Max'],
  ['art', 'Art', 'Artefato'], ['rel', 'Rel', 'Relíquia'], ['a1', '1A', 'Despertar 1'], ['a2', '2A', 'Despertar 2'],
];
const TITLES = { tenho: 'Coleção', quero: 'Desejos', nao: 'Faltando', ajustes: 'Ajustes' };
const SORTS = [['ordem', 'Ordem 6★'], ['nome', 'Nome'], ['nat', 'Estrelas'], ['el', 'Elemento']];

const PREFS_KEY = 'sw.prefs.v1';
const blankFilters = () => ({ el: [], nat: [], cat: [], flags: {} });
let prefs = { tab: 'tenho', sort: 'ordem', filters: blankFilters() };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch {}
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} };
let query = '';

// 1A monster id -> 2nd-awakening icon (data/awaken2.json)
let AWAKEN2 = {};
const imgOf = (e) => (e.a2 && e.mid && AWAKEN2[e.mid]) || e.img;

const stars = (e) => (e.s6 ? 6 : e.s5 ? 5 : e.nat || 0);
const starStr = (e) => '★'.repeat(stars(e)) + `<span class="d">${'★'.repeat(Math.max(0, 6 - stars(e)))}</span>`;

// ---------- list ----------
function filtered() {
  const f = prefs.filters, q = norm(query);
  let list = S.all().filter((e) => e.status === prefs.tab);
  if (q) list = list.filter((e) => norm(e.nome).includes(q));
  if (f.el.length) list = list.filter((e) => f.el.includes(e.el));
  if (f.nat.length) list = list.filter((e) => f.nat.includes(Number(e.nat)));
  if (f.cat.length) list = list.filter((e) => f.cat.includes(e.cat));
  for (const [k, v] of Object.entries(f.flags)) {
    if (v === null || v === undefined) continue;
    list = list.filter((e) => (e[k] === null ? false : !!e[k]) === v && !(k === 'a2' && e.a2 === null && v === false));
  }
  const byName = (a, b) => a.nome.localeCompare(b.nome, 'pt');
  const elIdx = (e) => ELEMENTS.findIndex(([n]) => n === e.el);
  const sorters = {
    ordem: (a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9) || byName(a, b),
    nome: byName,
    nat: (a, b) => stars(b) - stars(a) || b.nat - a.nat || byName(a, b),
    el: (a, b) => elIdx(a) - elIdx(b) || byName(a, b),
  };
  return list.sort(sorters[prefs.sort] || sorters.ordem);
}

function itemHTML(e) {
  const showNum = prefs.tab === 'tenho' && prefs.sort === 'ordem';
  const tags = e.status === 'tenho'
    ? [['skill', 'Skill'], ['runa', 'Runa'], ['art', 'Art'], ['rel', 'Rel'], ['a1', '1A'], ['a2', '2A']]
        .filter(([k]) => e[k] !== null)
        .map(([k, l]) => `<span class="t ${e[k] ? 'y' : ''}">${l}</span>`).join('')
    : '';
  return `<button class="item" data-id="${esc(e.id)}">
    ${showNum ? `<span class="num">${e.ordem ? e.ordem : '–'}</span>` : ''}
    <span class="av"><img src="img/${esc(imgOf(e))}" alt="" loading="lazy" decoding="async"><span class="el" style="background:${EL_COLOR[e.el] || '#888'}"></span></span>
    <span class="info"><div class="nm">${esc(e.nome)}</div><div class="stars">${starStr(e)}</div><div class="meta">${esc(e.el)} · ${esc(e.cat || '—')}${e.a1 === false ? ' · não desp.' : ''}</div></span>
    <span class="tags">${tags}</span></button>`;
}

let renderToken = 0;
function renderList() {
  const list = filtered();
  const el = $('#list');
  const token = ++renderToken;
  el.innerHTML = `<div class="count">${list.length} ${list.length === 1 ? 'summon' : 'summons'}</div>` +
    (list.length ? '' : `<div class="empty">Nada encontrado com esses filtros.</div>`);
  let i = 0;
  const chunk = () => {
    if (token !== renderToken) return;
    el.insertAdjacentHTML('beforeend', list.slice(i, i + 60).map(itemHTML).join(''));
    i += 60;
    if (i < list.length) sentinel();
  };
  const sentinel = () => {
    const s = document.createElement('div'); s.style.height = '1px'; el.appendChild(s);
    const io = new IntersectionObserver((ents) => { if (ents[0].isIntersecting) { io.disconnect(); s.remove(); chunk(); } }, { rootMargin: '800px' });
    io.observe(s);
  };
  chunk();
}

function renderStats() {
  const mine = S.all().filter((e) => e.status === 'tenho');
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  let cards;
  if (prefs.tab === 'tenho') {
    const s6 = mine.filter((e) => e.s6).length, runa = mine.filter((e) => e.runa).length;
    cards = [[mine.length, 'Summons', 100, 'var(--acc)'], [s6, `6★ (${pct(s6, mine.length)}%)`, pct(s6, mine.length)], [runa, `Runa full (${pct(runa, mine.length)}%)`, pct(runa, mine.length), 'var(--ok)']];
  } else if (prefs.tab === 'quero') {
    const w = S.all().filter((e) => e.status === 'quero');
    cards = [[w.length, 'Desejados', 100, 'var(--acc)'], [w.filter((e) => e.nat >= 5).length, 'Naturais 5★', 0], [w.filter((e) => e.nat === 4).length, 'Naturais 4★', 0]];
  } else {
    const n = S.all().filter((e) => e.status === 'nao');
    const total = n.length + mine.length;
    cards = [[n.length, 'Faltando', pct(n.length, total), 'var(--warn)'], [n.filter((e) => e.nat >= 5).length, 'Naturais 5★', 0], [n.filter((e) => e.nat === 4).length, 'Naturais 4★', 0]];
  }
  $('#stats').innerHTML = cards.map(([v, l, p, c]) =>
    `<div class="st"><b>${v}</b><span>${l}</span><div class="bar"><i style="width:${p}%;${c ? `background:${c}` : ''}"></i></div></div>`).join('');
}

function activeFilterCount() {
  const f = prefs.filters;
  return f.nat.length + f.cat.length + Object.values(f.flags).filter((v) => v !== null && v !== undefined).length;
}

function renderChips() {
  const f = prefs.filters;
  const elChips = [`<button class="chip ${f.el.length ? '' : 'on'}" data-chip="el:*">Todos</button>`]
    .concat(ELEMENTS.map(([n, ic]) => `<button class="chip ${f.el.includes(n) ? 'on' : ''}" data-chip="el:${n}">${ic} ${n}</button>`));
  const extra = [
    ...f.nat.map((n) => `<button class="chip x" data-chip="nat:${n}">${n}★ natural ✕</button>`),
    ...f.cat.map((c) => `<button class="chip x" data-chip="cat:${c}">${c} ✕</button>`),
    ...Object.entries(f.flags).filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `<button class="chip x" data-chip="flag:${k}">${FLAGS.find((x) => x[0] === k)[2]}: ${v ? 'sim' : 'não'} ✕</button>`),
  ];
  $('#chips').innerHTML = extra.join('') + elChips.join('');
  const n = activeFilterCount();
  $('#fcount').hidden = !n; $('#fcount').textContent = n;
}

function render() {
  const isSettings = prefs.tab === 'ajustes';
  $('#pageTitle').textContent = TITLES[prefs.tab];
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === prefs.tab));
  $('#stats').hidden = $('.searchrow').hidden = $('#chips').hidden = $('#list').hidden = isSettings;
  $('#settings').hidden = !isSettings;
  if (isSettings) return renderSettings();
  renderStats(); renderChips(); renderList();
}

// ---------- sheets ----------
function openSheet(html, onClick) {
  const panel = $('#sheetPanel');
  panel.innerHTML = `<div class="grab"></div>` + html;
  panel.onclick = onClick || null;
  panel.classList.toggle('anim', $('#sheet').hidden);
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeSheet() { $('#sheet').hidden = true; document.body.style.overflow = ''; }

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2200);
}

function detailHTML(e) {
  const st = stars(e);
  // A null flag means the option doesn't exist for this monster (e.g. no 2nd awakening): hide it.
  const tg = (k, label) => (e[k] === null ? '' :
    `<button class="tg" data-flag="${k}"><span>${label}</span><span class="sw ${e[k] ? 'on' : ''}"></span></button>`);
  const statusSeg = [['tenho', 'Tenho'], ['quero', 'Quero'], ['nao', 'Não tenho']]
    .map(([v, l]) => `<button data-status="${v}" class="${e.status === v ? 'on' : ''}">${l}</button>`).join('');
  const copies = S.all().filter((x) => x.mid && x.mid === e.mid && x.status === 'tenho').length;
  return `<div class="shead"><span></span><button class="link" data-close>Fechar</button></div>
    <div class="hero"><img src="img/${esc(imgOf(e))}" alt=""><h2>${esc(e.nome)}</h2>
      <span class="pill" style="color:${EL_COLOR[e.el]}">● ${esc(e.el)}</span><span class="pill">${esc(e.cat || '—')}</span><span class="pill">Natural ${e.nat}★</span>
      ${e.ordem ? `<span class="pill">#${e.ordem} no 6★</span>` : ''}${copies > 1 ? `<span class="pill">${copies} cópias</span>` : ''}</div>
    <div class="seg">${statusSeg}</div>
    ${e.status === 'tenho' ? `
      <div class="starsel">${[1, 2, 3, 4, 5, 6].map((i) => `<button data-star="${i}" class="${i <= st ? 'on' : ''}" aria-label="${i} estrelas">★</button>`).join('')}</div>
      <div class="grp">${tg('skill', 'Skill Max')}${tg('runa', 'Runa Max')}${tg('art', 'Artefato')}${tg('rel', 'Relíquia')}</div>
      <div class="grp">${tg('a1', 'Despertar 1')}${tg('a2', 'Despertar 2')}</div>` : `
      <button class="btn" data-status="tenho">🎉 Ganhei! Mover para a coleção</button>`}
    <label class="f">Observação</label>
    <textarea id="obs" placeholder="Ex.: fazer homunculus, runar para ToA…">${esc(e.obs)}</textarea>
    ${e.status === 'tenho' ? `<div class="row2"><button class="btn sec" data-act="copy">+ Outra cópia</button><button class="btn danger" data-act="del">Remover</button></div>` : ''}`;
}

function openDetail(id) {
  const draw = () => {
    const e = S.get(id);
    if (!e || e.deleted) return closeSheet();
    openSheet(detailHTML(e), onDetailClick);
    const ta = $('#obs');
    ta.addEventListener('change', () => S.update(id, { obs: ta.value }));
  };
  function onDetailClick(ev) {
    const e = S.get(id);
    const t = ev.target.closest('button');
    if (!t || !e) return;
    if (t.dataset.flag) {
      const k = t.dataset.flag;
      if (e[k] === null) return;
      const patch = { [k]: !e[k] };
      S.update(id, patch);
    } else if (t.dataset.star) {
      const n = Number(t.dataset.star);
      const patch = n >= 6 ? { s5: true, s6: true } : n === 5 ? { s5: true, s6: false } : { s5: false, s6: false };
      if (patch.s6 && !e.s6 && !e.ordem) { patch.ordem = S.nextOrdem(); toast(`⭐ ${e.nome} virou 6★ — nº ${patch.ordem} na ordem`); }
      if (!patch.s6 && e.s6) patch.ordem = null;
      S.update(id, patch);
    } else if (t.dataset.status) {
      const s = t.dataset.status;
      if (s === e.status) return;
      S.update(id, { status: s });
      if (s === 'tenho') toast(`🎉 ${e.nome} foi para a coleção`);
    } else if (t.dataset.act === 'copy') {
      const copy = { ...e, id: 'u' + Date.now().toString(36), s5: false, s6: false, skill: false, runa: false, art: false, rel: false, a2: e.a2 === null ? null : false, obs: '', ordem: null, deleted: false };
      S.add(copy); toast('Cópia adicionada'); id = copy.id;
    } else if (t.dataset.act === 'del') {
      const others = S.all().filter((x) => x.id !== e.id && x.mid && x.mid === e.mid);
      if (!confirm(others.length ? `Remover esta cópia de ${e.nome}?` : `Mover ${e.nome} para "Faltando"?`)) return;
      if (others.length || !e.mid) S.remove(e.id);
      else S.update(e.id, { status: 'nao', s5: false, s6: false, skill: false, runa: false, art: false, rel: false, ordem: null });
      return closeSheet();
    } else if ('close' in t.dataset) return closeSheet();
    draw();
  }
  draw();
}

function filtersHTML() {
  const f = prefs.filters;
  const chip = (group, v, label, on) => `<button class="chip ${on ? 'on' : ''}" data-f="${group}" data-v="${v}">${label}</button>`;
  const tri = (k) => {
    const v = f.flags[k];
    return `<div class="tri" data-k="${k}">${[['', 'Todos', v == null], ['1', 'Sim', v === true], ['0', 'Não', v === false]]
      .map(([val, l, on]) => `<button data-tri="${val}" class="${on ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  };
  return `<div class="shead"><button class="link" data-clear>Limpar</button><h2>Filtros</h2><button class="link" data-close>OK</button></div>
    <label class="f">Ordenar por</label><div class="seg">${SORTS.map(([v, l]) => `<button data-sort="${v}" class="${prefs.sort === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    <label class="f">Elemento</label><div class="wrapchips">${ELEMENTS.map(([n, ic]) => chip('el', n, `${ic} ${n}`, f.el.includes(n))).join('')}</div>
    <label class="f">Estrela natural</label><div class="wrapchips">${NATS.map((n) => chip('nat', n, `${n}★`, f.nat.includes(n))).join('')}</div>
    <label class="f">Categoria</label><div class="wrapchips">${CATS.map((c) => chip('cat', c, c, f.cat.includes(c))).join('')}</div>
    <label class="f">Progresso</label>
    <div class="grp">${FLAGS.map(([k, , label]) => `<div class="frow"><span>${label}</span>${tri(k)}</div>`).join('')}</div>`;
}

function openFilters() {
  openSheet(filtersHTML(), (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    const f = prefs.filters;
    if ('close' in t.dataset) { closeSheet(); return; }
    if ('clear' in t.dataset) prefs.filters = blankFilters();
    else if (t.dataset.sort) prefs.sort = t.dataset.sort;
    else if (t.dataset.f) {
      const g = t.dataset.f, v = g === 'nat' ? Number(t.dataset.v) : t.dataset.v;
      f[g] = f[g].includes(v) ? f[g].filter((x) => x !== v) : [...f[g], v];
    } else if (t.dataset.tri !== undefined) {
      const k = t.closest('.tri').dataset.k;
      f.flags[k] = t.dataset.tri === '' ? null : t.dataset.tri === '1';
    }
    savePrefs(); render();
    const y = $('#sheetPanel').scrollTop;
    openSheet(filtersHTML(), $('#sheetPanel').onclick);
    $('#sheetPanel').scrollTop = y;
  });
}

// ---------- settings ----------
function renderSettings() {
  const user = S.currentUser(), state = S.currentSyncState();
  let sync;
  if (!S.syncConfigured()) {
    sync = `<div class="card"><h3>☁️ Nuvem</h3><p>A sincronização ainda não foi configurada. Os dados estão salvos só neste aparelho — faça backups abaixo.</p></div>`;
  } else if (!user) {
    sync = `<div class="card"><h3>☁️ Entrar para sincronizar</h3><p>Seus dados ficam salvos na nuvem e aparecem em qualquer aparelho em que você entrar.</p>
      <label class="f">E-mail</label><input id="em" class="inp" type="email" autocomplete="username" inputmode="email">
      <label class="f">Senha</label><input id="pw" class="inp" type="password" autocomplete="current-password">
      <div class="row2"><button class="btn" data-act="in">Entrar</button><button class="btn sec" data-act="up">Criar conta</button></div></div>`;
  } else {
    const label = { on: '✅ Sincronizado', busy: '⏳ Sincronizando…', err: '⚠️ Erro — tente de novo', 'logged-out': '' }[state] || state;
    sync = `<div class="card"><h3>☁️ Nuvem</h3><p>Conectado como <b>${esc(user.email)}</b><br>${label}</p>
      <div class="row2"><button class="btn" data-act="sync">Sincronizar agora</button><button class="btn sec" data-act="out">Sair</button></div></div>`;
  }
  $('#settings').innerHTML = sync + `
    <div class="card"><h3>💾 Backup</h3><p>Exporte um arquivo com todos os seus dados (salve no iCloud Drive) ou importe um backup.</p>
      <div class="row2"><button class="btn sec" data-act="export">Exportar</button><button class="btn sec" data-act="import">Importar</button></div>
      <input id="file" type="file" accept="application/json,.json" hidden></div>
    <div class="card"><h3>📱 Instalar no iPhone</h3><p>No Safari, toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>. O app abre em tela cheia e funciona offline.</p></div>
    <div class="card"><h3>♻️ Recomeçar</h3><p>Restaura os dados originais da planilha. Suas alterações feitas no app serão perdidas.</p>
      <button class="btn danger" data-act="reset">Restaurar dados da planilha</button></div>
    <p style="text-align:center;color:var(--mut);font-size:12px;margin-top:8px">${S.all().length} registros · imagens: SWARFARM / Com2uS</p>`;
}

async function onSettingsClick(ev) {
  const t = ev.target.closest('button');
  if (!t || !t.dataset.act) return;
  const act = t.dataset.act;
  try {
    if (act === 'in' || act === 'up') {
      const em = $('#em').value.trim(), pw = $('#pw').value;
      if (!em || pw.length < 6) return toast('Informe e-mail e senha (mín. 6 caracteres)');
      t.disabled = true;
      if (act === 'in') { await S.signIn(em, pw); toast('Conectado!'); }
      else { const r = await S.signUp(em, pw); toast(r === 'confirm' ? 'Confirme pelo link no seu e-mail e depois entre aqui' : 'Conta criada!'); }
    } else if (act === 'sync') { await S.syncNow(); toast('Sincronizado'); }
    else if (act === 'out') { await S.signOut(); }
    else if (act === 'export') await exportBackup();
    else if (act === 'import') $('#file').click();
    else if (act === 'reset') {
      if (confirm('Restaurar os dados originais da planilha? Isso desfaz tudo que você alterou no app.')) { await S.resetToSeed(); toast('Dados restaurados'); }
    }
  } catch (e) { toast('Erro: ' + (e.message || e)); }
  render();
}

async function exportBackup() {
  const name = `sw-tracker-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([S.exportJSON()], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Backup SW Tracker' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- wiring ----------
function wire() {
  $('#tabs').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    prefs.tab = b.dataset.tab; savePrefs(); render(); window.scrollTo(0, 0);
  });
  $('#list').addEventListener('click', (ev) => { const b = ev.target.closest('.item'); if (b) openDetail(b.dataset.id); });
  let qt; $('#q').addEventListener('input', (ev) => { clearTimeout(qt); qt = setTimeout(() => { query = ev.target.value; renderList(); }, 120); });
  $('#btnFilter').addEventListener('click', openFilters);
  $('#chips').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-chip]'); if (!b) return;
    const [g, v] = b.dataset.chip.split(':'); const f = prefs.filters;
    if (g === 'el') f.el = v === '*' ? [] : f.el.includes(v) ? f.el.filter((x) => x !== v) : [...f.el, v];
    else if (g === 'nat') f.nat = f.nat.filter((x) => x !== Number(v));
    else if (g === 'cat') f.cat = f.cat.filter((x) => x !== v);
    else if (g === 'flag') delete f.flags[v];
    savePrefs(); render();
  });
  $('#sheet').addEventListener('click', (ev) => { if (ev.target.matches('[data-close].sheet-bg')) closeSheet(); });
  $('#settings').addEventListener('click', onSettingsClick);
  $('#settings').addEventListener('change', async (ev) => {
    if (ev.target.id !== 'file' || !ev.target.files[0]) return;
    try { const n = S.importJSON(await ev.target.files[0].text()); toast(`${n} registros importados`); } catch (e) { toast('Erro: ' + e.message); }
    render();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) S.syncNow().catch(() => {}); });

  let rt;
  S.onChange(() => { clearTimeout(rt); rt = setTimeout(() => { if (prefs.tab !== 'ajustes') { renderStats(); renderList(); } }, 50); });
  S.onSync((state) => {
    $('#syncDot').className = 'sync ' + ({ on: 'on', busy: 'busy', err: 'err' }[state] || '');
    if (prefs.tab === 'ajustes') renderSettings();
  });
}

async function main() {
  await S.load();
  try { AWAKEN2 = await (await fetch('data/awaken2.json')).json(); } catch {}
  if (!TITLES[prefs.tab]) prefs.tab = 'tenho';
  prefs.filters = { ...blankFilters(), ...prefs.filters };
  wire(); render();
  S.initSync();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
main();
