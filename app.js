/* ProgramApp · la programación de Gabi para sus atletas */
(function () {
  'use strict';

  var CFG = window.APP_CONFIG;
  firebase.initializeApp(CFG.firebase);
  var auth = firebase.auth();
  auth.languageCode = 'es';

  var LEVANTAMIENTOS = ['SNATCH', 'POWER SNATCH', 'CLEAN', 'POWER CLEAN', 'SPLIT JERK', 'BACK SQUAT', 'FRONT SQUAT', 'DEADLIFT', 'BENCH PRESS'];
  var NOMBRE_DIA = { LUNES: 'Lunes', MARTES: 'Martes', MIERCOLES: 'Miércoles', JUEVES: 'Jueves', VIERNES: 'Viernes', SABADO: 'Sábado', DOMINGO: 'Domingo' };
  var CORTO_DIA = { LUNES: 'Lun', MARTES: 'Mar', MIERCOLES: 'Mié', JUEVES: 'Jue', VIERNES: 'Vie', SABADO: 'Sáb', DOMINGO: 'Dom' };
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var SIGLAS = ['RPE', 'RIR', 'WOD', 'WODS', 'BMU', 'RMU', 'HSPU', 'SHSPU', 'C2B', 'T2B', 'DB', 'DBS', 'KB', 'ERG', 'ERGS', 'OH', 'OHS', 'DL',
    'HS', 'HSWALK', 'Z2', 'Z3', 'AMRAP', 'EMOM', 'GHD', 'PVC', 'RX', 'RM', 'BMUS', 'RMUS', 'SCL', 'INT'];

  var $app = document.getElementById('app');
  var $scrim = document.getElementById('scrim');

  var S = { user: null, data: null, dia: 0, cargando: false, ultimaCarga: 0, aviso: '' };

  // ---------- utilidades ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function norm(s) { return String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function leer(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function fechaCorta(iso) { var p = iso.split('-'); return Number(p[2]) + ' ' + MESES[Number(p[1]) - 1]; }
  function diaMes(iso) { return Number(iso.slice(8)); }

  function rpeNum(r) { if (!r) return null; if (/z\s*2/i.test(r)) return 4; var m = String(r).match(/\d+/g); return m ? Math.max.apply(null, m.map(Number)) : null; }
  function rpeColor(r) { var n = rpeNum(r); if (n == null) return 'var(--muted)'; return n >= 8 ? 'var(--rpe-high)' : n >= 7 ? 'var(--rpe-mid)' : 'var(--rpe-low)'; }

  /** Texto en mayúsculas con saltos de línea manuales → párrafos legibles en minúscula. */
  function prosa(texto) {
    return String(texto || '').split(/\n\s*\n/).map(function (par) {
      var t = par.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).join(' ').replace(/\s+/g, ' ');
      if (!t) return '';
      var bajo = t.toLowerCase().replace(/(^|[.!?:]\s+)([a-záéíóúñ])/g, function (m, a, b) { return a + b.toUpperCase(); });
      bajo = bajo.replace(/\b[\wáéíóúñ]+\b/gi, function (w) {
        var u = w.toUpperCase();
        return SIGLAS.indexOf(u) >= 0 || /\d/.test(w) ? u : w;
      });
      return '<p>' + esc(bajo) + '</p>';
    }).join('');
  }

  // ---------- vídeos ----------
  var reVideos = null, listaVideos = [];
  function prepararVideos(videos) {
    listaVideos = videos || [];
    var pats = [];
    listaVideos.forEach(function (v, i) {
      [v.nombre].concat(v.alias || []).forEach(function (n) { if (n && n.trim().length >= 3) pats.push({ p: n.trim(), i: i }); });
    });
    pats.sort(function (a, b) { return b.p.length - a.p.length; });
    var clase = { A: '[AÁ]', E: '[EÉ]', I: '[IÍ]', O: '[OÓ]', U: '[UÚÜ]', N: '[NÑ]' };
    var mapa = {};
    var alt = pats.map(function (x) {
      mapa[norm(x.p)] = x.i;
      return norm(x.p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[AEIOUN]/g, function (c) { return clase[c]; }).replace(/\s+/g, '\\s+');
    });
    reVideos = alt.length ? { re: new RegExp('(' + alt.join('|') + ')', 'gi'), mapa: mapa } : null;
  }
  function conVideos(html) {
    if (!reVideos) return html;
    return html.replace(reVideos.re, function (m) {
      var i = reVideos.mapa[norm(m).replace(/\s+/g, ' ')];
      return i == null ? m : '<button class="vid" type="button" data-v="' + i + '">' + m + '</button>';
    });
  }
  function idVideo(url) { var m = String(url).match(/(?:shorts\/|v=|youtu\.be\/|embed\/)([\w-]{11})/); return m ? m[1] : ''; }

  // ---------- porcentajes → kilos ----------
  var RE_LEV = [
    [/POWER\s+SNATCH|MUSCLE\s+SNATCH|MUSTLE\s+SNATCH/, 'POWER SNATCH'],
    [/POWER\s+CLEAN/, 'POWER CLEAN'],
    [/SPLIT\s+JERK/, 'SPLIT JERK'],
    [/BACK\s+SQUAT/, 'BACK SQUAT'],
    [/FRONT\s+SQUAT/, 'FRONT SQUAT'],
    [/DEADLIFT|\bDL\b/, 'DEADLIFT'],
    [/BENCH\s+PRESS|PRESS\s+BANCA/, 'BENCH PRESS'],
    [/(?<!DB |KB |DUAL DB )SNATCH/, 'SNATCH'],
    [/(?<!DB |KB |DUAL DB )CLEAN/, 'CLEAN']
  ];
  function levantamiento(texto) {
    var n = norm(texto);
    for (var i = 0; i < RE_LEV.length; i++) if (RE_LEV[i][0].test(n)) return RE_LEV[i][1];
    return null;
  }
  function conKilos(lineaHtml, lineaTxt, ctx) {
    var marcas = (S.user && S.user.marcas) || {};
    if (!/%/.test(lineaTxt)) return lineaHtml;
    var lev = levantamiento(lineaTxt) || ctx.parte || ctx.bloque;
    if (ctx.desdePower && lev === 'SNATCH') lev = 'POWER SNATCH';
    var rm = lev && marcas[lev];
    if (!rm) return lineaHtml;
    return lineaHtml.replace(/(\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)*)\s*%/g, function (todo, nums) {
      var kg = nums.split('/').map(function (x) { return Math.round(rm * parseFloat(x.replace(',', '.')) / 100 * 2) / 2; });
      return todo + '<span class="kg" title="' + esc(lev) + ' ' + rm + ' kg">' + kg.join('/') + ' kg</span>';
    });
  }
  function pizarra(texto, ctx) {
    return String(texto || '').split('\n').map(function (l) {
      return conKilos(conVideos(esc(l)), l, ctx);
    }).join('\n');
  }

  // ---------- servidor ----------
  function api(cuerpo, reintento) {
    var u = auth.currentUser;
    if (!u) return Promise.reject(new Error('sin_sesion'));
    return u.getIdToken(!!reintento).then(function (tok) {
      cuerpo.idToken = tok;
      return fetch(CFG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) });
    }).then(function (r) {
      return r.text().then(function (t) {
        try { return JSON.parse(t); }
        catch (e) { throw new Error('respuesta no válida del servidor (HTTP ' + r.status + '): ' + t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)); }
      });
    }).then(function (res) {
      if (!res.ok && res.error === 'sesion_caducada' && !reintento) return api(cuerpo, true);
      return res;
    });
  }

  function cargar(semana) {
    S.cargando = true;
    return api({ action: 'semana', semana: semana || null }).then(function (res) {
      S.cargando = false;
      if (!res.ok) {
        if (res.error === 'no_autorizado') return pantallaNoAutorizado(res.email);
        S.aviso = 'No se pudo cargar la programación (' + (res.detalle || res.error) + ').';
        return render();
      }
      var antes = S.data && S.data.semana;
      S.user = res.user; S.data = res.data; S.ultimaCarga = Date.now(); S.aviso = '';
      prepararVideos(S.data.videos);
      if (antes !== S.data.semana || !semana) S.dia = diaInicial();
      if (!semana) guardar('pa-cache-' + res.user.email, { user: res.user, data: res.data });
      render();
    }).catch(function (e) {
      S.cargando = false;
      var det = e && e.message ? e.message : String(e);
      if (!navigator.onLine) det = 'el dispositivo no tiene internet';
      else if (/Failed to fetch|NetworkError|Load failed/i.test(det)) det = 'el servidor no respondió o bloqueó la petición';
      S.aviso = (S.data ? 'No se pudo actualizar: ' : 'No se pudo cargar: ') + det;
      render();
    });
  }

  function diaInicial() {
    var d = S.data, i = d.dias.findIndex(function (x) { return x.iso === d.hoy; });
    if (i >= 0) return i;
    return d.hoy < (d.dias[0] && d.dias[0].iso) ? 0 : Math.max(0, d.dias.length - 1);
  }

  // ---------- pantallas ----------
  function pantallaLogin(msg) {
    $app.innerHTML =
      '<section class="login">' +
      '<div class="brand">ProgramApp</div>' +
      '<p>La programación semanal de Gabi. Entra con la cuenta que le diste a Gabi.</p>' +
      '<button class="btn btn-primary" id="gbtn" type="button">Entrar con Google</button>' +
      '<div class="or">o con un enlace a tu correo</div>' +
      '<form id="mailf" class="field"><label for="mail">Email</label>' +
      '<input id="mail" type="email" autocomplete="email" inputmode="email" required placeholder="tu@email.com">' +
      '<button class="btn" type="submit" id="mailbtn">Enviarme el enlace</button></form>' +
      (msg ? '<div class="' + (msg.ok ? 'hint' : 'err') + '" role="status">' + esc(msg.t) + '</div>' : '') +
      '</section>';
    document.getElementById('gbtn').onclick = function () {
      var p = new firebase.auth.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      auth.signInWithPopup(p).catch(function (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') return auth.signInWithRedirect(p);
        if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') pantallaLogin({ t: 'No se pudo entrar con Google (' + e.code + ').' });
      });
    };
    document.getElementById('mailf').onsubmit = function (ev) {
      ev.preventDefault();
      var email = document.getElementById('mail').value.trim();
      var btn = document.getElementById('mailbtn'); btn.disabled = true; btn.textContent = 'Enviando…';
      auth.sendSignInLinkToEmail(email, { url: location.origin + location.pathname, handleCodeInApp: true }).then(function () {
        guardar('pa-email', email);
        pantallaLogin({ ok: true, t: 'Enlace enviado a ' + email + '. Ábrelo desde este mismo dispositivo. Si no llega, mira en spam.' });
      }).catch(function (e) { pantallaLogin({ t: 'No se pudo enviar el enlace (' + e.code + ').' }); });
    };
  }

  function pantallaConfirmarEmail() {
    $app.innerHTML =
      '<section class="login"><div class="brand">ProgramApp</div>' +
      '<p>Para terminar de entrar, confirma el email al que llegó el enlace.</p>' +
      '<form id="cf" class="field"><label for="cmail">Email</label><input id="cmail" type="email" required autocomplete="email">' +
      '<button class="btn btn-primary" type="submit">Entrar</button></form></section>';
    document.getElementById('cf').onsubmit = function (ev) {
      ev.preventDefault();
      completarEnlace(document.getElementById('cmail').value.trim());
    };
  }

  function completarEnlace(email) {
    auth.signInWithEmailLink(email, location.href).then(function () {
      try { localStorage.removeItem('pa-email'); } catch (e) {}
      history.replaceState(null, '', location.origin + location.pathname);
    }).catch(function (e) {
      history.replaceState(null, '', location.origin + location.pathname);
      pantallaLogin({ t: 'El enlace no es válido o ha caducado. Pide otro (' + e.code + ').' });
    });
  }

  function pantallaNoAutorizado(email) {
    $app.innerHTML =
      '<section class="login"><div class="brand">ProgramApp</div>' +
      '<p>Has entrado como <b>' + esc(email) + '</b>, pero ese email no está dado de alta en la programación.</p>' +
      '<p>Pídele a Gabi que lo añada a la lista de atletas y vuelve a abrir la app.</p>' +
      '<button class="btn" id="salir" type="button">Entrar con otra cuenta</button></section>';
    document.getElementById('salir').onclick = function () { auth.signOut(); };
  }

  // ---------- vista principal ----------
  function render() {
    var d = S.data;
    if (!d) {
      var fallo = S.aviso && !S.cargando;
      $app.innerHTML = '<div class="splash"><div class="brand">ProgramApp</div><div class="' + (fallo ? 'err' : 'hint') + '">' + esc(S.aviso || 'Cargando la semana…') + '</div>' +
        (fallo ? '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn-ghost" id="reint" type="button">Reintentar</button><button class="btn-ghost" id="salir2" type="button">Cerrar sesión</button></div>' : '') + '</div>';
      if (fallo) {
        document.getElementById('reint').onclick = function () { S.aviso = ''; render(); cargar(); };
        document.getElementById('salir2').onclick = function () { auth.signOut(); };
      }
      return;
    }
    if (!d.dias || !d.dias.length) {
      $app.innerHTML = cabecera(d) + '<div class="empty">Gabi todavía no ha publicado esta semana.</div>';
      enlazarCabecera(); return;
    }
    $app.innerHTML = cabecera(d) + ciclo(d) + semana(d) + '<main class="day" id="day">' + dia(d, d.dias[S.dia]) + '</main>' +
      (S.aviso ? '<div class="stale">' + esc(S.aviso) + '</div>' : '');
    enlazarCabecera();
  }

  function cabecera(d) {
    var idx = d.semanas.findIndex(function (s) { return s.nombre === d.semana; });
    var lbl = d.dias && d.dias.length ? 'Semana ' + fechaCorta(d.dias[0].iso) + ' – ' + fechaCorta(d.dias[d.dias.length - 1].iso) : 'Semana ' + d.semana;
    var ini = (S.user.nombre || '?').trim().charAt(0).toUpperCase();
    return '<header class="top"><div class="weeknav">' +
      '<button class="icon-btn" id="prev" type="button" aria-label="Semana anterior"' + (idx <= 0 ? ' disabled' : '') + '>‹</button>' +
      '<span class="lbl">' + esc(lbl) + '</span>' +
      '<button class="icon-btn" id="next" type="button" aria-label="Semana siguiente"' + (idx < 0 || idx >= d.semanas.length - 1 ? ' disabled' : '') + '>›</button>' +
      '</div><button class="who" id="perfil" type="button" aria-label="Mi perfil">' + esc(ini) + '</button></header>';
  }

  function enlazarCabecera() {
    var d = S.data, idx = d.semanas.findIndex(function (s) { return s.nombre === d.semana; });
    var p = document.getElementById('prev'), n = document.getElementById('next');
    if (p) p.onclick = function () { if (idx > 0) { S.aviso = 'Cargando…'; render(); cargar(d.semanas[idx - 1].nombre); } };
    if (n) n.onclick = function () { if (idx < d.semanas.length - 1) { S.aviso = 'Cargando…'; render(); cargar(d.semanas[idx + 1].nombre); } };
    document.getElementById('perfil').onclick = abrirPerfil;
  }

  function ciclo(d) {
    var c = d.ciclo;
    if (!c || !c.fases || !c.fases.length) return '';
    var fases = c.fases.map(function (f, i) {
      var celdas = '';
      for (var k = 1; k <= f.semanas; k++) {
        var cls = i < c.actual ? 'done' : i === c.actual ? (k < c.semana ? 'done' : k === c.semana ? 'now' : '') : '';
        celdas += '<i class="' + cls + '"></i>';
      }
      return '<div class="phase' + (i === c.actual ? ' cur' : '') + '"><div class="bar">' + celdas + '</div><span>' + esc(f.nombre) + '</span></div>';
    }).join('');
    var fa = c.fases[c.actual];
    var linea = fa ? '<div class="cycle-line"><b>' + esc(cap(fa.nombre)) + '</b> · semana ' + c.semana + ' de ' + fa.semanas + '</div>' : '';
    var obj = fa && fa.objetivos ? '<details><summary>Objetivos de la fase</summary><div class="exp-body goals">' + esc(fa.objetivos) + '</div></details>' : '';
    return '<section class="cycle" aria-label="Ciclo">' + '<div class="phases">' + fases + '</div>' + linea + obj + '</section>';
  }
  function cap(s) { s = String(s || '').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }

  function semana(d) {
    return '<nav class="week" aria-label="Días">' + d.dias.map(function (x, i) {
      return '<button class="day-btn" type="button" data-dia="' + i + '" aria-pressed="' + (i === S.dia) + '" style="--c:' + rpeColor(x.rpe) + '">' +
        '<span class="d">' + CORTO_DIA[x.nombre] + '</span><span class="n">' + diaMes(x.iso) + '</span>' +
        (x.rpe ? '<span class="r">' + esc(x.rpe) + '</span>' : '<span class="r" style="visibility:hidden">–</span>') +
        '<span class="dot' + (x.iso === d.hoy ? '' : ' off') + '"></span></button>';
    }).join('') + '</nav>';
  }

  function dia(d, x) {
    var pers = (d.personal && d.personal.porDia && d.personal.porDia[x.iso]) || [];
    var fijas = (d.personal && d.personal.fijas) || [];
    var generales = pers.filter(function (n) { return !n.bloque; });
    var html = '<div class="day-title"><h1>' + NOMBRE_DIA[x.nombre] + ' ' + diaMes(x.iso) + '</h1>' +
      (x.rpe ? '<div class="rpe-pill" style="--c:' + rpeColor(x.rpe) + '"><b>' + esc(x.rpe) + '</b><span>' + (x.rpe === 'Z2' ? 'Recovery' : 'RPE del día') + '</span></div>' : '') + '</div>';
    if (x.foco && x.foco.length) html += '<div class="focus">' + x.foco.map(function (f) { return '<span>' + esc(cap(f)) + '</span>'; }).join('') + '</div>';
    if (generales.length) html += generales.map(notaPersonal).join('');
    if (fijas.length) html += '<details class="foryou fixed"><summary>Tus indicaciones fijas (' + fijas.length + ')</summary><div class="exp-body">' +
      fijas.map(function (n) { return '<div><div class="part-lbl">' + esc(n.tipo) + (n.bloque ? ' · bloque ' + n.bloque : '') + '</div><p style="margin:0;white-space:pre-line">' + esc(n.texto) + '</p></div>'; }).join('') + '</div></details>';
    html += '<div class="blocks">' + x.bloques.map(function (b) { return bloque(b, pers); }).join('') + '</div>';
    if (x.notasDia && x.notasDia.length) html += '<details class="daynotes"><summary>Más notas del coach</summary><div class="exp-body prose">' +
      x.notasDia.map(function (n) { return (n.titulo ? '<div class="part-lbl">' + esc(n.titulo) + '</div>' : '') + prosa(n.texto); }).join('') + '</div></details>';
    return html;
  }

  function notaPersonal(n) {
    return '<div class="foryou' + (n.bloque ? ' inline' : '') + '"><div class="lbl">Para ti · ' + esc(n.tipo) + '</div><p>' + esc(n.texto) + '</p></div>';
  }

  function bloque(b, pers) {
    var todo = b.partes.map(function (p) { return p.etiqueta + '\n' + p.texto; }).join('\n');
    var ctxB = { bloque: levantamiento(b.titulo), desdePower: /DEL POWER SNATCH/.test(norm(todo)) };
    function parte(p) {
      var ctx = { bloque: ctxB.bloque, desdePower: ctxB.desdePower, parte: levantamiento(p.texto) || levantamiento(p.etiqueta) };
      var etq = p.tipo === 'adapt' ? '' : p.etiqueta;
      return '<div class="part">' + (etq ? '<div class="part-lbl">' + esc(etq) + '</div>' : '') +
        (p.texto ? '<div class="board' + (p.tipo !== 'main' ? ' small' : '') + '">' + pizarra(p.texto, ctx) + '</div>' : '') + '</div>';
    }
    var prep = b.partes.filter(function (p) { return p.tipo === 'prep'; });
    var main = b.partes.filter(function (p) { return p.tipo === 'main'; });
    var adapt = b.partes.filter(function (p) { return p.tipo === 'adapt'; });
    var mios = pers.filter(function (n) { return n.bloque === b.n; });

    var notas = '';
    if (b.wod) {
      var campos = [['material', 'Material'], ['carga', 'Carga'], ['intensidad', 'Intensidad'], ['formato', 'Formato'], ['modalidad', 'Modalidad'], ['notas', 'Estrategia'], ['objetivo', 'Objetivo']];
      notas += '<dl class="meta">' + campos.filter(function (c) { return b.wod[c[0]]; }).map(function (c) {
        return '<dt>' + c[1] + '</dt><dd class="prose">' + prosa(b.wod[c[0]]) + '</dd>';
      }).join('') + '</dl>';
    }
    if (b.nota) notas += '<div class="prose">' + prosa(b.nota) + '</div>';

    return '<article class="block">' +
      '<div class="b-head"><span class="b-num">' + (b.n || '•') + '</span><span class="b-title">' + esc(b.titulo) + '</span>' +
      (b.rpe ? '<span class="b-rpe" style="--c:' + rpeColor(b.rpe) + '">RPE ' + esc(b.rpe) + '</span>' : '') + '</div>' +
      mios.map(notaPersonal).join('') +
      (prep.length ? '<details><summary>Calentamiento y activación</summary><div class="exp-body">' + prep.map(parte).join('') + '</div></details>' : '') +
      main.map(parte).join('') +
      (adapt.length ? '<details><summary>Adaptaciones</summary><div class="exp-body">' + adapt.map(parte).join('') + '</div></details>' : '') +
      (notas ? '<details><summary>Notas del coach</summary><div class="exp-body">' + notas + '</div></details>' : '') +
      '</article>';
  }

  // ---------- hojas ----------
  function abrirHoja(html) {
    $scrim.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + '</div>';
    $scrim.hidden = false;
    var f = $scrim.querySelector('input,button'); if (f) f.focus();
  }
  function cerrarHoja() { $scrim.hidden = true; $scrim.innerHTML = ''; }
  $scrim.addEventListener('click', function (e) { if (e.target === $scrim || e.target.closest('[data-close]')) cerrarHoja(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$scrim.hidden) cerrarHoja(); });

  function abrirVideo(i) {
    var v = listaVideos[i]; if (!v) return;
    var id = idVideo(v.url);
    abrirHoja('<div class="row"><h2>' + esc(v.nombre) + '</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div>' +
      (id ? '<div class="player"><iframe src="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&playsinline=1&rel=0&modestbranding=1" title="' + esc(v.nombre) + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>' : '') +
      '<a class="btn" href="' + esc(v.url) + '" target="_blank" rel="noopener">Abrir en YouTube</a>');
  }

  function abrirPerfil() {
    var u = S.user, m = u.marcas || {};
    abrirHoja('<div class="row"><h2>' + esc(u.nombre) + '</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div>' +
      '<div class="hint">' + esc(u.email) + '</div>' +
      '<div><div class="part-lbl">Mis marcas (1RM, kg)</div><div class="hint">Con tus marcas, los porcentajes de Gabi se convierten en kilos.</div></div>' +
      '<form id="marcasf"><div class="marks">' + LEVANTAMIENTOS.map(function (l) {
        var id = 'rm-' + l.replace(/\s/g, '');
        return '<label for="' + id + '">' + cap(l) + '<input id="' + id + '" data-lev="' + l + '" type="number" inputmode="decimal" min="0" step="0.5" value="' + (m[l] || '') + '" placeholder="kg"></label>';
      }).join('') + '</div><div style="height:12px"></div><button class="btn btn-primary" type="submit" id="gm">Guardar marcas</button></form>' +
      '<div id="gmst" class="hint" role="status"></div>' +
      '<button class="btn" type="button" id="logout">Cerrar sesión</button>');
    document.getElementById('marcasf').onsubmit = function (ev) {
      ev.preventDefault();
      var nuevas = {};
      $scrim.querySelectorAll('input[data-lev]').forEach(function (inp) { var n = parseFloat(inp.value); nuevas[inp.dataset.lev] = n > 0 ? n : ''; });
      var btn = document.getElementById('gm'), st = document.getElementById('gmst');
      btn.disabled = true; btn.textContent = 'Guardando…';
      api({ action: 'marcas', marcas: nuevas }).then(function (r) {
        if (!r.ok) throw new Error(r.error);
        var limpio = {}; Object.keys(nuevas).forEach(function (k) { if (nuevas[k]) limpio[k] = nuevas[k]; });
        S.user.marcas = limpio; render();
        btn.disabled = false; btn.textContent = 'Guardar marcas'; st.textContent = 'Marcas guardadas.';
      }).catch(function () { btn.disabled = false; btn.textContent = 'Guardar marcas'; st.textContent = 'No se pudieron guardar. Revisa la conexión.'; });
    };
    document.getElementById('logout').onclick = function () { cerrarHoja(); auth.signOut(); };
  }

  // ---------- eventos ----------
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.day-btn');
    if (b) { S.dia = +b.dataset.dia; render(); window.scrollTo({ top: 0 }); return; }
    var v = e.target.closest('.vid');
    if (v) { e.preventDefault(); abrirVideo(+v.dataset.v); }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && S.user && Date.now() - S.ultimaCarga > 5 * 60 * 1000 && !S.cargando) cargar(S.data && S.data.semana);
  });

  // ---------- arranque ----------
  if (auth.isSignInWithEmailLink(location.href)) {
    var em = leer('pa-email');
    if (em) completarEnlace(em); else pantallaConfirmarEmail();
  }

  auth.onAuthStateChanged(function (u) {
    if (!u) {
      S.user = null; S.data = null;
      if (!auth.isSignInWithEmailLink(location.href)) pantallaLogin();
      return;
    }
    var c = leer('pa-cache-' + String(u.email).toLowerCase());
    if (c && c.data) { S.user = c.user; S.data = c.data; prepararVideos(S.data.videos); S.dia = diaInicial(); S.aviso = 'Actualizando…'; render(); }
    else { S.user = { nombre: u.displayName || u.email, email: u.email, marcas: {} }; render(); }
    cargar();
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
