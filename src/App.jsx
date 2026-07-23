import React from 'react';
import { css } from './css.js';
import { Pressable } from './Pressable.jsx';
import { RAW, CATPT, EQPT, AMBER, AMBER_GRAD, CIRC, SKELETON, translateName, uid } from './translate.js';
import { supabase } from './supabaseClient.js';
import logo from './assets/bronzetes-logo-sem-fundo.png';

class App extends React.Component {
  state = {
    libStatus: 'loading', screen: 'home', tab: 'fichas',
    fichas: [], history: [], editId: null, progFicha: 'all',
    pq: '', pcat: 'todos', ptarget: 'todos', pickerMode: 'add', swapKey: null, returnTo: 'edit',
    customExs: [], cName: '', cUrl: '', video: null,
    profile: { name: 'Atleta', photo: null },
    settings: { fichasLayout: 'cartoes', gifsAnimados: true, descansoPadrao: 60 },
    resumePrompt: false, toast: null,
    wo: null, now: Date.now(), rest: null, summary: null,
    session: null, authStatus: 'checking', authMode: 'login', authName: '', authEmail: '', authPassword: '', authError: null, authBusy: false,
  };
  lib = []; map = {};
  ringRef = React.createRef(); rafId = null; toastTimer = null;
  _libDone = false; _userRow = undefined; _explicitSignOut = false; authSub = null;

  componentDidMount() {
    this.loadLib();
    supabase.auth.getSession().then(({ data }) => this.onAuthChange(data.session));
    this.authSub = supabase.auth.onAuthStateChange((_event, session) => this.onAuthChange(session)).data.subscription;
  }
  componentWillUnmount() { clearInterval(this.tickInt); this.stopRingLoop(); clearTimeout(this.toastTimer); if (this.authSub) this.authSub.unsubscribe(); }

  componentDidUpdate(prevProps, prevState) {
    if (!prevState.rest && this.state.rest) this.startRingLoop();
    if (prevState.rest && !this.state.rest) this.stopRingLoop();
  }

  onAuthChange(session) {
    const prevId = this.state.session && this.state.session.user.id;
    const nextId = session && session.user.id;
    if (this.state.authStatus === 'signedIn' && nextId === prevId) { this.setState({ session }); return; }
    if (session) {
      this.setState({ session, authStatus: 'signedIn', authName: '', authEmail: '', authPassword: '', authError: null });
      this._userRow = undefined;
      this.fetchUserData(session.user.id);
    } else {
      const resetToDefaults = this._explicitSignOut;
      this._explicitSignOut = false;
      this._userRow = undefined;
      this.setState(resetToDefaults ? {
        session: null, authStatus: 'signedOut',
        fichas: [], history: [], customExs: [], editId: null,
        profile: { name: 'Atleta', photo: null },
        settings: { fichasLayout: 'cartoes', gifsAnimados: true, descansoPadrao: 60 },
        resumePrompt: false, wo: null, rest: null, summary: null, screen: 'home', tab: 'fichas',
      } : { session: null, authStatus: 'signedOut' });
    }
  }

  async fetchUserData(userId) {
    const { data, error } = await supabase.from('user_data').select('data').eq('user_id', userId).maybeSingle();
    this._userRow = error ? null : (data ? data.data : null);
    this.maybeInit();
  }

  async submitAuth() {
    if (this.state.authBusy) return;
    const isSignup = this.state.authMode === 'signup';
    const name = this.state.authName.trim();
    const email = this.state.authEmail.trim();
    const password = this.state.authPassword;
    if (!email || !password || (isSignup && !name)) { this.setState({ authError: isSignup ? 'Preencha nome, e-mail e senha.' : 'Preencha e-mail e senha.' }); return; }
    this.setState({ authBusy: true, authError: null });
    const { data, error } = isSignup
      ? await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (error) { this.setState({ authBusy: false, authError: error.message }); return; }
    if (this.state.authMode === 'signup' && !data.session) {
      this.setState({ authBusy: false, authError: 'Verifique seu e-mail para confirmar a conta antes de entrar.' });
      return;
    }
    this.setState({ authBusy: false });
  }

  signOut() {
    this._explicitSignOut = true;
    supabase.auth.signOut();
  }

  maybeInit() {
    if (!this._libDone || this._userRow === undefined) return;
    const lib = this.lib;
    const st = { libStatus: 'ready' };
    const saved = this._userRow;
    if (saved) {
      st.fichas = saved.fichas || []; st.history = saved.history || []; st.customExs = saved.customExs || [];
      if (saved.profile) st.profile = saved.profile;
      if (saved.settings) st.settings = { ...this.state.settings, ...saved.settings };
      if (saved.wo) { st.wo = saved.wo; st.rest = saved.rest || null; st.resumePrompt = true; }
      if (!st.history.some(h => (h.exsLog || []).length)) st.history = this.seedHistory(st.fichas).concat(st.history);
      const bad = lib.find(e => e.n === 'band one arm twisting seated row');
      const good = lib.find(e => e.n === 'cable seated row');
      if (bad && good) st.fichas = st.fichas.map(f => ({ ...f, exs: f.exs.map(x => x.ex === bad.i ? { ...x, ex: good.i } : x) }));
    } else {
      st.fichas = this.seed(); st.history = this.seedHistory(st.fichas);
      const meta = this.state.session && this.state.session.user.user_metadata;
      const name = meta && meta.full_name;
      if (name) st.profile = { name, photo: null };
    }
    this.setState(st, () => this.save());
  }

  loadLib() {
    try {
      const c = localStorage.getItem('truze.lib.v2');
      if (c) { this.libReady(JSON.parse(c)); return; }
    } catch (e) {}
    fetch(RAW + 'data/exercises.json').then(r => r.json()).then(d => {
      const lib = d.map(e => ({ i: e.id, n: e.name, c: e.category, t: e.target || '', e: e.equipment || '', s: (e.gif_url || '').replace('videos/', '').replace('.gif', '') }));
      try { localStorage.setItem('truze.lib.v2', JSON.stringify(lib)); } catch (e) {}
      this.libReady(lib);
    }).catch(() => this.setState({ libStatus: 'error' }));
  }
  libReady(lib) {
    this.lib = lib;
    this.map = {};
    lib.forEach(e => { this.map[e.i] = e; });
    this._libDone = true;
    this.maybeInit();
  }

  pick(spec, kws, used, idx) {
    const parts = spec.split(':');
    let pool = this.lib.filter(e => e.c === parts[0] && (!parts[1] || (e.t || '').includes(parts[1])));
    if (!pool.length) pool = this.lib;
    for (const kw of kws) {
      const f = pool.find(e => e.n.toLowerCase().includes(kw) && !used.has(e.i));
      if (f) return f.i;
    }
    const fb = pool.find(e => !used.has(e.i)) || pool[idx % pool.length];
    return fb.i;
  }
  mkFicha(name, defs) {
    const used = new Set();
    const exs = defs.map((d, ix) => {
      const id = this.pick(d[0], d[1], used, ix);
      used.add(id);
      return { k: uid(), ex: id, sets: d[2], reps: d[3], rest: d[4], last: d[5] };
    });
    return { id: uid(), name, exs };
  }
  seed() {
    return [
      this.mkFicha('Treino A · Peito e Tríceps', [
        ['chest', ['barbell bench press', 'bench press'], 4, 8, 90, 40],
        ['chest', ['barbell incline bench press', 'incline bench press'], 3, 10, 90, 30],
        ['chest', ['dumbbell fly', 'cable low fly', ' fly'], 3, 12, 60, 14],
        ['chest', ['chest dip', 'dip'], 3, 10, 90, 0],
        ['upper arms:triceps', ['cable pushdown', 'pushdown'], 3, 12, 60, 25],
        ['upper arms:triceps', ['barbell standing overhead triceps extension', 'overhead triceps extension', 'extension'], 3, 12, 60, 20],
        ['chest', ['push-up', 'push up'], 3, 15, 60, 0],
        ['upper arms:triceps', ['skull', 'lying triceps'], 3, 10, 60, 15],
      ]),
      this.mkFicha('Treino B · Costas e Bíceps', [
        ['back', ['pull-up', 'pull up'], 4, 8, 90, 0],
        ['back', ['cable pulldown', 'lateral pulldown', 'pulldown'], 4, 10, 90, 55],
        ['back', ['barbell bent over row', 'bent over row', ' row'], 4, 10, 90, 50],
        ['back', ['cable seated row', 'cable low seated row', 'seated row'], 3, 12, 60, 45],
        ['upper legs', ['barbell deadlift', 'deadlift'], 4, 6, 120, 80],
        ['upper arms:biceps', ['barbell curl'], 3, 10, 60, 25],
        ['upper arms:biceps', ['hammer'], 3, 12, 60, 12],
        ['upper arms:biceps', ['preacher'], 3, 12, 60, 20],
      ]),
      this.mkFicha('Treino C · Pernas e Ombros', [
        ['upper legs', ['barbell full squat', 'full squat', 'squat'], 4, 8, 120, 60],
        ['upper legs', ['leg press'], 4, 10, 90, 120],
        ['upper legs', ['dumbbell lunge', 'barbell lunge', 'lunge'], 3, 12, 60, 20],
        ['upper legs', ['lever leg extension', 'leg extension'], 3, 12, 60, 40],
        ['upper legs', ['lever lying leg curl', 'lying leg curl', 'leg curl'], 3, 12, 60, 35],
        ['shoulders', ['barbell seated overhead press', 'dumbbell seated shoulder press', 'dumbbell shoulder press', 'cable shoulder press'], 4, 8, 90, 30],
        ['shoulders', ['dumbbell lateral raise', 'cable lateral raise'], 3, 15, 60, 8],
        ['lower legs', ['barbell standing calf raise', 'barbell seated calf raise', 'calf raise'], 4, 15, 60, 50],
      ]),
    ];
  }

  seedHistory(fichas) {
    const DAY = 86400000;
    const now = Date.now();
    const weeks = [{ ago: 35, f: 0.82 }, { ago: 28, f: 0.87 }, { ago: 21, f: 0.92 }, { ago: 14, f: 0.96 }, { ago: 7, f: 1.0 }];
    const out = [];
    fichas.forEach((f, fi) => {
      weeks.forEach((w, wi) => {
        const jitter = 1 + (wi === 4 ? 0 : (Math.sin(fi * 3 + wi) * 0.015));
        let vol = 0;
        const exsLog = f.exs.map(x => {
          const base = x.last || 20;
          const load = Math.max(0, Math.round((base * w.f * jitter) / 2.5) * 2.5);
          vol += load * x.sets * x.reps;
          return { ex: x.ex, load, sets: x.sets, reps: x.reps };
        });
        out.push({ id: uid(), at: now - w.ago * DAY - fi * 2 * DAY, name: f.name, secs: 2700 + wi * 90 + fi * 120, done: f.exs.length, total: f.exs.length, vol, exsLog });
      });
    });
    return out.sort((a, b) => b.at - a.at);
  }

  save() {
    // Coalesces bursts of save() calls (e.g. one per keystroke) into a single
    // in-flight request at a time, so a slow earlier response can never land
    // after and overwrite a newer one. Always persists the latest state
    // eventually, never a stale intermediate one.
    if (this._saving) { this._saveQueued = true; return; }
    this._saving = true;
    this._doSave().finally(() => {
      this._saving = false;
      if (this._saveQueued) { this._saveQueued = false; this.save(); }
    });
  }

  async _doSave() {
    const s = this.state;
    if (!s.session) return;
    const payload = { fichas: s.fichas, history: s.history, customExs: s.customExs, profile: s.profile, settings: s.settings, wo: s.wo, rest: s.rest };
    let error;
    try {
      ({ error } = await supabase.from('user_data').upsert({ user_id: s.session.user.id, data: payload, updated_at: new Date().toISOString() }));
    } catch (e) {
      error = e;
    }
    if (error) {
      // Retry once the current save cycle finishes, so a transient failure
      // (dropped connection, aborted request) doesn't silently lose the write.
      this._saveQueued = true;
      clearTimeout(this.toastTimer);
      this.setState({ toast: 'Não foi possível salvar. Verifique sua conexão.' });
      this.toastTimer = setTimeout(() => this.setState({ toast: null }), 3500);
    }
  }
  updFichas(fn) { this.setState(s => ({ fichas: fn(s.fichas) }), () => this.save()); }

  custom(id) { return (this.state.customExs || []).find(c => c.id === id); }
  img(id) { const c = this.custom(id); if (c) return c.yt ? 'https://img.youtube.com/vi/' + c.yt + '/hqdefault.jpg' : ''; const e = this.map[id]; return e ? RAW + 'images/' + e.s + '.jpg' : ''; }
  gif(id) { const c = this.custom(id); if (c) return c.yt ? 'https://img.youtube.com/vi/' + c.yt + '/hqdefault.jpg' : ''; const e = this.map[id]; return e ? RAW + 'videos/' + e.s + '.gif' : ''; }
  exName(id) { const c = this.custom(id); if (c) return c.name; const e = this.map[id]; return e ? translateName(e.n) : '—'; }
  exSub(id) { const c = this.custom(id); if (c) return c.yt ? 'Personalizado · vídeo' : 'Personalizado'; const e = this.map[id]; if (!e) return ''; return (CATPT[e.c] || e.c) + ' · ' + (EQPT[e.e] || e.e); }
  ytId(url) { if (!url) return ''; const m = String(url).match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : (String(url).trim().match(/^[A-Za-z0-9_-]{11}$/) ? url.trim() : ''); }
  fmtSec(t) { const m = Math.floor(t / 60), s = t % 60; return m + ':' + String(s).padStart(2, '0'); }
  fmtRest(t) { return t >= 60 ? (t % 60 === 0 ? (t / 60) + 'min' : Math.floor(t / 60) + 'm' + (t % 60)) : t + 's'; }
  fichaMeta(f) {
    const cats = [...new Set(f.exs.map(x => { const e = this.map[x.ex]; return e ? (CATPT[e.c] || e.c) : ''; }).filter(Boolean))];
    return f.exs.length + ' exercícios · ' + cats.slice(0, 3).join(', ');
  }

  startTick() {
    clearInterval(this.tickInt);
    this.tickInt = setInterval(() => {
      const willEnd = !!(this.state.rest && Math.ceil((this.state.rest.end - Date.now()) / 1000) <= 0);
      this.setState(s => {
        let rest = s.rest;
        if (rest) {
          const left = Math.max(0, Math.ceil((rest.end - Date.now()) / 1000));
          rest = left <= 0 ? null : { ...rest, left };
        }
        return { now: Date.now(), rest };
      }, willEnd ? () => { this.vibrateEnd(); this.save(); } : undefined);
    }, 250);
  }

  vibrateEnd() {
    if (navigator.vibrate) { try { navigator.vibrate([40, 60, 40]); } catch (e) {} }
  }

