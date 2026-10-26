/* Fabrik Program · la programación de Gabi para sus atletas */
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
  var ICO_IG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/></svg>';
  var ICO_WA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 8.5c.2 2.6 2.4 5 5.2 5.6l1.2-1.3-1.8-.9-.8.8c-1-.5-1.8-1.3-2.3-2.3l.8-.8-.9-1.8z" fill="currentColor"/></svg>';
  function redesHtml() {
    var r = CFG.redes || {};
    var a = [];
    if (r.instagram) a.push('<a class="social" href="' + esc(r.instagram) + '" target="_blank" rel="noopener" aria-label="Instagram de Gabi">' + ICO_IG + '<span>Instagram</span></a>');
    if (r.whatsapp) a.push('<a class="social" href="https://wa.me/' + esc(r.whatsapp) + '?text=' + encodeURIComponent('Hola Gabi, vengo de la app Fabrik Program') +
      '" target="_blank" rel="noopener" aria-label="WhatsApp de Gabi">' + ICO_WA + '<span>WhatsApp</span></a>');
    return a.length ? '<div class="socials"><div class="hint">¿Dudas? Habla con Gabi</div><div class="social-row">' + a.join('') + '</div></div>' : '';
  }

  function pantallaLogin(msg) {
    $app.innerHTML =
      '<section class="login">' +
      '<div class="brand">Fabrik Program</div>' +
      '<p>La programación semanal de Gabi. Entra con la cuenta que le diste a Gabi.</p>' +
      '<button class="btn btn-primary" id="gbtn" type="button">Entrar con Google</button>' +
      (CFG.microsoft ? '<button class="btn" id="msbtn" type="button">Entrar con Microsoft (Outlook, Hotmail)</button>' : '') +
      '<div class="or">o con cualquier correo (Outlook, Hotmail, iCloud…)</div>' +
      '<form id="mailf" class="field"><label for="mail">Email</label>' +
      '<input id="mail" type="email" autocomplete="email" inputmode="email" required placeholder="tu@email.com">' +
      '<button class="btn" type="submit" id="mailbtn">Enviarme el enlace</button></form>' +
      (msg ? '<div class="' + (msg.ok ? 'hint' : 'err') + '" role="status">' + esc(msg.t) + '</div>' : '') +
      redesHtml() +
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
      '<section class="login"><div class="brand">Fabrik Program</div>' +
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
  var ICO_SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="19" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" stroke="currentColor" stroke-width="2"/></svg>';
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
      $app.innerHTML = '<div class="splash"><div class="brand">Fabrik Program</div><div class="' + (fallo ? 'err' : 'hint') + '">' + esc(S.aviso || 'Cargando la semana…') + '</div>' +
        (fallo ? '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn-ghost" id="reint" type="button">Reintentar</button><button class="btn-ghost" id="salir2" type="button">Cerrar sesión</button></div>' : '') + '</div>';
      if (fallo) {
        document.getElementById('reint').onclick = function () { S.aviso = ''; render(); cargar(); };
        document.getElementById('salir2').onclick = function () { auth.signOut(); };
      }
      return;
    }
    if (S.vista === 'ajustes') return renderAjustes();
    if (S.vista === 'ficha') return renderFicha();
    if (S.vista === 'ranking') return renderRanking();
    if (!d.dias || !d.dias.length) {
      $app.innerHTML = cabecera(d) + '<div class="empty">Gabi todavía no ha publicado la semana.' +
        (d.proxima ? '<br>Próxima publicación: ' + esc(d.proxima) + '.' : '') + '</div>';
      enlazarCabecera(); return;
    }
    var aviso = d.publicada === false ? '<div class="unpub">Vista previa · ' + (d.proxima ? 'se publica el ' + esc(d.proxima) : 'aún sin publicar') + '</div>' : '';
    $app.innerHTML = cabecera(d) + aviso + tarjetaSemana(d) + ciclo(d) + semana(d) + '<main class="day" id="day">' + dia(d, d.dias[S.dia]) + '</main>' +
      (S.aviso ? '<div class="stale">' + esc(S.aviso) + '</div>' : '');
    enlazarCabecera();
    abrirAvisosPendientes(d);
  }

  function cabecera(d) {
    var idx = (d.semanas || []).findIndex(function (s) { return s.clave === d.semana; });
    var lbl = d.dias && d.dias.length ? 'Semana ' + fechaCorta(d.dias[0].iso) + ' – ' + fechaCorta(d.dias[d.dias.length - 1].iso) : 'Programación';
    var ini = (S.user.nombre || '?').trim().charAt(0).toUpperCase();
    return '<header class="top"><div class="weeknav">' +
      '<button class="icon-btn" id="prev" type="button" aria-label="Semana anterior"' + (idx <= 0 ? ' disabled' : '') + '>‹</button>' +
      '<span class="lbl">' + esc(lbl) + '</span>' +
      '<button class="icon-btn" id="next" type="button" aria-label="Semana siguiente"' + (idx < 0 || idx >= d.semanas.length - 1 ? ' disabled' : '') + '>›</button>' +
      '</div><button class="icon-btn share" id="compartir" type="button" aria-label="Compartir la app">' + ICO_SHARE + '</button>' +
      '<button class="who" id="perfil" type="button" aria-label="Menú">' + esc(ini) + '</button></header>';
  }

  function enlazarCabecera() {
    var d = S.data, sems = d.semanas || [], idx = sems.findIndex(function (s) { return s.clave === d.semana; });
    var p = document.getElementById('prev'), n = document.getElementById('next');
    if (p) p.onclick = function () { if (idx > 0) { S.aviso = 'Cargando…'; render(); cargar(sems[idx - 1].clave); } };
    if (n) n.onclick = function () { if (idx < sems.length - 1) { S.aviso = 'Cargando…'; render(); cargar(sems[idx + 1].clave); } };
    document.getElementById('perfil').onclick = function () { abrirAjustes(); };
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
    var delDia = pers.filter(function (n) { return !n.bloque && !n.clave; });
    var html = '<div class="day-title"><h1>' + NOMBRE_DIA[x.nombre] + ' ' + diaMes(x.iso) + '</h1>' +
      (x.rpe ? '<div class="rpe-pill" style="--c:' + rpeColor(x.rpe) + '"><b>' + esc(x.rpe) + '</b><span>' + (x.rpe === 'Z2' ? 'Recovery' : 'RPE del día') + '</span></div>' : '') + '</div>';
    if (x.foco && x.foco.length) html += '<div class="focus">' + x.foco.map(function (f) { return '<span>' + esc(cap(f)) + '</span>'; }).join('') + '</div>';
    html += ((d.avisos && d.avisos[x.iso]) || []).map(function (a) {
      return '<button class="notice" type="button" data-aviso="' + esc(a.id) + '"><span class="lbl">' + esc(a.tipo && a.tipo !== 'Aviso' ? a.tipo : 'Aviso') + (a.hora ? ' · ' + esc(a.hora) : '') + '</span><b>' + esc(a.titulo) + '</b>' +
        (a.mensaje ? '<span class="txt">' + esc(a.mensaje) + '</span>' : '') + '</button>';
    }).join('');
    html += htmlCuentaAtras(d);
    html += notasCoachHtml(delDia, 'para hoy');
    if (x.variantesNombres && x.variantesNombres.length) html += '<div class="variant-note">' + x.variantesNombres.map(function (n) {
      return '<span class="v-tag">' + esc(nombreVersion(n)) + '</span>'; }).join('') + '<span>Si compites, abre los desplegables naranjas de cada bloque: ahí está lo que cambia.</span></div>';
    html += '<div class="blocks">' + x.bloques.map(function (b) { return bloque(b, pers, x, d); }).join('') +
      (x.variantesExtra || []).map(bloqueExtra).join('') + '</div>';
    if (x.notasDia && x.notasDia.length) html += '<details class="daynotes"><summary class="coach-sum">Más notas del coach</summary><div class="exp-body prose">' +
      x.notasDia.map(function (n) { return (n.titulo ? '<div class="part-lbl coach-t">' + esc(n.titulo) + '</div>' : '') + prosa(n.texto); }).join('') + '</div></details>';
    html += tarjetaSesion(d, x);
    return html;
  }

  /**
   * Notas del coach (de NOTAS) al principio del día o del bloque:
   *  · normales → desplegable en color suave
   *  · de un evento → desplegable llamativo con el nombre del evento, justo debajo
   */
  function notasCoachHtml(lista, donde) {
    if (!lista.length) return '';
    var normales = lista.filter(function (n) { return !n.evento; });
    var porEvento = {};
    lista.forEach(function (n) { if (n.evento) (porEvento[n.evento] = porEvento[n.evento] || []).push(n); });
    var item = function (n) {
      var alc = n.alcance === 'SEMANA' ? ' · toda la semana' : '';
      return '<div class="cn-item"><div class="cn-lbl">' + esc(n.tipo || 'Nota') + alc + '</div><p>' + esc(n.texto) + '</p>' +
        (n.video ? '<button type="button" class="btn-ghost sm" data-video-url="' + esc(n.video) + '" data-video-nombre="' + esc(n.texto.split('\n')[0]) + '">▶ Vídeo</button>' : '') + '</div>';
    };
    var h = '';
    if (normales.length) h += '<details class="cnote"' + (normales.length <= 2 ? ' open' : '') + '><summary><span class="cn-ico">✎</span><span class="coach-sum">Nota del coach ' + esc(donde) +
      (normales.length > 1 ? ' (' + normales.length + ')' : '') + '</span></summary><div class="exp-body">' + normales.map(item).join('') + '</div></details>';
    Object.keys(porEvento).forEach(function (ev) {
      var l = porEvento[ev];
      h += '<details class="cnote ev" open><summary><span class="cn-ico">★</span><span class="coach-sum">Nota del coach · ' + esc(ev) + '</span></summary>' +
        '<div class="exp-body">' + l.map(item).join('') + '</div></details>';
    });
    return h;
  }

  function htmlCuentaAtras(d) {
    return (d.eventos || []).filter(function (e) { return e.mio && /COMPETI|HYROX|CARRERA/i.test(norm(e.tipo)) && e.inicio && e.inicio >= d.hoy; }).map(function (e) {
      return '<button type="button" class="countdown" data-ir-evento="' + esc(e.id) + '"><div class="cd-txt"><span class="lbl">' + esc(e.tipo) + ' · ' + fechaCorta(e.inicio) + '</span><b>' + esc(e.nombre) + '</b></div>' +
        '<span class="cd">' + esc(diasHasta(e.inicio)) + '</span></button>';
    }).join('');
  }

  function esMetcon(b) {
    return /METCON|\bWOD\b/.test(norm(b.titulo)) || b.partes.some(function (p) { return /^\s*METCON\s*:/.test(norm(p.texto)); });
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
    var mias = pers.filter(function (n) {
      if (n.bloque) return n.bloque === b.n;
      return n.clave ? norm(b.titulo).indexOf(norm(n.clave)) >= 0 : false; // palabra clave: en el título del bloque
    });

    var notas = '';
    if (b.wod) {
      var campos = [['material', 'Material'], ['carga', 'Carga'], ['intensidad', 'Intensidad'], ['formato', 'Formato'], ['modalidad', 'Modalidad'], ['notas', 'Estrategia'], ['objetivo', 'Objetivo']];
      notas += '<dl class="meta">' + campos.filter(function (c) { return b.wod[c[0]]; }).map(function (c) {
        return '<dt class="coach-t">' + c[1] + '</dt><dd class="prose">' + prosa(b.wod[c[0]]) + '</dd>';
      }).join('') + '</dl>';
    }
    if (b.nota) notas += '<div class="prose">' + prosa(b.nota) + '</div>';

    return '<article class="block" id="b-' + b.n + '">' +
      '<div class="b-head"><span class="b-num">' + (b.n || '•') + '</span><span class="b-title">' + esc(b.titulo) + '</span>' +
      (b.rpe ? '<span class="b-rpe" style="--c:' + rpeColor(b.rpe) + '">RPE ' + esc(b.rpe) + '</span>' : '') + '</div>' +
      notasCoachHtml(mias, 'para este bloque') +
      (prep.length ? '<details><summary>Calentamiento y activación</summary><div class="exp-body">' + prep.map(parte).join('') + '</div></details>' : '') +
      main.map(parte).join('') +
      (adapt.length ? '<details><summary>Adaptaciones</summary><div class="exp-body">' + adapt.map(parte).join('') + '</div></details>' : '') +
      (notas ? '<details><summary class="coach-sum">Notas del coach</summary><div class="exp-body">' + notas + '</div></details>' : '') +
      (b.variantes || []).map(function (v) { return htmlVariante(v, parte); }).join('') +
      (x && x.iso <= d.hoy && b.n ? valoraBloque(d, x, b) : '') +
      '</article>';
  }

  /** "Valora el bloque": RPE en un desplegable; en los metcon, también el resultado (voluntario). */
  function valoraBloque(d, x, b) {
    var v = valorDe(d, x.iso + '|Bloque|' + b.n);
    var metcon = esMetcon(b);
    var res = metcon ? resultadosBloque(d, x.iso, b) : [];
    var resumen = (v ? '<span class="vb-v" style="--c:' + rpeColor(String(v.v)) + '">RPE ' + esc(v.v) + '</span>' : '') +
      res.map(function (r) { return '<span class="vb-r">' + esc(r.texto) + (r.version ? ' · ' + esc(nombreVersion(r.version)) : '') + '</span>'; }).join('');
    return '<details class="rate-d"><summary>Valora el bloque' + (resumen ? '<span class="vb-sum">' + resumen + '</span>' : '') + '</summary><div class="exp-body">' +
      '<div class="hint">1 muy fácil · 10 esfuerzo máximo</div>' +
      chips({ tipo: 'bloque', dia: x.iso, bloque: b.n, etiqueta: b.n + ' · ' + b.titulo, metcon: metcon }, v) +
      (metcon ? '<div class="vb-acc"><button type="button" class="btn-ghost" data-resultado="' + esc(JSON.stringify({ dia: x.iso, n: b.n })) + '">' +
        (res.length ? 'Cambiar mi resultado' : '＋ Apuntar mi resultado') + '</button>' +
        '<button type="button" class="btn-ghost" data-ver-ranking="' + esc(x.iso) + '">🏆 Ranking</button></div>' : '') +
      '</div></details>';
  }

  function resultadosBloque(d, iso, b) {
    var out = [];
    Object.keys(d.resultados || {}).forEach(function (k) {
      var p = k.split('|');
      if (p[0] === iso && Number(p[1]) === b.n) { var r = d.resultados[k]; out.push({ texto: r.texto, version: p[2], nivel: r.nivel }); }
    });
    return out;
  }


  // ---------- versiones especiales (p. ej. pestaña "26/10/2026 BADAJOZ") ----------
  function nombreVersion(n) { return String(n || '').toLowerCase().replace(/(^|\s)\S/g, function (c) { return c.toUpperCase(); }); }
  function htmlVariante(v, parte) {
    var tag = '<span class="v-tag">' + esc(nombreVersion(v.nombre)) + '</span>';
    if (v.tipo === 'quita') return '<div class="variant none">' + tag + '<span>No se hace este bloque</span></div>';
    var cuerpo = '';
    if (v.tipo === 'sustituye') {
      cuerpo = '<div class="v-title">' + esc(v.titulo) + '</div>' + v.partes.map(parte).join('');
    } else {
      if (v.titulo) cuerpo += '<div class="v-title">' + esc(v.titulo) + '</div>';
      cuerpo += v.partes.map(function (p) {
        return '<div class="v-part">' + (p.cambio === 'nueva' ? '<span class="v-mark">Nuevo</span>' : '') + parte(p) + '</div>';
      }).join('');
      if (v.quitadas && v.quitadas.length) cuerpo += '<p class="v-off">No se hace: ' + v.quitadas.map(esc).join(' · ') + '</p>';
    }
    var resumen = v.tipo === 'sustituye' ? 'En su lugar: ' + esc(v.titulo) : 'Cambios para ' + esc(nombreVersion(v.nombre));
    return '<details class="variant">' + '<summary>' + tag + '<span class="v-sum">' + resumen + '</span></summary><div class="exp-body">' + cuerpo + '</div></details>';
  }
  function bloqueExtra(e) {
    var b = e.bloque;
    function parte(p) {
      return '<div class="part">' + (p.etiqueta && p.tipo !== 'adapt' ? '<div class="part-lbl">' + esc(p.etiqueta) + '</div>' : '') +
        (p.texto ? '<div class="board small">' + pizarra(p.texto, { bloque: levantamiento(b.titulo) }) + '</div>' : '') + '</div>';
    }
    return '<details class="variant extra"><summary><span class="v-tag">' + esc(nombreVersion(e.nombre)) + '</span><span class="v-sum">Bloque extra: ' +
      esc(b.titulo) + '</span></summary><div class="exp-body">' + b.partes.map(parte).join('') + '</div></details>';
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
      video_no_valido: 'El vídeo tiene que ser un enlace.', tiempo_no_valido: 'Escribe el tiempo como mm:ss (ej. 12:45).', falta_bloque: 'Elige el bloque.',
      nota_vacia: 'Escribe la nota.', evento_repetido: 'Ya hay un evento activo con ese nombre.', evento_no_encontrado: 'Ese evento no existe.', no_encontrado: 'Ya no existe.',
      faltan_campos: 'Rellena todos los campos.', fechas_no_validas: 'La fecha de fin es anterior a la de inicio.', marca_no_valida: 'Marca no válida.', atleta_no_encontrado: 'No encuentro a ese atleta.', solicitud_no_encontrada: 'Esa solicitud ya estaba resuelta.', fecha_no_valida: 'Revisa la fecha.', aviso_vacio: 'Escribe un título o un mensaje.' }[m] || 'No se pudo guardar. Revisa la conexión.';
  }
  // ---------- avisos (eventos con «aviso al entrar») ----------
  // Salen cada día al entrar, hasta que el atleta pulsa «Visto».
  function avisoVisto(id) { return (S.data.valoraciones && (S.data.valoraciones.leidos || []).indexOf(id) >= 0) || leer('pa-visto-' + id); }
  function avisoHoyCerrado(id) { return leer('pa-av-' + id + '-' + S.data.hoy); }
  function abrirAvisosPendientes(d) {
    if (!$scrim.hidden || !d.avisos) return;
    var pend = (d.avisos[d.hoy] || []).filter(function (a) { return !avisoVisto(a.id) && !avisoHoyCerrado(a.id); });
    if (pend.length) mostrarAviso(pend[0], d.hoy, true);
  }
  function mostrarAviso(a, iso, auto) {
    var dd = (S.data.dias || []).filter(function (y) { return y.iso === iso; })[0];
    var cuando = a.inicio && a.fin && a.fin !== a.inicio ? fechaCorta(a.inicio) + ' – ' + fechaCorta(a.fin) : (dd ? NOMBRE_DIA[dd.nombre] + ' ' + diaMes(iso) : fechaCorta(iso));
    abrirHoja('<div class="notice-modal"><div class="lbl">' + esc(a.tipo || 'Aviso') + ' · ' + esc(cuando) + (a.hora ? ' · ' + esc(a.hora) : '') + '</div>' +
      '<h2>' + esc(a.titulo) + '</h2>' + (a.mensaje ? '<p>' + esc(a.mensaje) + '</p>' : '') + (a.lugar ? '<p class="hint">📍 ' + esc(a.lugar) + '</p>' : '') + '</div>' +
      (a.enlace ? '<a class="btn btn-primary" href="' + esc(a.enlace) + '" target="_blank" rel="noopener">Abrir enlace</a>' : '') +
      '<div class="two-btn"><button class="btn" type="button" data-av-cerrar="' + esc(a.id) + '">Cerrar</button>' +
      (avisoVisto(a.id) ? '<button class="btn" type="button" data-close>Ya marcado como visto</button>' :
        '<button class="btn' + (a.enlace ? '' : ' btn-primary') + '" type="button" data-av-visto="' + esc(a.id) + '">Visto, no mostrar más</button>') + '</div>');
    if (auto) guardar('pa-av-' + a.id + '-' + S.data.hoy, true);
  }
  function marcarVisto(id) {
    guardar('pa-visto-' + id, true);
    (S.data.valoraciones.leidos = S.data.valoraciones.leidos || []).push(id);
    (S.data.eventos || []).forEach(function (e) { if (e.id === id) e.visto = true; });
    api({ action: 'aviso_visto', id: id }).catch(function () {});
    cerrarHoja(); toast('Marcado como visto. Lo tienes en Ajustes → Avisos.');
  }

  // ---------- aviso breve en pantalla ----------
  var tToast = null;
  function toast(t) {
    var el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = t; el.classList.add('show');
    clearTimeout(tToast); tToast = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  // =====================================================================
  //  MENÚ (Ajustes) · eventos, avisos, notas, ranking, marcas, descuentos, coach
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

  function abrirAjustes(abrir) { cerrarHoja(); S.vista = 'ajustes'; S._abrir = abrir || null; render(); window.scrollTo({ top: 0 }); }
  function volverSemana() { S.vista = null; S.ficha = null; render(); window.scrollTo({ top: 0 }); }

  function cabeceraVista(titulo, atras) {
    return '<header class="top"><button class="btn-ghost" type="button" id="atras">‹ ' + esc(atras) + '</button>' +
      '<span class="view-title">' + esc(titulo) + '</span></header>';
  }

  function seccion(id, titulo, cuerpo, extra, ico) {
    return '<details class="set" id="' + id + '"><summary>' + (ico ? '<span class="set-ico">' + ico + '</span>' : '') + esc(titulo) +
      (extra ? ' <span class="badge">' + esc(extra) + '</span>' : '') + '</summary><div class="set-body">' + cuerpo + '</div></details>';
  }

  function renderAjustes() {
    var d = S.data || {}, u = S.user || {};
    var tema = leer('pa-tema') || 'auto';
    var evs = (d.eventos || []).filter(function (e) { return e.mio && !e.pasado; });
    var avisos = misAvisos(d);
    var nuevosAv = avisos.filter(function (a) { return !a.visto && !a.pasado; }).length;
    var html = cabeceraVista('Menú', 'Semana') +
      '<section class="me"><div class="who big">' + esc((u.nombre || '?').charAt(0).toUpperCase()) + '</div><div><b>' + esc(u.nombre) + '</b>' +
      '<div class="hint">' + esc(u.email) + (u.grupo ? ' · ' + esc(u.grupo) : '') + '</div></div>' +
      '<button class="btn-ghost" type="button" id="compartir2">Compartir app</button></section>';

    html += seccion('s-eventos', 'Mis eventos', htmlEventos(d), evs.length ? String(evs.length) : '', '★');
    html += seccion('s-avisos', 'Avisos', htmlAvisos(avisos), nuevosAv ? String(nuevosAv) : '', '!');
    html += seccion('s-notas', 'Notas del coach', htmlNotasSemana(d) + '<div class="part-lbl" style="margin-top:10px">Ejercicios recomendados</div>' + htmlRecsAtleta(d.recomendaciones || []), '', '✎');
    html += '<button class="set-link" type="button" id="ir-ranking"><span class="set-ico">🏆</span>Leaderboard<span class="go">›</span></button>';
    html += seccion('s-marcas', 'Mis marcas', htmlMarcas(d), '', '◆');
    html += seccion('s-desc', '% Descuentos', '<div id="desc-body"><div class="hint">Cargando…</div></div>', d.descuentosPendientes ? d.descuentosPendientes + ' pendiente' + (d.descuentosPendientes > 1 ? 's' : '') : '', '%');
    if (d.staff) html += seccion('s-coach', 'Coach', htmlCoach(d), d.solicitudesPendientes ? d.solicitudesPendientes + ' solicitud' + (d.solicitudesPendientes > 1 ? 'es' : '') : '', '⚑');
    html += seccion('s-tema', 'Apariencia', '<div class="seg" role="group" aria-label="Tema">' + Object.keys(TEMAS).map(function (k) {
      return '<button type="button" data-tema="' + k + '" aria-pressed="' + (tema === k) + '">' + TEMAS[k] + '</button>'; }).join('') + '</div>' +
      '<div class="hint">Automático sigue el modo claro u oscuro de tu móvil u ordenador.</div>', '', '◐');
    html += seccion('s-instalar', 'Instalar la app', htmlInstalar(), '', '↓');
    html += '<button class="btn" type="button" id="logout">Cerrar sesión</button>';
    $app.innerHTML = html;
    document.getElementById('atras').onclick = volverSemana;
    document.getElementById('logout').onclick = function () { S.vista = null; auth.signOut(); };
    document.getElementById('compartir2').onclick = compartirApp;
    document.getElementById('ir-ranking').onclick = function () { abrirLeaderboard(); };
    document.getElementById('s-desc').addEventListener('toggle', function () { if (this.open) cargarDescuentos(); });
    enlazarMarcas();
    var ab = S._abrir; S._abrir = null; if (ab && document.getElementById(ab)) { document.getElementById(ab).open = true; if (ab === 's-desc') cargarDescuentos(); }
  }

  // ---------- Mis eventos ----------
  function diasHasta(iso) {
    var n = Math.round((Date.parse(iso) - Date.parse(S.data.hoy)) / 864e5);
    return n > 1 ? 'faltan ' + n + ' días' : n === 1 ? 'mañana' : n === 0 ? 'hoy' : 'pasado';
  }
  function cuandoEvento(e) {
    return fechaCorta(e.inicio) + (e.fin && e.fin !== e.inicio ? ' – ' + fechaCorta(e.fin) : '') + (e.hora ? ' · ' + e.hora : '');
  }
  function tarjetaEvento(e, abierto) {
    var notas = e.notas || [];
    return '<details class="ev-card' + (e.mio ? ' mio' : '') + '" id="ev-' + esc(e.id) + '"' + (abierto ? ' open' : '') + '><summary><div class="ev-sum"><span class="ev-tipo">' + esc(e.tipo) + '</span>' +
      '<b>' + esc(e.nombre) + '</b><span class="hint">' + esc(cuandoEvento(e)) + (e.lugar ? ' · ' + esc(e.lugar) : '') + '</span></div>' +
      (e.inicio && !e.pasado ? '<span class="cd sm">' + esc(diasHasta(e.inicio)) + '</span>' : '') + '</summary><div class="exp-body">' +
      (e.descripcion ? '<p class="ev-desc">' + esc(e.descripcion) + '</p>' : '') +
      (e.enlace ? '<a class="btn" href="' + esc(e.enlace) + '" target="_blank" rel="noopener">Abrir enlace</a>' : '') +
      (notas.length ? '<details class="cnote ev" open><summary><span class="cn-ico">★</span><span class="coach-sum">Notas y entrenos del coach (' + notas.length + ')</span></summary><div class="exp-body">' +
        notas.map(function (n) {
          return '<div class="cn-item"><div class="cn-lbl">' + esc(n.tipo) + ' · ' + (n.fecha ? fechaCorta(n.fecha) : '') + (n.alcance === 'SEMANA' ? ' (semana)' : '') + '</div><p>' + esc(n.texto) + '</p>' +
            (n.video ? '<button type="button" class="btn-ghost sm" data-video-url="' + esc(n.video) + '" data-video-nombre="' + esc(e.nombre) + '">▶ Vídeo</button>' : '') + '</div>';
        }).join('') + '</div></details>' : '') +
      (!e.mio && !e.pasado ? (e.solicitado ? '<div class="hint">Solicitud enviada · pendiente de que la apruebe el coach.</div>' :
        '<button class="btn" type="button" data-unirme="' + esc(e.id) + '">Quiero apuntarme</button>') : '') +
      '</div></details>';
  }
  function htmlEventos(d) {
    var l = d.eventos || [];
    var mios = l.filter(function (e) { return e.mio && !e.pasado; });
    var todos = l.filter(function (e) { return !e.mio && e.visible && !e.pasado && !/^AVISO$/i.test(e.tipo); });
    var otros = l.filter(function (e) { return !e.mio && !e.visible && !e.pasado; });
    var pasados = l.filter(function (e) { return e.pasado && (e.mio || e.visible) && !/^AVISO$/i.test(e.tipo); });
    var h = mios.length ? mios.map(function (e) { return tarjetaEvento(e, mios.length === 1); }).join('') : '<div class="hint">No estás apuntado a ningún evento.</div>';
    if (todos.length) h += '<div class="part-lbl" style="margin-top:10px">Para todos</div>' + todos.map(function (e) { return tarjetaEvento(e); }).join('');
    if (otros.length) h += '<details class="hist"><summary>Otros eventos (puedes pedir apuntarte)</summary><div class="exp-body">' + otros.map(function (e) { return tarjetaEvento(e); }).join('') + '</div></details>';
    if (pasados.length) h += '<details class="hist"><summary>Pasados (' + pasados.length + ')</summary><div class="exp-body">' + pasados.map(function (e) { return tarjetaEvento(e); }).join('') + '</div></details>';
    return h;
  }

  // ---------- Avisos ----------
  function misAvisos(d) {
    return (d.eventos || []).filter(function (e) { return e.aviso && e.visible; });
  }
  function htmlAvisos(lista) {
    var activos = lista.filter(function (a) { return !a.pasado; }), viejos = lista.filter(function (a) { return a.pasado; });
    var item = function (a) {
      return '<div class="av-item' + (a.visto ? ' visto' : '') + '"><div><b>' + esc(a.nombre) + '</b><div class="hint">' + esc(a.tipo) + ' · ' + esc(cuandoEvento(a)) + (a.visto ? ' · visto' : '') + '</div>' +
        (a.descripcion ? '<p>' + esc(a.descripcion) + '</p>' : '') + '</div>' +
        '<div class="av-acc">' + (a.enlace ? '<a class="btn-ghost" href="' + esc(a.enlace) + '" target="_blank" rel="noopener">Abrir</a>' : '') +
        (!a.visto && !a.pasado ? '<button class="btn-ghost" type="button" data-av-visto="' + esc(a.id) + '">Visto</button>' : '') + '</div></div>';
    };
    return (activos.length ? activos.map(item).join('') : '<div class="hint">No hay avisos activos.</div>') +
      (viejos.length ? '<details class="hist"><summary>Anteriores (' + viejos.length + ')</summary><div class="exp-body">' + viejos.map(item).join('') + '</div></details>' : '');
  }

  // ---------- Notas de la semana ----------
  function htmlNotasSemana(d) {
    var p = d.personal || { porDia: {} };
    var vistas = {};
    var filas = (d.dias || []).map(function (x) {
      var notas = ((p.porDia && p.porDia[x.iso]) || []).filter(function (n) {
        var k = n.id + (n.alcance === 'SEMANA' ? '' : x.iso);
        if (vistas[k]) return false; vistas[k] = 1; return true;
      });
      if (!notas.length) return '';
      return '<div class="wk-day"><div class="part-lbl">' + NOMBRE_DIA[x.nombre] + ' ' + diaMes(x.iso) + '</div>' + notas.map(function (n) {
        var donde = n.bloque ? 'Bloque ' + n.bloque : n.clave ? 'Bloques de ' + n.clave : n.alcance === 'SEMANA' ? 'Toda la semana' : 'Todo el día';
        return '<div class="wk-item' + (n.evento ? ' ev' : '') + '"><span class="hint">' + esc(n.tipo) + ' · ' + esc(donde) + (n.evento ? ' · ' + esc(n.evento) : '') + '</span><p>' + esc(n.texto) + '</p></div>';
      }).join('') + '</div>';
    }).join('');
    return filas || '<div class="hint">El coach no te ha dejado notas esta semana.</div>';
  }

  // ---------- Ejercicios recomendados (notas de tipo Ejercicio) ----------
  function recItem(r, coach) {
    var cuando = r.desde ? (r.fin ? fechaCorta(r.desde) + ' – ' + fechaCorta(r.fin) : 'desde ' + fechaCorta(r.desde)) : '';
    return '<div class="rec"><div class="rec-head"><b>' + esc(r.ejercicio) + '</b><span class="chip">' + esc(r.tipo) + '</span></div>' +
      (r.dosis ? '<div class="rec-dosis">' + esc(r.dosis) + '</div>' : '') +
      '<div class="rec-foot"><span class="hint">' + esc(cuando) + (r.por ? ' · ' + esc(r.por) : '') + '</span>' +
      (r.video ? '<button type="button" class="btn-ghost" data-video-url="' + esc(r.video) + '" data-video-nombre="' + esc(r.ejercicio) + '">▶ Vídeo</button>' : '') +
      (coach && r.estado === 'Activa' ? '<button type="button" class="btn-ghost" data-nota-off="' + esc(r.id) + '">Retirar</button>' : '') + '</div></div>';
  }
  function htmlRecsAtleta(recs, coach) {
    recs = recs.filter(function (r) { return r.tipo !== 'Competición'; });
    var act = recs.filter(function (r) { return r.estado === 'Activa'; }), fin = recs.filter(function (r) { return r.estado !== 'Activa'; });
    return (act.length ? act.map(function (r) { return recItem(r, coach); }).join('') : '<div class="hint">No hay ejercicios recomendados activos.</div>') +
      (fin.length ? '<details class="hist"><summary>Historial (' + fin.length + ')</summary><div class="exp-body">' + fin.map(function (r) { return recItem(r, false); }).join('') + '</div></details>' : '');
  }

  // ---------- % Descuentos ----------
  function cargarDescuentos() {
    api({ action: 'descuentos' }).then(function (r) { if (r.ok) { S.desc = r.descuentos; pintarDescuentos(); } })
      .catch(function () { var el = document.getElementById('desc-body'); if (el) el.innerHTML = '<div class="err">No se pudieron cargar.</div>'; });
  }
  function pintarDescuentos() {
    var el = document.getElementById('desc-body'), D = S.desc, staff = S.data && S.data.staff;
    if (!el || !D) return;
    var carta = function (x, modo) {
      var vig = x.fin ? 'Hasta el ' + fechaCorta(x.fin) : 'Sin fecha de fin';
      return '<div class="desc' + (modo === 'pend' ? ' pend' : '') + '"><div class="desc-top"><b>' + esc(x.marca) + '</b>' + (x.codigo ? '<span class="desc-code">' + esc(x.codigo) + '</span>' : '') + '</div>' +
        (x.descripcion ? '<p>' + esc(x.descripcion) + '</p>' : '') +
        '<div class="hint">' + esc(vig) + (x.aportado ? ' · gracias a ' + esc(x.aportado) : '') + (modo === 'pend' ? ' · propuesto por ' + esc(x.enviado) : '') + '</div>' +
        (modo === 'pend' ? (staff ? '<div class="two-btn"><button class="btn" type="button" data-desc-res="0" data-id="' + esc(x.id) + '">Rechazar</button><button class="btn btn-primary" type="button" data-desc-res="1" data-id="' + esc(x.id) + '">Aprobar</button></div>' :
          '<div class="hint"><b>Pendiente</b> de aprobación.</div>') :
          '<div class="two-btn"><button class="btn btn-primary" type="button" data-desc-usar="' + esc(x.id) + '">' + (x.codigo ? 'Copiar código y abrir web' : 'Abrir web') + '</button>' +
          (staff ? '<button class="btn" type="button" data-desc-ret="' + esc(x.id) + '">Retirar</button>' : '') + '</div>') + '</div>';
    };
    el.innerHTML = (D.activos.length ? D.activos.map(function (x) { return carta(x); }).join('') : '<div class="hint">Todavía no hay descuentos.</div>') +
      (D.pendientes.length ? '<div class="part-lbl" style="margin-top:10px">' + (staff ? 'Propuestas por aprobar' : 'Tus propuestas') + '</div>' + D.pendientes.map(function (x) { return carta(x, 'pend'); }).join('') : '') +
      '<details class="hist"><summary>' + (staff ? '＋ Añadir descuento' : '＋ Proponer un descuento') + '</summary><div class="exp-body"><form id="descf" class="avf">' +
      '<label for="ds-m">Marca o tienda</label><input id="ds-m" maxlength="60" required placeholder="Ej. Northern Spirit">' +
      '<label for="ds-d">Qué incluye</label><input id="ds-d" maxlength="200"' + (staff ? '' : ' required') + ' placeholder="Ej. 10 % en toda la web">' +
      '<div class="two"><div><label for="ds-c">Código</label><input id="ds-c" maxlength="40"' + (staff ? '' : ' required') + ' placeholder="Ej. FABRIK10"></div>' +
      '<div><label for="ds-a">Lo aporta</label><input id="ds-a" maxlength="60"' + (staff ? '' : ' required') + ' placeholder="Ej. Gabi"></div></div>' +
      '<label for="ds-u">Enlace de la web</label><input id="ds-u" type="url" required placeholder="https://…">' +
      '<div class="two"><div><label for="ds-i">Desde (opcional)</label><input id="ds-i" type="date"></div><div><label for="ds-f">Hasta (vacío = indefinido)</label><input id="ds-f" type="date"></div></div>' +
      (staff ? '' : '<div class="hint">Lo revisa el coach antes de que lo vean los demás.</div>') +
      '<button class="btn btn-primary" type="submit" id="ds-ok">' + (staff ? 'Publicar descuento' : 'Enviar propuesta') + '</button></form></div></details>';
    document.getElementById('descf').onsubmit = function (ev) {
      ev.preventDefault();
      var b = document.getElementById('ds-ok'); b.disabled = true;
      api({ action: 'descuento_crear', descuento: { marca: val('ds-m'), descripcion: val('ds-d'), codigo: val('ds-c'), aportado: val('ds-a'), enlace: val('ds-u'), inicio: val('ds-i'), fin: val('ds-f') } })
        .then(function (r) { if (!r.ok) throw new Error(r.detalle || r.error); S.desc = r.descuentos; pintarDescuentos(); toast(staff ? 'Descuento publicado' : 'Propuesta enviada al coach'); })
        .catch(function (e) { b.disabled = false; toast(mensajeError(e.message)); });
    };
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
      '<li>Aparece el icono de Fabrik Program con el resto de tus apps. Se abre a pantalla completa, sin barra del navegador.</li></ol>';
    return (S.instalar ? '<button class="btn btn-primary" type="button" id="instalar-ya">Instalar ahora</button>' : '') +
      '<details class="tut"' + (!movil ? ' open' : '') + '><summary>Ordenador · Windows / Mac</summary>' + pasosPC + '</details>' +
      '<details class="tut"' + (movil ? ' open' : '') + '><summary>Móvil · Android / iPhone</summary>' + pasosMovil + '</details>';
  }

  // ---------- Coach ----------
  function htmlCoach(d) {
    return '<div class="coach-grid">' +
      '<button class="btn" type="button" id="co-atletas">Atletas · ficha</button>' +
      '<button class="btn" type="button" id="co-eventos">Eventos y avisos</button>' +
      '<button class="btn" type="button" id="co-notas">Nota a un evento o a todos</button>' +
      '<button class="btn" type="button" id="co-solic">Solicitudes' + (d.solicitudesPendientes ? ' (' + d.solicitudesPendientes + ')' : '') + '</button></div>' +
      '<div class="hint">Las propuestas de descuento se aprueban en «% Descuentos».</div>';
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
    var cargarLista = S._atletas ? Promise.resolve({ ok: true, atletas: S._atletas }) : api({ action: 'atletas' });
    cargarLista.then(function (r) {
      if (!r.ok) throw new Error(r.detalle || r.error);
      S._atletas = r.atletas;
      lista = r.atletas.filter(function (a) { return !opciones || !opciones.soloActivos || a.activo; })
        .sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
      pintar();
    }).catch(function (e) { document.getElementById(contenedorId + '-r').innerHTML = '<div class="err">' + esc(mensajeError(e.message)) + '</div>'; });
    document.getElementById(contenedorId + '-q').oninput = pintar;
    cont.onclick = function (ev) {
      var b = ev.target.closest('.res');
      if (b) {
        var a = lista.filter(function (x) { return x.email === b.dataset.e; })[0];
        if (opciones && opciones.sinConfirmar) { alElegir(a); return; }
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

  // ---------- Coach: eventos ----------
  var TIPOS_EVENTO = ['Competición', 'Toma de marcas', 'Wod especial', 'Carrera', 'HYROX', 'Inscripción', 'Aviso', 'Otro'];
  function abrirEventosCoach() {
    abrirHoja('<div class="row"><h2>Eventos y avisos</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div>' +
      '<button class="btn btn-primary" type="button" id="ev-nuevo">＋ Nuevo evento</button><button class="btn" type="button" id="av-nuevo">＋ Nuevo aviso rápido</button>' +
      '<div id="evc-lista"><div class="hint">Cargando…</div></div>');
    document.getElementById('ev-nuevo').onclick = function () { abrirFormEvento({}); };
    document.getElementById('av-nuevo').onclick = function () { abrirFormEvento({ tipo: 'Aviso', aviso: true, para: 'Todos', inicio: S.data.hoy }); };
    api({ action: 'eventos' }).then(function (r) { if (r.ok) { S.data.eventos = r.eventos; pintarEventosCoach(); } });
  }
  function pintarEventosCoach() {
    var el = document.getElementById('evc-lista'); if (!el) return;
    var l = (S.data.eventos || []).slice().sort(function (a, b) { return (a.pasado - b.pasado) || (a.inicio < b.inicio ? -1 : 1); });
    el.innerHTML = l.length ? l.map(function (e) {
      return '<div class="evc' + (e.pasado ? ' pasado' : '') + '"><div class="evc-top"><span class="ev-tipo">' + esc(e.tipo) + '</span><b>' + esc(e.nombre) + '</b></div>' +
        '<div class="hint">' + esc(cuandoEvento(e)) + ' · ' + esc(e.para) + (e.aviso ? ' · aviso al entrar' : '') + ' · ' + (e.participantes || []).length + ' atleta' + ((e.participantes || []).length === 1 ? '' : 's') + '</div>' +
        '<div class="evc-acc"><button class="btn-ghost" type="button" data-ev-edit="' + esc(e.id) + '">Editar</button>' +
        '<button class="btn-ghost" type="button" data-ev-part="' + esc(e.id) + '">Atletas</button>' +
        '<button class="btn-ghost" type="button" data-ev-nota="' + esc(e.id) + '">Nota</button>' +
        '<button class="btn-ghost" type="button" data-ev-del="' + esc(e.id) + '">Retirar</button></div></div>';
    }).join('') : '<div class="hint">Todavía no hay eventos.</div>';
  }
  function eventoPorId(id) { return (S.data.eventos || []).filter(function (e) { return e.id === id; })[0]; }
  function abrirFormEvento(e) {
    var op = function (l, act) { return l.map(function (x) { return '<option' + (x === act ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); };
    abrirHoja('<div class="row"><h2>' + (e.id ? 'Editar evento' : e.tipo === 'Aviso' ? 'Nuevo aviso' : 'Nuevo evento') + '</h2><button class="btn-ghost" type="button" id="evf-volver">‹ Volver</button></div>' +
      '<form id="evf" class="avf"><label for="ef-n">Nombre</label><input id="ef-n" maxlength="60" required placeholder="Ej. Alhambra Games 2027 · Toma de marcas viernes" value="' + esc(e.nombre || '') + '">' +
      '<div class="two"><div><label for="ef-t">Tipo</label><select id="ef-t">' + op(TIPOS_EVENTO, e.tipo || 'Competición') + '</select></div>' +
      '<div><label for="ef-p">Para</label><select id="ef-p">' + op(['Todos', 'Participantes', 'Box', 'Individual', 'Otro', 'Coach'], e.para || 'Participantes') + '</select></div></div>' +
      '<div class="two"><div><label for="ef-i">Inicio</label><input id="ef-i" type="date" required value="' + esc(e.inicio || '') + '"></div>' +
      '<div><label for="ef-f">Fin (si dura más de un día)</label><input id="ef-f" type="date" value="' + esc(e.fin && e.fin !== e.inicio ? e.fin : '') + '"></div></div>' +
      '<div class="two"><div><label for="ef-h">Hora (opcional)</label><input id="ef-h" type="time" value="' + esc(e.hora || '') + '"></div>' +
      '<div><label for="ef-l">Lugar (opcional)</label><input id="ef-l" maxlength="80" value="' + esc(e.lugar || '') + '"></div></div>' +
      '<label for="ef-u">Enlace (opcional)</label><input id="ef-u" type="url" placeholder="https://… inscripción, info" value="' + esc(e.enlace || '') + '">' +
      '<label for="ef-d">Descripción</label><textarea id="ef-d" rows="3" maxlength="1000" placeholder="Lo que leerán los atletas">' + esc(e.descripcion || '') + '</textarea>' +
      '<label class="chk"><input type="checkbox" id="ef-a"' + (e.aviso ? ' checked' : '') + '> Aviso al entrar en la app (cada día entre inicio y fin, hasta que lo marquen como visto)</label>' +
      '<button class="btn btn-primary" type="submit" id="ef-ok">Guardar</button></form>');
    document.getElementById('evf-volver').onclick = abrirEventosCoach;
    document.getElementById('ef-t').onchange = function () {
      var t = this.value;
      if (t === 'Aviso' || t === 'Inscripción') document.getElementById('ef-a').checked = true;
      if (t === 'Competición') document.getElementById('ef-p').value = 'Participantes';
    };
    document.getElementById('evf').onsubmit = function (ev) {
      ev.preventDefault();
      var b = document.getElementById('ef-ok'); b.disabled = true; b.textContent = 'Guardando…';
      api({ action: 'evento_guardar', evento: { id: e.id, nombre: val('ef-n'), tipo: val('ef-t'), para: val('ef-p'), inicio: val('ef-i'), fin: val('ef-f'), hora: val('ef-h'),
        lugar: val('ef-l'), enlace: val('ef-u'), descripcion: val('ef-d'), aviso: document.getElementById('ef-a').checked } }).then(function (r) {
        if (!r.ok) throw new Error(r.detalle || r.error);
        S.data.eventos = r.eventos; toast('Evento guardado');
        if (!e.id && val('ef-p') === 'Participantes') abrirParticipantes(r.id); else abrirEventosCoach();
      }).catch(function (er) { b.disabled = false; b.textContent = 'Guardar'; toast(mensajeError(er.message)); });
    };
  }
  /** Elegir los atletas de un evento: buscador + chips; se guarda con confirmación. */
  function abrirParticipantes(id) {
    var e = eventoPorId(id); if (!e) return;
    var sel = {};
    (e.participantes || []).forEach(function (a) { sel[a.email] = a; });
    abrirHoja('<div class="row"><h2>Atletas · ' + esc(e.nombre) + '</h2><button class="btn-ghost" type="button" id="pa-volver">‹ Volver</button></div>' +
      '<div class="hint">Toca un atleta para añadirlo. Toca una etiqueta para quitarlo.</div><div id="pa-chips" class="chips-sel"></div><div id="pa-bus"></div>' +
      '<button class="btn btn-primary" type="button" id="pa-ok">Guardar atletas</button>');
    function chips() {
      var ks = Object.keys(sel);
      document.getElementById('pa-chips').innerHTML = ks.length ? ks.map(function (k) { return '<button type="button" class="chip-x" data-quitar="' + esc(k) + '">' + esc(sel[k].nombre) + ' ×</button>'; }).join('') : '<span class="hint">Nadie todavía.</span>';
    }
    chips();
    document.getElementById('pa-chips').onclick = function (ev) { var b = ev.target.closest('[data-quitar]'); if (b) { delete sel[b.dataset.quitar]; chips(); } };
    buscadorAtletas('pa-bus', function (a) { sel[a.email] = a; chips(); toast(a.nombre + ' añadido'); }, { soloActivos: true, sinConfirmar: true });
    document.getElementById('pa-volver').onclick = abrirEventosCoach;
    document.getElementById('pa-ok').onclick = function () {
      var n = Object.keys(sel).length, b = this;
      if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = 'Confirmar: ' + n + ' atleta' + (n === 1 ? '' : 's') + ' en ' + e.nombre; return; }
      b.disabled = true;
      api({ action: 'evento_participantes', id: id, emails: Object.keys(sel) }).then(function (r) {
        if (!r.ok) throw new Error(r.detalle || r.error);
        S.data.eventos = r.eventos; S._atletas = null; toast('Atletas guardados'); abrirEventosCoach();
      }).catch(function (er) { b.disabled = false; toast(mensajeError(er.message)); });
    };
  }

  // ---------- Coach: notas (a un atleta, a un evento o a todos) ----------
  /** destino: { email, nombre } | { evento } | {} */
  function abrirFormNota(destino, volver) {
    destino = destino || {};
    var d = S.data, x = d.dias && d.dias[S.dia];
    var evs = (d.eventos || []).filter(function (e) { return !e.pasado; });
    var bloques = x ? x.bloques.map(function (b) { return '<option value="' + b.n + '">' + b.n + ' · ' + esc(cap(b.titulo)) + '</option>'; }).join('') : '';
    var para = destino.email ? '<div class="chosen"><div><b>' + esc(destino.nombre) + '</b><div class="hint">' + esc(destino.email) + '</div></div></div>' :
      '<label for="nf-para">Para</label><select id="nf-para"><option value="">Todos los atletas</option>' + evs.map(function (e) {
        return '<option value="' + esc(e.nombre) + '"' + (destino.evento === e.nombre ? ' selected' : '') + '>Evento · ' + esc(e.nombre) + '</option>'; }).join('') + '</select>';
    var evOpc = destino.email ? '<label for="nf-ev">Etiqueta de evento (opcional)</label><select id="nf-ev"><option value="">—</option>' + evs.map(function (e) { return '<option>' + esc(e.nombre) + '</option>'; }).join('') + '</select>' : '';
    abrirHoja('<div class="row"><h2>Nueva nota</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div>' +
      '<form id="nf" class="avf">' + para + evOpc +
      '<label>Dónde se ve</label><div class="seg" role="group" id="nf-al"><button type="button" data-val="Bloque" aria-pressed="false">Un bloque</button>' +
      '<button type="button" data-val="Día" aria-pressed="true">El día</button><button type="button" data-val="Semana" aria-pressed="false">La semana</button></div>' +
      '<div class="two"><div><label for="nf-f">Fecha</label><input id="nf-f" type="date" required value="' + esc(x ? x.iso : d.hoy) + '"></div>' +
      '<div><label for="nf-h">Repetir hasta (opcional)</label><input id="nf-h" type="date"></div></div>' +
      '<div id="nf-bw" hidden><label for="nf-b">Bloque</label>' + (bloques ? '<select id="nf-b">' + bloques + '</select>' : '<input id="nf-b" inputmode="numeric" placeholder="nº de bloque">') +
      '<div class="hint">Los bloques son los del día que estás viendo; si cambias la fecha, comprueba el número.</div></div>' +
      '<label for="nf-t">Tipo</label><select id="nf-t">' + ['Nota', 'Técnica', 'Carga', 'Adaptación', 'Estrategia', 'Movilidad', 'Ejercicio', 'Competición'].map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select>' +
      '<label for="nf-x">Nota</label><textarea id="nf-x" rows="4" maxlength="1500" required placeholder="Ej. Hoy prioriza la técnica: 75 % máximo en el C&J"></textarea>' +
      '<label for="nf-v">Vídeo (opcional)</label><input id="nf-v" type="url" placeholder="Enlace de YouTube">' +
      '<button class="btn btn-primary" type="submit" id="nf-ok">Guardar nota</button></form>');
    var alcance = 'Día';
    document.getElementById('nf-al').onclick = function (ev) {
      var b = ev.target.closest('[data-val]'); if (!b) return;
      alcance = b.dataset.val;
      this.querySelectorAll('button').forEach(function (z) { z.setAttribute('aria-pressed', String(z === b)); });
      document.getElementById('nf-bw').hidden = alcance !== 'Bloque';
    };
    document.getElementById('nf').onsubmit = function (ev) {
      ev.preventDefault();
      var nota = { alcance: alcance, fecha: val('nf-f'), hasta: val('nf-h'), bloque: alcance === 'Bloque' ? val('nf-b') : '', tipo: val('nf-t'), texto: val('nf-x'), video: val('nf-v') };
      if (destino.email) { nota.email = destino.email; nota.evento = val('nf-ev'); } else nota.evento = val('nf-para');
      var b = document.getElementById('nf-ok'); b.disabled = true; b.textContent = 'Guardando…';
      api({ action: 'nota_crear', nota: nota }).then(function (r) {
        if (!r.ok) throw new Error(r.detalle || r.error);
        toast('Nota guardada'); cerrarHoja();
        if (volver) volver(); else cargar(S.data.semana);
      }).catch(function (er) { b.disabled = false; b.textContent = 'Guardar nota'; toast(mensajeError(er.message)); });
    };
  }

  // ---------- Coach: solicitudes (acceso y eventos) ----------
  function abrirSolicitudes() {
    abrirHoja('<div class="row"><h2>Solicitudes</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div><div id="sol"><div class="hint">Cargando…</div></div>');
    api({ action: 'solicitudes' }).then(function (r) { if (r.ok) pintarSolicitudes(r.solicitudes); });
  }
  function pintarSolicitudes(lista) {
    var el = document.getElementById('sol'); if (!el) return;
    if (S.data) S.data.solicitudesPendientes = lista.length;
    el.innerHTML = lista.length ? lista.map(function (s, i) {
      var ev = s.tipo === 'Evento';
      return '<div class="sol"><span class="ev-tipo">' + (ev ? 'Evento · ' + esc(s.detalle) : 'Acceso') + '</span><div class="confirm-name">' + esc(s.nombre) + '</div><div>' + esc(s.email) + '</div>' +
        '<div class="hint">' + esc(s.fecha) + (s.sexo ? ' · ' + esc(s.sexo) : '') + (!ev && s.existe ? ' · ya existe en ATLETAS (' + esc(s.existe) + ')' : '') + '</div>' + (s.mensaje && !ev ? '<p>' + esc(s.mensaje) + '</p>' : '') +
        (ev ? '' : '<label class="lbl-s">Grupo si se aprueba</label><select data-grupo-de="' + i + '"><option>Box</option><option>Individual</option><option>Otro</option><option>Coach</option></select>') +
        '<div class="two-btn"><button type="button" class="btn" data-resolver="0" data-i="' + i + '">Rechazar</button>' +
        '<button type="button" class="btn btn-primary" data-resolver="1" data-i="' + i + '">Aprobar</button></div></div>';
    }).join('') : '<div class="hint">No hay solicitudes pendientes.</div>';
    S._solicitudes = lista;
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
    var html = cabeceraVista(f.atleta ? f.atleta.nombre : 'Atleta', 'Menú');
    if (f.cargando) html += '<div class="empty">Cargando ficha…</div>';
    else if (f.error) html += '<div class="empty">' + esc(f.error) + '</div>';
    else {
      var a = f.atleta;
      html += '<section class="me"><div class="who big">' + esc(a.nombre.charAt(0).toUpperCase()) + '</div><div><b>' + esc(a.nombre) + '</b>' +
        '<div class="hint">' + esc(a.email) + '</div><div class="hint">' + esc([a.grupo || '—', a.sexo, a.rol].filter(Boolean).join(' · ')) + (a.activo ? '' : ' · <b>desactivado</b>') + '</div>' +
        (a.eventos && a.eventos.length ? '<div class="ev-chips">' + a.eventos.map(function (e) { return '<span class="ev-tipo">' + esc(e) + '</span>'; }).join('') + '</div>' : '') + '</div></section>';
      html += '<div class="two-btn"><button class="btn btn-primary" type="button" id="fi-nota">Nota para ' + esc(a.nombre.split(' ')[0]) + '</button><button class="btn" type="button" id="fi-av">Aviso solo para él/ella</button></div>';
      var notasAct = (f.notas || []).filter(function (n) { return n.activa; });
      html += seccion('fi-notas', 'Notas', notasAct.length ? notasAct.map(function (n) {
        return '<div class="av-item"><div><b>' + esc(n.tipo) + '</b> <span class="hint">' + (n.fecha ? fechaCorta(n.fecha) : '') + (n.hasta ? ' – ' + fechaCorta(n.hasta) : '') +
          ' · ' + (n.alcance === 'BLOQUE' ? 'bloque ' + esc(n.bloque || n.clave) : n.alcance === 'SEMANA' ? 'semana' : 'día') + (n.evento ? ' · ' + esc(n.evento) : '') + '</span><p>' + esc(n.texto) + '</p></div>' +
          '<button class="btn-ghost" type="button" data-nota-off="' + esc(n.id) + '">Retirar</button></div>';
      }).join('') : '<div class="hint">Sin notas activas.</div>', notasAct.length ? String(notasAct.length) : '');
      // RM editables
      var rm = f.marcas1rm || {};
      html += seccion('fi-rm', 'RM (kg) · editables', '<form id="fi-rmf"><div class="marks">' + LEVANTAMIENTOS.map(function (l) {
        return '<label>' + cap(l) + '<input data-rm="' + l + '" type="number" inputmode="decimal" min="0" step="0.5" value="' + (rm[l] || '') + '" placeholder="kg"></label>';
      }).join('') + '</div><button class="btn btn-primary" type="submit" id="fi-rmok">Guardar RM</button></form>');
      // feedback
      html += seccion('fi-rpe', 'RPE · últimas semanas', (f.semanas.length ? '<table class="tbl"><thead><tr><th>Semana</th><th>Semana</th><th>Sesiones</th><th>Bloques</th></tr></thead><tbody>' +
        f.semanas.map(function (s) {
          return '<tr><td>' + fechaCorta(s.lunes) + '</td><td>' + rpeTd(s.semana) + '</td><td>' + rpeTd(s.sesionesMedia) + (s.sesiones.length ? ' <span class="hint">(' + s.sesiones.length + ')</span>' : '') + '</td><td>' + rpeTd(s.bloquesMedia) + '</td></tr>' +
            (s.comentario ? '<tr class="sub"><td colspan="4">“' + esc(s.comentario) + '”</td></tr>' : '') +
            s.sesiones.filter(function (x) { return x.c; }).map(function (x) { return '<tr class="sub"><td colspan="4">' + fechaCorta(x.dia) + ': “' + esc(x.c) + '”</td></tr>'; }).join('');
        }).join('') + '</tbody></table>' : '<div class="hint">Todavía no ha valorado ninguna sesión.</div>') +
        ((f.resumen || []).length ? '<div class="part-lbl" style="margin-top:10px">Medias del ciclo</div><table class="tbl"><thead><tr><th>Ciclo</th><th>Sem.</th><th>Hal.</th><th>Fza.</th><th>Gim.</th><th>Met.</th><th>Acc.</th></tr></thead><tbody>' +
          f.resumen.map(function (r) {
            return '<tr><td>' + fechaCorta(r.ciclo) + '</td><td>' + rpeTd(r.semana) + '</td><td>' + rpeTd(r.halterofilia) + '</td><td>' + rpeTd(r.fuerza) + '</td><td>' + rpeTd(r.gimnasticos) + '</td><td>' + rpeTd(r.metcon) + '</td><td>' + rpeTd(r.accesorios) + '</td></tr>';
          }).join('') + '</tbody></table>' : ''));
      html += seccion('fi-res', 'Resultados de metcon', (f.resultados || []).length ? '<div class="kv">' + f.resultados.map(function (r) {
        return '<span>' + fechaCorta(r.dia) + ' · ' + esc(r.titulo) + (r.version ? ' (' + esc(nombreVersion(r.version)) + ')' : '') + '</span><b>' + esc(r.texto) + ' <span class="rk-niv ' + (r.nivel === 'RX' ? 'rx' : 'ad') + '">' + esc(r.nivel) + '</span></b>';
      }).join('') + '</div>' : '<div class="hint">Sin resultados este ciclo.</div>');
      var otras = agruparMarcas(f.marcas.filter(function (x) { return LEVANTAMIENTOS.indexOf(x.marca) < 0; }));
      html += seccion('fi-marcas', 'Otras marcas', Object.keys(otras).length ? '<div class="kv">' + Object.keys(otras).map(function (n) { return '<span>' + esc(cap(n)) + '</span><b>' + esc(fmtMarca(otras[n].mejor)) + '</b>'; }).join('') + '</div>' : '<div class="hint">Sin marcas.</div>');
    }
    $app.innerHTML = html;
    document.getElementById('atras').onclick = function () { S.vista = 'ajustes'; S._abrir = 's-coach'; render(); };
    var bn = document.getElementById('fi-nota'); if (bn) bn.onclick = function () { abrirFormNota({ email: f.atleta.email, nombre: f.atleta.nombre }, function () { abrirFicha(f.atleta.email); }); };
    var ba = document.getElementById('fi-av'); if (ba) ba.onclick = function () { abrirFormEvento({ tipo: 'Aviso', aviso: true, para: f.atleta.email, inicio: S.data.hoy, nombre: '' }); };
    var rf = document.getElementById('fi-rmf');
    if (rf) rf.onsubmit = function (ev) {
      ev.preventDefault();
      var cambios = [];
      rf.querySelectorAll('input[data-rm]').forEach(function (inp) { var n = parseFloat(inp.value) || ''; if (String(n) !== String(f.marcas1rm[inp.dataset.rm] || '')) cambios.push([inp.dataset.rm, n]); });
      if (!cambios.length) { toast('No hay cambios'); return; }
      var b = document.getElementById('fi-rmok'); b.disabled = true; b.textContent = 'Guardando…';
      cambios.reduce(function (p, c) { return p.then(function () { return api({ action: 'rm', email: f.atleta.email, marca: c[0], valor: c[1] }).then(function (r) { if (!r.ok) throw new Error(r.detalle || r.error); S.ficha = r.ficha; }); }); }, Promise.resolve())
        .then(function () { S.ficha.email = f.atleta.email; S._abrir = 'fi-rm'; render(); toast('RM guardados (y anotados en MARCAS)'); })
        .catch(function (er) { b.disabled = false; b.textContent = 'Guardar RM'; toast(mensajeError(er.message)); });
    };
    var ab = S._abrir; S._abrir = null; if (ab && document.getElementById(ab)) document.getElementById(ab).open = true;
  }
  function rpeTd(v) { return v == null || v === '' ? '<span class="hint">—</span>' : '<b style="color:' + rpeColor(String(Math.round(v))) + '">' + esc(v) + '</b>'; }

  // ---------- Mis marcas ----------
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
      '<form id="prf" class="prf"><datalist id="pr-nombres">' + nombresCatalogo(nombres).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>' +
      '<label for="pr-n">Nueva marca</label><input id="pr-n" list="pr-nombres" maxlength="60" placeholder="Ej. FRAN, 5 K RUN, HYROX, MAX HSPU" required>' +
      '<div class="three"><div><label for="pr-t">Tipo</label><select id="pr-t"><option>Kilos</option><option>Tiempo</option><option>Reps</option><option>Calorías</option><option>Distancia</option></select></div>' +
      '<div><label for="pr-v">Valor</label><input id="pr-v" required inputmode="decimal" placeholder="kg · ej. 102.5"></div>' +
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
  function fmtMarca(x) { if (!x) return ''; var u = { Kilos: ' kg', Calorías: ' cal', Reps: ' reps', Tiempo: '', Distancia: ' m' }[x.tipo] || ''; return x.valor + u; }
  var PH_MARCA = { Kilos: 'kg · ej. 102.5', Tiempo: 'mm:ss · ej. 3:45 (o 1:05:30)', Reps: 'reps · ej. 50', 'Calorías': 'cal · ej. 120', Distancia: 'metros · ej. 400' };
  var CATALOGO = { FRAN: 'Tiempo', GRACE: 'Tiempo', ISABEL: 'Tiempo', DIANE: 'Tiempo', HELEN: 'Tiempo', KAREN: 'Tiempo', MURPH: 'Tiempo', CINDY: 'Reps',
    '400 M RUN': 'Tiempo', '1 K RUN': 'Tiempo', '5 K RUN': 'Tiempo', '10 K RUN': 'Tiempo', '500 M ROW': 'Tiempo', '2 K ROW': 'Tiempo', '1 K SKI': 'Tiempo',
    '50 CAL BIKE': 'Tiempo', HYROX: 'Tiempo', 'HYROX DOBLES': 'Tiempo', 'MAX PULL UPS': 'Reps', 'MAX STRICT PULL UPS': 'Reps', 'MAX T2B': 'Reps', 'MAX HSPU': 'Reps',
    'MAX DU': 'Reps', 'MAX RING MUSCLE UP': 'Reps', 'MAX BAR MUSCLE UP': 'Reps', 'HS WALK': 'Distancia', 'CLEAN & JERK': 'Kilos', 'OVERHEAD SQUAT': 'Kilos',
    'STRICT PRESS': 'Kilos', 'PUSH PRESS': 'Kilos', THRUSTER: 'Kilos' };
  function nombresCatalogo(propios) {
    var l = Object.keys(CATALOGO).concat(propios.map(function (n) { return n.toUpperCase(); }));
    return l.filter(function (x, i) { return l.indexOf(x) === i; });
  }

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
    if (t) t.onchange = function () { v.placeholder = PH_MARCA[t.value]; v.inputMode = t.value === 'Tiempo' ? 'text' : 'decimal'; };
    var pn = document.getElementById('pr-n');
    if (pn) pn.onchange = function () { var tp = CATALOGO[norm(pn.value).trim()]; if (tp && t) { t.value = tp; t.onchange(); } };
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
  // ---------- resultados de metcon ----------
  var TIPOS_RES = [['Tiempo', 'For time'], ['AMRAP', 'AMRAP'], ['Máximo', 'Máx. reps/cal/m'], ['Carga', 'Carga (kg)'], ['Máquina', 'Cal / km']];

  /** Tipo de resultado más probable según el texto del WOD (el atleta puede cambiarlo). */
  function formatoWod(b) {
    var t = norm(b.titulo + '\n' + b.partes.map(function (p) { return p.texto; }).join('\n'));
    if (/AMRAP/.test(t) && !/TIME CAP|FOR TIME/.test(t)) return 'AMRAP';
    if (/FOR TIME|TIME CAP|\bRFT\b|\d+\s*ROUNDS FOR/.test(t)) return 'Tiempo';
    if (/\bRM\b|HEAVY|MAX LOAD|CARGA MAX/.test(t)) return 'Carga';
    if (/(EMOM|EVERY|INTERVAL|ON\s*X)/.test(t) && /(CAL|ROW|SKI|BIKE|ERG|RUN|\bKM\b|\bM\b)/.test(t)) return 'Máquina';
    if (/\bMAX\b/.test(t)) return 'Máximo';
    return 'Tiempo';
  }

  function bloqueDe(iso, n) {
    var x = (S.data.dias || []).filter(function (y) { return y.iso === iso; })[0];
    return x ? x.bloques.filter(function (b) { return b.n === n; })[0] : null;
  }

  /** Lee un resultado guardado ("12:30", "CAP + 150 reps", "5 rondas + 12 reps"…) para rellenar el formulario. */
  function leerResultado(r) {
    var o = {}, t = r.texto || '';
    if (r.tipo === 'Tiempo') { var c = t.match(/CAP \+ (\d+)/); if (c) { o.cap = true; o.reps = c[1]; } else o.tiempo = t; }
    if (r.tipo === 'AMRAP') { var m = t.match(/(\d+) rondas?(?: \+ (\d+))?/); if (m) { o.rondas = m[1]; o.reps = m[2] || ''; } }
    if (r.tipo === 'Máximo') { var x = t.split(' '); o.valor = x[0]; o.unidad = x[1]; }
    if (r.tipo === 'Carga') o.kg = parseFloat(t);
    if (r.tipo === 'Máquina') { var ca = t.match(/([\d.]+) cal/), km = t.match(/([\d.]+) km/); o.cal = ca ? ca[1] : ''; o.km = km ? km[1] : ''; }
    return o;
  }

  function abrirResultado(iso, n, versionPre) {
    var d = S.data, b = bloqueDe(iso, n);
    if (!b) return;
    var versiones = [''].concat((b.variantes || []).filter(function (v) { return v.tipo !== 'quita'; }).map(function (v) { return v.nombre; }));
    var version = versionPre != null ? versionPre : (versiones.length > 1 && (d.eventos || []).some(function (e) { return e.mio && norm(e.nombre).indexOf(norm(versiones[1])) >= 0; }) ? versiones[1] : '');
    var previo = (d.resultados || {})[iso + '|' + n + '|' + version];
    var tipo = previo ? previo.tipo : formatoWod(b), nivel = previo ? previo.nivel : 'RX';
    var v = previo ? leerResultado(previo) : {};
    var seg = function (id, ops, actual) {
      return '<div class="seg" role="group" id="' + id + '">' + ops.map(function (o) {
        var val = o[0], lbl = o[1];
        return '<button type="button" data-val="' + esc(val) + '" aria-pressed="' + (val === actual) + '">' + esc(lbl) + '</button>';
      }).join('') + '</div>';
    };
    var campos = {
      'Tiempo': '<div class="rs-row"><div><label for="rs-t">Tiempo</label><input id="rs-t" inputmode="numeric" placeholder="mm:ss · ej. 12:45" value="' + esc(v.tiempo || '') + '"></div></div>' +
        '<label class="chk"><input type="checkbox" id="rs-cap"' + (v.cap ? ' checked' : '') + '> No terminé (time cap)</label>' +
        '<div id="rs-capw"' + (v.cap ? '' : ' hidden') + '><label for="rs-cr">Repeticiones hechas</label><input id="rs-cr" inputmode="numeric" placeholder="reps · ej. 152" value="' + esc(v.reps || '') + '"></div>',
      'AMRAP': '<div class="rs-row two"><div><label for="rs-ro">Rondas</label><input id="rs-ro" inputmode="numeric" placeholder="ej. 6" value="' + esc(v.rondas || '') + '"></div>' +
        '<div><label for="rs-re">Reps de la última ronda</label><input id="rs-re" inputmode="numeric" placeholder="ej. 14" value="' + esc(v.reps || '') + '"></div></div>',
      'Máximo': '<div class="rs-row two"><div><label for="rs-mv">Resultado</label><input id="rs-mv" inputmode="decimal" placeholder="ej. 85" value="' + esc(v.valor || '') + '"></div>' +
        '<div><label for="rs-mu">Unidad</label><select id="rs-mu">' + ['reps', 'cal', 'm', 'kg'].map(function (u) { return '<option' + (v.unidad === u ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select></div></div>',
      'Carga': '<div class="rs-row"><div><label for="rs-kg">Kilos</label><input id="rs-kg" inputmode="decimal" placeholder="kg · ej. 102.5" value="' + esc(v.kg || '') + '"></div></div>',
      'Máquina': '<div class="rs-row two"><div><label for="rs-ca">Calorías</label><input id="rs-ca" inputmode="numeric" placeholder="cal · ej. 120" value="' + esc(v.cal || '') + '"></div>' +
        '<div><label for="rs-km">Distancia</label><input id="rs-km" inputmode="decimal" placeholder="km · ej. 4.2" value="' + esc(v.km || '') + '"></div></div>' +
        '<div class="hint">Rellena una de las dos o ambas.</div>'
    };
    abrirHoja('<div class="row"><h2>Tu resultado</h2><button class="btn-ghost" data-close type="button">Ahora no</button></div>' +
      '<div class="hint">' + esc(b.n + ' · ' + b.titulo) + ' · ' + NOMBRE_DIA[(S.data.dias.filter(function (y) { return y.iso === iso; })[0] || {}).nombre] + ' ' + diaMes(iso) +
      ' · es voluntario: sale en el ranking de la semana</div>' +
      (versiones.length > 1 ? '<label>Versión</label>' + seg('rs-ver', versiones.map(function (x) { return [x, x ? nombreVersion(x) : 'Normal']; }), version) : '') +
      '<label>Nivel</label>' + seg('rs-niv', [['RX', 'RX'], ['Adaptado', 'Adaptado']], nivel) +
      '<div id="rs-adw"' + (nivel === 'Adaptado' ? '' : ' hidden') + '><input id="rs-ad" maxlength="140" placeholder="Qué adaptaste · ej. T2B → knee raises, 40 kg" value="' + esc(previo && previo.adaptacion || '') + '"></div>' +
      '<label>Tipo de resultado</label>' + seg('rs-tipo', TIPOS_RES, tipo) +
      '<div id="rs-campos">' + campos[tipo] + '</div>' +
      '<button class="btn btn-primary" type="button" id="rs-ok">Guardar resultado</button>' +
      (previo ? '<button class="btn" type="button" id="rs-del">Borrar mi resultado</button>' : ''));
    var estado = { tipo: tipo, nivel: nivel, version: version };
    function enlazarCampos() {
      var cap = document.getElementById('rs-cap');
      if (cap) cap.onchange = function () { document.getElementById('rs-capw').hidden = !cap.checked; document.getElementById('rs-t').disabled = cap.checked; };
      if (cap && cap.checked) document.getElementById('rs-t').disabled = true;
    }
    enlazarCampos();
    $scrim.querySelectorAll('.seg').forEach(function (g) {
      g.onclick = function (ev) {
        var bt = ev.target.closest('button[data-val]'); if (!bt) return;
        g.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === bt)); });
        if (g.id === 'rs-tipo') { estado.tipo = bt.dataset.val; document.getElementById('rs-campos').innerHTML = campos[estado.tipo]; enlazarCampos(); }
        if (g.id === 'rs-niv') { estado.nivel = bt.dataset.val; document.getElementById('rs-adw').hidden = estado.nivel !== 'Adaptado'; }
        if (g.id === 'rs-ver') { cerrarHoja(); abrirResultado(iso, n, bt.dataset.val); }
      };
    });
    document.getElementById('rs-ok').onclick = function () {
      var cuerpo = { action: 'resultado', dia: iso, bloque: n, titulo: b.titulo, version: estado.version, tipo: estado.tipo, nivel: estado.nivel, adaptacion: val('rs-ad') };
      if (estado.tipo === 'Tiempo') { var c = document.getElementById('rs-cap').checked; cuerpo.cap = c; cuerpo.tiempo = val('rs-t'); cuerpo.reps = val('rs-cr'); }
      if (estado.tipo === 'AMRAP') { cuerpo.rondas = val('rs-ro'); cuerpo.reps = val('rs-re') || 0; }
      if (estado.tipo === 'Máximo') { cuerpo.valor = val('rs-mv'); cuerpo.unidad = val('rs-mu'); }
      if (estado.tipo === 'Carga') cuerpo.kg = val('rs-kg');
      if (estado.tipo === 'Máquina') { cuerpo.cal = val('rs-ca'); cuerpo.km = val('rs-km'); }
      if (estado.nivel === 'Adaptado' && !cuerpo.adaptacion) { toast('Cuenta en una línea qué adaptaste.'); return; }
      var bt = this; bt.disabled = true; bt.textContent = 'Guardando…';
      api(cuerpo).then(function (r) {
        if (!r.ok) throw new Error(r.detalle || r.error);
        S.data.resultados = r.resultados; cerrarHoja(); render(); toast('Resultado guardado · mira el ranking');
      }).catch(function (e) { bt.disabled = false; bt.textContent = 'Guardar resultado'; toast(mensajeError(e.message)); });
    };
    var del = document.getElementById('rs-del');
    if (del) del.onclick = function () {
      if (del.dataset.confirmar !== '1') { del.dataset.confirmar = '1'; del.textContent = '¿Seguro? Pulsa otra vez'; return; }
      api({ action: 'resultado_borrar', dia: iso, bloque: n, version: estado.version }).then(function (r) {
        if (!r.ok) throw new Error(r.detalle || r.error);
        S.data.resultados = r.resultados; cerrarHoja(); render(); toast('Resultado borrado');
      }).catch(function (e) { toast(mensajeError(e.message)); });
    };
  }

  // ---------- leaderboard ----------
  function abrirLeaderboard(lunes, irA) {
    S.vista = 'ranking'; S.rk = S.rk || { filtro: leer('pa-rk-filtro') || 'Todos' };
    S.rk.cargando = true; S.rk.irA = irA || null; render();
    api({ action: 'leaderboard', lunes: lunes || (S.data.dias && S.data.dias[0] ? S.data.dias[0].iso : null) }).then(function (r) {
      if (!r.ok) throw new Error(r.detalle || r.error);
      S.rk.datos = r.leaderboard; S.rk.cargando = false; render();
    }).catch(function (e) { S.rk.cargando = false; S.rk.error = mensajeError(e.message); render(); });
  }

  function renderRanking() {
    var rk = S.rk || {}, L = rk.datos;
    var html = cabeceraVista('Leaderboard', 'Volver');
    if (rk.cargando && !L) html += '<div class="empty">Cargando ranking…</div>';
    else if (rk.error && !L) html += '<div class="empty">' + esc(rk.error) + '</div>';
    else {
      html += '<div class="rk-bar"><select id="rk-sem" aria-label="Semana">' + L.semanas.map(function (s) {
        return '<option value="' + s + '"' + (s === L.lunes ? ' selected' : '') + '>Semana del ' + fechaCorta(s) + '</option>'; }).join('') + '</select>' +
        '<div class="seg" role="group" id="rk-f">' + ['Todos', 'Chicos', 'Chicas'].map(function (f) {
          return '<button type="button" data-f="' + f + '" aria-pressed="' + (rk.filtro === f) + '">' + f + '</button>'; }).join('') + '</div></div>';
      if (!L.metcons.length) html += '<div class="empty">Todavía no hay resultados esta semana.<br><span class="hint">Se apuntan desde «Valora el bloque» en cada metcon.</span></div>';
      var dias = {};
      L.metcons.forEach(function (m) { (dias[m.dia] = dias[m.dia] || []).push(m); });
      Object.keys(dias).sort().forEach(function (iso) {
        var nom = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][new Date(iso + 'T12:00:00Z').getUTCDay()];
        html += '<section class="rk-day" id="rk-' + iso + '"><h2>' + NOMBRE_DIA[nom] + ' ' + diaMes(iso) + '</h2>';
        dias[iso].forEach(function (m) {
          var filas = m.filas.filter(function (f) { return rk.filtro === 'Todos' || (rk.filtro === 'Chicos' ? f.sexo === 'Chico' : f.sexo === 'Chica'); });
          var pos = 0, nivelAnt = null;
          html += '<div class="rk-card"><div class="rk-head"><span class="b-num">' + m.bloque + '</span><b>' + esc(m.titulo || 'Metcon') + '</b>' +
            (m.version ? '<span class="v-tag">' + esc(nombreVersion(m.version)) + '</span>' : '') + '</div>' +
            (filas.length ? '<ol class="rk-list">' + filas.map(function (f) {
              var sep = '';
              if (f.nivel !== nivelAnt) { if (nivelAnt) sep = '<li class="rk-sep">' + esc(f.nivel) + '</li>'; pos = 0; nivelAnt = f.nivel; }
              pos++;
              return sep + '<li class="' + (f.yo ? 'yo' : '') + '"><span class="rk-pos">' + pos + '</span><span class="rk-name">' + esc(f.nombre) +
                (f.adaptacion ? '<span class="hint">' + esc(f.adaptacion) + '</span>' : '') + '</span>' +
                '<span class="rk-niv ' + (f.nivel === 'RX' ? 'rx' : 'ad') + '">' + esc(f.nivel) + '</span><b class="rk-res">' + esc(f.texto) + '</b></li>';
            }).join('') + '</ol>' : '<div class="hint">Nadie en este filtro.</div>') + '</div>';
        });
        html += '</section>';
      });
    }
    $app.innerHTML = html;
    document.getElementById('atras').onclick = volverSemana;
    var sel = document.getElementById('rk-sem');
    if (sel) sel.onchange = function () { abrirLeaderboard(sel.value); };
    var f = document.getElementById('rk-f');
    if (f) f.onclick = function (ev) { var b = ev.target.closest('[data-f]'); if (!b) return; rk.filtro = b.dataset.f; guardar('pa-rk-filtro', rk.filtro); render(); };
    if (rk.irA) { var el = document.getElementById('rk-' + rk.irA); rk.irA = null; if (el) setTimeout(function () { el.scrollIntoView({ block: 'start' }); }, 30); }
  }

  // ---------- compartir la app ----------
  function compartirApp() {
    var url = CFG.urlApp || (location.origin + location.pathname);
    var datos = { title: 'Fabrik Program', text: 'La programación de Gabi en el móvil: entra en Fabrik Program', url: url };
    if (navigator.share) { navigator.share(datos).catch(function () {}); return; }
    copiar(url, 'Enlace copiado: pégalo en WhatsApp o donde quieras');
  }

  function copiar(texto, msg) {
    var hecho = function () { toast(msg || 'Copiado'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(hecho).catch(function () { copiarViejo(texto); hecho(); });
    else { copiarViejo(texto); hecho(); }
  }
  function copiarViejo(t) {
    var a = document.createElement('textarea'); a.value = t; a.setAttribute('readonly', ''); a.style.position = 'fixed'; a.style.opacity = '0';
    document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(a);
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
      '<form id="solf" class="field"><label for="sol-n">Nombre y apellidos</label><input id="sol-n" required minlength="3" maxlength="80" autocomplete="name" placeholder="Ej. Ana García López">' +
      '<label>Sexo (para los rankings)</label><div class="seg" role="group" id="sol-s"><button type="button" data-val="Chico" aria-pressed="false">Chico</button><button type="button" data-val="Chica" aria-pressed="false">Chica</button></div>' +
      '<label for="sol-m">Mensaje (opcional)</label><input id="sol-m" maxlength="300" placeholder="Ej. Entreno en el box por las tardes">' +
      '<button class="btn btn-primary" type="submit" id="sol-ok">Pedir acceso</button></form>';
    $app.innerHTML = '<section class="login"><div class="brand">Fabrik Program</div><div class="hint">Has entrado como <b>' + esc(email) + '</b></div>' + cuerpo +
      '<button class="btn" id="salir" type="button">Entrar con otra cuenta</button>' + redesHtml() + '</section>';
    document.getElementById('salir').onclick = function () { auth.signOut(); };
    var f = document.getElementById('solf'), sexo = '';
    if (f) {
      document.getElementById('sol-s').onclick = function (ev) {
        var b = ev.target.closest('[data-val]'); if (!b) return; sexo = b.dataset.val;
        this.querySelectorAll('button').forEach(function (z) { z.setAttribute('aria-pressed', String(z === b)); });
      };
      f.onsubmit = function (ev) {
        ev.preventDefault();
        if (!sexo) { toast('Elige chico o chica.'); return; }
        var b = document.getElementById('sol-ok'); b.disabled = true; b.textContent = 'Enviando…';
        api({ action: 'solicitar', nombre: val('sol-n'), mensaje: val('sol-m'), sexo: sexo }).then(function (r) {
          if (r.solicitud === 'Pendiente') pantallaSolicitud(email, 'Pendiente');
          else throw new Error(r.detalle || r.error);
        }).catch(function (e) { b.disabled = false; b.textContent = 'Pedir acceso'; toast(mensajeError(e.message)); });
      };
    }
  }

  // ---------- hojas ----------
  function abrirHoja(html) {
    $scrim.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + '</div>';
    $scrim.hidden = false;
    var f = $scrim.querySelector('input,button,select'); if (f) f.focus();
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

  /** Pide confirmación con un segundo toque (cambia el texto del botón). */
  function confirmar(b, texto) {
    if (b.dataset.confirmar === '1') return true;
    b.dataset.confirmar = '1'; b.dataset.txt = b.textContent; b.textContent = texto || '¿Seguro?';
    setTimeout(function () { if (b.isConnected && b.dataset.confirmar === '1') { b.dataset.confirmar = ''; b.textContent = b.dataset.txt; } }, 4000);
    return false;
  }
  function falloApi(b) { return function (er) { if (b) b.disabled = false; toast(mensajeError(er.message)); }; }
  function ok(r) { if (!r.ok) throw new Error(r.detalle || r.error); return r; }

  // ---------- eventos de la interfaz ----------
  document.addEventListener('click', function (e) {
    var t = e.target, b;
    if ((b = t.closest('.day-btn'))) { S.dia = +b.dataset.dia; render(); window.scrollTo({ top: 0 }); return; }
    if ((b = t.closest('.vid'))) { e.preventDefault(); abrirVideo(+b.dataset.v); return; }
    if ((b = t.closest('.rpe-chip'))) {
      var o = JSON.parse(b.dataset.o), com = null;
      if (o.tipo === 'sesion') { var ts = document.getElementById('com-ses'); com = ts ? ts.value.trim() : null; }
      if (o.tipo === 'semana') { var tw = document.getElementById('com-sem'); com = tw ? tw.value.trim() : null; }
      var primera = o.tipo === 'bloque' && !valorDe(S.data, claveVal(o));
      guardarVal(o, +b.dataset.v, com);
      // metcon: al valorarlo por primera vez se ofrece apuntar el resultado (voluntario)
      if (o.metcon && primera && !resultadosBloque(S.data, o.dia, { n: o.bloque }).length) setTimeout(function () { abrirResultado(o.dia, o.bloque); }, 350);
      return;
    }
    if ((b = t.closest('[data-guardar-com]'))) {
      var tt = b.dataset.guardarCom, dd = S.data;
      if (tt === 'sesion') guardarVal({ tipo: 'sesion', dia: dd.dias[S.dia].iso }, null, document.getElementById('com-ses').value.trim());
      else guardarVal({ tipo: 'semana', lunes: dd.dias[0].iso }, null, document.getElementById('com-sem').value.trim());
      if (tt === 'semana' && dd.valoraciones[dd.dias[0].iso + '|Semana|']) cerrarHoja();
      return;
    }
    if (t.closest('#valsem')) { abrirValorarSemana(); return; }
    if ((b = t.closest('[data-resultado]'))) { var rr = JSON.parse(b.dataset.resultado); abrirResultado(rr.dia, rr.n); return; }
    if ((b = t.closest('[data-ver-ranking]'))) { abrirLeaderboard(null, b.dataset.verRanking); return; }
    if ((b = t.closest('[data-aviso]'))) {
      var iso = S.data.dias[S.dia].iso;
      var a = ((S.data.avisos || {})[iso] || []).filter(function (x) { return x.id === b.dataset.aviso; })[0];
      if (a) mostrarAviso(a, iso); return;
    }
    if ((b = t.closest('[data-av-cerrar]'))) { cerrarHoja(); return; }
    if ((b = t.closest('[data-av-visto]'))) { marcarVisto(b.dataset.avVisto); if (S.vista === 'ajustes') { S._abrir = 's-avisos'; render(); } return; }
    if ((b = t.closest('[data-ir-evento]'))) { abrirAjustes('s-eventos'); setTimeout(function () { var el = document.getElementById('ev-' + b.dataset.irEvento); if (el) { el.open = true; el.scrollIntoView({ block: 'center' }); } }, 30); return; }
    if ((b = t.closest('[data-unirme]'))) {
      if (!confirmar(b, '¿Pedir apuntarme? Toca otra vez')) return;
      b.disabled = true;
      api({ action: 'evento_solicitar', id: b.dataset.unirme }).then(ok).then(function (r) { S.data.eventos = r.eventos; S._abrir = 's-eventos'; render(); toast('Solicitud enviada al coach'); }).catch(falloApi(b));
      return;
    }
    if ((b = t.closest('[data-tema]'))) { guardar('pa-tema', b.dataset.tema); aplicarTema(b.dataset.tema); S._abrir = 's-tema'; render(); return; }
    if (t.closest('#instalar-ya') && S.instalar) { S.instalar.prompt(); S.instalar.userChoice.then(function () { S.instalar = null; S._abrir = 's-instalar'; render(); }); return; }
    if (t.closest('#compartir')) { compartirApp(); return; }
    // descuentos
    if ((b = t.closest('[data-desc-usar]'))) {
      var x = ((S.desc || {}).activos || []).filter(function (z) { return z.id === b.dataset.descUsar; })[0];
      if (!x) return;
      if (x.codigo) copiar(x.codigo, 'Código ' + x.codigo + ' copiado: pégalo al pagar');
      if (x.enlace) window.open(x.enlace, '_blank', 'noopener');
      return;
    }
    if ((b = t.closest('[data-desc-res]'))) {
      var apr = b.dataset.descRes === '1';
      if (!confirmar(b, apr ? '¿Aprobar?' : '¿Rechazar?')) return;
      b.disabled = true;
      api({ action: 'descuento_resolver', id: b.dataset.id, aprobar: apr }).then(ok).then(function (r) { S.desc = r.descuentos; pintarDescuentos(); toast(apr ? 'Aprobado: ya lo ven todos' : 'Rechazado'); }).catch(falloApi(b));
      return;
    }
    if ((b = t.closest('[data-desc-ret]'))) {
      if (!confirmar(b, '¿Retirar?')) return;
      api({ action: 'descuento_retirar', id: b.dataset.descRet }).then(ok).then(function (r) { S.desc = r.descuentos; pintarDescuentos(); toast('Retirado'); }).catch(falloApi(b));
      return;
    }
    // coach
    if (t.closest('#co-atletas')) { abrirBuscarAtleta(); return; }
    if (t.closest('#co-solic')) { abrirSolicitudes(); return; }
    if (t.closest('#co-eventos')) { abrirEventosCoach(); return; }
    if (t.closest('#co-notas')) { abrirFormNota({}); return; }
    if ((b = t.closest('[data-ev-edit]'))) { abrirFormEvento(eventoPorId(b.dataset.evEdit)); return; }
    if ((b = t.closest('[data-ev-part]'))) { abrirParticipantes(b.dataset.evPart); return; }
    if ((b = t.closest('[data-ev-nota]'))) { var ev0 = eventoPorId(b.dataset.evNota); abrirFormNota({ evento: ev0.nombre }, abrirEventosCoach); return; }
    if ((b = t.closest('[data-ev-del]'))) {
      if (!confirmar(b, '¿Retirar?')) return;
      api({ action: 'evento_borrar', id: b.dataset.evDel }).then(ok).then(function (r) { S.data.eventos = r.eventos; pintarEventosCoach(); toast('Evento retirado'); }).catch(falloApi(b));
      return;
    }
    if ((b = t.closest('[data-nota-off]'))) {
      if (!confirmar(b, '¿Retirar?')) return;
      api({ action: 'nota_off', id: b.dataset.notaOff, email: S.ficha && S.ficha.email }).then(ok).then(function () {
        toast('Nota retirada'); if (S.vista === 'ficha') abrirFicha(S.ficha.email); else recargarDatos('s-notas');
      }).catch(falloApi(b));
      return;
    }
    if ((b = t.closest('[data-video-url]'))) { abrirVideoUrl(b.dataset.videoNombre, b.dataset.videoUrl); return; }
    if ((b = t.closest('[data-resolver]'))) {
      var aprobar = b.dataset.resolver === '1', s = (S._solicitudes || [])[+b.dataset.i];
      if (!s || !confirmar(b, aprobar ? '¿Aprobar?' : '¿Rechazar?')) return;
      b.disabled = true;
      var gsel = document.querySelector('[data-grupo-de="' + b.dataset.i + '"]');
      api({ action: 'solicitud_resolver', email: s.email, tipo: s.tipo, detalle: s.detalle, aprobar: aprobar, grupo: gsel ? gsel.value : 'Box' }).then(ok).then(function (r) {
        S._atletas = null;
        toast(aprobar ? (s.tipo === 'Evento' ? 'Apuntado a ' + s.detalle : 'Aprobada: ya puede entrar') : 'Solicitud rechazada'); pintarSolicitudes(r.solicitudes);
      }).catch(falloApi(b));
      return;
    }
    if ((b = t.closest('[data-borrar-marca]'))) {
      if (!confirmar(b, '¿Borrar?')) return;
      api({ action: 'marca_borrar', marca: JSON.parse(b.dataset.borrarMarca) }).then(ok).then(function (r) {
        S.data.misMarcas = r.marcas; S._abrir = 's-marcas'; render(); toast('Marca borrada');
      }).catch(falloApi());
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