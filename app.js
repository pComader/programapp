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
        if (res.error === 'no_autorizado') return pantallaSolicitud(res.email, res.solicitud);
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
      (CFG.microsoft ? '<button class="btn" id="msbtn" type="button">Entrar con Microsoft (Outlook, Hotmail)</button>' : '') +
      '<div class="or">o con cualquier correo (Outlook, Hotmail, iCloud…)</div>' +
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
    if (CFG.microsoft) document.getElementById('msbtn').onclick = function () {
      var p = new firebase.auth.OAuthProvider('microsoft.com');
      p.setCustomParameters({ prompt: 'select_account' });
      auth.signInWithPopup(p).catch(function (e) {
        if (e.code === 'auth/popup-blocked') return auth.signInWithRedirect(p);
        if (e.code === 'auth/account-exists-with-different-credential') return pantallaLogin({ t: 'Ese correo ya entró antes con otro método (Google o enlace). Usa ese mismo método.' });
        if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') pantallaLogin({ t: 'No se pudo entrar con Microsoft (' + e.code + ').' });
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

  // ---------- vista principal ----------
  function render() {
    var d = S.data;
    if (d && !d.valoraciones) d.valoraciones = { leidos: [] };
    // conservar los desplegables abiertos y el scroll al repintar (p. ej. al marcar un RPE)
    var abiertos = [].map.call(document.querySelectorAll('#app details'), function (x) { return x.open; });
    var claveP = (S.vista || 'semana') + '|' + (d && d.semana) + '|' + S.dia;
    var mismoDia = S._pintado === claveP && !S._abrir;
    S._pintado = claveP;
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
    if (S.vista === 'ajustes') return renderAjustes();
    if (S.vista === 'ficha') return renderFicha();
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
    document.getElementById('perfil').onclick = abrirAjustes;
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
    html += htmlRecsDia(d, x);
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
      solo_staff: 'Solo Coach y Admin pueden hacer esto.', falta_nombre: 'Escribe tu nombre y apellidos.', falta_marca: 'Pon un nombre a la marca.',
      valor_no_valido: 'Revisa el valor (tiempo como mm:ss, por ejemplo 4:35).', tipo_no_valido: 'Elige un tipo válido.', falta_ejercicio: 'Escribe el ejercicio.',
      video_no_valido: 'El vídeo tiene que ser un enlace de YouTube.', atleta_no_encontrado: 'No encuentro a ese atleta.', solicitud_no_encontrada: 'Esa solicitud ya estaba resuelta.', fecha_no_valida: 'Revisa la fecha.', aviso_vacio: 'Escribe un título o un mensaje.' }[m] || 'No se pudo guardar. Revisa la conexión.';
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
  function abrirGestionAvisos(lista, atletaPre) {
    var d = S.data, hoyDia = d.dias && d.dias[S.dia] ? d.dias[S.dia].iso : d.hoy;
    S._avAtleta = atletaPre || null;
    var opts = ['Todos', 'Box', 'Individual', 'Otro', 'Coach'].map(function (g) { return '<option value="' + g + '">' + g + '</option>'; }).join('') +
      '<option value="__uno"' + (atletaPre ? ' selected' : '') + '>Un atleta concreto…</option>';
    abrirHoja('<div class="row"><h2>Avisos</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div>' +
      '<form id="avf" class="avf">' +
      '<label for="av-para">Para</label><select id="av-para">' + opts + '</select>' +
      '<div id="av-elegido"></div><div id="av-pick" hidden></div>' +
      '<div class="two"><div><label for="av-desde">Desde</label><input id="av-desde" type="date" required value="' + hoyDia + '"></div>' +
      '<div><label for="av-hasta">Hasta (opcional)</label><input id="av-hasta" type="date"></div></div>' +
      '<label for="av-tit">Título</label><input id="av-tit" maxlength="80" placeholder="Ej. Box cerrado por la tarde">' +
      '<label for="av-msg">Mensaje</label><textarea id="av-msg" rows="3" maxlength="1000" placeholder="Lo que verán al abrir ese día"></textarea>' +
      '<button class="btn btn-primary" type="submit" id="av-env">Enviar aviso</button></form>' +
      '<div class="part-lbl">Avisos activos</div><div id="av-lista" class="av-lista">' + (lista ? listaAvisosHtml(lista) : '<div class="hint">Cargando…</div>') + '</div>');
    var sel = document.getElementById('av-para');
    function pintarElegido() {
      var el = document.getElementById('av-elegido'), pick = document.getElementById('av-pick');
      if (sel.value !== '__uno') { el.innerHTML = ''; pick.hidden = true; return; }
      if (S._avAtleta) {
        pick.hidden = true;
        el.innerHTML = '<div class="chosen"><div><b>' + esc(S._avAtleta.nombre) + '</b><div class="hint">' + esc(S._avAtleta.email) + '</div></div><button type="button" class="btn-ghost" id="av-cambiar">Cambiar</button></div>';
        document.getElementById('av-cambiar').onclick = function () { S._avAtleta = null; pintarElegido(); };
      } else {
        el.innerHTML = ''; pick.hidden = false;
        buscadorAtletas('av-pick', function (a) { S._avAtleta = a; pintarElegido(); }, { soloActivos: true });
      }
    }
    sel.onchange = pintarElegido; pintarElegido();
    document.getElementById('avf').onsubmit = function (ev) {
      ev.preventDefault();
      if (sel.value === '__uno' && !S._avAtleta) { toast('Elige y confirma el atleta.'); return; }
      var para = sel.value === '__uno' ? S._avAtleta.email : sel.value;
      var btn = document.getElementById('av-env'); btn.disabled = true; btn.textContent = 'Enviando…';
      api({ action: 'aviso_crear', aviso: { para: para, desde: val('av-desde'), hasta: val('av-hasta'), titulo: val('av-tit'), mensaje: val('av-msg') } })
        .then(function (r) {
          if (!r.ok) throw new Error(r.detalle || r.error);
          toast('Aviso enviado'); abrirGestionAvisos(r.avisos); if (!S.vista) cargar(S.data.semana);
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


  // =====================================================================
  //  AJUSTES · tema, marcas, avisos, notas, recomendaciones, instalar, coach
  // =====================================================================
  var TEMAS = { auto: 'Automático', claro: 'Claro', oscuro: 'Oscuro' };
  function aplicarTema(t) {
    var r = document.documentElement;
    if (t === 'claro') r.setAttribute('data-theme', 'light');
    else if (t === 'oscuro') r.setAttribute('data-theme', 'dark');
    else r.removeAttribute('data-theme');
  }
  aplicarTema(leer('pa-tema') || 'auto');

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.instalar = e; });

  function abrirAjustes() { cerrarHoja(); S.vista = 'ajustes'; render(); window.scrollTo({ top: 0 }); }
  function volverSemana() { S.vista = null; S.ficha = null; render(); window.scrollTo({ top: 0 }); }

  function cabeceraVista(titulo, atras) {
    return '<header class="top"><button class="btn-ghost" type="button" id="atras">‹ ' + esc(atras) + '</button>' +
      '<span class="view-title">' + esc(titulo) + '</span></header>';
  }

  function seccion(id, titulo, cuerpo, extra) {
    return '<details class="set" id="' + id + '"><summary>' + esc(titulo) + (extra ? ' <span class="badge">' + esc(extra) + '</span>' : '') + '</summary>' +
      '<div class="set-body">' + cuerpo + '</div></details>';
  }

  function renderAjustes() {
    var d = S.data || {}, u = S.user || {};
    var tema = leer('pa-tema') || 'auto';
    var html = cabeceraVista('Ajustes', 'Semana') +
      '<section class="me"><div class="who big">' + esc((u.nombre || '?').charAt(0).toUpperCase()) + '</div><div><b>' + esc(u.nombre) + '</b>' +
      '<div class="hint">' + esc(u.email) + (u.grupo ? ' · ' + esc(u.grupo) : '') + '</div></div></section>';

    html += seccion('s-tema', 'Apariencia', '<div class="seg" role="group" aria-label="Tema">' + Object.keys(TEMAS).map(function (k) {
      return '<button type="button" data-tema="' + k + '" aria-pressed="' + (tema === k) + '">' + TEMAS[k] + '</button>'; }).join('') + '</div>' +
      '<div class="hint">Automático sigue el modo claro u oscuro de tu móvil u ordenador.</div>');

    html += seccion('s-marcas', 'Mis marcas', htmlMarcas(d));
    html += seccion('s-avisos', 'Avisos de la semana', htmlAvisosSemana(d), contar(d.avisos));
    html += seccion('s-notas', 'Mis notas del coach', htmlNotasSemana(d));
    var activas = (d.recomendaciones || []).filter(function (r) { return r.estado === 'Activa'; });
    html += seccion('s-recs', 'Mis ejercicios recomendados', htmlRecsAtleta(d.recomendaciones || []), activas.length ? String(activas.length) : '');
    html += seccion('s-instalar', 'Instalar la app', htmlInstalar());
    if (d.staff) html += seccion('s-coach', 'Coach', htmlCoach(d), d.solicitudesPendientes ? d.solicitudesPendientes + ' solicitud' + (d.solicitudesPendientes > 1 ? 'es' : '') : '');
    html += '<button class="btn" type="button" id="logout">Cerrar sesión</button>';
    $app.innerHTML = html;
    document.getElementById('atras').onclick = volverSemana;
    document.getElementById('logout').onclick = function () { S.vista = null; auth.signOut(); };
    enlazarMarcas();
    var ab = S._abrir; S._abrir = null; if (ab && document.getElementById(ab)) document.getElementById(ab).open = true;
  }

  function contar(porDia) {
    var n = 0, vistos = {};
    Object.keys(porDia || {}).forEach(function (k) { porDia[k].forEach(function (a) { if (!vistos[a.id]) { vistos[a.id] = 1; n++; } }); });
    return n ? String(n) : '';
  }

  // ---------- Mis marcas ----------
  function htmlMarcas(d) {
    var m = (S.user && S.user.marcas) || {};
    var otras = agruparMarcas((d.misMarcas || []).filter(function (x) { return LEVANTAMIENTOS.indexOf(x.marca) < 0; }));
    var nombres = Object.keys(otras);
    return '<div class="part-lbl">Repeticiones máximas (1RM, kg)</div><div class="hint">Con tus 1RM, los porcentajes de Gabi se convierten en kilos.</div>' +
      '<form id="marcasf"><div class="marks">' + LEVANTAMIENTOS.map(function (l) {
        var id = 'rm-' + l.replace(/\s/g, '');
        return '<label for="' + id + '">' + cap(l) + '<input id="' + id + '" data-lev="' + l + '" type="number" inputmode="decimal" min="0" step="0.5" value="' + (m[l] || '') + '" placeholder="kg"></label>';
      }).join('') + '</div><button class="btn btn-primary" type="submit" id="gm">Guardar 1RM</button></form>' +
      '<div class="part-lbl" style="margin-top:8px">Otras marcas</div>' +
      (nombres.length ? '<div class="pr-list">' + nombres.map(function (n) {
        var g = otras[n];
        return '<details class="pr"><summary><b>' + esc(cap(n)) + '</b><span class="pr-best">' + esc(fmtMarca(g.mejor)) + '</span></summary>' +
          '<div class="pr-hist">' + g.lista.map(function (x) {
            return '<div class="pr-row"><span>' + fechaCorta(x.fecha) + '</span><b>' + esc(fmtMarca(x)) + '</b>' + (x.notas ? '<span class="hint">' + esc(x.notas) + '</span>' : '') +
              '<button type="button" class="x" data-borrar-marca="' + esc(JSON.stringify({ fecha: x.fecha, marca: x.marca, valor: x.valor })) + '" aria-label="Borrar">×</button></div>';
          }).join('') + '</div></details>';
      }).join('') + '</div>' : '<div class="hint">Aún no tienes marcas personalizadas (Fran, 2K row, max HSPU…).</div>') +
      '<form id="prf" class="prf"><datalist id="pr-nombres">' + nombres.map(function (n) { return '<option value="' + esc(cap(n)) + '">'; }).join('') + '</datalist>' +
      '<label for="pr-n">Nueva marca</label><input id="pr-n" list="pr-nombres" maxlength="60" placeholder="Ej. Fran, 2K row, Max HSPU" required>' +
      '<div class="three"><div><label for="pr-t">Tipo</label><select id="pr-t"><option>Kilos</option><option>Tiempo</option><option>Calorías</option><option>Reps</option></select></div>' +
      '<div><label for="pr-v">Valor</label><input id="pr-v" required placeholder="kg"></div>' +
      '<div><label for="pr-f">Fecha</label><input id="pr-f" type="date" value="' + (d.hoy || '') + '" max="' + (d.hoy || '') + '"></div></div>' +
      '<input id="pr-nt" maxlength="200" placeholder="Nota (opcional)">' +
      '<button class="btn" type="submit" id="pr-ok">Añadir marca</button></form>';
  }
  function agruparMarcas(lista) {
    var g = {};
    lista.forEach(function (x) {
      var k = x.marca.toUpperCase();
      var e = g[k] = g[k] || { lista: [], mejor: null };
      e.lista.push(x);
      if (!e.mejor || mejorQue(x, e.mejor)) e.mejor = x;
    });
    return g;
  }
  function valorNum(x) { if (x.tipo === 'Tiempo') { var p = String(x.valor).split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); } return parseFloat(x.valor); }
  function mejorQue(a, b) { return a.tipo === 'Tiempo' ? valorNum(a) < valorNum(b) : valorNum(a) > valorNum(b); }
  function fmtMarca(x) { if (!x) return ''; var u = { Kilos: ' kg', Calorías: ' cal', Reps: ' reps', Tiempo: '' }[x.tipo] || ''; return x.valor + u; }

  function enlazarMarcas() {
    var f = document.getElementById('marcasf');
    if (f) f.onsubmit = function (ev) {
      ev.preventDefault();
      var nuevas = {};
      f.querySelectorAll('input[data-lev]').forEach(function (inp) { var n = parseFloat(inp.value); nuevas[inp.dataset.lev] = n > 0 ? n : ''; });
      var btn = document.getElementById('gm'); btn.disabled = true; btn.textContent = 'Guardando…';
      api({ action: 'marcas', marcas: nuevas }).then(function (r) {
        if (!r.ok) throw new Error(r.detalle || r.error);
        var limpio = {}; Object.keys(nuevas).forEach(function (k) { if (nuevas[k]) limpio[k] = nuevas[k]; });
        S.user.marcas = limpio; toast('1RM guardados'); recargarDatos('s-marcas');
      }).catch(function (e) { btn.disabled = false; btn.textContent = 'Guardar 1RM'; toast(mensajeError(e.message)); });
    };
    var t = document.getElementById('pr-t'), v = document.getElementById('pr-v');
    if (t) t.onchange = function () { v.placeholder = { Kilos: 'kg', Tiempo: 'mm:ss', Calorías: 'cal', Reps: 'reps' }[t.value]; v.inputMode = t.value === 'Tiempo' ? 'text' : 'decimal'; };
    var pf = document.getElementById('prf');
    if (pf) pf.onsubmit = function (ev) {
      ev.preventDefault();
      var b = document.getElementById('pr-ok'); b.disabled = true; b.textContent = 'Guardando…';
      api({ action: 'marca', marca: { marca: val('pr-n'), tipo: t.value, valor: val('pr-v'), fecha: val('pr-f'), notas: val('pr-nt') } }).then(function (r) {
        if (!r.ok) throw new Error(r.detalle || r.error);
        S.data.misMarcas = r.marcas; toast('Marca añadida'); S._abrir = 's-marcas'; render();
      }).catch(function (e) { b.disabled = false; b.textContent = 'Añadir marca'; toast(mensajeError(e.message)); });
    };
  }

  function recargarDatos(abrir) {
    S._abrir = abrir;
    api({ action: 'semana', semana: S.data && S.data.semana }).then(function (res) {
      if (res.ok) { S.user = res.user; S.data = res.data; prepararVideos(S.data.videos); }
      S._abrir = abrir; render();
    }).catch(function () { S._abrir = abrir; render(); });
  }

  // ---------- Avisos y notas de la semana ----------
  function diasSemana(d) { return d.dias || []; }
  function htmlAvisosSemana(d) {
    var filas = diasSemana(d).map(function (x) {
      var av = (d.avisos && d.avisos[x.iso]) || [];
      if (!av.length) return '';
      return '<div class="wk-day"><div class="part-lbl">' + NOMBRE_DIA[x.nombre] + ' ' + diaMes(x.iso) + '</div>' + av.map(function (a) {
        var leido = (d.valoraciones && (d.valoraciones.leidos || []).indexOf(a.id) >= 0);
        return '<div class="wk-item"><b>' + esc(a.titulo) + '</b>' + (leido ? ' <span class="hint">· leído</span>' : '') + (a.mensaje ? '<p>' + esc(a.mensaje) + '</p>' : '') + '</div>';
      }).join('') + '</div>';
    }).join('');
    return filas || '<div class="hint">No hay avisos esta semana.</div>';
  }
  function htmlNotasSemana(d) {
    var p = d.personal || { fijas: [], porDia: {} };
    var filas = diasSemana(d).map(function (x) {
      var notas = (p.porDia && p.porDia[x.iso]) || [];
      if (!notas.length) return '';
      return '<div class="wk-day"><div class="part-lbl">' + NOMBRE_DIA[x.nombre] + ' ' + diaMes(x.iso) + '</div>' + notas.map(function (n) {
        var donde = n.bloque ? 'Bloque ' + n.bloque : n.clave ? 'Bloques de ' + n.clave : 'Todo el día';
        return '<div class="wk-item"><span class="hint">' + esc(n.tipo) + ' · ' + esc(donde) + (n.alcance === 'SEMANA' ? ' · toda la semana' : '') + '</span><p>' + esc(n.texto) + '</p></div>';
      }).join('') + '</div>';
    }).join('');
    var fijas = (p.fijas || []).length ? '<div class="wk-day"><div class="part-lbl">Siempre</div>' + p.fijas.map(function (n) {
      return '<div class="wk-item"><span class="hint">' + esc(n.tipo) + '</span><p>' + esc(n.texto) + '</p></div>'; }).join('') + '</div>' : '';
    return (filas + fijas) || '<div class="hint">Gabi no te ha dejado notas personales esta semana.</div>';
  }

  // ---------- Recomendaciones (vista atleta) ----------
  function recItem(r, coach) {
    var meta = [r.tipo, r.zona].filter(Boolean).join(' · ');
    var cuando = r.desde ? (r.fin ? fechaCorta(r.desde) + ' – ' + fechaCorta(r.fin) : 'desde ' + fechaCorta(r.desde)) : '';
    var cuenta = r.tipo === 'Competición' && r.objetivo ? ' · ' + diasHasta(r.objetivo) : '';
    return '<div class="rec' + (r.tipo === 'Competición' ? ' comp' : '') + '"><div class="rec-head"><b>' + esc(r.ejercicio) + '</b><span class="chip">' + esc(meta) + '</span></div>' +
      (r.dosis ? '<div class="rec-dosis">' + esc(r.dosis) + '</div>' : '') +
      (r.notas ? '<div class="hint">' + esc(r.notas) + '</div>' : '') +
      '<div class="rec-foot"><span class="hint">' + esc(cuando + cuenta) + (r.por ? ' · ' + esc(r.por) : '') + '</span>' +
      (r.video ? '<button type="button" class="btn-ghost" data-video-url="' + esc(r.video) + '" data-video-nombre="' + esc(r.ejercicio) + '">▶ Vídeo</button>' : '') +
      (coach && r.estado === 'Activa' ? '<button type="button" class="btn-ghost" data-finalizar="' + esc(r.id) + '">Finalizar</button>' : '') + '</div></div>';
  }
  function diasHasta(iso) {
    var n = Math.round((Date.parse(iso) - Date.parse(S.data.hoy)) / 864e5);
    return n > 1 ? 'faltan ' + n + ' días' : n === 1 ? 'mañana' : n === 0 ? 'hoy' : 'pasada';
  }
  function htmlRecsAtleta(recs, coach) {
    var act = recs.filter(function (r) { return r.estado === 'Activa'; });
    var fin = recs.filter(function (r) { return r.estado !== 'Activa'; });
    var porZona = {};
    act.forEach(function (r) { (porZona[r.zona] = porZona[r.zona] || []).push(r); });
    return (act.length ? Object.keys(porZona).map(function (z) {
      return '<div class="part-lbl">' + esc(z) + '</div>' + porZona[z].map(function (r) { return recItem(r, coach); }).join('');
    }).join('') : '<div class="hint">No hay ejercicios recomendados activos.</div>') +
      (fin.length ? '<details class="hist"><summary>Historial (' + fin.length + ')</summary><div class="exp-body">' + fin.map(function (r) { return recItem(r, false); }).join('') + '</div></details>' : '');
  }
  /** Recomendaciones activas en un día concreto (para la vista del día). */
  function recsDelDia(d, iso) {
    return (d.recomendaciones || []).filter(function (r) {
      return r.estado === 'Activa' && (!r.desde || r.desde <= iso) && (!r.fin || iso <= r.fin);
    });
  }
  function htmlRecsDia(d, x) {
    var recs = recsDelDia(d, x.iso);
    var comp = (d.recomendaciones || []).filter(function (r) { return r.estado === 'Activa' && r.tipo === 'Competición' && r.objetivo && r.objetivo >= d.hoy; });
    var h = comp.map(function (r) {
      return '<div class="countdown"><div class="cd-txt"><span class="lbl">Competición · ' + fechaCorta(r.objetivo) + '</span><b>' + esc(r.ejercicio) + '</b></div><span class="cd">' + esc(diasHasta(r.objetivo)) + '</span></div>';
    }).join('');
    if (recs.length) h += '<details class="recs-day"><summary>Tus ejercicios recomendados (' + recs.length + ')</summary><div class="exp-body">' +
      recs.map(function (r) { return recItem(r, false); }).join('') + '</div></details>';
    return h;
  }

  // ---------- Instalar ----------
  function plataforma() {
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    if (/Mac/i.test(ua)) return 'mac';
    return 'windows';
  }
  function htmlInstalar() {
    var p = plataforma(), movil = p === 'ios' || p === 'android';
    var pasosPC = '<ol class="steps"><li><b>Chrome o Edge (Windows y Mac):</b> abre la app y, en la barra de direcciones, pulsa el icono <b>Instalar</b> (una pantalla con una flecha). Si no aparece: menú <b>⋮</b> → <b>Enviar, guardar y compartir</b> → <b>Instalar página como aplicación</b> (en Edge: <b>Aplicaciones → Instalar este sitio como una aplicación</b>).</li>' +
      '<li>Pulsa <b>Instalar</b>. Se crea un icono en el escritorio y en el menú Inicio (Windows) o en Aplicaciones/Launchpad (Mac).</li>' +
      '<li><b>Safari en Mac:</b> menú <b>Archivo → Añadir al Dock</b>.</li>' +
      '<li>Para tenerla a mano en Windows, haz clic derecho en el icono de la barra de tareas → <b>Anclar a la barra de tareas</b>.</li></ol>';
    var pasosMovil = '<ol class="steps"><li><b>iPhone (Safari):</b> abre la app en Safari, pulsa <b>Compartir</b> (el cuadrado con la flecha hacia arriba) → <b>Añadir a pantalla de inicio</b> → <b>Añadir</b>.</li>' +
      '<li><b>Android (Chrome):</b> menú <b>⋮</b> (arriba a la derecha) → <b>Añadir a pantalla de inicio</b> o <b>Instalar aplicación</b> → <b>Instalar</b>.</li>' +
      '<li>Aparece el icono de ProgramApp con el resto de tus apps. Se abre a pantalla completa, sin barra del navegador.</li></ol>';
    return (S.instalar ? '<button class="btn btn-primary" type="button" id="instalar-ya">Instalar ahora</button>' : '') +
      '<details class="tut"' + (!movil ? ' open' : '') + '><summary>Ordenador · Windows / Mac</summary>' + pasosPC + '</details>' +
      '<details class="tut"' + (movil ? ' open' : '') + '><summary>Móvil · Android / iPhone</summary>' + pasosMovil + '</details>';
  }

  // ---------- Coach ----------
  function htmlCoach(d) {
    return '<button class="btn" type="button" id="co-atletas">Buscar atleta · ficha</button>' +
      '<button class="btn" type="button" id="co-solic">Solicitudes de acceso' + (d.solicitudesPendientes ? ' (' + d.solicitudesPendientes + ')' : '') + '</button>' +
      '<button class="btn" type="button" id="co-avisos">Enviar o retirar avisos</button>';
  }

  /** Buscador de atletas con confirmación. alElegir(atleta) se llama tras confirmar. */
  function buscadorAtletas(contenedorId, alElegir, opciones) {
    var cont = document.getElementById(contenedorId);
    if (!cont) return;
    cont.innerHTML = '<input class="search" id="' + contenedorId + '-q" type="search" placeholder="Buscar por nombre o email" autocomplete="off">' +
      '<div class="results" id="' + contenedorId + '-r"><div class="hint">Cargando atletas…</div></div>';
    var lista = [];
    function pintar() {
      var q = norm(document.getElementById(contenedorId + '-q').value).trim();
      var f = lista.filter(function (a) { return !q || norm(a.nombre).indexOf(q) >= 0 || norm(a.email).indexOf(q) >= 0; }).slice(0, 12);
      document.getElementById(contenedorId + '-r').innerHTML = f.length ? f.map(function (a) {
        return '<button type="button" class="res" data-e="' + esc(a.email) + '"><b>' + esc(a.nombre) + '</b><span>' + esc(a.email) + '</span>' +
          '<span class="chip">' + esc(a.grupo || '—') + (a.activo === false ? ' · desactivado' : '') + '</span></button>';
      }).join('') : '<div class="hint">Nadie coincide con la búsqueda.</div>';
    }
    api({ action: 'atletas' }).then(function (r) {
      if (!r.ok) throw new Error(r.detalle || r.error);
      lista = r.atletas.filter(function (a) { return !opciones || !opciones.soloActivos || a.activo; })
        .sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
      pintar();
    }).catch(function (e) { document.getElementById(contenedorId + '-r').innerHTML = '<div class="err">' + esc(mensajeError(e.message)) + '</div>'; });
    document.getElementById(contenedorId + '-q').oninput = pintar;
    cont.onclick = function (ev) {
      var b = ev.target.closest('.res');
      if (b) {
        var a = lista.filter(function (x) { return x.email === b.dataset.e; })[0];
        document.getElementById(contenedorId + '-r').innerHTML = '<div class="confirm"><div class="part-lbl">¿Es este atleta?</div>' +
          '<div class="confirm-name">' + esc(a.nombre) + '</div><div>' + esc(a.email) + '</div><div class="hint">Grupo: ' + esc(a.grupo || '—') + ' · ' + esc(a.rol) + (a.activo === false ? ' · desactivado' : '') + '</div>' +
          '<div class="two-btn"><button type="button" class="btn" data-cancelar>Cancelar</button><button type="button" class="btn btn-primary" data-confirmar>Confirmar</button></div></div>';
        cont._elegido = a; return;
      }
      if (ev.target.closest('[data-cancelar]')) { pintar(); return; }
      if (ev.target.closest('[data-confirmar]')) alElegir(cont._elegido);
    };
  }

  function abrirBuscarAtleta() {
    abrirHoja('<div class="row"><h2>Buscar atleta</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div><div id="ba"></div>');
    buscadorAtletas('ba', function (a) { cerrarHoja(); abrirFicha(a.email); });
    setTimeout(function () { var q = document.getElementById('ba-q'); if (q) q.focus(); }, 50);
  }

  function abrirSolicitudes() {
    abrirHoja('<div class="row"><h2>Solicitudes</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div><div id="sol"><div class="hint">Cargando…</div></div>');
    api({ action: 'solicitudes' }).then(function (r) { if (r.ok) pintarSolicitudes(r.solicitudes); });
  }
  function pintarSolicitudes(lista) {
    var el = document.getElementById('sol'); if (!el) return;
    if (S.data) S.data.solicitudesPendientes = lista.length;
    el.innerHTML = lista.length ? lista.map(function (s) {
      return '<div class="sol"><div class="confirm-name">' + esc(s.nombre) + '</div><div>' + esc(s.email) + '</div>' +
        '<div class="hint">' + esc(s.fecha) + (s.existe ? ' · ya existe en ATLETAS (' + esc(s.existe) + ')' : '') + '</div>' + (s.mensaje ? '<p>' + esc(s.mensaje) + '</p>' : '') +
        '<label class="lbl-s">Grupo si se aprueba</label><select data-grupo-de="' + esc(s.email) + '"><option>Box</option><option>Individual</option><option>Otro</option><option>Coach</option></select>' +
        '<div class="two-btn"><button type="button" class="btn" data-resolver="0" data-email="' + esc(s.email) + '">Rechazar</button>' +
        '<button type="button" class="btn btn-primary" data-resolver="1" data-email="' + esc(s.email) + '">Aprobar</button></div></div>';
    }).join('') : '<div class="hint">No hay solicitudes pendientes.</div>';
  }

  // ---------- Ficha del atleta (coach) ----------
  function abrirFicha(email) {
    S.vista = 'ficha'; S.ficha = { cargando: true, email: email }; render();
    api({ action: 'ficha', email: email }).then(function (r) {
      if (!r.ok) throw new Error(r.detalle || r.error);
      S.ficha = r.ficha; S.ficha.email = email; render();
    }).catch(function (e) { S.ficha = { error: mensajeError(e.message), email: email }; render(); });
  }

  function renderFicha() {
    var f = S.ficha || {};
    var html = cabeceraVista(f.atleta ? f.atleta.nombre : 'Atleta', 'Ajustes');
    if (f.cargando) html += '<div class="empty">Cargando ficha…</div>';
    else if (f.error) html += '<div class="empty">' + esc(f.error) + '</div>';
    else {
      var a = f.atleta;
      html += '<section class="me"><div class="who big">' + esc(a.nombre.charAt(0).toUpperCase()) + '</div><div><b>' + esc(a.nombre) + '</b>' +
        '<div class="hint">' + esc(a.email) + '</div><div class="hint">Grupo ' + esc(a.grupo || '—') + ' · ' + esc(a.rol) + (a.activo ? '' : ' · <b>desactivado</b>') + '</div></div></section>';
      html += '<div class="two-btn"><button class="btn btn-primary" type="button" id="fi-rec">Nueva recomendación</button><button class="btn" type="button" id="fi-av">Enviar aviso</button></div>';
      // RPE
      html += seccion('fi-rpe', 'RPE · últimas semanas', f.semanas.length ? '<table class="tbl"><thead><tr><th>Semana</th><th>Semana</th><th>Sesiones</th><th>Bloques</th></tr></thead><tbody>' +
        f.semanas.map(function (s) {
          return '<tr><td>' + fechaCorta(s.lunes) + '</td><td>' + rpeTd(s.semana) + '</td><td>' + rpeTd(s.sesionesMedia) + (s.sesiones.length ? ' <span class="hint">(' + s.sesiones.length + ')</span>' : '') + '</td><td>' + rpeTd(s.bloquesMedia) + '</td></tr>' +
            (s.comentario ? '<tr class="sub"><td colspan="4">“' + esc(s.comentario) + '”</td></tr>' : '');
        }).join('') + '</tbody></table>' : '<div class="hint">Todavía no ha valorado ninguna sesión.</div>');
      html += seccion('fi-recs', 'Recomendaciones', htmlRecsAtleta(f.recomendaciones, true));
      var rm = f.marcas1rm || {};
      var otras = agruparMarcas(f.marcas.filter(function (x) { return LEVANTAMIENTOS.indexOf(x.marca) < 0; }));
      html += seccion('fi-marcas', 'Marcas', '<div class="kv">' + LEVANTAMIENTOS.map(function (l) { return '<span>' + cap(l) + '</span><b>' + (rm[l] ? rm[l] + ' kg' : '—') + '</b>'; }).join('') + '</div>' +
        (Object.keys(otras).length ? '<div class="part-lbl">Otras</div><div class="kv">' + Object.keys(otras).map(function (n) { return '<span>' + esc(cap(n)) + '</span><b>' + esc(fmtMarca(otras[n].mejor)) + '</b>'; }).join('') + '</div>' : ''));
    }
    $app.innerHTML = html;
    document.getElementById('atras').onclick = function () { S.vista = 'ajustes'; S._abrir = 's-coach'; render(); };
    var br = document.getElementById('fi-rec'); if (br) br.onclick = abrirNuevaRec;
    var ba = document.getElementById('fi-av'); if (ba) ba.onclick = function () { abrirGestionAvisos(null, S.ficha.atleta); };
    var ab = S._abrir; S._abrir = null; if (ab && document.getElementById(ab)) document.getElementById(ab).open = true;
  }
  function rpeTd(v) { return v == null || v === '' ? '<span class="hint">—</span>' : '<b style="color:' + rpeColor(String(Math.round(v))) + '">' + esc(v) + '</b>'; }

  function abrirNuevaRec() {
    var a = S.ficha.atleta, hoy = S.data ? S.data.hoy : '';
    var nombresDic = (listaVideos || []).map(function (v) { return v.nombre; });
    abrirHoja('<div class="row"><h2>Nueva recomendación</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div>' +
      '<div class="hint">Para <b>' + esc(a.nombre) + '</b> · ' + esc(a.email) + '</div>' +
      '<form id="recf" class="avf"><datalist id="rec-dic">' + nombresDic.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>' +
      '<div class="two"><div><label for="rc-tipo">Tipo</label><select id="rc-tipo"><option>Movilidad</option><option>Activación</option><option>Fuerza</option><option>Estiramiento</option><option>Competición</option></select></div>' +
      '<div><label for="rc-zona">Zona</label><select id="rc-zona"><option>Hombro</option><option>Codo</option><option>Muñeca</option><option>Lumbar</option><option>Dorsal</option><option>Cadera</option><option>Rodilla</option><option>Tobillo</option><option selected>General</option><option>Otro</option></select></div></div>' +
      '<label for="rc-ej">Ejercicio o trabajo</label><input id="rc-ej" list="rec-dic" maxlength="120" required placeholder="Ej. Banded external rotation">' +
      '<label for="rc-dosis">Dosis</label><input id="rc-dosis" maxlength="160" placeholder="Ej. 3×15 por brazo, antes de entrenar">' +
      '<div class="two"><div><label for="rc-desde">Desde</label><input id="rc-desde" type="date" value="' + hoy + '"></div><div><label for="rc-fin">Hasta (opcional)</label><input id="rc-fin" type="date"></div></div>' +
      '<div id="rc-obj-w" hidden><label for="rc-obj">Fecha de la competición</label><input id="rc-obj" type="date"></div>' +
      '<label for="rc-video">Vídeo (opcional)</label><input id="rc-video" type="url" placeholder="Enlace de YouTube · si el ejercicio está en el diccionario no hace falta">' +
      '<label for="rc-notas">Motivo o indicaciones</label><textarea id="rc-notas" rows="2" maxlength="400" placeholder="Ej. molestia en el jerk"></textarea>' +
      '<button class="btn btn-primary" type="submit" id="rc-ok">Guardar recomendación</button></form>');
    var tipo = document.getElementById('rc-tipo');
    tipo.onchange = function () { document.getElementById('rc-obj-w').hidden = tipo.value !== 'Competición'; };
    document.getElementById('recf').onsubmit = function (ev) {
      ev.preventDefault();
      var b = document.getElementById('rc-ok'); b.disabled = true; b.textContent = 'Guardando…';
      api({ action: 'rec_crear', email: a.email, rec: { tipo: tipo.value, zona: val('rc-zona'), ejercicio: val('rc-ej'), dosis: val('rc-dosis'),
        desde: val('rc-desde'), fin: val('rc-fin'), objetivo: tipo.value === 'Competición' ? val('rc-obj') : '', video: val('rc-video'), notas: val('rc-notas') } })
        .then(function (r) {
          if (!r.ok) throw new Error(r.detalle || r.error);
          cerrarHoja(); S.ficha = r.ficha; S.ficha.email = a.email; S._abrir = 'fi-recs'; render(); toast('Recomendación guardada');
        }).catch(function (e) { b.disabled = false; b.textContent = 'Guardar recomendación'; toast(mensajeError(e.message)); });
    };
  }

  function abrirVideoUrl(nombre, url) {
    var id = idVideo(url);
    abrirHoja('<div class="row"><h2>' + esc(nombre) + '</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div>' +
      (id ? '<div class="player"><iframe src="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&playsinline=1&rel=0&modestbranding=1" title="' + esc(nombre) + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>' : '') +
      '<a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">Abrir en YouTube</a>');
  }

  // ---------- Pedir acceso ----------
  function pantallaSolicitud(email, estado) {
    var cuerpo;
    if (estado === 'Pendiente') cuerpo = '<p>Tu solicitud de acceso está <b>pendiente</b>. Gabi la revisará pronto; cuando la apruebe, vuelve a abrir la app.</p>';
    else if (estado === 'Rechazada') cuerpo = '<p>Tu solicitud de acceso no ha sido aprobada. Si crees que es un error, habla con Gabi.</p>';
    else cuerpo = '<p>Este correo todavía no tiene acceso. Pídelo aquí: Gabi verá tu nombre y tu correo y lo aprobará.</p>' +
      '<form id="solf" class="field"><label for="sol-n">Nombre y apellidos</label><input id="sol-n" required minlength="3" maxlength="80" autocomplete="name">' +
      '<label for="sol-m">Mensaje (opcional)</label><input id="sol-m" maxlength="300" placeholder="Ej. Entreno en el box por las tardes">' +
      '<button class="btn btn-primary" type="submit" id="sol-ok">Pedir acceso</button></form>';
    $app.innerHTML = '<section class="login"><div class="brand">ProgramApp</div><div class="hint">Has entrado como <b>' + esc(email) + '</b></div>' + cuerpo +
      '<button class="btn" id="salir" type="button">Entrar con otra cuenta</button></section>';
    document.getElementById('salir').onclick = function () { auth.signOut(); };
    var f = document.getElementById('solf');
    if (f) f.onsubmit = function (ev) {
      ev.preventDefault();
      var b = document.getElementById('sol-ok'); b.disabled = true; b.textContent = 'Enviando…';
      api({ action: 'solicitar', nombre: val('sol-n'), mensaje: val('sol-m') }).then(function (r) {
        if (r.solicitud === 'Pendiente') pantallaSolicitud(email, 'Pendiente');
        else throw new Error(r.detalle || r.error);
      }).catch(function (e) { b.disabled = false; b.textContent = 'Pedir acceso'; toast(mensajeError(e.message)); });
    };
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

  function abrirPerfil() { abrirAjustes(); }

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
    var tm = e.target.closest('[data-tema]');
    if (tm) { guardar('pa-tema', tm.dataset.tema); aplicarTema(tm.dataset.tema); S._abrir = 's-tema'; render(); return; }
    if (e.target.closest('#instalar-ya') && S.instalar) { S.instalar.prompt(); S.instalar.userChoice.then(function () { S.instalar = null; S._abrir = 's-instalar'; render(); }); return; }
    if (e.target.closest('#co-atletas')) { abrirBuscarAtleta(); return; }
    if (e.target.closest('#co-solic')) { abrirSolicitudes(); return; }
    if (e.target.closest('#co-avisos')) { abrirGestionAvisos(null); return; }
    var vu = e.target.closest('[data-video-url]');
    if (vu) { abrirVideoUrl(vu.dataset.videoNombre, vu.dataset.videoUrl); return; }
    var rs = e.target.closest('[data-resolver]');
    if (rs) {
      var aprobar = rs.dataset.resolver === '1';
      if (rs.dataset.confirmar !== '1') { rs.dataset.confirmar = '1'; rs.textContent = aprobar ? '¿Aprobar?' : '¿Rechazar?'; return; }
      rs.disabled = true;
      var gsel = document.querySelector('[data-grupo-de="' + rs.dataset.email + '"]');
      api({ action: 'solicitud_resolver', email: rs.dataset.email, aprobar: aprobar, grupo: gsel ? gsel.value : 'Box' }).then(function (r) {
        if (!r.ok) throw new Error(r.detalle || r.error);
        toast(aprobar ? 'Aprobada: ya puede entrar' : 'Solicitud rechazada'); pintarSolicitudes(r.solicitudes);
      }).catch(function (er) { rs.disabled = false; toast(mensajeError(er.message)); });
      return;
    }
    var bm = e.target.closest('[data-borrar-marca]');
    if (bm) {
      if (bm.dataset.confirmar !== '1') { bm.dataset.confirmar = '1'; bm.textContent = '¿Borrar?'; return; }
      api({ action: 'marca_borrar', marca: JSON.parse(bm.dataset.borrarMarca) }).then(function (r) {
        if (!r.ok) throw new Error(r.detalle || r.error);
        S.data.misMarcas = r.marcas; S._abrir = 's-marcas'; render(); toast('Marca borrada');
      }).catch(function (er) { toast(mensajeError(er.message)); });
      return;
    }
    var fz = e.target.closest('[data-finalizar]');
    if (fz) {
      if (fz.dataset.confirmar !== '1') { fz.dataset.confirmar = '1'; fz.textContent = '¿Finalizar?'; return; }
      api({ action: 'rec_finalizar', id: fz.dataset.finalizar, email: S.ficha.email }).then(function (r) {
        if (!r.ok) throw new Error(r.detalle || r.error);
        S.ficha = r.ficha; S.ficha.email = r.ficha.atleta.email; S._abrir = 'fi-recs'; render(); toast('Pasada al historial');
      }).catch(function (er) { toast(mensajeError(er.message)); });
      return;
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