  startRingLoop() {
    cancelAnimationFrame(this.rafId);
    const tick = () => {
      const r = this.state.rest;
      if (!r) { this.rafId = null; return; }
      const leftMs = Math.max(0, r.end - Date.now());
      const frac = r.total ? leftMs / (r.total * 1000) : 0;
      if (this.ringRef.current) this.ringRef.current.setAttribute('stroke-dashoffset', String(CIRC * (1 - frac)));
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }
  stopRingLoop() { cancelAnimationFrame(this.rafId); this.rafId = null; }

  startWorkout(f) {
    const loads = {};
    f.exs.forEach(x => { loads[x.k] = x.last || 0; });
    this.setState({ screen: 'workout', wo: { fichaId: f.id, started: Date.now(), setsDone: {}, loads }, rest: null }, () => this.save());
    this.startTick();
  }
  finishWorkout() {
    const s = this.state;
    const f = s.fichas.find(x => x.id === s.wo.fichaId);
    if (!f) return;
    const secs = Math.floor((Date.now() - s.wo.started) / 1000);
    const sd = s.wo.setsDone || {};
    const doneKeys = f.exs.filter(x => (sd[x.k] || 0) >= x.sets);
    const anySet = f.exs.some(x => (sd[x.k] || 0) > 0);
    if (!anySet && !window.confirm('Nenhuma série marcada. Concluir mesmo assim?')) return;
    let vol = 0;
    const rows = f.exs.map(x => {
      const load = Number(s.wo.loads[x.k]) || 0;
      const setsC = Math.min(sd[x.k] || 0, x.sets);
      const done = setsC >= x.sets;
      vol += load * setsC * x.reps;
      return { name: this.exName(x.ex), done, load, setsC, sets: x.sets, reps: x.reps };
    });
    const exsLog = f.exs.filter(x => (sd[x.k] || 0) > 0).map(x => ({ ex: x.ex, load: Number(s.wo.loads[x.k]) || 0, sets: Math.min(sd[x.k] || 0, x.sets), reps: x.reps }));
    const session = { id: uid(), at: Date.now(), name: f.name, secs, done: doneKeys.length, total: f.exs.length, vol, exsLog };
    clearInterval(this.tickInt);
    this.setState(st => ({
      screen: 'summary', rest: null,
      summary: { name: f.name, secs, done: doneKeys.length, total: f.exs.length, vol, rows },
      history: [session, ...st.history],
      fichas: st.fichas.map(fi => fi.id !== f.id ? fi : { ...fi, exs: fi.exs.map(x => ((st.wo.setsDone || {})[x.k] || 0) > 0 ? { ...x, last: Number(st.wo.loads[x.k]) || 0 } : x) }),
      wo: null,
    }), () => this.save());
  }

  renderVals() {
    const s = this.state;
    const layout = s.settings.fichasLayout ?? 'cartoes';
    const defaultRest = s.settings.descansoPadrao ?? 60;
    const gifsOn = s.settings.gifsAnimados ?? true;
    const ready = s.libStatus === 'ready';
    const v = {
      authStatus: s.authStatus,
      authMode: s.authMode,
      authName: s.authName,
      authEmail: s.authEmail,
      authPassword: s.authPassword,
      authError: s.authError,
      authBusy: s.authBusy,
      onAuthName: (e) => this.setState({ authName: e.target.value }),
      onAuthEmail: (e) => this.setState({ authEmail: e.target.value }),
      onAuthPassword: (e) => this.setState({ authPassword: e.target.value }),
      onToggleAuthMode: () => this.setState(st => ({ authMode: st.authMode === 'login' ? 'signup' : 'login', authError: null })),
      onAuthSubmit: (e) => { e.preventDefault(); this.submitAuth(); },
      onSignOut: () => this.signOut(),
      libLoading: s.libStatus === 'loading',
      libError: s.libStatus === 'error',
      onRetry: () => { this.setState({ libStatus: 'loading' }); this.loadLib(); },
      isHome: ready && s.screen === 'home',
      isEdit: ready && s.screen === 'edit',
      isPicker: ready && s.screen === 'picker',
      isCustom: ready && s.screen === 'custom',
      isProfile: ready && s.screen === 'profile',
      isSettings: ready && s.screen === 'settings',
      videoOpen: !!s.video,
      videoSrc: s.video ? 'https://www.youtube.com/embed/' + s.video + '?autoplay=1&rel=0' : '',
      onCloseVideo: () => this.setState({ video: null }),
      isWorkout: ready && s.screen === 'workout' && !!s.wo,
      isSummary: ready && s.screen === 'summary' && !!s.summary,
      restActive: !!s.rest && s.screen === 'workout',
      tabFichas: s.tab === 'fichas', tabHist: s.tab === 'hist', tabProg: s.tab === 'prog',
      homeTitle: s.tab === 'fichas' ? 'Minhas fichas' : s.tab === 'hist' ? 'Histórico' : 'Progresso',
      tabFichasBg: s.tab === 'fichas' ? AMBER_GRAD : 'transparent',
      tabHistBg: s.tab === 'hist' ? AMBER_GRAD : 'transparent',
      tabProgBg: s.tab === 'prog' ? AMBER_GRAD : 'transparent',
      tabFichasShadow: s.tab === 'fichas' ? 'inset 0 1px 0 rgba(255,255,255,.5),0 6px 16px rgba(0,0,0,.35)' : 'none',
      tabHistShadow: s.tab === 'hist' ? 'inset 0 1px 0 rgba(255,255,255,.5),0 6px 16px rgba(0,0,0,.35)' : 'none',
      tabProgShadow: s.tab === 'prog' ? 'inset 0 1px 0 rgba(255,255,255,.5),0 6px 16px rgba(0,0,0,.35)' : 'none',
      tabFichasFg: s.tab === 'fichas' ? '#1A1408' : 'rgba(245,241,230,.6)',
      tabHistFg: s.tab === 'hist' ? '#1A1408' : 'rgba(245,241,230,.6)',
      tabProgFg: s.tab === 'prog' ? '#1A1408' : 'rgba(245,241,230,.6)',
      onTabFichas: () => this.setState({ tab: 'fichas', screen: 'home' }),
      onTabHist: () => this.setState({ tab: 'hist', screen: 'home' }),
      onTabProg: () => this.setState({ tab: 'prog', screen: 'home' }),
      showTabBar: ready && ['home', 'edit', 'picker', 'custom', 'profile', 'settings'].includes(s.screen) && !s.video,
      layoutCards: layout === 'cartoes', layoutList: layout === 'lista', layoutCovers: layout === 'capas',
      noFichas: ready && s.fichas.length === 0,
      onNewFicha: () => {
        const f = { id: uid(), name: '', exs: [] };
        this.setState(st => ({ fichas: [...st.fichas, f], screen: 'edit', editId: f.id }), () => this.save());
      },
      onBackHome: () => {
        this.updFichas(fs => fs.filter(f => f.exs.length > 0 || f.name.trim() !== ''));
        this.setState({ screen: 'home', summary: null });
      },
      fichaCards: [], histRows: [], noHist: false, progRows: [], noProg: false, progFichaChips: [],
      editRows: [], editName: '', editMeta: '',
      catChips: [], pickerRows: [], pickerQuery: s.pq,
      pickerTitle: s.pickerMode === 'swap' ? 'Trocar exercício' : 'Biblioteca',
      pickerCount: this.lib.length ? this.lib.length.toLocaleString('pt-BR') + ' exercícios' : '',
      pickerMore: false, pickerMoreLabel: '', pickerEmpty: false,
      onPickerQuery: (e) => this.setState({ pq: e.target.value }),
      onPickerBack: () => this.setState({ screen: s.returnTo === 'workout' ? 'workout' : 'edit' }),
      onOpenCustom: () => this.setState({ screen: 'custom', cName: '', cUrl: '' }),
      onCustomBack: () => this.setState({ screen: 'picker' }),
      onCustomName: (e) => this.setState({ cName: e.target.value }),
      onCustomUrl: (e) => this.setState({ cUrl: e.target.value }),
      cName: s.cName, cUrl: s.cUrl,
      cPreviewId: this.ytId(s.cUrl),
      cPreviewEl: null, cCanSave: s.cName.trim().length > 0,
      cSaveDisabled: s.cName.trim().length === 0,
      cSaveBg: s.cName.trim().length ? 'rgba(245,241,230,.96)' : 'rgba(245,241,230,.4)',
      cSaveCursor: s.cName.trim().length ? 'pointer' : 'not-allowed',
      cSaveOpacity: s.cName.trim().length ? 1 : 0.5,
      onCustomSave: () => {
        const name = s.cName.trim();
        if (!name) return;
        const yt = this.ytId(s.cUrl);
        const cid = 'c_' + uid();
        const custom = { id: cid, name, yt };
        const targetFichaId = s.pickerMode === 'swap' ? (s.wo ? s.wo.fichaId : s.editId) : s.editId;
        this.setState(st => {
          let fichas = st.fichas;
          if (st.pickerMode === 'swap' && st.swapKey) {
            fichas = fichas.map(f => f.id !== targetFichaId ? f : { ...f, exs: f.exs.map(x => x.k !== st.swapKey ? x : { ...x, ex: cid }) });
          } else {
            fichas = fichas.map(f => f.id !== targetFichaId ? f : { ...f, exs: [...f.exs, { k: uid(), ex: cid, sets: 3, reps: 12, rest: defaultRest, last: 0 }] });
          }
          return { customExs: [...(st.customExs || []), custom], fichas, screen: st.returnTo === 'workout' ? 'workout' : 'edit' };
        }, () => this.save());
      },
      woRows: [], woName: '', woElapsed: '', woProgressText: '', woProgressPct: '0%',
      sumRows: [], sumFicha: '', sumTime: '', sumDone: '', sumVol: '',
      restDash: 0, restNext: '',
      onRestPlus: () => this.setState(st => st.rest ? { rest: { ...st.rest, end: st.rest.end + 15000, total: st.rest.total + 15 } } : null, () => this.save()),
      onRestSkip: () => this.setState({ rest: null }, () => this.save()),
      onAbandon: () => { if (window.confirm('Abandonar o treino? O progresso será perdido.')) { clearInterval(this.tickInt); this.setState({ screen: 'home', wo: null, rest: null }, () => this.save()); } },
      onFinish: () => this.finishWorkout(),
      toast: s.toast,
      resumePrompt: s.resumePrompt,
      onResumeContinue: () => this.setState({ resumePrompt: false, screen: 'workout' }, () => this.startTick()),
      onResumeDiscard: () => this.setState({ resumePrompt: false, wo: null, rest: null }, () => this.save()),
      onAddEx: () => this.setState({ screen: 'picker', pickerMode: 'add', returnTo: 'edit', pq: '', pcat: 'todos' }),
      onOpenProfile: () => this.setState({ screen: 'profile' }),
      onProfileBack: () => this.setState({ screen: 'home' }),
      onOpenSettings: () => this.setState({ screen: 'settings' }),
      onSettingsBack: () => this.setState({ screen: 'profile' }),
      settingsLayout: s.settings.fichasLayout,
      settingsGifs: s.settings.gifsAnimados,
      settingsRestLabel: this.fmtRest(s.settings.descansoPadrao),
      onSetLayout: (k) => this.setState(st => ({ settings: { ...st.settings, fichasLayout: k } }), () => this.save()),
      onToggleGifs: () => this.setState(st => ({ settings: { ...st.settings, gifsAnimados: !st.settings.gifsAnimados } }), () => this.save()),
      onSetDefaultRestDown: () => this.setState(st => ({ settings: { ...st.settings, descansoPadrao: Math.max(15, st.settings.descansoPadrao - 15) } }), () => this.save()),
      onSetDefaultRestUp: () => this.setState(st => ({ settings: { ...st.settings, descansoPadrao: Math.min(300, st.settings.descansoPadrao + 15) } }), () => this.save()),
      layoutChips: [['cartoes', 'Cartões'], ['lista', 'Lista'], ['capas', 'Capas']].map(([k, label]) => {
        const on = s.settings.fichasLayout === k;
        return {
          k, label,
          bg: on ? AMBER_GRAD : 'rgba(255,255,255,.07)', fg: on ? '#1A1408' : 'rgba(245,241,230,.75)', border: on ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.15)',
          onPick: () => this.setState(st => ({ settings: { ...st.settings, fichasLayout: k } }), () => this.save()),
        };
      }),
      onProfileName: (e) => this.setState(st => ({ profile: { ...st.profile, name: e.target.value } }), () => this.save()),
      onRemovePhoto: () => this.setState(st => ({ profile: { ...st.profile, photo: null } }), () => this.save()),
      onPhotoPick: (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => this.setState(st => ({ profile: { ...st.profile, photo: reader.result } }), () => this.save());
        reader.readAsDataURL(file);
      },
      profileName: (s.profile && s.profile.name) || '',
      headerAvatar: null, profileAvatarBig: null, hasPhoto: !!(s.profile && s.profile.photo),
      profTreinos: '0', profFichas: '0', profHoras: '0',
      onEditName: () => {}, onDeleteFicha: () => {},
    };
    if (!ready) return v;

    if (s.resumePrompt && s.wo) {
      const rf = s.fichas.find(f => f.id === s.wo.fichaId);
      v.resumeFichaName = rf ? rf.name : 'Treino';
      v.resumeElapsed = this.fmtSec(Math.max(0, Math.floor((Date.now() - s.wo.started) / 1000)));
    }

    // ---- perfil ----
    const prof = s.profile || { name: 'Atleta', photo: null };
    const initial = (prof.name || 'A').trim().charAt(0).toUpperCase() || 'A';
    const avatarImg = () => React.createElement('img', { src: prof.photo, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } });
    const avatarInitial = (fontSize) => React.createElement('div', { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize, fontWeight: 800, color: '#F5F1E6' } }, initial);
    v.headerAvatar = prof.photo ? avatarImg() : avatarInitial(19);
    v.profileAvatarBig = prof.photo ? avatarImg() : avatarInitial(50);
    v.profTreinos = String(s.history.length);
    v.profFichas = String(s.fichas.length);
    v.profHoras = String(Math.round(s.history.reduce((a, h) => a + (h.secs || 0), 0) / 3600));

    // ---- home: fichas ----
    v.fichaCards = s.fichas.map(f => {
      const start = () => { if (f.exs.length) this.startWorkout(f); else this.setState({ screen: 'edit', editId: f.id }); };
      const edit = () => this.setState({ screen: 'edit', editId: f.id });
      return {
        id: f.id,
        name: f.name || 'Sem nome',
        meta: this.fichaMeta(f),
        metaShort: f.exs.length + ' exercícios',
        letter: (f.name || '?').replace('Treino ', '').charAt(0).toUpperCase(),
        thumbStrip: f.exs.slice(0, 4).map(x => React.createElement('div', { key: x.k, style: { width: 58, height: 58, borderRadius: 16, background: 'linear-gradient(90deg, rgba(255,255,255,.05) 25%, rgba(255,255,255,.14) 37%, rgba(255,255,255,.05) 63%)', backgroundSize: '400% 100%', animation: 'skeleton 1.4s ease infinite', overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(255,255,255,.3)' } }, React.createElement('img', { src: this.img(x.ex), alt: '', loading: 'lazy', style: { width: '100%', height: '100%', objectFit: 'cover' } }))).concat(f.exs.length > 4 ? [React.createElement('div', { key: 'more', style: { width: 58, height: 58, borderRadius: 16, background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.16)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'rgba(245,241,230,.65)', flexShrink: 0 } }, '+' + (f.exs.length - 4))] : []),
        coverEl: f.exs.length ? React.createElement('img', { src: this.img(f.exs[0].ex), alt: '', style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' } }) : null,
        onStart: start,
        onEdit: edit,
        onEditStop: (e) => { e.stopPropagation(); edit(); },
      };
    });

    // ---- history ----
    v.histRows = s.history.map(h => ({
      id: h.id, name: h.name,
      date: new Date(h.at).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      time: this.fmtSec(h.secs),
      stats: h.done + '/' + h.total + ' · ' + (h.vol >= 1000 ? (h.vol / 1000).toFixed(1).replace('.', ',') + ' t' : h.vol + ' kg'),
    }));
    v.noHist = s.history.length === 0;

    // ---- progresso / métricas ----
    if (s.tab === 'prog') {
      v.progFichaChips = [{ k: 'all', label: 'Todas' }, ...s.fichas.map(f => ({ k: f.id, label: f.name || 'Sem nome' }))].map(c => {
        const on = s.progFicha === c.k;
        return { k: c.k, label: c.label, bg: on ? AMBER_GRAD : 'rgba(255,255,255,.07)', fg: on ? '#1A1408' : 'rgba(245,241,230,.75)', border: on ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.15)', onPick: () => this.setState({ progFicha: c.k }) };
      });
      const selFicha = s.fichas.find(f => f.id === s.progFicha);
      const allowedExs = selFicha ? new Set(selFicha.exs.map(x => x.ex)) : null;
      const byEx = {};
      [...s.history].sort((a, b) => a.at - b.at).forEach(h => {
        (h.exsLog || []).forEach(l => {
          if (!(l.load > 0)) return;
          if (allowedExs && !allowedExs.has(l.ex)) return;
          (byEx[l.ex] = byEx[l.ex] || []).push({ at: h.at, load: l.load });
        });
      });
      const shortDate = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
      const rows = Object.keys(byEx).map(ex => {
        const pts = byEx[ex];
        const first = pts[0].load, last = pts[pts.length - 1].load;
        const delta = last - first;
        const pct = first ? Math.round(delta / first * 100) : 0;
        const max = Math.max(...pts.map(p => p.load)), min = Math.min(...pts.map(p => p.load));
        const W = 240, H = 60, pad = 6, span = Math.max(1, max - min);
        const step = pts.length > 1 ? (W - pad * 2) / (pts.length - 1) : 0;
        const coords = pts.map((p, i) => [pad + i * step, H - pad - (p.load - min) / span * (H - pad * 2)]);
        const line = coords.map((c, i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
        const area = line + ' L' + coords[coords.length - 1][0].toFixed(1) + ' ' + (H - pad) + ' L' + coords[0][0].toFixed(1) + ' ' + (H - pad) + ' Z';
        const chart = React.createElement('svg', { width: '100%', height: H, viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', style: { display: 'block', overflow: 'visible' } },
          React.createElement('line', { x1: pad, y1: H - pad, x2: W - pad, y2: H - pad, stroke: 'rgba(255,255,255,.12)', strokeWidth: 1, strokeDasharray: '2 5', strokeLinecap: 'round' }),
          React.createElement('path', { d: area, fill: 'rgba(255,255,255,.09)' }),
          React.createElement('path', { d: line, fill: 'none', stroke: '#F5F1E6', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { filter: 'drop-shadow(0 0 5px rgba(255,255,255,.4))' } }),
          ...coords.map((c, i) => React.createElement('circle', { key: i, cx: c[0], cy: c[1], r: i === coords.length - 1 ? 3.6 : 2.2, fill: i === coords.length - 1 ? '#FFFFFF' : 'rgba(245,241,230,.55)' })));
        const badgeLabel = pct ? (pct >= 0 ? '+' : '') + pct + '%' : (delta >= 0 ? '+' : '') + delta + ' kg';
        return {
          ex, name: this.exName(ex), sub: this.exSub(ex),
          thumbEl: React.createElement('img', { src: this.img(ex), alt: '', loading: 'lazy', style: { width: '100%', height: '100%', objectFit: 'cover' } }),
          current: last + ' kg',
          firstLabel: first + ' kg',
          periodLabel: pts.length > 1 ? shortDate(pts[0].at) + ' – ' + shortDate(pts[pts.length - 1].at) : shortDate(pts[0].at),
          badgeLabel,
          deltaColor: delta > 0 ? '#8FE3A2' : (delta < 0 ? '#F0A0A0' : 'rgba(245,241,230,.6)'),
          deltaBg: delta > 0 ? 'rgba(143,227,162,.14)' : (delta < 0 ? 'rgba(240,160,160,.14)' : 'rgba(245,241,230,.08)'),
          arrow: delta > 0 ? '▲' : (delta < 0 ? '▼' : '='),
          sessions: pts.length + (pts.length > 1 ? ' registros' : ' registro'),
          chart, _last: last, _delta: delta,
        };
      }).sort((a, b) => b._delta - a._delta);
      v.progRows = rows;
      v.noProg = rows.length === 0;
      v.progCount = rows.length;
      v.progUpCount = rows.filter(r => r._delta > 0).length;
      v.progBest = rows.find(r => r._delta > 0) || null;
    }

    // ---- edit ----
    const ef = s.fichas.find(f => f.id === s.editId);
    if (ef && s.screen === 'edit') {
      v.editName = ef.name;
      v.editMeta = ef.exs.length + ' exercícios · toque em + para adicionar da biblioteca';
      v.onEditName = (e) => this.updFichas(fs => fs.map(f => f.id === ef.id ? { ...f, name: e.target.value } : f));
      v.onDeleteFicha = () => {
        if (window.confirm('Excluir a ficha "' + (ef.name || 'Sem nome') + '"?')) {
          this.updFichas(fs => fs.filter(f => f.id !== ef.id));
          this.setState({ screen: 'home' });
        }
      };
      const step = (k, field, d, min, max) => this.updFichas(fs => fs.map(f => f.id !== ef.id ? f : { ...f, exs: f.exs.map(x => x.k !== k ? x : { ...x, [field]: Math.min(max, Math.max(min, x[field] + d)) }) }));
      const setDirect = (k, field, val, min, max) => this.updFichas(fs => fs.map(f => f.id !== ef.id ? f : { ...f, exs: f.exs.map(x => x.k !== k ? x : { ...x, [field]: Math.min(max, Math.max(min, val)) }) }));
      v.editRows = ef.exs.map(x => ({
        k: x.k,
        thumbEl: React.createElement('img', { src: this.img(x.ex), alt: '', loading: 'lazy', style: { width: '100%', height: '100%', objectFit: 'cover' } }),
        name: this.exName(x.ex),
        sub: this.exSub(x.ex),
        sets: x.sets, reps: x.reps, restLabel: this.fmtRest(x.rest),
        onSetsDown: () => step(x.k, 'sets', -1, 1, 10), onSetsUp: () => step(x.k, 'sets', 1, 1, 10),
        onSetsInput: (e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) setDirect(x.k, 'sets', n, 1, 10); },
        onRepsDown: () => step(x.k, 'reps', -1, 1, 50), onRepsUp: () => step(x.k, 'reps', 1, 1, 50),
        onRepsInput: (e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) setDirect(x.k, 'reps', n, 1, 50); },
        onRestDown: () => step(x.k, 'rest', -15, 15, 300), onRestUp: () => step(x.k, 'rest', 15, 15, 300),
        onRemove: () => { if (window.confirm('Remover "' + this.exName(x.ex) + '" da ficha?')) this.updFichas(fs => fs.map(f => f.id !== ef.id ? f : { ...f, exs: f.exs.filter(y => y.k !== x.k) })); },
      }));
    }

    // ---- picker ----
    const cats = ['todos', 'legs', 'chest', 'back', 'shoulders', 'upper arms', 'lower arms', 'waist', 'cardio'];
    v.catChips = cats.map(c => {
      const on = s.pcat === c;
      return {
        k: c,
        label: c === 'todos' ? 'Todos' : c === 'legs' ? 'Pernas' : (CATPT[c] || c),
        bg: on ? AMBER_GRAD : 'rgba(255,255,255,.07)',
        fg: on ? '#1A1408' : 'rgba(245,241,230,.75)',
        border: on ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.15)',
        onPick: () => this.setState({ pcat: c, ptarget: 'todos' }),
      };
    });
    const LEG_TARGETS = [['todos', 'Todas'], ['quad', 'Quadríceps'], ['hamstring', 'Posterior'], ['glute', 'Glúteos'], ['calv', 'Panturrilha'], ['adductor', 'Adutores'], ['abductor', 'Abdutores']];
    v.showLegTargets = s.pcat === 'legs';
    v.legTargetChips = LEG_TARGETS.map(([k, label]) => {
      const on = s.ptarget === k;
      return { k, label, bg: on ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.05)', fg: on ? '#F5F1E6' : 'rgba(245,241,230,.55)', border: on ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.12)', onPick: () => this.setState({ ptarget: k }) };
    });
    if (s.screen === 'picker') {
      const q = s.pq.trim().toLowerCase();
      let list = this.lib;
      if (s.pcat === 'legs') {
        list = list.filter(e => e.c === 'upper legs' || e.c === 'lower legs');
        if (s.ptarget !== 'todos') list = list.filter(e => (e.t || '').toLowerCase().includes(s.ptarget));
      } else if (s.pcat !== 'todos') list = list.filter(e => e.c === s.pcat);
      if (q) list = list.filter(e => e.n.toLowerCase().includes(q) || (e.t || '').toLowerCase().includes(q) || translateName(e.n).toLowerCase().includes(q));
      const total = list.length;
      const shown = list.slice(0, 60);
      v.pickerEmpty = total === 0;
      v.pickerMore = total > 60;
      v.pickerMoreLabel = 'Mostrando 60 de ' + total.toLocaleString('pt-BR') + ' — refine a busca';
      v.pickerRows = shown.map(e => ({
        k: e.i, thumbEl: React.createElement('img', { src: RAW + 'images/' + e.s + '.jpg', alt: '', loading: 'lazy', style: { width: '100%', height: '100%', objectFit: 'cover' } }), name: translateName(e.n), sub: this.exSub(e.i),
        onPick: () => {
          if (s.pickerMode === 'swap' && s.swapKey) {
            this.updFichas(fs => fs.map(f => f.id !== (s.wo ? s.wo.fichaId : s.editId) ? f : { ...f, exs: f.exs.map(x => x.k !== s.swapKey ? x : { ...x, ex: e.i }) }));
            this.setState({ screen: s.returnTo === 'workout' ? 'workout' : 'edit' });
          } else {
            this.updFichas(fs => fs.map(f => f.id !== s.editId ? f : { ...f, exs: [...f.exs, { k: uid(), ex: e.i, sets: 3, reps: 12, rest: defaultRest, last: 0 }] }));
            this.setState({ screen: 'edit' });
          }
        },
      }));
    }

    // ---- custom exercise form ----
    if (s.screen === 'custom') {
      const yt = this.ytId(s.cUrl);
      v.cPreviewEl = yt
        ? React.createElement('div', { style: { position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(255,255,255,.18)', background: '#000' } },
            React.createElement('img', { src: 'https://img.youtube.com/vi/' + yt + '/hqdefault.jpg', alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } }),
            React.createElement('div', { style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
              React.createElement('div', { style: { width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px rgba(0,0,0,.5)' } },
                React.createElement('div', { style: { width: 0, height: 0, borderTop: '9px solid transparent', borderBottom: '9px solid transparent', borderLeft: '15px solid #1A1408', marginLeft: 3 } }))))
        : null;
    }

    // ---- workout ----
    if (s.wo) {
      const f = s.fichas.find(x => x.id === s.wo.fichaId);
      if (f) {
        const sd = s.wo.setsDone || {};
        const totalSets = f.exs.reduce((a, x) => a + x.sets, 0);
        const doneSets = f.exs.reduce((a, x) => a + Math.min(sd[x.k] || 0, x.sets), 0);
        v.woName = f.name;
        v.woElapsed = this.fmtSec(Math.floor((s.now - s.wo.started) / 1000));
        v.woProgressText = doneSets + '/' + totalSets + ' séries';
        v.woProgressPct = (totalSets ? Math.round(doneSets / totalSets * 100) : 0) + '%';
        v.woRows = f.exs.map(x => {
          const c = Math.min(sd[x.k] || 0, x.sets);
          const done = c >= x.sets;
          const pills = Array.from({ length: x.sets }, (_, i) => {
            const filled = i < c;
            const setSetsDone = (n) => this.setState(st => {
              const cur = Math.min((st.wo.setsDone || {})[x.k] || 0, x.sets);
              const increased = n > cur;
              const nextMap = { ...(st.wo.setsDone || {}), [x.k]: n };
              let rest = st.rest;
              if (increased) {
                const allSetsDone = f.exs.every(y => (nextMap[y.k] || 0) >= y.sets);
                if (!allSetsDone) {
                  const moreHere = n < x.sets;
                  const nextEx = f.exs.find(y => (nextMap[y.k] || 0) < y.sets);
                  const label = moreHere ? ('Série ' + (n + 1) + ' de ' + x.sets + ' · ' + this.exName(x.ex)) : (nextEx ? 'Próximo: ' + this.exName(nextEx.ex) : '');
                  rest = { end: Date.now() + x.rest * 1000, total: x.rest, left: x.rest, next: label };
                }
              }
              return { wo: { ...st.wo, setsDone: nextMap }, rest };
            }, () => this.save());
            const isNext = i === c;
            return {
              key: x.k + '-' + i, n: i + 1, filled,
              content: filled ? '✓' : String(i + 1),
              bg: filled ? AMBER_GRAD : (isNext ? 'rgba(255,255,255,.12)' : 'rgba(10,8,16,.35)'),
              fg: filled ? '#1A1408' : (isNext ? '#F5F1E6' : 'rgba(245,241,230,.5)'),
              border: filled ? 'rgba(255,255,255,.45)' : (isNext ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.1)'),
              shadow: filled ? 'inset 0 1px 0 rgba(255,255,255,.5),0 5px 14px rgba(0,0,0,.4)' : 'inset 0 1px 0 rgba(255,255,255,.12)',
              onTap: () => setSetsDone(filled ? i : i + 1),
            };
          });
          const cust = this.custom(x.ex);
          const ytVid = cust && cust.yt ? cust.yt : null;
          const mediaImg = React.createElement('img', { src: gifsOn ? this.gif(x.ex) : this.img(x.ex), alt: '', loading: 'lazy', style: { width: '100%', height: '100%', objectFit: 'cover' } });
          const mediaEl = ytVid
            ? React.createElement('div', { onClick: () => this.setState({ video: ytVid }), style: { position: 'relative', width: '100%', height: '100%', cursor: 'pointer' } },
                mediaImg,
                React.createElement('div', { style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.18)' } },
                  React.createElement('div', { style: { width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
                    React.createElement('div', { style: { width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '8px solid #1A1408', marginLeft: 2 } }))))
            : mediaImg;
          return {
            k: x.k,
            mediaEl,
            name: this.exName(x.ex),
            setsReps: x.sets + ' séries × ' + x.reps + ' reps · descanso ' + this.fmtRest(x.rest),
            lastLabel: x.last ? 'Última vez: ' + x.last + ' kg' : 'Primeira vez neste exercício',
            load: String(s.wo.loads[x.k] ?? 0),
            border: done ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.14)',
            opacity: done ? 0.78 : 1,
            setPills: pills,
            setsCountLabel: c + '/' + x.sets,
            setsCountColor: done ? '#F5F1E6' : 'rgba(245,241,230,.55)',
            onLoad: (e) => {
              const val = e.target.value.replace(',', '.');
              this.setState(st => ({ wo: { ...st.wo, loads: { ...st.wo.loads, [x.k]: val } } }), () => this.save());
            },
            onLoadDown: () => this.setState(st => ({ wo: { ...st.wo, loads: { ...st.wo.loads, [x.k]: Math.max(0, (Number(st.wo.loads[x.k]) || 0) - 2.5) } } }), () => this.save()),
            onLoadUp: () => this.setState(st => ({ wo: { ...st.wo, loads: { ...st.wo.loads, [x.k]: (Number(st.wo.loads[x.k]) || 0) + 2.5 } } }), () => this.save()),
            onSwap: () => this.setState({ screen: 'picker', pickerMode: 'swap', swapKey: x.k, returnTo: 'workout', pq: '', pcat: 'todos' }),
          };
        });
      }
    }

    // ---- rest ----
    v.restRingColor = '#F5F1E6'; v.restRingGlow = 'rgba(255,255,255,.5)'; v.restHaloAnim = 'restHalo 2.4s ease-in-out infinite';
    v.restNumEl = null;
    if (s.rest) {
      const left = s.rest.left;
      const urgent = left <= 5;
      v.restDash = CIRC * (1 - left / s.rest.total);
      v.restNext = s.rest.next || '';
      v.restRingColor = urgent ? '#FFFFFF' : '#F5F1E6';
      v.restRingGlow = urgent ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.5)';
      v.restHaloAnim = urgent ? 'restHaloFast 1s ease-in-out infinite' : 'restHalo 2.4s ease-in-out infinite';
      v.restNumEl = React.createElement('div', {
        key: left,
        style: { fontSize: 52, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px', color: urgent ? '#FFFFFF' : '#F5F1E6', textShadow: urgent ? '0 0 22px rgba(255,255,255,.6)' : 'none', animation: 'numPop .5s cubic-bezier(.22,1,.36,1)' },
      }, String(left));
    }

    // ---- summary ----
    if (s.summary) {
      const su = s.summary;
      v.sumFicha = su.name;
      v.sumTime = this.fmtSec(su.secs);
      v.sumDone = su.done + '/' + su.total;
      v.sumVol = su.vol >= 1000 ? (su.vol / 1000).toFixed(1).replace('.', ',') + ' t' : su.vol + ' kg';
      v.sumRows = su.rows.map((r, i) => ({
        k: i, name: r.name,
        ck: r.setsC > 0 ? AMBER : 'rgba(245,241,230,.18)',
        detail: r.setsC > 0 ? (r.setsC + '×' + (r.load ? ' ' + r.load + ' kg' : (r.reps + ' reps'))) : 'pulado',
      }));
    }
    return v;
  }

  renderAuth(v) {
    const isSignup = v.authMode === 'signup';
    return (
      <div data-screen-label="Entrar" style={css(`position:relative;z-index:1;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px`)}>
        <form onSubmit={v.onAuthSubmit} style={css(`width:100%;max-width:340px;display:flex;flex-direction:column;gap:14px;padding:32px 28px;border-radius:30px;background:rgba(255,255,255,.08);backdrop-filter:blur(24px) saturate(180%);border:1px solid rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 18px 44px rgba(0,0,0,.4)`)}>
          <img src={logo} alt="Bronzetes" style={css(`width:72px;height:72px;object-fit:contain;margin:0 auto 4px`)} />
          <div style={css(`font-size:24px;font-weight:800;color:#F5F1E6;letter-spacing:-0.5px;text-align:center;margin-top:-8px`)}>Bronzetes</div>
          <div style={css(`font-size:13.5px;color:rgba(245,241,230,.55);text-align:center;margin-bottom:6px`)}>{isSignup ? 'Crie sua conta para começar' : 'Entre para acessar suas fichas'}</div>

          {isSignup && (
            <>
              <div style={css(`font-size:11px;font-weight:700;letter-spacing:0.8px;color:rgba(245,241,230,.45);text-transform:uppercase`)}>Nome</div>
              <input type="text" autoComplete="name" value={v.authName} onChange={v.onAuthName} placeholder="Seu nome" style={css(`width:100%;box-sizing:border-box;background:rgba(255,255,255,.08);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.16);border-radius:16px;font-size:15px;font-weight:600;color:#F5F1E6;padding:13px 15px;box-shadow:inset 0 1px 0 rgba(255,255,255,.14)`)} />
            </>
          )}

          <div style={css(`font-size:11px;font-weight:700;letter-spacing:0.8px;color:rgba(245,241,230,.45);text-transform:uppercase`)}>E-mail</div>
          <input type="email" autoComplete="email" value={v.authEmail} onChange={v.onAuthEmail} placeholder="voce@email.com" style={css(`width:100%;box-sizing:border-box;background:rgba(255,255,255,.08);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.16);border-radius:16px;font-size:15px;font-weight:600;color:#F5F1E6;padding:13px 15px;box-shadow:inset 0 1px 0 rgba(255,255,255,.14)`)} />

          <div style={css(`font-size:11px;font-weight:700;letter-spacing:0.8px;color:rgba(245,241,230,.45);text-transform:uppercase`)}>Senha</div>
          <input type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} value={v.authPassword} onChange={v.onAuthPassword} placeholder="••••••••" style={css(`width:100%;box-sizing:border-box;background:rgba(255,255,255,.08);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.16);border-radius:16px;font-size:15px;font-weight:600;color:#F5F1E6;padding:13px 15px;box-shadow:inset 0 1px 0 rgba(255,255,255,.14)`)} />

          {v.authError && (
            <div style={css(`font-size:12.5px;color:#F0A0A0;text-align:center;line-height:1.4`)}>{v.authError}</div>
          )}

          <Pressable as="button" activeStyle={css(`transform:scale(0.97)`)} style={css(`width:100%;height:52px;border-radius:26px;background:rgba(245,241,230,.96);border:1px solid rgba(255,255,255,.4);cursor:${v.authBusy ? 'default' : 'pointer'};opacity:${v.authBusy ? 0.7 : 1};font-family:'Outfit',sans-serif;font-size:15px;font-weight:800;color:#1A1408;margin-top:6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 12px 30px rgba(0,0,0,.4);transition:transform .15s ease`)}>{v.authBusy ? 'Aguarde…' : (isSignup ? 'Criar conta' : 'Entrar')}</Pressable>

          <Pressable as="button" type="button" onClick={v.onToggleAuthMode} activeStyle={css(`transform:scale(0.97)`)} style={css(`width:100%;height:40px;border-radius:20px;background:transparent;border:none;cursor:pointer;font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;color:rgba(245,241,230,.6);transition:transform .15s ease`)}>{isSignup ? 'Já tem conta? Entrar' : 'Não tem conta? Criar agora'}</Pressable>
        </form>
      </div>
    );
  }

  renderLoading() {
    return (
      <div data-screen-label="Carregando" style={css(`position:relative;z-index:1;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px`)}>
        <div style={css(`display:flex;flex-direction:column;align-items:center;gap:18px;padding:36px 40px;border-radius:30px;background:rgba(255,255,255,.08);backdrop-filter:blur(24px) saturate(180%);border:1px solid rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 18px 44px rgba(0,0,0,.4)`)}>
          <img src={logo} alt="Bronzetes" style={css(`width:56px;height:56px;object-fit:contain`)} />
          <div style={css(`font-size:26px;font-weight:800;color:#F5F1E6;letter-spacing:-0.5px;margin-top:-10px`)}>Bronzetes</div>
          <div style={css(`width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.14);border-top-color:#F5F1E6;animation:spin .8s linear infinite`)}></div>
          <div style={css(`font-size:13.5px;color:rgba(245,241,230,.6);text-align:center`)}>Carregando biblioteca de exercícios…<br />1.324 movimentos com GIFs</div>
        </div>
      </div>
    );
  }

  renderError(v) {
    return (
      <div data-screen-label="Erro" style={css(`position:relative;z-index:1;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:32px;text-align:center`)}>
        <div style={css(`font-size:15px;color:rgba(245,241,230,.75)`)}>Não foi possível carregar a biblioteca de exercícios.</div>
        <button onClick={v.onRetry} style={css(`background:rgba(245,241,230,.95);border:1px solid rgba(255,255,255,.32);box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 10px 28px rgba(0,0,0,.35);color:#1A1408;border-radius:22px;padding:12px 24px;font-family:'Outfit',sans-serif;font-size:14px;font-weight:700;cursor:pointer`)}>Tentar novamente</button>
      </div>
    );
  }

  renderHome(v) {
    return (
      <div data-screen-label="Minhas fichas" style={css(`position:relative;z-index:1;flex:1;display:flex;flex-direction:column;overflow:hidden`)}>
        <div style={css(`padding:calc(24px + env(safe-area-inset-top)) 22px 12px;display:flex;align-items:flex-end;justify-content:space-between`)}>
          <div style={css(`display:flex;align-items:center;gap:10px`)}>
            <img src={logo} alt="Bronzetes" style={css(`width:34px;height:34px;object-fit:contain;flex-shrink:0`)} />
            <div style={css(`font-size:28px;font-weight:800;letter-spacing:-0.6px;text-shadow:0 2px 14px rgba(0,0,0,.35)`)}>{v.homeTitle}</div>
          </div>
          <div style={css(`display:flex;align-items:center;gap:10px`)}>
            {v.tabFichas && (
              <Pressable onClick={v.onNewFicha} activeStyle={css(`transform:scale(0.9)`)} style={css(`width:46px;height:46px;border-radius:50%;background:rgba(245,241,230,.95);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.4);cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 10px 26px rgba(0,0,0,.4);transition:transform .15s ease`)}>
                <svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 2v14M2 9h14" stroke="#1A1408" strokeWidth="2.6" strokeLinecap="round"></path></svg>
              </Pressable>
            )}
            <Pressable onClick={v.onOpenProfile} activeStyle={css(`transform:scale(0.9)`)} style={css(`width:46px;height:46px;border-radius:50%;overflow:hidden;background:rgba(255,255,255,.1);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 8px 20px rgba(0,0,0,.35);transition:transform .15s ease;padding:0`)}>
              {v.headerAvatar}
            </Pressable>
          </div>
        </div>

        {v.tabFichas && (
          <div style={css(`flex:1;overflow:auto;padding:8px 22px 150px`)}>
            {v.layoutCards && v.fichaCards.map(f => (
              <div key={f.id} style={css(`position:relative;overflow:hidden;background:rgba(255,255,255,.075);backdrop-filter:blur(22px) saturate(180%);border:1px solid rgba(255,255,255,.15);border-radius:26px;padding:16px;margin-bottom:16px;box-shadow:inset 0 1px 0 rgba(255,255,255,.2),0 14px 34px rgba(0,0,0,.3)`)}>
                <div style={css(`position:absolute;width:38%;height:26%;top:0;left:0;border-radius:50%;background:rgba(255,255,255,.6);filter:blur(22px);opacity:.14;mix-blend-mode:screen;animation:shine 9s ease-in-out infinite;pointer-events:none`)}></div>
                <div style={css(`display:flex;align-items:flex-start;justify-content:space-between;gap:10px`)}>
                  <div style={css(`min-width:0`)}>
                    <div style={css(`font-size:18px;font-weight:700;letter-spacing:-0.3px`)}>{f.name}</div>
                    <div style={css(`font-size:13px;color:rgba(245,241,230,.55);margin-top:2px`)}>{f.meta}</div>
                  </div>
                  <button onClick={f.onEdit} style={css(`width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);box-shadow:inset 0 1px 0 rgba(255,255,255,.25);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>
                    <svg width="14" height="14" viewBox="0 0 14 14"><path d="M9.5 1.5l3 3L5 12H2v-3l7.5-7.5z" fill="none" stroke="rgba(245,241,230,.7)" strokeWidth="1.5" strokeLinejoin="round"></path></svg>
                  </button>
                </div>
                <div style={css(`display:flex;gap:8px;margin:12px 0 14px;overflow-x:auto`)}>{f.thumbStrip}</div>
                <Pressable onClick={f.onStart} activeStyle={css(`transform:scale(0.96);box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 4px 12px rgba(0,0,0,.35)`)} style={css(`width:100%;height:48px;border-radius:24px;background:rgba(245,241,230,.95);border:1px solid rgba(255,255,255,.35);cursor:pointer;font-family:'Outfit',sans-serif;font-size:15px;font-weight:700;color:#1A1408;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 8px 22px rgba(0,0,0,.3);transition:transform .15s ease,box-shadow .15s ease`)}>
                  <svg width="12" height="14" viewBox="0 0 12 14"><path d="M1 1.5v11l10-5.5-10-5.5z" fill="#1A1408"></path></svg>
                  Iniciar treino
                </Pressable>
              </div>
            ))}

            {v.layoutList && v.fichaCards.map(f => (
              <div key={f.id} onClick={f.onStart} style={css(`background:rgba(255,255,255,.075);backdrop-filter:blur(22px) saturate(180%);border:1px solid rgba(255,255,255,.15);border-radius:24px;padding:13px 14px;margin-bottom:12px;display:flex;align-items:center;gap:13px;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.2),0 10px 26px rgba(0,0,0,.28)`)}>
                <div style={css(`width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:800;color:#F5F1E6;flex-shrink:0`)}>{f.letter}</div>
                <div style={css(`flex:1;min-width:0`)}>
                  <div style={css(`font-size:16px;font-weight:700`)}>{f.name}</div>
                  <div style={css(`font-size:12.5px;color:rgba(245,241,230,.55);margin-top:1px`)}>{f.meta}</div>
                </div>
                <button onClick={f.onEditStop} style={css(`width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);box-shadow:inset 0 1px 0 rgba(255,255,255,.25);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>
                  <svg width="13" height="13" viewBox="0 0 14 14"><path d="M9.5 1.5l3 3L5 12H2v-3l7.5-7.5z" fill="none" stroke="rgba(245,241,230,.7)" strokeWidth="1.5" strokeLinejoin="round"></path></svg>
                </button>
                <div style={css(`width:40px;height:40px;border-radius:50%;background:rgba(245,241,230,.95);border:1px solid rgba(255,255,255,.4);box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 6px 16px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>
                  <svg width="11" height="13" viewBox="0 0 12 14"><path d="M1 1.5v11l10-5.5-10-5.5z" fill="#1A1408"></path></svg>
                </div>
              </div>
            ))}

            {v.layoutCovers && (
              <div style={css(`display:grid;grid-template-columns:1fr 1fr;gap:14px`)}>
                {v.fichaCards.map(f => (
                  <div key={f.id} onClick={f.onStart} style={css(`position:relative;border-radius:24px;overflow:hidden;${SKELETON};aspect-ratio:0.82;cursor:pointer;border:1px solid rgba(255,255,255,.22);box-shadow:0 14px 30px rgba(0,0,0,.35)`)}>
                    {f.coverEl}
                    <button onClick={f.onEditStop} style={css(`position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:50%;background:rgba(20,16,30,.4);backdrop-filter:blur(14px) saturate(160%);border:1px solid rgba(255,255,255,.3);box-shadow:inset 0 1px 0 rgba(255,255,255,.3);cursor:pointer;display:flex;align-items:center;justify-content:center`)}>
                      <svg width="12" height="12" viewBox="0 0 14 14"><path d="M9.5 1.5l3 3L5 12H2v-3l7.5-7.5z" fill="none" stroke="rgba(245,241,230,.9)" strokeWidth="1.5" strokeLinejoin="round"></path></svg>
                    </button>
                    <div style={css(`position:absolute;left:8px;right:8px;bottom:8px;padding:10px 12px;border-radius:17px;background:rgba(22,17,34,.42);backdrop-filter:blur(18px) saturate(170%);border:1px solid rgba(255,255,255,.24);box-shadow:inset 0 1px 0 rgba(255,255,255,.3)`)}>
                      <div style={css(`font-size:14px;font-weight:700;line-height:1.2;text-shadow:0 1px 6px rgba(0,0,0,.4)`)}>{f.name}</div>
                      <div style={css(`font-size:11px;color:#F5F1E6;font-weight:600;margin-top:2px`)}>{f.metaShort} ▸</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {v.noFichas && (
              <div style={css(`text-align:center;padding:70px 20px;color:rgba(245,241,230,.5);font-size:14px`)}>Nenhuma ficha ainda.<br />Toque em + para criar a primeira.</div>
            )}
          </div>
        )}

        {v.tabHist && (
          <div style={css(`flex:1;overflow:auto;padding:8px 22px 150px`)}>
            {v.histRows.map(h => (
              <div key={h.id} style={css(`background:rgba(255,255,255,.075);backdrop-filter:blur(22px) saturate(180%);border:1px solid rgba(255,255,255,.15);border-radius:22px;padding:14px 16px;margin-bottom:12px;display:flex;align-items:center;gap:14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.2),0 10px 26px rgba(0,0,0,.28)`)}>
                <div style={css(`width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);box-shadow:inset 0 1px 0 rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>
                  <svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="#F5F1E6" strokeWidth="1.8"></circle><path d="M10 5.5V10l3 2" fill="none" stroke="#F5F1E6" strokeWidth="1.8" strokeLinecap="round"></path></svg>
                </div>
                <div style={css(`flex:1;min-width:0`)}>
                  <div style={css(`font-size:15px;font-weight:700`)}>{h.name}</div>
                  <div style={css(`font-size:12.5px;color:rgba(245,241,230,.55);margin-top:1px`)}>{h.date}</div>
                </div>
                <div style={css(`text-align:right;flex-shrink:0`)}>
                  <div style={css(`font-size:14px;font-weight:700;color:#F5F1E6`)}>{h.time}</div>
                  <div style={css(`font-size:12px;color:rgba(245,241,230,.55)`)}>{h.stats}</div>
                </div>
              </div>
            ))}
            {v.noHist && (
              <div style={css(`text-align:center;padding:70px 20px;color:rgba(245,241,230,.5);font-size:14px`)}>Nenhum treino concluído ainda.<br />Seu histórico aparecerá aqui.</div>
            )}
          </div>
        )}

        {v.tabProg && (
          <div style={css(`flex:1;overflow:auto;padding:8px 22px 150px`)}>
            <div style={css(`font-size:12.5px;color:rgba(245,241,230,.5);margin:0 2px 14px;line-height:1.4`)}>Evolução da carga por exercício ao longo das semanas.</div>

            {v.progFichaChips.length > 1 && (
              <div style={css(`display:flex;gap:8px;overflow-x:auto;padding:0 0 16px;margin:0 -2px`)}>
                {v.progFichaChips.map(c => (
                  <button key={c.k} onClick={c.onPick} style={css(`flex-shrink:0;height:34px;padding:0 15px;border-radius:17px;border:1px solid ${c.border};background:${c.bg};backdrop-filter:blur(14px) saturate(160%);color:${c.fg};font-family:'Outfit',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.18);white-space:nowrap`)}>{c.label}</button>
                ))}
              </div>
            )}

            {!v.noProg && (
              <div style={css(`display:flex;gap:10px;margin-bottom:18px`)}>
                <div style={css(`flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:13px 10px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.16)`)}>
                  <div style={css(`font-size:20px;font-weight:800;color:#F5F1E6`)}>{v.progCount}</div>
                  <div style={css(`font-size:10.5px;font-weight:700;letter-spacing:0.4px;color:rgba(245,241,230,.5);text-transform:uppercase;margin-top:3px`)}>Monitorados</div>
                </div>
                <div style={css(`flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:13px 10px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.16)`)}>
                  <div style={css(`font-size:20px;font-weight:800;color:#8FE3A2`)}>{v.progUpCount}</div>
                  <div style={css(`font-size:10.5px;font-weight:700;letter-spacing:0.4px;color:rgba(245,241,230,.5);text-transform:uppercase;margin-top:3px`)}>Em evolução</div>
                </div>
                <div style={css(`flex:1.5;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:12px 13px;box-shadow:inset 0 1px 0 rgba(255,255,255,.16);min-width:0`)}>
                  <div style={css(`font-size:10.5px;font-weight:700;letter-spacing:0.4px;color:rgba(245,241,230,.5);text-transform:uppercase`)}>Destaque</div>
                  <div style={css(`font-size:13px;font-weight:700;color:#F5F1E6;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize`)}>{v.progBest ? v.progBest.name : '—'}</div>
                  {v.progBest && <div style={css(`font-size:11.5px;font-weight:700;color:#8FE3A2;margin-top:1px`)}>▲ {v.progBest.badgeLabel}</div>}
                </div>
              </div>
            )}

            {v.progRows.map(p => (
              <div key={p.ex} style={css(`background:rgba(255,255,255,.075);backdrop-filter:blur(22px) saturate(180%);border:1px solid rgba(255,255,255,.15);border-radius:22px;padding:14px 15px;margin-bottom:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,.2),0 10px 26px rgba(0,0,0,.26)`)}>
                <div style={css(`display:flex;align-items:center;gap:11px`)}>
                  <div style={css(`width:44px;height:44px;border-radius:13px;${SKELETON};overflow:hidden;flex-shrink:0;border:1px solid rgba(255,255,255,.3)`)}>{p.thumbEl}</div>
                  <div style={css(`flex:1;min-width:0`)}>
                    <div style={css(`font-size:14.5px;font-weight:700;line-height:1.2;text-transform:capitalize;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`)}>{p.name}</div>
                    <div style={css(`font-size:11.5px;color:rgba(245,241,230,.5);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`)}>{p.sessions} · {p.periodLabel}</div>
                  </div>
                  <div style={css(`flex-shrink:0;padding:5px 10px;border-radius:12px;background:${p.deltaBg};font-size:11.5px;font-weight:700;color:${p.deltaColor};white-space:nowrap`)}>{p.arrow} {p.badgeLabel}</div>
                </div>
                <div style={css(`display:flex;align-items:baseline;gap:8px;margin-top:14px`)}>
                  <span style={css(`font-size:12.5px;font-weight:600;color:rgba(245,241,230,.4)`)}>{p.firstLabel}</span>
                  <svg width="13" height="10" viewBox="0 0 13 10" style={css(`flex-shrink:0`)}><path d="M1 5h10M7 1l4 4-4 4" fill="none" stroke="rgba(245,241,230,.35)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                  <span style={css(`font-size:18px;font-weight:800;color:#F5F1E6`)}>{p.current}</span>
                </div>
                <div style={css(`margin-top:10px`)}>{p.chart}</div>
              </div>
            ))}
            {v.noProg && s.progFicha === 'all' && (
              <div style={css(`text-align:center;padding:70px 20px;color:rgba(245,241,230,.5);font-size:14px`)}>Sem dados de carga ainda.<br />Marque séries com carga nos treinos<br />para acompanhar sua evolução.</div>
            )}
            {v.noProg && s.progFicha !== 'all' && (
              <div style={css(`text-align:center;padding:70px 20px;color:rgba(245,241,230,.5);font-size:14px`)}>Nenhum dado de carga para esta ficha ainda.<br />Marque séries com carga nos treinos dela<br />para acompanhar a evolução.</div>
            )}
          </div>
        )}
      </div>
    );
  }

  renderTabBar(v) {
    return (
      <div style={css(`position:fixed;left:50%;transform:translateX(-50%);bottom:calc(20px + env(safe-area-inset-bottom));z-index:40;display:flex;gap:4px;padding:5px;border-radius:32px;overflow:hidden;background:rgba(255,255,255,.095);backdrop-filter:blur(26px) saturate(190%);border:1px solid rgba(255,255,255,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 16px 38px rgba(0,0,0,.45)`)}>
        <div style={css(`position:absolute;width:22%;height:60%;top:0;left:2%;border-radius:50%;background:rgba(255,255,255,.6);filter:blur(14px);opacity:.12;mix-blend-mode:screen;animation:shine 8s ease-in-out infinite;pointer-events:none`)}></div>
        <Pressable onClick={v.onTabFichas} activeStyle={css(`transform:scale(0.94)`)} style={css(`display:flex;align-items:center;gap:6px;height:44px;padding:0 13px;border-radius:24px;border:none;cursor:pointer;font-family:'Outfit',sans-serif;background:${v.tabFichasBg};box-shadow:${v.tabFichasShadow};transition:background .25s,transform .15s ease`)}>
          <svg width="18" height="18" viewBox="0 0 22 22"><path d="M3 5.5h16M3 11h16M3 16.5h10" stroke={v.tabFichasFg} strokeWidth="2.2" strokeLinecap="round"></path></svg>
          <span style={css(`font-size:13px;font-weight:700;color:${v.tabFichasFg}`)}>Fichas</span>
        </Pressable>
        <Pressable onClick={v.onTabProg} activeStyle={css(`transform:scale(0.94)`)} style={css(`display:flex;align-items:center;gap:6px;height:44px;padding:0 13px;border-radius:24px;border:none;cursor:pointer;font-family:'Outfit',sans-serif;background:${v.tabProgBg};box-shadow:${v.tabProgShadow};transition:background .25s,transform .15s ease`)}>
          <svg width="18" height="18" viewBox="0 0 22 22"><path d="M3 15l5-5 4 3 6-8" fill="none" stroke={v.tabProgFg} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
          <span style={css(`font-size:13px;font-weight:700;color:${v.tabProgFg}`)}>Progresso</span>
        </Pressable>
        <Pressable onClick={v.onTabHist} activeStyle={css(`transform:scale(0.94)`)} style={css(`display:flex;align-items:center;gap:6px;height:44px;padding:0 13px;border-radius:24px;border:none;cursor:pointer;font-family:'Outfit',sans-serif;background:${v.tabHistBg};box-shadow:${v.tabHistShadow};transition:background .25s,transform .15s ease`)}>
          <svg width="18" height="18" viewBox="0 0 22 22"><circle cx="11" cy="11" r="8" fill="none" stroke={v.tabHistFg} strokeWidth="2.2"></circle><path d="M11 6.5V11l3.2 2" fill="none" stroke={v.tabHistFg} strokeWidth="2.2" strokeLinecap="round"></path></svg>
          <span style={css(`font-size:13px;font-weight:700;color:${v.tabHistFg}`)}>Histórico</span>
        </Pressable>
      </div>
    );
  }

  renderEdit(v) {
    return (
      <div data-screen-label="Editar ficha" style={css(`position:relative;z-index:1;flex:1;display:flex;flex-direction:column;overflow:hidden`)}>
        <div style={css(`padding:calc(24px + env(safe-area-inset-top)) 22px 10px;display:flex;align-items:center;gap:12px`)}>
          <Pressable onClick={v.onBackHome} activeStyle={css(`transform:scale(0.9)`)} style={css(`width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.1);backdrop-filter:blur(18px) saturate(170%);border:1px solid rgba(255,255,255,.2);box-shadow:inset 0 1px 0 rgba(255,255,255,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s ease`)}>
            <svg width="10" height="16" viewBox="0 0 10 16"><path d="M8.5 1.5L2 8l6.5 6.5" fill="none" stroke="#F5F1E6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
          </Pressable>
          <input value={v.editName} onChange={v.onEditName} placeholder="Nome da ficha" style={css(`flex:1;min-width:0;background:rgba(255,255,255,.06);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.14);border-radius:16px;font-size:19px;font-weight:700;color:#F5F1E6;padding:9px 14px;letter-spacing:-0.3px;box-shadow:inset 0 1px 0 rgba(255,255,255,.14)`)} />
          <button onClick={v.onDeleteFicha} style={css(`width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.08);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.18);box-shadow:inset 0 1px 0 rgba(255,255,255,.2);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>
            <svg width="14" height="15" viewBox="0 0 14 15"><path d="M1.5 3.5h11M5 3.5V2h4v1.5M3 3.5l.8 10h6.4l.8-10" fill="none" stroke="#F5F1E6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
          </button>
        </div>
        <div style={css(`font-size:12.5px;color:rgba(245,241,230,.5);padding:0 24px 10px`)}>{v.editMeta}</div>
        <div style={css(`flex:1;overflow:auto;padding:4px 22px 150px`)}>
          {v.editRows.map(r => (
            <div key={r.k} style={css(`background:rgba(255,255,255,.065);backdrop-filter:blur(20px) saturate(175%);border:1px solid rgba(255,255,255,.14);border-radius:22px;padding:12px;margin-bottom:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 10px 24px rgba(0,0,0,.26)`)}>
              <div style={css(`display:flex;gap:12px;align-items:center`)}>
                <div style={css(`width:52px;height:52px;border-radius:16px;${SKELETON};overflow:hidden;flex-shrink:0;border:1px solid rgba(255,255,255,.3)`)}>{r.thumbEl}</div>
                <div style={css(`flex:1;min-width:0`)}>
                  <div style={css(`font-size:14.5px;font-weight:600;line-height:1.25;text-transform:capitalize`)}>{r.name}</div>
                  <div style={css(`font-size:12px;color:rgba(245,241,230,.5);margin-top:1px`)}>{r.sub}</div>
                </div>
                <button onClick={r.onRemove} style={css(`width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.2);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>
                  <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="rgba(245,241,230,.6)" strokeWidth="1.8" strokeLinecap="round"></path></svg>
                </button>
              </div>
              <div style={css(`display:flex;flex-wrap:wrap;gap:8px;row-gap:8px;margin-top:11px`)}>
                <div style={css(`flex:1 1 104px;min-width:104px;background:rgba(10,8,16,.35);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:7px 10px;box-sizing:border-box`)}>
                  <div style={css(`font-size:10.5px;font-weight:700;letter-spacing:0.8px;color:rgba(245,241,230,.45);text-transform:uppercase`)}>Séries</div>
                  <div style={css(`display:flex;align-items:center;justify-content:space-between;margin-top:2px`)}>
                    <button onClick={r.onSetsDown} style={css(`width:32px;height:32px;flex-shrink:0;border:none;background:none;color:#F5F1E6;font-size:17px;font-weight:700;cursor:pointer;padding:0;line-height:1`)}>−</button>
                    <input value={r.sets} onChange={r.onSetsInput} inputMode="numeric" style={css(`width:24px;min-width:0;text-align:center;background:none;border:none;font-size:15px;font-weight:700;color:#F5F1E6;padding:0`)} />
                    <button onClick={r.onSetsUp} style={css(`width:32px;height:32px;flex-shrink:0;border:none;background:none;color:#F5F1E6;font-size:17px;font-weight:700;cursor:pointer;padding:0;line-height:1`)}>+</button>
                  </div>
                </div>
                <div style={css(`flex:1 1 104px;min-width:104px;background:rgba(10,8,16,.35);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:7px 10px;box-sizing:border-box`)}>
                  <div style={css(`font-size:10.5px;font-weight:700;letter-spacing:0.8px;color:rgba(245,241,230,.45);text-transform:uppercase`)}>Reps</div>
                  <div style={css(`display:flex;align-items:center;justify-content:space-between;margin-top:2px`)}>
                    <button onClick={r.onRepsDown} style={css(`width:32px;height:32px;flex-shrink:0;border:none;background:none;color:#F5F1E6;font-size:17px;font-weight:700;cursor:pointer;padding:0;line-height:1`)}>−</button>
                    <input value={r.reps} onChange={r.onRepsInput} inputMode="numeric" style={css(`width:24px;min-width:0;text-align:center;background:none;border:none;font-size:15px;font-weight:700;color:#F5F1E6;padding:0`)} />
                    <button onClick={r.onRepsUp} style={css(`width:32px;height:32px;flex-shrink:0;border:none;background:none;color:#F5F1E6;font-size:17px;font-weight:700;cursor:pointer;padding:0;line-height:1`)}>+</button>
                  </div>
                </div>
                <div style={css(`flex:1.2 1 118px;min-width:118px;background:rgba(10,8,16,.35);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:7px 10px;box-sizing:border-box`)}>
                  <div style={css(`font-size:10.5px;font-weight:700;letter-spacing:0.8px;color:rgba(245,241,230,.45);text-transform:uppercase`)}>Descanso</div>
                  <div style={css(`display:flex;align-items:center;justify-content:space-between;margin-top:2px`)}>
                    <button onClick={r.onRestDown} style={css(`width:32px;height:32px;flex-shrink:0;border:none;background:none;color:#F5F1E6;font-size:17px;font-weight:700;cursor:pointer;padding:0;line-height:1`)}>−</button>
                    <span style={css(`font-size:15px;font-weight:700;white-space:nowrap`)}>{r.restLabel}</span>
                    <button onClick={r.onRestUp} style={css(`width:32px;height:32px;flex-shrink:0;border:none;background:none;color:#F5F1E6;font-size:17px;font-weight:700;cursor:pointer;padding:0;line-height:1`)}>+</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <button onClick={v.onAddEx} style={css(`width:100%;height:54px;border-radius:27px;background:rgba(255,255,255,.07);backdrop-filter:blur(16px);border:1.5px dashed rgba(255,255,255,.4);color:#F5F1E6;font-family:'Outfit',sans-serif;font-size:14.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:inset 0 1px 0 rgba(255,255,255,.1)`)}>
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1v12M1 7h12" stroke="#F5F1E6" strokeWidth="2.2" strokeLinecap="round"></path></svg>
            Adicionar exercício
          </button>
        </div>
      </div>
    );
  }

  renderPicker(v) {
    return (
      <div data-screen-label="Biblioteca de exercícios" style={css(`position:relative;z-index:1;flex:1;display:flex;flex-direction:column;overflow:hidden`)}>
        <div style={css(`padding:calc(24px + env(safe-area-inset-top)) 22px 10px;display:flex;align-items:center;gap:12px`)}>
          <Pressable onClick={v.onPickerBack} activeStyle={css(`transform:scale(0.9)`)} style={css(`width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.1);backdrop-filter:blur(18px) saturate(170%);border:1px solid rgba(255,255,255,.2);box-shadow:inset 0 1px 0 rgba(255,255,255,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s ease`)}>
            <svg width="10" height="16" viewBox="0 0 10 16"><path d="M8.5 1.5L2 8l6.5 6.5" fill="none" stroke="#F5F1E6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
          </Pressable>
          <div>
            <div style={css(`font-size:19px;font-weight:800;letter-spacing:-0.3px`)}>{v.pickerTitle}</div>
            <div style={css(`font-size:12px;color:rgba(245,241,230,.5)`)}>{v.pickerCount}</div>
          </div>
        </div>
        <div style={css(`padding:6px 22px 10px`)}>
          <div style={css(`display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.08);backdrop-filter:blur(20px) saturate(180%);border:1px solid rgba(255,255,255,.18);border-radius:23px;padding:0 16px;height:46px;box-shadow:inset 0 1px 0 rgba(255,255,255,.22)`)}>
            <svg width="15" height="15" viewBox="0 0 15 15"><circle cx="6.5" cy="6.5" r="5" fill="none" stroke="rgba(245,241,230,.45)" strokeWidth="1.8"></circle><path d="M10.5 10.5L14 14" stroke="rgba(245,241,230,.45)" strokeWidth="1.8" strokeLinecap="round"></path></svg>
            <input value={v.pickerQuery} onChange={v.onPickerQuery} placeholder="Buscar exercício…" style={css(`flex:1;background:none;border:none;font-size:14.5px;color:#F5F1E6`)} />
          </div>
        </div>
        <div style={css(`display:flex;gap:8px;overflow-x:auto;padding:2px 22px 12px;flex-shrink:0`)}>
          {v.catChips.map(c => (
            <button key={c.k} onClick={c.onPick} style={css(`flex-shrink:0;height:34px;padding:0 15px;border-radius:17px;border:1px solid ${c.border};background:${c.bg};backdrop-filter:blur(14px) saturate(160%);color:${c.fg};font-family:'Outfit',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.18)`)}>{c.label}</button>
          ))}
        </div>
        {v.showLegTargets && (
          <div style={css(`display:flex;gap:6px;overflow-x:auto;padding:0 22px 12px;flex-shrink:0`)}>
            {v.legTargetChips.map(lt => (
              <button key={lt.k} onClick={lt.onPick} style={css(`flex-shrink:0;height:28px;padding:0 12px;border-radius:14px;border:1px solid ${lt.border};background:${lt.bg};color:${lt.fg};font-family:'Outfit',sans-serif;font-size:11.5px;font-weight:600;cursor:pointer`)}>{lt.label}</button>
            ))}
          </div>
        )}
        <div style={css(`flex:1;overflow:auto;padding:0 22px 150px`)}>
          <Pressable onClick={v.onOpenCustom} activeStyle={css(`transform:scale(0.98)`)} style={css(`width:100%;display:flex;align-items:center;gap:12px;padding:11px 12px;margin:4px 0 6px;border-radius:16px;background:rgba(255,255,255,.06);border:1px dashed rgba(255,255,255,.28);cursor:pointer;transition:transform .15s ease`)}>
            <div style={css(`width:44px;height:44px;border-radius:13px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>
              <svg width="18" height="18" viewBox="0 0 20 14"><rect x="1" y="1" width="18" height="12" rx="3" fill="none" stroke="#F5F1E6" strokeWidth="1.6"></rect><path d="M8 4.5l4 2.5-4 2.5z" fill="#F5F1E6"></path></svg>
            </div>
            <div style={css(`flex:1;min-width:0;text-align:left`)}>
              <div style={css(`font-size:14.5px;font-weight:700;color:#F5F1E6`)}>Criar exercício personalizado</div>
              <div style={css(`font-size:12px;color:rgba(245,241,230,.5);margin-top:1px`)}>Com vídeo do YouTube</div>
            </div>
            <div style={css(`width:30px;height:30px;border-radius:50%;background:rgba(245,241,230,.95);display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>
              <svg width="11" height="11" viewBox="0 0 12 12"><path d="M6 1v10M1 6h10" stroke="#1A1408" strokeWidth="2.2" strokeLinecap="round"></path></svg>
            </div>
          </Pressable>
          {v.pickerRows.map(p => (
            <div key={p.k} onClick={p.onPick} style={css(`display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer`)}>
              <div style={css(`width:52px;height:52px;border-radius:16px;${SKELETON};overflow:hidden;flex-shrink:0;border:1px solid rgba(255,255,255,.3)`)}>{p.thumbEl}</div>
              <div style={css(`flex:1;min-width:0`)}>
                <div style={css(`font-size:14.5px;font-weight:600;line-height:1.25;text-transform:capitalize`)}>{p.name}</div>
                <div style={css(`font-size:12px;color:rgba(245,241,230,.5);margin-top:1px`)}>{p.sub}</div>
              </div>
              <div style={css(`width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>
                <svg width="11" height="11" viewBox="0 0 12 12"><path d="M6 1v10M1 6h10" stroke="#F5F1E6" strokeWidth="2" strokeLinecap="round"></path></svg>
              </div>
            </div>
          ))}
          {v.pickerMore && (
            <div style={css(`text-align:center;padding:14px;font-size:12px;color:rgba(245,241,230,.45)`)}>{v.pickerMoreLabel}</div>
          )}
          {v.pickerEmpty && (
            <div style={css(`text-align:center;padding:50px 20px;font-size:14px;color:rgba(245,241,230,.5)`)}>Nenhum exercício encontrado.</div>
          )}
        </div>
      </div>
    );
  }

  renderCustom(v) {
    return (
      <div data-screen-label="Exercício personalizado" style={css(`position:relative;z-index:1;flex:1;display:flex;flex-direction:column;overflow:hidden`)}>
        <div style={css(`padding:calc(24px + env(safe-area-inset-top)) 22px 10px;display:flex;align-items:center;gap:12px`)}>
          <Pressable onClick={v.onCustomBack} activeStyle={css(`transform:scale(0.9)`)} style={css(`width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.1);backdrop-filter:blur(18px) saturate(170%);border:1px solid rgba(255,255,255,.2);box-shadow:inset 0 1px 0 rgba(255,255,255,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s ease`)}>
            <svg width="10" height="16" viewBox="0 0 10 16"><path d="M8.5 1.5L2 8l6.5 6.5" fill="none" stroke="#F5F1E6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
          </Pressable>
          <div style={css(`font-size:19px;font-weight:800;letter-spacing:-0.3px`)}>Exercício personalizado</div>
        </div>
        <div style={css(`flex:1;overflow:auto;padding:8px 22px 40px`)}>
          <div style={css(`font-size:11px;font-weight:700;letter-spacing:0.8px;color:rgba(245,241,230,.45);text-transform:uppercase;margin:6px 2px 6px`)}>Nome do exercício</div>
          <input value={v.cName} onChange={v.onCustomName} placeholder="Ex: Rosca inversa na polia" style={css(`width:100%;box-sizing:border-box;background:rgba(255,255,255,.08);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.16);border-radius:16px;font-size:15px;font-weight:600;color:#F5F1E6;padding:13px 15px;box-shadow:inset 0 1px 0 rgba(255,255,255,.14)`)} />
          <div style={css(`font-size:11px;font-weight:700;letter-spacing:0.8px;color:rgba(245,241,230,.45);text-transform:uppercase;margin:18px 2px 6px`)}>Vídeo do YouTube <span style={css(`font-weight:500;text-transform:none;letter-spacing:0;color:rgba(245,241,230,.35)`)}>(opcional)</span></div>
          <div style={css(`display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.08);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:0 15px;height:48px;box-shadow:inset 0 1px 0 rgba(255,255,255,.14)`)}>
            <svg width="18" height="14" viewBox="0 0 20 14" style={css(`flex-shrink:0`)}><rect x="1" y="1" width="18" height="12" rx="3" fill="none" stroke="rgba(245,241,230,.55)" strokeWidth="1.6"></rect><path d="M8 4.5l4 2.5-4 2.5z" fill="rgba(245,241,230,.55)"></path></svg>
            <input value={v.cUrl} onChange={v.onCustomUrl} placeholder="Cole o link do YouTube" style={css(`flex:1;min-width:0;background:none;border:none;font-size:14px;color:#F5F1E6`)} />
          </div>
          <div style={css(`margin-top:16px`)}>{v.cPreviewEl}</div>
        </div>
        <div style={css(`padding:6px 22px 116px`)}>
          <Pressable onClick={v.onCustomSave} disabled={v.cSaveDisabled} activeStyle={css(`transform:scale(0.97)`)} style={css(`width:100%;height:54px;border-radius:27px;background:${v.cSaveBg};border:1px solid rgba(255,255,255,.4);cursor:${v.cSaveCursor};font-family:'Outfit',sans-serif;font-size:15px;font-weight:800;color:#1A1408;opacity:${v.cSaveOpacity};box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 12px 30px rgba(0,0,0,.4);transition:transform .15s ease`)}>Adicionar à ficha</Pressable>
        </div>
      </div>
    );
  }

  renderVideo(v) {
    return (
      <div data-screen-label="Vídeo" style={css(`position:absolute;inset:0;z-index:120;background:rgba(6,5,10,.82);backdrop-filter:blur(20px) saturate(150%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;animation:restBackdropIn .28s ease-out both`)} onClick={v.onCloseVideo}>
        <div style={css(`width:100%;max-width:340px;aspect-ratio:16/9;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,.2);box-shadow:0 24px 60px rgba(0,0,0,.6);animation:restPanelIn .4s cubic-bezier(.22,1,.36,1) both`)}>
          <iframe title="Vídeo do exercício" src={v.videoSrc} width="100%" height="100%" frameBorder="0" allow="autoplay; encrypted-media" allowFullScreen style={css(`border:0;display:block`)}></iframe>
        </div>
        <Pressable onClick={v.onCloseVideo} activeStyle={css(`transform:scale(0.94)`)} style={css(`margin-top:20px;height:46px;padding:0 28px;border-radius:23px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.28);color:#F5F1E6;font-family:'Outfit',sans-serif;font-size:14px;font-weight:700;cursor:pointer;transition:transform .15s ease`)}>Fechar</Pressable>
      </div>
    );
  }

  renderProfile(v) {
    return (
      <div data-screen-label="Perfil" style={css(`position:relative;z-index:1;flex:1;display:flex;flex-direction:column;overflow:auto`)}>
        <div style={css(`padding:calc(24px + env(safe-area-inset-top)) 22px 10px;display:flex;align-items:center;gap:12px`)}>
          <Pressable onClick={v.onProfileBack} activeStyle={css(`transform:scale(0.9)`)} style={css(`width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.1);backdrop-filter:blur(18px) saturate(170%);border:1px solid rgba(255,255,255,.2);box-shadow:inset 0 1px 0 rgba(255,255,255,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s ease`)}>
            <svg width="10" height="16" viewBox="0 0 10 16"><path d="M8.5 1.5L2 8l6.5 6.5" fill="none" stroke="#F5F1E6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
          </Pressable>
          <div style={css(`font-size:19px;font-weight:800;letter-spacing:-0.3px`)}>Perfil</div>
        </div>
        <div style={css(`flex:1;padding:14px 24px 150px;display:flex;flex-direction:column;align-items:center`)}>
          <label style={css(`position:relative;width:132px;height:132px;border-radius:50%;cursor:pointer;display:block;flex-shrink:0`)}>
            <div style={css(`width:132px;height:132px;border-radius:50%;overflow:hidden;background:rgba(255,255,255,.08);backdrop-filter:blur(18px) saturate(180%);border:1px solid rgba(255,255,255,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 14px 34px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center`)}>{v.profileAvatarBig}</div>
            <div style={css(`position:absolute;right:2px;bottom:2px;width:38px;height:38px;border-radius:50%;background:rgba(245,241,230,.96);border:2px solid #14121C;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(0,0,0,.4)`)}>
              <svg width="17" height="17" viewBox="0 0 20 20"><path d="M3 6.5h3l1.2-2h5.6L14 6.5h3v10H3z" fill="none" stroke="#1A1408" strokeWidth="1.7" strokeLinejoin="round"></path><circle cx="10" cy="11" r="3" fill="none" stroke="#1A1408" strokeWidth="1.7"></circle></svg>
            </div>
            <input type="file" accept="image/*" onChange={v.onPhotoPick} style={css(`position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer`)} />
          </label>
          <div style={css(`font-size:12.5px;color:rgba(245,241,230,.45);margin-top:12px`)}>Toque na foto para alterar</div>

          <div style={css(`width:100%;font-size:11px;font-weight:700;letter-spacing:0.8px;color:rgba(245,241,230,.45);text-transform:uppercase;margin:26px 2px 6px`)}>Nome</div>
          <input value={v.profileName} onChange={v.onProfileName} placeholder="Seu nome" style={css(`width:100%;box-sizing:border-box;background:rgba(255,255,255,.08);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.16);border-radius:16px;font-size:16px;font-weight:600;color:#F5F1E6;padding:14px 16px;box-shadow:inset 0 1px 0 rgba(255,255,255,.14)`)} />

          <div style={css(`width:100%;display:flex;gap:10px;margin-top:22px`)}>
            <div style={css(`flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:15px 10px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.16)`)}>
              <div style={css(`font-size:22px;font-weight:800;color:#F5F1E6`)}>{v.profTreinos}</div>
              <div style={css(`font-size:10.5px;font-weight:600;letter-spacing:0.5px;color:rgba(245,241,230,.5);text-transform:uppercase;margin-top:2px`)}>Treinos</div>
            </div>
            <div style={css(`flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:15px 10px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.16)`)}>
              <div style={css(`font-size:22px;font-weight:800;color:#F5F1E6`)}>{v.profFichas}</div>
              <div style={css(`font-size:10.5px;font-weight:600;letter-spacing:0.5px;color:rgba(245,241,230,.5);text-transform:uppercase;margin-top:2px`)}>Fichas</div>
            </div>
            <div style={css(`flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:15px 10px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.16)`)}>
              <div style={css(`font-size:22px;font-weight:800;color:#F5F1E6`)}>{v.profHoras}</div>
              <div style={css(`font-size:10.5px;font-weight:600;letter-spacing:0.5px;color:rgba(245,241,230,.5);text-transform:uppercase;margin-top:2px`)}>Horas</div>
            </div>
          </div>
          {v.hasPhoto && (
            <Pressable onClick={v.onRemovePhoto} activeStyle={css(`transform:scale(0.95)`)} style={css(`margin-top:20px;height:44px;padding:0 22px;border-radius:22px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.18);color:rgba(245,241,230,.75);font-family:'Outfit',sans-serif;font-size:13.5px;font-weight:700;cursor:pointer;transition:transform .15s ease`)}>Remover foto</Pressable>
          )}

          <Pressable onClick={v.onOpenSettings} activeStyle={css(`transform:scale(0.97)`)} style={css(`width:100%;display:flex;align-items:center;gap:12px;margin-top:28px;padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);box-shadow:inset 0 1px 0 rgba(255,255,255,.16);cursor:pointer;transition:transform .15s ease`)}>
            <div style={css(`width:38px;height:38px;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>
              <svg width="17" height="17" viewBox="0 0 20 20"><path d="M10 6.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" fill="none" stroke="#F5F1E6" strokeWidth="1.6"></path><path d="M16.4 12.2l1.3 1-1 1.8-1.5-.5a5.6 5.6 0 01-1.3.8l-.3 1.6H10.4l-.3-1.6a5.6 5.6 0 01-1.3-.8l-1.5.5-1-1.8 1.3-1a5.7 5.7 0 010-1.5l-1.3-1 1-1.8 1.5.5c.4-.3.8-.6 1.3-.8l.3-1.6h3.2l.3 1.6c.5.2.9.5 1.3.8l1.5-.5 1 1.8-1.3 1c.1.5.1 1 0 1.5z" fill="none" stroke="#F5F1E6" strokeWidth="1.4" strokeLinejoin="round"></path></svg>
            </div>
            <div style={css(`flex:1;min-width:0;text-align:left`)}>
              <div style={css(`font-size:14.5px;font-weight:700;color:#F5F1E6`)}>Preferências</div>
              <div style={css(`font-size:12px;color:rgba(245,241,230,.5);margin-top:1px`)}>Layout, descanso padrão e GIFs</div>
            </div>
            <svg width="7" height="12" viewBox="0 0 7 12" style={css(`flex-shrink:0`)}><path d="M1 1l5 5-5 5" fill="none" stroke="rgba(245,241,230,.4)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"></path></svg>
          </Pressable>

          <Pressable onClick={v.onSignOut} activeStyle={css(`transform:scale(0.97)`)} style={css(`width:100%;height:46px;margin-top:14px;border-radius:18px;background:transparent;border:1px solid rgba(240,160,160,.3);color:#F0A0A0;font-family:'Outfit',sans-serif;font-size:13.5px;font-weight:700;cursor:pointer;transition:transform .15s ease`)}>Sair</Pressable>
        </div>
      </div>
    );
  }

  renderSettings(v) {
    return (
      <div data-screen-label="Preferências" style={css(`position:relative;z-index:1;flex:1;display:flex;flex-direction:column;overflow:hidden`)}>
        <div style={css(`padding:calc(24px + env(safe-area-inset-top)) 22px 10px;display:flex;align-items:center;gap:12px`)}>
          <Pressable onClick={v.onSettingsBack} activeStyle={css(`transform:scale(0.9)`)} style={css(`width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.1);backdrop-filter:blur(18px) saturate(170%);border:1px solid rgba(255,255,255,.2);box-shadow:inset 0 1px 0 rgba(255,255,255,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s ease`)}>
            <svg width="10" height="16" viewBox="0 0 10 16"><path d="M8.5 1.5L2 8l6.5 6.5" fill="none" stroke="#F5F1E6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
          </Pressable>
          <div style={css(`font-size:19px;font-weight:800;letter-spacing:-0.3px`)}>Preferências</div>
        </div>
        <div style={css(`flex:1;overflow:auto;padding:14px 22px 150px`)}>
          <div style={css(`font-size:11px;font-weight:700;letter-spacing:0.8px;color:rgba(245,241,230,.45);text-transform:uppercase;margin:6px 2px 8px`)}>Layout das fichas</div>
          <div style={css(`display:flex;gap:8px;margin-bottom:24px`)}>
            {v.layoutChips.map(c => (
              <button key={c.k} onClick={c.onPick} style={css(`flex:1;height:40px;border-radius:18px;border:1px solid ${c.border};background:${c.bg};backdrop-filter:blur(14px) saturate(160%);color:${c.fg};font-family:'Outfit',sans-serif;font-size:13px;font-weight:700;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.18)`)}>{c.label}</button>
            ))}
          </div>

          <div style={css(`display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:15px 16px;margin-bottom:24px;box-shadow:inset 0 1px 0 rgba(255,255,255,.16)`)}>
            <div>
              <div style={css(`font-size:14.5px;font-weight:700;color:#F5F1E6`)}>GIFs animados</div>
              <div style={css(`font-size:12px;color:rgba(245,241,230,.5);margin-top:2px`)}>Mostrar animação em vez de imagem estática durante o treino</div>
            </div>
            <Pressable onClick={v.onToggleGifs} activeStyle={css(`transform:scale(0.94)`)} style={css(`flex-shrink:0;width:50px;height:30px;border-radius:15px;border:none;cursor:pointer;background:${v.settingsGifs ? AMBER_GRAD : 'rgba(255,255,255,.12)'};position:relative;transition:background .2s ease;margin-left:14px`)}>
              <div style={css(`position:absolute;top:3px;left:${v.settingsGifs ? '23px' : '3px'};width:24px;height:24px;border-radius:50%;background:#F5F1E6;box-shadow:0 3px 8px rgba(0,0,0,.35);transition:left .2s ease`)}></div>
            </Pressable>
          </div>

          <div style={css(`display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:15px 16px;box-shadow:inset 0 1px 0 rgba(255,255,255,.16)`)}>
            <div>
              <div style={css(`font-size:14.5px;font-weight:700;color:#F5F1E6`)}>Descanso padrão</div>
              <div style={css(`font-size:12px;color:rgba(245,241,230,.5);margin-top:2px`)}>Usado ao adicionar um novo exercício</div>
            </div>
            <div style={css(`display:flex;align-items:center;gap:2px;background:rgba(10,8,16,.35);border:1px solid rgba(255,255,255,.08);border-radius:19px;padding:4px;flex-shrink:0;margin-left:14px`)}>
              <button onClick={v.onSetDefaultRestDown} style={css(`width:32px;height:32px;border:none;background:none;color:#F5F1E6;font-size:19px;font-weight:700;cursor:pointer;padding:0;line-height:1`)}>−</button>
              <span style={css(`min-width:52px;text-align:center;font-size:14px;font-weight:800;color:#F5F1E6`)}>{v.settingsRestLabel}</span>
              <button onClick={v.onSetDefaultRestUp} style={css(`width:32px;height:32px;border:none;background:none;color:#F5F1E6;font-size:19px;font-weight:700;cursor:pointer;padding:0;line-height:1`)}>+</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  renderWorkout(v) {
    return (
      <div data-screen-label="Treino em andamento" style={css(`position:relative;z-index:1;flex:1;display:flex;flex-direction:column;overflow:hidden`)}>
        <div style={css(`padding:calc(24px + env(safe-area-inset-top)) 22px 0;display:flex;align-items:center;gap:12px`)}>
          <Pressable onClick={v.onAbandon} activeStyle={css(`transform:scale(0.9)`)} style={css(`width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.1);backdrop-filter:blur(18px) saturate(170%);border:1px solid rgba(255,255,255,.2);box-shadow:inset 0 1px 0 rgba(255,255,255,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s ease`)}>
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="#F5F1E6" strokeWidth="2" strokeLinecap="round"></path></svg>
          </Pressable>
          <div style={css(`flex:1;min-width:0`)}>
            <div style={css(`font-size:17px;font-weight:800;letter-spacing:-0.3px`)}>{v.woName}</div>
          </div>
          <div style={css(`display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.1);backdrop-filter:blur(16px) saturate(170%);border:1px solid rgba(255,255,255,.22);border-radius:20px;padding:7px 13px;flex-shrink:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.2)`)}>
            <svg width="13" height="13" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="#F5F1E6" strokeWidth="2"></circle><path d="M10 5.5V10l3 2" fill="none" stroke="#F5F1E6" strokeWidth="2" strokeLinecap="round"></path></svg>
            <span style={css(`font-size:14px;font-weight:700;color:#F5F1E6;font-variant-numeric:tabular-nums`)}>{v.woElapsed}</span>
          </div>
        </div>
        <div style={css(`margin:14px 22px 10px;padding:11px 15px;border-radius:19px;background:rgba(255,255,255,.075);backdrop-filter:blur(20px) saturate(180%);border:1px solid rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.2)`)}>
          <div style={css(`display:flex;justify-content:space-between;font-size:12px;color:rgba(245,241,230,.6);margin-bottom:7px`)}>
            <span style={css(`font-weight:600`)}>Progresso</span>
            <span style={css(`font-weight:700;color:#F5F1E6`)}>{v.woProgressText}</span>
          </div>
          <div style={css(`height:7px;border-radius:4px;background:rgba(10,8,16,.4);overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.35)`)}>
            <div style={css(`height:100%;border-radius:4px;background:#F5F1E6;box-shadow:0 0 10px rgba(255,255,255,.4);transition:width .35s ease;width:${v.woProgressPct}`)}></div>
          </div>
        </div>
        <div style={css(`flex:1;overflow:auto;padding:4px 22px 130px`)}>
          {v.woRows.map(w => (
            <div key={w.k} style={css(`background:rgba(255,255,255,.065);backdrop-filter:blur(20px) saturate(175%);border:1px solid ${w.border};border-radius:24px;padding:12px;margin-bottom:12px;opacity:${w.opacity};box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 10px 26px rgba(0,0,0,.26);transition:opacity .25s,border-color .25s`)}>
              <div style={css(`display:flex;gap:12px`)}>
                <div style={css(`width:74px;height:74px;border-radius:18px;${SKELETON};overflow:hidden;flex-shrink:0;border:1px solid rgba(255,255,255,.3)`)}>{w.mediaEl}</div>
                <div style={css(`flex:1;min-width:0`)}>
                  <div style={css(`font-size:15px;font-weight:700;line-height:1.25;text-transform:capitalize`)}>{w.name}</div>
                  <div style={css(`font-size:12.5px;color:rgba(245,241,230,.55);margin-top:2px`)}>{w.setsReps}</div>
                  <div style={css(`font-size:12px;color:#F5F1E6;font-weight:600;margin-top:3px`)}>{w.lastLabel}</div>
                </div>
                <div style={css(`display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;align-self:center;gap:2px`)}>
                  <div style={css(`font-size:15px;font-weight:800;color:${w.setsCountColor};font-variant-numeric:tabular-nums`)}>{w.setsCountLabel}</div>
                  <div style={css(`font-size:10.5px;font-weight:700;letter-spacing:.8px;color:rgba(245,241,230,.4);text-transform:uppercase`)}>séries</div>
                </div>
              </div>
              <div style={css(`display:flex;gap:6px;margin-top:12px;flex-wrap:wrap`)}>
                {w.setPills.map(sp => (
                  <Pressable key={sp.key} onClick={sp.onTap} activeStyle={css(`transform:scale(0.9)`)} style={css(`flex:1;min-width:44px;height:40px;border-radius:14px;border:1.5px solid ${sp.border};background:${sp.bg};box-shadow:${sp.shadow};cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;font-family:'Outfit',sans-serif;font-size:13px;font-weight:800;color:${sp.fg};transition:all .18s ease`)}>{sp.content}</Pressable>
                ))}
              </div>
              <div style={css(`display:flex;align-items:center;gap:8px;row-gap:8px;margin-top:11px;flex-wrap:wrap`)}>
                <div style={css(`display:flex;align-items:center;gap:2px;background:rgba(10,8,16,.35);border:1px solid rgba(255,255,255,.08);border-radius:19px;padding:4px;flex-shrink:0`)}>
                  <button onClick={w.onLoadDown} style={css(`width:40px;height:40px;border:none;background:none;color:#F5F1E6;font-size:19px;font-weight:700;cursor:pointer;padding:0;line-height:1`)}>−</button>
                  <input value={w.load} onChange={w.onLoad} inputMode="decimal" style={css(`width:44px;text-align:center;background:none;border:none;font-size:16px;font-weight:800;color:#F5F1E6;padding:0`)} />
                  <button onClick={w.onLoadUp} style={css(`width:40px;height:40px;border:none;background:none;color:#F5F1E6;font-size:19px;font-weight:700;cursor:pointer;padding:0;line-height:1`)}>+</button>
                </div>
                <span style={css(`font-size:12.5px;font-weight:700;color:rgba(245,241,230,.55);flex-shrink:0`)}>kg</span>
                <button onClick={w.onSwap} style={css(`height:36px;padding:0 14px;border-radius:18px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.2);cursor:pointer;display:flex;align-items:center;gap:6px;font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;color:rgba(245,241,230,.75);flex-shrink:0;margin-left:auto`)}>
                  <svg width="13" height="12" viewBox="0 0 14 13"><path d="M3.5 1L1 3.5 3.5 6M1 3.5h9M10.5 7L13 9.5 10.5 12M13 9.5H4" fill="none" stroke="rgba(245,241,230,.75)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                  Trocar
                </button>
              </div>
            </div>
          ))}
        </div>
        <div style={css(`position:absolute;left:22px;right:22px;bottom:calc(46px + env(safe-area-inset-bottom));z-index:40`)}>
          <Pressable onClick={v.onFinish} activeStyle={css(`transform:scale(0.97)`)} style={css(`width:100%;height:56px;border-radius:28px;background:rgba(245,241,230,.96);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.4);cursor:pointer;font-family:'Outfit',sans-serif;font-size:16px;font-weight:800;color:#1A1408;box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 14px 34px rgba(0,0,0,.42);transition:transform .15s ease`)}>Concluir treino</Pressable>
        </div>
      </div>
    );
  }

  renderSummary(v) {
    return (
      <div data-screen-label="Resumo do treino" style={css(`position:relative;z-index:1;flex:1;display:flex;flex-direction:column;overflow:auto;padding:90px 26px 40px;box-sizing:border-box`)}>
        <div style={css(`display:flex;flex-direction:column;align-items:center;text-align:center`)}>
          <div style={css(`width:78px;height:78px;border-radius:50%;background:rgba(245,241,230,.96);border:1px solid rgba(255,255,255,.45);display:flex;align-items:center;justify-content:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 16px 38px rgba(0,0,0,.42)`)}>
            <svg width="30" height="24" viewBox="0 0 16 13"><path d="M1.5 6.5l4.5 4.5L14.5 1.5" fill="none" stroke="#1A1408" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"></path></svg>
          </div>
          <div style={css(`font-size:25px;font-weight:800;letter-spacing:-0.5px;margin-top:16px;text-shadow:0 2px 14px rgba(0,0,0,.35)`)}>Treino concluído!</div>
          <div style={css(`font-size:14px;color:rgba(245,241,230,.6);margin-top:3px`)}>{v.sumFicha}</div>
        </div>
        <div style={css(`display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:24px`)}>
          <div style={css(`background:rgba(255,255,255,.08);backdrop-filter:blur(20px) saturate(180%);border:1px solid rgba(255,255,255,.16);border-radius:20px;padding:13px 8px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 8px 22px rgba(0,0,0,.25)`)}>
            <div style={css(`font-size:19px;font-weight:800;color:#F5F1E6;font-variant-numeric:tabular-nums`)}>{v.sumTime}</div>
            <div style={css(`font-size:10.5px;font-weight:600;letter-spacing:0.6px;color:rgba(245,241,230,.5);text-transform:uppercase;margin-top:2px`)}>Tempo</div>
          </div>
          <div style={css(`background:rgba(255,255,255,.08);backdrop-filter:blur(20px) saturate(180%);border:1px solid rgba(255,255,255,.16);border-radius:20px;padding:13px 8px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 8px 22px rgba(0,0,0,.25)`)}>
            <div style={css(`font-size:19px;font-weight:800;color:#F5F1E6`)}>{v.sumDone}</div>
            <div style={css(`font-size:10.5px;font-weight:600;letter-spacing:0.6px;color:rgba(245,241,230,.5);text-transform:uppercase;margin-top:2px`)}>Exercícios</div>
          </div>
          <div style={css(`background:rgba(255,255,255,.08);backdrop-filter:blur(20px) saturate(180%);border:1px solid rgba(255,255,255,.16);border-radius:20px;padding:13px 8px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 8px 22px rgba(0,0,0,.25)`)}>
            <div style={css(`font-size:19px;font-weight:800;color:#F5F1E6`)}>{v.sumVol}</div>
            <div style={css(`font-size:10.5px;font-weight:600;letter-spacing:0.6px;color:rgba(245,241,230,.5);text-transform:uppercase;margin-top:2px`)}>Volume</div>
          </div>
        </div>
        <div style={css(`margin-top:20px;padding:6px 16px;border-radius:20px;background:rgba(255,255,255,.06);backdrop-filter:blur(18px) saturate(170%);border:1px solid rgba(255,255,255,.13);box-shadow:inset 0 1px 0 rgba(255,255,255,.16)`)}>
          {v.sumRows.map(sr => (
            <div key={sr.k} style={css(`display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06)`)}>
              <svg width="14" height="12" viewBox="0 0 16 13" style={css(`flex-shrink:0`)}><path d="M1.5 6.5l4.5 4.5L14.5 1.5" fill="none" stroke={sr.ck} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"></path></svg>
              <div style={css(`flex:1;font-size:13.5px;font-weight:600;text-transform:capitalize;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`)}>{sr.name}</div>
              <div style={css(`font-size:13px;font-weight:700;color:rgba(245,241,230,.65);flex-shrink:0`)}>{sr.detail}</div>
            </div>
          ))}
        </div>
        <div style={css(`flex:1`)}></div>
        <button onClick={v.onBackHome} style={css(`width:100%;height:54px;border-radius:27px;background:rgba(245,241,230,.96);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.4);cursor:pointer;font-family:'Outfit',sans-serif;font-size:15px;font-weight:800;color:#1A1408;margin-top:22px;flex-shrink:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 12px 30px rgba(0,0,0,.4)`)}>Voltar às fichas</button>
      </div>
    );
  }

  renderRest(v) {
    return (
      <div data-screen-label="Timer de descanso" style={css(`position:absolute;inset:0;z-index:100;background:rgba(6,5,10,.82);display:flex;flex-direction:column;align-items:center;justify-content:center;animation:restBackdropIn .3s ease-out both`)}>
        <div style={css(`position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;gap:6px;padding:32px 34px 28px;border-radius:38px;background:rgba(26,20,34,.96);border:1px solid rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 24px 60px rgba(0,0,0,.5);animation:restPanelIn .42s cubic-bezier(.22,1,.36,1) both`)}>
          <div style={css(`font-size:12px;font-weight:800;letter-spacing:3px;color:rgba(245,241,230,.55);text-transform:uppercase`)}>Descanso</div>
          <div style={css(`position:relative;width:200px;height:200px;margin-top:10px`)}>
            <svg width="200" height="200" viewBox="0 0 200 200" style={css(`transform:rotate(-90deg);position:relative`)}>
              <circle cx="100" cy="100" r="86" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="10"></circle>
              <circle ref={this.ringRef} cx="100" cy="100" r="86" fill="none" stroke={v.restRingColor} strokeWidth="10" strokeLinecap="round" strokeDasharray="540.35" strokeDashoffset={v.restDash} style={{ transition: 'stroke .3s ease' }}></circle>
            </svg>
            <div style={css(`position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center`)}>
              {v.restNumEl}
              <div style={css(`font-size:13px;color:rgba(245,241,230,.55);margin-top:-4px`)}>segundos</div>
            </div>
          </div>
          <div style={css(`font-size:13.5px;color:rgba(245,241,230,.65);margin-top:10px;max-width:240px;text-align:center;text-transform:capitalize`)}>{v.restNext}</div>
          <div style={css(`display:flex;align-items:center;gap:22px;margin-top:16px`)}>
            <Pressable onClick={v.onRestPlus} activeStyle={css(`transform:scale(0.92)`)} style={css(`height:48px;padding:0 24px;border-radius:24px;background:rgba(245,241,230,.96);border:1px solid rgba(255,255,255,.4);box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 8px 20px rgba(0,0,0,.35);color:#1A1408;font-family:'Outfit',sans-serif;font-size:14.5px;font-weight:800;cursor:pointer;transition:transform .15s ease`)}>+15s</Pressable>
            <Pressable onClick={v.onRestSkip} activeStyle={css(`transform:scale(0.92)`)} style={css(`height:38px;padding:0 16px;border-radius:19px;background:transparent;border:1px solid rgba(255,255,255,.18);color:rgba(245,241,230,.55);font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;cursor:pointer;transition:transform .15s ease`)}>Pular</Pressable>
          </div>
        </div>
      </div>
    );
  }

  renderResumePrompt(v) {
    return (
      <div data-screen-label="Retomar treino" style={css(`position:absolute;inset:0;z-index:110;background:rgba(10,8,16,.6);backdrop-filter:blur(26px) saturate(160%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;animation:restBackdropIn .3s ease-out both`)}>
        <div style={css(`width:100%;max-width:320px;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;gap:6px;padding:28px 26px;border-radius:32px;background:rgba(255,255,255,.09);backdrop-filter:blur(28px) saturate(190%);border:1px solid rgba(255,255,255,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 24px 60px rgba(0,0,0,.5);animation:restPanelIn .42s cubic-bezier(.22,1,.36,1) both;text-align:center`)}>
          <div style={css(`font-size:12px;font-weight:800;letter-spacing:2px;color:rgba(245,241,230,.55);text-transform:uppercase`)}>Treino em andamento</div>
          <div style={css(`font-size:20px;font-weight:800;margin-top:6px;text-transform:capitalize`)}>{v.resumeFichaName}</div>
          <div style={css(`font-size:13px;color:rgba(245,241,230,.55);margin-top:4px`)}>{v.resumeElapsed} decorridos antes de sair</div>
          <div style={css(`display:flex;flex-direction:column;gap:10px;width:100%;margin-top:22px`)}>
            <Pressable onClick={v.onResumeContinue} activeStyle={css(`transform:scale(0.97)`)} style={css(`width:100%;height:50px;border-radius:25px;background:rgba(245,241,230,.96);border:1px solid rgba(255,255,255,.4);box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 12px 30px rgba(0,0,0,.4);color:#1A1408;font-family:'Outfit',sans-serif;font-size:14.5px;font-weight:800;cursor:pointer;transition:transform .15s ease`)}>Continuar treino</Pressable>
            <Pressable onClick={v.onResumeDiscard} activeStyle={css(`transform:scale(0.97)`)} style={css(`width:100%;height:44px;border-radius:22px;background:transparent;border:1px solid rgba(255,255,255,.18);color:rgba(245,241,230,.6);font-family:'Outfit',sans-serif;font-size:13.5px;font-weight:600;cursor:pointer;transition:transform .15s ease`)}>Descartar</Pressable>
          </div>
        </div>
      </div>
    );
  }

  renderToast(v) {
    return (
      <div style={css(`position:fixed;left:50%;transform:translateX(-50%);bottom:calc(90px + env(safe-area-inset-bottom));z-index:200;max-width:calc(100% - 44px);padding:12px 18px;border-radius:18px;background:rgba(28,22,16,.94);backdrop-filter:blur(20px) saturate(180%);border:1px solid rgba(255,255,255,.18);box-shadow:0 16px 38px rgba(0,0,0,.5);color:#F5F1E6;font-size:13px;font-weight:600;text-align:center`)}>{v.toast}</div>
    );
  }

  render() {
    const v = this.renderVals();
    return (
      <div style={{ background: '#0B0912', boxSizing: 'border-box' }}>
        <div data-screen-label="App Bronzetes" style={css(`height:100vh;height:100dvh;width:100%;max-width:480px;margin:0 auto;display:flex;flex-direction:column;background:#100D1A;color:#F5F1E6;font-family:'Outfit',system-ui,sans-serif;position:relative;overflow:hidden`)}>
          <div style={css(`position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none`)}>
            <div style={css(`position:absolute;width:360px;height:360px;border-radius:50%;background:rgba(255,255,255,.05);top:-90px;left:-100px;filter:blur(30px);animation:drift1 16s ease-in-out infinite alternate`)}></div>
            <div style={css(`position:absolute;width:420px;height:420px;border-radius:50%;background:rgba(255,255,255,.04);bottom:-120px;right:-130px;filter:blur(34px);animation:drift2 19s ease-in-out infinite alternate`)}></div>
            <div style={css(`position:absolute;width:280px;height:280px;border-radius:50%;background:rgba(255,255,255,.035);top:40%;right:-110px;filter:blur(32px);animation:drift3 14s ease-in-out infinite alternate`)}></div>
          </div>

          {v.authStatus === 'checking' && this.renderLoading()}
          {v.authStatus === 'signedOut' && this.renderAuth(v)}
          {v.authStatus === 'signedIn' && v.libLoading && this.renderLoading()}
          {v.authStatus === 'signedIn' && v.libError && this.renderError(v)}
          {v.authStatus === 'signedIn' && v.isHome && this.renderHome(v)}
          {v.authStatus === 'signedIn' && v.isEdit && this.renderEdit(v)}
          {v.authStatus === 'signedIn' && v.isPicker && this.renderPicker(v)}
          {v.authStatus === 'signedIn' && v.isCustom && this.renderCustom(v)}
          {v.authStatus === 'signedIn' && v.videoOpen && this.renderVideo(v)}
          {v.authStatus === 'signedIn' && v.isProfile && this.renderProfile(v)}
          {v.authStatus === 'signedIn' && v.isSettings && this.renderSettings(v)}
          {v.authStatus === 'signedIn' && v.isWorkout && this.renderWorkout(v)}
          {v.authStatus === 'signedIn' && v.isSummary && this.renderSummary(v)}
          {v.authStatus === 'signedIn' && v.restActive && this.renderRest(v)}
          {v.authStatus === 'signedIn' && v.resumePrompt && this.renderResumePrompt(v)}
          {v.authStatus === 'signedIn' && v.showTabBar && this.renderTabBar(v)}
        </div>
        {v.toast && this.renderToast(v)}
      </div>
    );
  }
}

export default App;
