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
    if (d && !d.valoraciones) d.valoraciones = { leidos: [] };
    // conservar los desplegables abiertos y el scroll al repintar (p. ej. al marcar un RPE)
    var abiertos = [].map.call(document.querySelectorAll('#app details'), function (x) { return x.open; });
    var mismoDia = S._pintado === (d && d.semana) + '|' + S.dia;
    S._pintado = (d && d.semana) + '|' + S.dia;
    setTimeout(function () {
      if (!mismoDia) return;
      [].forEach.call(document.querySelectorAll('#app details'), function (x, i) { if (abiertos[i]) x.open = true; });
    }, 0);
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
      $app.innerHTML = cabecera(d) + '<div class="empty">Gabi todavía no ha publicado la semana.' +
        (d.proxima ? '<br>Próxima publicación: ' + esc(d.proxima) + '.' : '') + '</div>';
      enlazarCabecera(); return;
    }
    var aviso = d.publicada === false ? '<div class="unpub">Vista previa · ' + (d.proxima ? 'se publica el ' + esc(d.proxima) : 'aún sin publicar') + '</div>' : '';
    $app.innerHTML = cabecera(d) + aviso + tarjetaSemana(d) + ciclo(d) + semana(d) + '<main class="day" id="day">' + dia(d, d.dias[S.dia]) + '</main>' +
      (S.aviso ? '<div class="stale">' + esc(S.aviso) + '</div>' : '');
    enlazarCabecera();
    abrirAvisosPendientes(d, d.dias[S.dia]);
  }

  function cabecera(d) {
    var idx = (d.semanas || []).findIndex(function (s) { return s.clave === d.semana; });
    var lbl = d.dias && d.dias.length ? 'Semana ' + fechaCorta(d.dias[0].iso) + ' – ' + fechaCorta(d.dias[d.dias.length - 1].iso) : 'Programación';
    var ini = (S.user.nombre || '?').trim().charAt(0).toUpperCase();
    return '<header class="top"><div class="weeknav">' +
      '<button class="icon-btn" id="prev" type="button" aria-label="Semana anterior"' + (idx <= 0 ? ' disabled' : '') + '>‹</button>' +
      '<span class="lbl">' + esc(lbl) + '</span>' +
      '<button class="icon-btn" id="next" type="button" aria-label="Semana siguiente"' + (idx < 0 || idx >= d.semanas.length - 1 ? ' disabled' : '') + '>›</button>' +
      '</div><button class="who" id="perfil" type="button" aria-label="Mi perfil">' + esc(ini) + '</button></header>';
  }

  function enlazarCabecera() {
    var d = S.data, sems = d.semanas || [], idx = sems.findIndex(function (s) { return s.clave === d.semana; });
    var p = document.getElementById('prev'), n = document.getElementById('next');
    if (p) p.onclick = function () { if (idx > 0) { S.aviso = 'Cargando…'; render(); cargar(sems[idx - 1].clave); } };
    if (n) n.onclick = function () { if (idx < sems.length - 1) { S.aviso = 'Cargando…'; render(); cargar(sems[idx + 1].clave); } };
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
    var generales = pers.filter(function (n) { return !n.bloque && !n.clave; });
    var html = '<div class="day-title"><h1>' + NOMBRE_DIA[x.nombre] + ' ' + diaMes(x.iso) + '</h1>' +
      (x.rpe ? '<div class="rpe-pill" style="--c:' + rpeColor(x.rpe) + '"><b>' + esc(x.rpe) + '</b><span>' + (x.rpe === 'Z2' ? 'Recovery' : 'RPE del día') + '</span></div>' : '') + '</div>';
    if (x.foco && x.foco.length) html += '<div class="focus">' + x.foco.map(function (f) { return '<span>' + esc(cap(f)) + '</span>'; }).join('') + '</div>';
    html += ((d.avisos && d.avisos[x.iso]) || []).map(function (a) {
      return '<button class="notice" type="button" data-aviso="' + esc(a.id) + '"><span class="lbl">Aviso</span><b>' + esc(a.titulo) + '</b>' +
        (a.mensaje ? '<span class="txt">' + esc(a.mensaje) + '</span>' : '') + '</button>';
    }).join('');
    if (generales.length) html += generales.map(notaPersonal).join('');
    if (fijas.length) html += '<details class="foryou fixed"><summary>Tus indicaciones fijas (' + fijas.length + ')</summary><div class="exp-body">' +
      fijas.map(function (n) { return '<div><div class="part-lbl">' + esc(n.tipo) + (n.bloque ? ' · bloque ' + n.bloque : '') + '</div><p style="margin:0;white-space:pre-line">' + esc(n.texto) + '</p></div>'; }).join('') + '</div></details>';
    html += '<div class="blocks">' + x.bloques.map(function (b) { return bloque(b, pers, x, d); }).join('') + '</div>';
    if (x.notasDia && x.notasDia.length) html += '<details class="daynotes"><summary>Más notas del coach</summary><div class="exp-body prose">' +
      x.notasDia.map(function (n) { return (n.titulo ? '<div class="part-lbl">' + esc(n.titulo) + '</div>' : '') + prosa(n.texto); }).join('') + '</div></details>';
    html += tarjetaSesion(d, x);
    return html;
  }

  function notaPersonal(n) {
    var alc = n.alcance === 'SEMANA' ? ' · toda la semana' : n.alcance === 'PERMANENTE' ? ' · siempre' : '';
    return '<div class="foryou' + (n.bloque || n.clave ? ' inline' : '') + '"><div class="lbl">Para ti · ' + esc(n.tipo) + alc + '</div><p>' + esc(n.texto) + '</p></div>';
  }

  function bloque(b, pers, x, d) {
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
    var mios = pers.filter(function (n) {
      if (n.bloque) return n.bloque === b.n;
      return n.clave ? norm(b.titulo).indexOf(norm(n.clave)) >= 0 : false; // palabra clave: en el título del bloque
    });

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
      (x && x.iso <= d.hoy && b.n ? '<div class="rate"><span class="rate-lbl">Tu RPE</span>' +
        chips({ tipo: 'bloque', dia: x.iso, bloque: b.n, etiqueta: b.n + ' · ' + b.titulo }, valorDe(d, x.iso + '|Bloque|' + b.n)) + '</div>' : '') +
      '</article>';
  }


  // ---------- valoraciones (RPE) ----------
  function valorDe(d, k) { return (d.valoraciones && d.valoraciones[k]) || null; }
  function claveVal(o) {
    if (o.tipo === 'semana') return o.lunes + '|Semana|';
    return o.dia + '|' + (o.tipo === 'bloque' ? 'Bloque' : 'Sesión') + '|' + (o.tipo === 'bloque' ? o.bloque : '');
  }
  function chips(o, actual) {
    var datos = ' data-o="' + esc(JSON.stringify(o)) + '"';
    var h = '<div class="chips" role="group" aria-label="RPE del 1 al 10">';
    for (var i = 1; i <= 10; i++) {
      var sel = actual && Number(actual.v) === i;
      h += '<button type="button" class="rpe-chip' + (sel ? ' on' : '') + '" style="--c:' + rpeColor(String(i)) + '" data-v="' + i + '"' + datos +
        ' aria-pressed="' + sel + '">' + i + '</button>';
    }
    return h + '</div>';
  }
  function tarjetaSesion(d, x) {
    if (x.iso > d.hoy) return '';
    var o = { tipo: 'sesion', dia: x.iso }, val = valorDe(d, claveVal(o));
    return '<section class="rate-card"><div class="rate-title">¿Cómo ha ido la sesión?</div>' +
      '<div class="hint">RPE de toda la sesión · 1 muy fácil · 10 esfuerzo máximo</div>' + chips(o, val) +
      '<textarea id="com-ses" rows="2" maxlength="500" placeholder="Comentario para Gabi (opcional)">' + esc(val && val.c || '') + '</textarea>' +
      '<button class="btn" type="button" data-guardar-com="sesion">' + (val ? 'Guardar comentario' : 'Guardar') + '</button></section>';
  }
  function tarjetaSemana(d) {
    if (!d.semanaValorable || !d.dias || !d.dias.length) return '';
    var val = valorDe(d, d.dias[0].iso + '|Semana|');
    return '<button class="week-rate' + (val ? ' done' : '') + '" type="button" id="valsem">' +
      (val ? 'Semana valorada · RPE ' + esc(val.v) + ' · cambiar' : 'Valora tu semana · RPE global') + '</button>';
  }
  function abrirValorarSemana() {
    var d = S.data, o = { tipo: 'semana', lunes: d.dias[0].iso }, val = valorDe(d, claveVal(o));
    abrirHoja('<div class="row"><h2>Tu semana</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div>' +
      '<div class="hint">RPE global de la semana del ' + fechaCorta(d.dias[0].iso) + ' · 1 muy fácil · 10 esfuerzo máximo</div>' + chips(o, val) +
      '<textarea id="com-sem" rows="3" maxlength="500" placeholder="¿Cómo te has sentido? (opcional)">' + esc(val && val.c || '') + '</textarea>' +
      '<button class="btn btn-primary" type="button" data-guardar-com="semana">Guardar</button>');
  }
  function guardarVal(o, valor, comentario) {
    var d = S.data, k = claveVal(o), antes = d.valoraciones[k];
    if (valor == null && !antes) { toast('Elige primero un número del 1 al 10.'); return; }
    var nuevo = { v: valor != null ? valor : antes.v, c: comentario != null ? comentario : (antes && antes.c) || '' };
    d.valoraciones[k] = nuevo;
    render(); refrescarHoja(o);
    var cuerpo = Object.assign({ action: 'valorar', valor: nuevo.v, comentario: nuevo.c }, o);
    api(cuerpo).then(function (r) {
      if (!r.ok) throw new Error(r.detalle || r.error);
      toast(o.tipo === 'bloque' ? 'RPE guardado' : 'Guardado');
    }).catch(function (e) {
      if (antes) d.valoraciones[k] = antes; else delete d.valoraciones[k];
      render(); refrescarHoja(o); toast(mensajeError(e.message));
    });
  }
  function refrescarHoja(o) { if (o.tipo === 'semana' && !$scrim.hidden) { var c = document.getElementById('com-sem'); var t = c ? c.value : null; abrirValorarSemana(); if (t != null) document.getElementById('com-sem').value = t; } }
  function mensajeError(m) {
    return { dia_futuro: 'Solo se pueden valorar el día de hoy y los anteriores.', fuera_de_plazo: 'La valoración de la semana se abre el sábado a las 12:00 y cierra el martes a las 23:59.',
      solo_staff: 'Solo Coach y Admin pueden hacer esto.', fecha_no_valida: 'Revisa la fecha.', aviso_vacio: 'Escribe un título o un mensaje.' }[m] || 'No se pudo guardar. Revisa la conexión.';
  }

  // ---------- avisos ----------
  function avisoLeido(id) { return (S.data.valoraciones && (S.data.valoraciones.leidos || []).indexOf(id) >= 0) || leer('pa-leido-' + id); }
  function abrirAvisosPendientes(d, x) {
    if (!$scrim.hidden || !x || !d.avisos) return;
    var pend = (d.avisos[x.iso] || []).filter(function (a) { return !avisoLeido(a.id); });
    if (pend.length) mostrarAviso(pend[0], x.iso);
  }
  function mostrarAviso(a, iso) {
    abrirHoja('<div class="notice-modal"><div class="lbl">Aviso · ' + esc(NOMBRE_DIA[S.data.dias[S.dia].nombre]) + ' ' + diaMes(iso) + '</div>' +
      '<h2>' + esc(a.titulo) + '</h2>' + (a.mensaje ? '<p>' + esc(a.mensaje) + '</p>' : '') + '</div>' +
      '<button class="btn btn-primary" type="button" data-close>Entendido</button>');
    if (!avisoLeido(a.id)) {
      guardar('pa-leido-' + a.id, true);
      (S.data.valoraciones.leidos = S.data.valoraciones.leidos || []).push(a.id);
      api({ action: 'valorar', tipo: 'leido', dia: iso, avisoId: a.id, etiqueta: a.titulo }).catch(function () {});
    }
  }

  // ---------- avisos: crear y retirar (Coach / Admin) ----------
  function abrirGestionAvisos(lista) {
    var d = S.data, hoyDia = d.dias && d.dias[S.dia] ? d.dias[S.dia].iso : d.hoy;
    var opts = ['Todos', 'Box', 'Individual', 'Otro', 'Coach'].map(function (g) { return '<option>' + g + '</option>'; }).join('') +
      ((d.atletas || []).length ? '<optgroup label="Un atleta">' + d.atletas.map(function (a) {
        return '<option value="' + esc(a.email) + '">' + esc(a.nombre) + (a.grupo ? ' · ' + esc(a.grupo) : '') + '</option>'; }).join('') + '</optgroup>' : '');
    abrirHoja('<div class="row"><h2>Avisos</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div>' +
      '<form id="avf" class="avf">' +
      '<label for="av-para">Para</label><select id="av-para">' + opts + '</select>' +
      '<div class="two"><div><label for="av-desde">Desde</label><input id="av-desde" type="date" required value="' + hoyDia + '"></div>' +
      '<div><label for="av-hasta">Hasta (opcional)</label><input id="av-hasta" type="date"></div></div>' +
      '<label for="av-tit">Título</label><input id="av-tit" maxlength="80" placeholder="Ej. Box cerrado por la tarde">' +
      '<label for="av-msg">Mensaje</label><textarea id="av-msg" rows="3" maxlength="1000" placeholder="Lo que verán los atletas al abrir ese día"></textarea>' +
      '<button class="btn btn-primary" type="submit" id="av-env">Enviar aviso</button></form>' +
      '<div class="part-lbl">Avisos activos</div><div id="av-lista" class="av-lista">' + (lista ? listaAvisosHtml(lista) : '<div class="hint">Cargando…</div>') + '</div>');
    document.getElementById('avf').onsubmit = function (ev) {
      ev.preventDefault();
      var btn = document.getElementById('av-env'); btn.disabled = true; btn.textContent = 'Enviando…';
      api({ action: 'aviso_crear', aviso: { para: val('av-para'), desde: val('av-desde'), hasta: val('av-hasta'), titulo: val('av-tit'), mensaje: val('av-msg') } })
        .then(function (r) {
          if (!r.ok) throw new Error(r.detalle || r.error);
          toast('Aviso enviado'); abrirGestionAvisos(r.avisos); cargar(S.data.semana);
        }).catch(function (e) { btn.disabled = false; btn.textContent = 'Enviar aviso'; toast(mensajeError(e.message)); });
    };
    if (!lista) api({ action: 'avisos_lista' }).then(function (r) { var el = document.getElementById('av-lista'); if (el && r.ok) el.innerHTML = listaAvisosHtml(r.avisos); });
  }
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function listaAvisosHtml(lista) {
    if (!lista.length) return '<div class="hint">No hay avisos activos de hoy en adelante.</div>';
    return lista.map(function (a) {
      var nom = a.para.indexOf('@') >= 0 ? ((S.data.atletas || []).filter(function (x) { return x.email === a.para.toLowerCase(); })[0] || {}).nombre || a.para : a.para;
      return '<div class="av-item"><div><b>' + esc(a.titulo) + '</b><div class="hint">' + fechaCorta(a.desde) + (a.hasta && a.hasta !== a.desde ? ' – ' + fechaCorta(a.hasta) : '') +
        ' · ' + esc(nom) + (a.por ? ' · ' + esc(a.por) : '') + '</div></div><button class="btn-ghost" type="button" data-retirar="' + esc(a.id) + '">Retirar</button></div>';
    }).join('');
  }

  // ---------- aviso breve en pantalla ----------
  var tToast = null;
  function toast(t) {
    var el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = t; el.classList.add('show');
    clearTimeout(tToast); tToast = setTimeout(function () { el.classList.remove('show'); }, 2600);
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
      (S.data && S.data.staff ? '<div><div class="part-lbl">Coach</div><div class="hint">Mensajes que verán los atletas al abrir un día.</div></div>' +
        '<button class="btn" type="button" id="gestav">Enviar o retirar avisos</button>' : '') +
      '<button class="btn" type="button" id="logout">Cerrar sesión</button>');
    var ga = document.getElementById('gestav'); if (ga) ga.onclick = function () { abrirGestionAvisos(null); };
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
    if (v) { e.preventDefault(); abrirVideo(+v.dataset.v); return; }
    var c = e.target.closest('.rpe-chip');
    if (c) {
      var o = JSON.parse(c.dataset.o), com = null;
      if (o.tipo === 'sesion') { var ts = document.getElementById('com-ses'); com = ts ? ts.value.trim() : null; }
      if (o.tipo === 'semana') { var tw = document.getElementById('com-sem'); com = tw ? tw.value.trim() : null; }
      guardarVal(o, +c.dataset.v, com); return;
    }
    var g = e.target.closest('[data-guardar-com]');
    if (g) {
      var t = g.dataset.guardarCom, dd = S.data;
      if (t === 'sesion') guardarVal({ tipo: 'sesion', dia: dd.dias[S.dia].iso }, null, document.getElementById('com-ses').value.trim());
      else { guardarVal({ tipo: 'semana', lunes: dd.dias[0].iso }, null, document.getElementById('com-sem').value.trim()); }
      if (t === 'semana' && dd.valoraciones[dd.dias[0].iso + '|Semana|']) cerrarHoja();
      return;
    }
    if (e.target.closest('#valsem')) { abrirValorarSemana(); return; }
    var n = e.target.closest('[data-aviso]');
    if (n) {
      var a = ((S.data.avisos || {})[S.data.dias[S.dia].iso] || []).filter(function (x) { return x.id === n.dataset.aviso; })[0];
      if (a) mostrarAviso(a, S.data.dias[S.dia].iso); return;
    }
    var rt = e.target.closest('[data-retirar]');
    if (rt) {
      if (rt.dataset.confirmar !== '1') { rt.dataset.confirmar = '1'; rt.textContent = '¿Seguro?'; return; }
      rt.disabled = true;
      api({ action: 'aviso_off', id: rt.dataset.retirar }).then(function (r) {
        if (!r.ok) throw new Error(r.detalle || r.error);
        document.getElementById('av-lista').innerHTML = listaAvisosHtml(r.avisos); toast('Aviso retirado'); cargar(S.data.semana);
      }).catch(function (er) { rt.disabled = false; toast(mensajeError(er.message)); });
    }
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
