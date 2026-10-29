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
  // ---------- porcentajes → kilos (v17) ----------
  //  · Cada movimiento usa SU marca: no hace falta tener todos los RM rellenos.
  //  · Vale cualquier marca en kilos que el atleta haya registrado (Push Press, Overhead Squat…).
  //  · «sobre tu / respecto a / considerando tu / basándote en / de tu / se cogen del» + movimiento
  //    = el % se calcula sobre ESE movimiento (en esa línea, o en toda la parte si esa frase va en una línea sin cifras).
  var ALIAS_MOV = [
    [/\bHPC\b|HANG\s+POWER\s+CLEAN/, 'POWER CLEAN'],
    [/\bHPS\b|HANG\s+POWER\s+SNATCH/, 'POWER SNATCH'],
    [/\bOHS\b/, 'OVERHEAD SQUAT'],
    [/\bBS\b/, 'BACK SQUAT'],
    [/\bFS\b/, 'FRONT SQUAT']
  ];
  // derivados olímpicos: el % es del olímpico (snatch deadlift, clean pull, snatch balance…)
  var RE_DERIVADO = /\b(POWER\s+SNATCH|POWER\s+CLEAN|SNATCH|CLEAN)\s+(?:HIGH\s+)?(?:DEADLIFT|DL|PULL|BALANCE|SHRUG|SEGMENT)/;
  var RE_BASE = /(?:SOBRE|RESPECTO\s+(?:A|AL|DE)|CONSIDERANDO|BASANDOTE\s+EN|BASANDOSE\s+EN|BASADO\s+EN|EN\s+BASE\s+A(?:L)?|DE\s+TU|SE\s+COGEN?\s+DE(?:L)?|SE\s+CALCULAN?\s+(?:SOBRE|DE(?:L)?))\s+(.+)/;

  /** Marcas del atleta en kilos: sus 1RM + la mejor marca en kilos de cada movimiento de «Mis marcas». */
  function marcasKilos() {
    var m = {}, rm = (S.user && S.user.marcas) || {};
    Object.keys(rm).forEach(function (k) { if (rm[k] > 0) m[norm(k).replace(/\s+/g, ' ').trim()] = Number(rm[k]); });
    ((S.data && S.data.misMarcas) || []).forEach(function (x) {
      if (x.tipo !== 'Kilos') return;
      var v = parseFloat(String(x.valor).replace(',', '.')), k = norm(x.marca).replace(/\s+/g, ' ').trim();
      if (v > 0 && !(m[k] >= v)) m[k] = v;
    });
    return m;
  }
  function reNombre(nom) { return new RegExp('(?:^|[^A-Z])' + nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+') + '(?![A-Z])'); }

  /** El movimiento que aparece en un texto (o null): marcas propias (la más larga primero), derivados, abreviaturas y los básicos. */
  function movimientoEn(texto, marcas) {
    marcas = marcas || marcasKilos();
    var n = norm(texto).replace(/\s+/g, ' ');
    var propias = Object.keys(marcas).filter(function (k) { return LEVANTAMIENTOS.indexOf(k) < 0; }).sort(function (a, b) { return b.length - a.length; });
    var d = n.match(RE_DERIVADO);
    if (d) return d[1].replace(/\s+/g, ' ');
    for (var i = 0; i < propias.length; i++) if (reNombre(propias[i]).test(n)) return propias[i];
    for (var j = 0; j < ALIAS_MOV.length; j++) if (ALIAS_MOV[j][0].test(n)) return ALIAS_MOV[j][1];
    return levantamiento(n);
  }
  /** Si el texto dice «sobre tu X» (o similar), el movimiento X; si no, null. */
  function baseExplicita(texto, marcas) {
    var m = norm(texto).replace(/\s+/g, ' ').match(RE_BASE);
    return m ? movimientoEn(m[1].replace(/^(?:TU|TUS|EL|LA|SU|LOS|DE)\s+/, ''), marcas) : null;
  }
  /** Base para toda una parte: una línea con «sobre tu X» sin cifras de % (p. ej. «*% SOBRE TU POWER CLEAN»). */
  function baseDeParte(texto, marcas) {
    var lin = String(texto || '').split('\n');
    for (var i = 0; i < lin.length; i++) {
      if (/\d\s*%/.test(lin[i])) continue;
      var b = baseExplicita(lin[i], marcas);
      if (b) return b;
    }
    return null;
  }
  /** Movimiento base de una línea. Prioridad: frase en la línea › frase en la parte › movimiento de la línea › de la parte › del bloque. */
  function baseLinea(lineaTxt, ctx, marcas) {
    var mov = baseExplicita(lineaTxt, marcas) || ctx.baseParte || movimientoEn(lineaTxt, marcas) || ctx.parte || ctx.bloque || null;
    if (ctx.desdePower && mov === 'SNATCH') mov = 'POWER SNATCH';
    return mov;
  }
  function conKilos(lineaHtml, lineaTxt, ctx) {
    if (!/\d\s*%/.test(lineaTxt)) return lineaHtml;
    var marcas = ctx.marcas || marcasKilos(), mov = baseLinea(lineaTxt, ctx, marcas), rm = mov && marcas[mov];
    if (!rm) return lineaHtml;
    return lineaHtml.replace(/(\d+(?:[.,]\d+)?(?:\s*%?\s*\/\s*\d+(?:[.,]\d+)?)*)\s*%/g, function (todo, nums) {
      var vals = nums.replace(/%/g, '').split('/').map(function (x) { return parseFloat(x.replace(',', '.')); });
      if (vals.some(function (x) { return !(x > 0 && x <= 150); })) return todo;
      var kg = vals.map(function (x) { return Math.round(rm * x / 100 * 2) / 2; });
      return todo + '<span class="kg" title="' + esc(cap(mov)) + ' ' + rm + ' kg">' + kg.join('/') + ' kg</span>';
    });
  }
  function pizarra(texto, ctx) {
    var marcas = marcasKilos(), c = {};
    Object.keys(ctx || {}).forEach(function (k) { c[k] = ctx[k]; });
    c.marcas = marcas;
    c.baseParte = baseDeParte(texto, marcas) || c.baseBloque || null;
    return String(texto || '').split('\n').map(function (l) {
      return conKilos(conVideos(esc(l)), l, c);
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

  /** Pantalla de entrada: dos pestañas. ACCESO = entrar (Google u otro correo). REGISTRO = pedir acceso (nombre + correo). */
  function pantallaLogin(msg, pestana) {
    var reg = (pestana || S.loginTab) === 'registro';
    S.loginTab = reg ? 'registro' : 'acceso';
    var aviso = msg ? '<div class="' + (msg.ok ? 'hint ok-msg' : 'err') + '" role="status">' + esc(msg.t) + '</div>' : '';
    var acceso =
      '<p>Entra con la cuenta que le diste a Gabi.</p>' +
      '<button class="btn btn-primary" id="gbtn" type="button">Entrar con Google</button>' +
      (CFG.microsoft ? '<button class="btn" id="msbtn" type="button">Entrar con Microsoft (Outlook, Hotmail)</button>' : '') +
      '<button class="btn" id="otrobtn" type="button" aria-expanded="' + !!S.loginOtro + '" aria-controls="mailf">✉ Entrar con otro correo</button>' +
      '<form id="mailf" class="field"' + (S.loginOtro ? '' : ' hidden') + '><label for="mail">Tu correo (Yahoo, Outlook, Hotmail, iCloud…)</label>' +
      '<input id="mail" type="email" autocomplete="email" inputmode="email" required placeholder="ej. tu@yahoo.es · @outlook.com">' +
      '<button class="btn btn-primary" type="submit" id="mailbtn">Enviarme el enlace para entrar</button>' +
      '<div class="hint">Te llega un correo con un enlace: ábrelo en este mismo dispositivo y entras sin contraseña.</div></form>' +
      '<div class="hint">¿Es tu primera vez? <button class="link" type="button" data-tab="registro">Regístrate</button></div>';
    var registro =
      '<p>¿Aún no tienes acceso? Pídelo aquí. Gabi lo aprueba y después entras en <b>Acceso</b> con este mismo correo.</p>' +
      '<form id="regf" class="field"><label for="reg-n">Nombre completo</label>' +
      '<input id="reg-n" required minlength="5" maxlength="80" autocomplete="name" placeholder="Ana García López">' +
      '<label for="reg-m">Correo</label><input id="reg-m" type="email" required autocomplete="email" inputmode="email" placeholder="ej. tu@gmail.com · @yahoo.es">' +
      '<button class="btn btn-primary" type="submit" id="regbtn">Solicitar acceso</button></form>' +
      '<div class="hint">Usa el correo con el que vas a entrar (el de tu cuenta de Google, si entras con Google).</div>';
    $app.innerHTML =
      '<section class="login">' +
      '<div class="brand">Fabrik Program</div>' +
      '<div class="seg login-tabs" role="group" aria-label="Acceso o registro"><button type="button" data-tab="acceso" aria-pressed="' + !reg + '">Acceso</button>' +
      '<button type="button" data-tab="registro" aria-pressed="' + reg + '">Registro</button></div>' +
      (reg ? registro : acceso) + aviso + redesHtml() +
      '</section>';
    [].forEach.call($app.querySelectorAll('[data-tab]'), function (b) { b.onclick = function () { pantallaLogin(null, b.dataset.tab); }; });
    if (reg) {
      document.getElementById('regf').onsubmit = function (ev) {
        ev.preventDefault();
        var nombre = document.getElementById('reg-n').value.trim(), email = document.getElementById('reg-m').value.trim().toLowerCase();
        if (nombre.split(/\s+/).length < 2) { pantallaLogin({ t: 'Escribe tu nombre y al menos un apellido.' }, 'registro'); return; }
        var btn = document.getElementById('regbtn'); btn.disabled = true; btn.textContent = 'Enviando…';
        fetch(CFG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'registro', nombre: nombre, email: email }) })
          .then(function (r) { return r.json(); })
          .then(function (r) {
            if (!r.ok) throw new Error(r.error);
            if (r.estado === 'ya_tiene_acceso') pantallaLogin({ ok: true, t: 'Ese correo ya tiene acceso. Entra aquí con Google o con el enlace al correo.' }, 'acceso');
            else pantallaLogin({ ok: true, t: 'Solicitud enviada. Cuando Gabi la apruebe, entra en Acceso con ' + email + '.' }, 'acceso');
          }).catch(function (e) { pantallaLogin({ t: mensajeError(e.message) }, 'registro'); });
      };
      return;
    }
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
    document.getElementById('otrobtn').onclick = function () {
      var f = document.getElementById('mailf'); S.loginOtro = f.hidden; f.hidden = !f.hidden; this.setAttribute('aria-expanded', String(!f.hidden));
      if (!f.hidden) document.getElementById('mail').focus();
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
    if (S.vista === 'calendario') return renderCalendario();
    if (d.soloEventos) return renderSoloEventos(d);
    if (!d.dias || !d.dias.length) {
      $app.innerHTML = cabecera(d) + '<div class="empty">Gabi todavía no ha publicado la semana.' +
        (d.proxima ? '<br>Próxima publicación: ' + esc(d.proxima) + '.' : '') + '</div>';
      enlazarCabecera(); return;
    }
    var aviso = d.publicada === false ? '<div class="unpub">Vista previa · ' + (d.proxima ? 'se publica el ' + esc(d.proxima) : 'aún sin publicar') + '</div>' : '';
    TM.reg = []; renovarPush();
    $app.innerHTML = cabecera(d) + bannerInstalar() + bannerPush() + aviso + tarjetaSemana(d) + ciclo(d) + semana(d) + '<main class="day" id="day">' + dia(d, d.dias[S.dia]) + '</main>' +
      (S.aviso ? '<div class="stale">' + esc(S.aviso) + '</div>' : '');
    enlazarCabecera();
    abrirAvisosPendientes(d);
    avisoSeguimiento(d);
  }

  function cabecera(d) {
    var idx = (d.semanas || []).findIndex(function (s) { return s.clave === d.semana; });
    var lbl = d.dias && d.dias.length ? 'Semana ' + fechaCorta(d.dias[0].iso) + ' – ' + fechaCorta(d.dias[d.dias.length - 1].iso) : 'Programación';
    var ini = (S.user.nombre || '?').trim().charAt(0).toUpperCase();
    return '<header class="top"><div class="weeknav">' +
      '<button class="icon-btn" id="prev" type="button" aria-label="Semana anterior"' + (idx <= 0 ? ' disabled' : '') + '>‹</button>' +
      '<span class="lbl">' + esc(lbl) + '</span>' +
      '<button class="icon-btn" id="next" type="button" aria-label="Semana siguiente"' + (idx < 0 || idx >= d.semanas.length - 1 ? ' disabled' : '') + '>›</button>' +
      '</div>' + botonCalc() + '<button class="icon-btn share" id="compartir" type="button" aria-label="Compartir la app">' + ICO_SHARE + '</button>' +
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
      var nn = notasDeFase(f.nombre).length;
      return '<button type="button" class="phase' + (i === c.actual ? ' cur' : '') + '" data-fase="' + i + '" aria-label="' + esc(f.nombre) + ': objetivos y notas"><div class="bar">' + celdas + '</div><span>' + esc(f.nombre) + (nn ? ' <em class="ph-n">' + nn + '</em>' : '') + '</span></button>';
    }).join('');
    var fa = c.fases[c.actual];
    var linea = fa ? '<div class="cycle-line"><b>' + esc(cap(fa.nombre)) + '</b> · semana ' + c.semana + ' de ' + fa.semanas + '</div>' : '';
    var obj = '<div class="hint ph-hint">Toca una fase para ver sus objetivos y las notas del coach.</div>';
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
    html += ((d.avisos && d.avisos[x.iso]) || []).filter(function (a) { return !avisoOculto(a); }).map(function (a) {
      return '<button class="notice' + (a.siempre ? ' fijo' : '') + '" type="button" data-aviso="' + esc(a.id) + '"><span class="lbl">' + esc(a.tipo && a.tipo !== 'Aviso' ? a.tipo : 'Aviso') + (a.hora ? ' · ' + esc(a.hora) : '') + '</span><b>' + esc(a.titulo) + '</b>' +
        (a.mensaje ? '<span class="txt">' + esc(a.mensaje) + '</span>' : '') + (a.siempre ? '<span class="fijo-txt">📌 ' + esc(txtSiempre(a)) + '</span>' : '') + '</button>';
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
    var mk = marcasKilos();
    var ctxB = { bloque: movimientoEn(b.titulo, mk), desdePower: /DEL POWER SNATCH/.test(norm(todo)), baseBloque: baseDeParte(todo, mk) };
    function parte(p) {
      var ctx = { bloque: ctxB.bloque, desdePower: ctxB.desdePower, baseBloque: ctxB.baseBloque, parte: movimientoEn(p.texto, mk) || movimientoEn(p.etiqueta, mk) };
      var etq = p.tipo === 'adapt' ? '' : p.etiqueta;
      var tm = tmBoton(p, b, x);
      return '<div class="part' + (tm ? ' has-tm' : '') + '">' + tm + (etq ? '<div class="part-lbl">' + esc(etq) + '</div>' : '') +
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
      (b.rpe ? '<span class="b-rpe" style="--c:' + rpeColor(b.rpe) + '">RPE ' + esc(b.rpe) + '</span>' : '') + botonGuardar(x, b) + '</div>' +
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
        ' aria-pressed="' + !!sel + '">' + i + '</button>';
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
      solo_staff: 'Solo Coach y Admin pueden hacer esto.', solo_eventos: 'Tu acceso es solo para tus eventos.', version_no_permitida: 'Ese resultado es solo para quien está apuntado a ese evento.',
      email_no_valido: 'Revisa el correo.', demasiadas_solicitudes: 'Hay muchas solicitudes ahora mismo. Prueba en un rato.', sexo_no_valido: 'Elige chico o chica.', falta_nombre: 'Escribe tu nombre y apellidos.', falta_marca: 'Pon un nombre a la marca.',
      valor_no_valido: 'Revisa el valor (el tiempo en minutos y segundos).', tipo_no_valido: 'Elige un tipo válido.', falta_ejercicio: 'Escribe el ejercicio.',
      video_no_valido: 'El vídeo tiene que ser un enlace.', tiempo_no_valido: 'Revisa el tiempo: minutos y segundos (los segundos de 0 a 59).', falta_bloque: 'Elige el bloque.',
      nota_vacia: 'Escribe la nota.', evento_repetido: 'Ya hay un evento activo con ese nombre.', evento_no_encontrado: 'Ese evento no existe.', no_encontrado: 'Ya no existe.', confirmar_borrado: 'Es un metcon guardado: confírmalo para borrarlo.',
      faltan_campos: 'Rellena todos los campos.', fechas_no_validas: 'La fecha de fin es anterior a la de inicio.', marca_no_valida: 'Marca no válida.', atleta_no_encontrado: 'No encuentro a ese atleta.', solicitud_no_encontrada: 'Esa solicitud ya estaba resuelta.', fecha_no_valida: 'Revisa la fecha.', aviso_vacio: 'Escribe un título o un mensaje.' }[m] || 'No se pudo guardar. Revisa la conexión.';
  }
  // ---------- avisos (eventos con «aviso al entrar») ----------
  // Salen cada día al entrar, hasta que el atleta pulsa «Visto».
  function avisoVisto(id) { return (S.data.valoraciones && (S.data.valoraciones.leidos || []).indexOf(id) >= 0) || leer('pa-visto-' + id); }
  /** Un aviso «siempre visible» no se puede ocultar; los demás desaparecen del día al marcarlos como vistos. */
  function avisoOculto(a) { return !a.siempre && avisoVisto(a.id); }
  function txtSiempre(a) { return (a.por || 'El coach') + ' lo ha marcado como siempre visible'; }
  function avisoHoyCerrado(id) { return leer('pa-av-' + id + '-' + S.data.hoy); }
  function abrirAvisosPendientes(d) {
    if (!$scrim.hidden || !d.avisos) return;
    var pend = (d.avisos[d.hoy] || []).filter(function (a) { return !avisoOculto(a) && !avisoHoyCerrado(a.id); });
    if (pend.length) mostrarAviso(pend[0], d.hoy, true);
  }
  function mostrarAviso(a, iso, auto) {
    var dd = (S.data.dias || []).filter(function (y) { return y.iso === iso; })[0];
    var cuando = a.inicio && a.fin && a.fin !== a.inicio ? fechaCorta(a.inicio) + ' – ' + fechaCorta(a.fin) : (dd ? NOMBRE_DIA[dd.nombre] + ' ' + diaMes(iso) : fechaCorta(iso));
    abrirHoja('<div class="notice-modal"><div class="lbl">' + esc(a.tipo || 'Aviso') + ' · ' + esc(cuando) + (a.hora ? ' · ' + esc(a.hora) : '') + '</div>' +
      '<h2>' + esc(a.titulo) + '</h2>' + (a.mensaje ? '<p>' + esc(a.mensaje) + '</p>' : '') + (a.lugar ? '<p class="hint">📍 ' + esc(a.lugar) + '</p>' : '') + '</div>' +
      (a.enlace ? '<a class="btn btn-primary" href="' + esc(a.enlace) + '" target="_blank" rel="noopener">Abrir enlace</a>' : '') +
      (a.siempre ? '<p class="av-siempre">📌 ' + esc(txtSiempre(a)) + '</p><button class="btn" type="button" data-av-cerrar="' + esc(a.id) + '">Cerrar</button>' :
      '<div class="two-btn"><button class="btn" type="button" data-av-cerrar="' + esc(a.id) + '">Cerrar</button>' +
      (avisoVisto(a.id) ? '<button class="btn" type="button" data-close>Ya marcado como visto</button>' :
        '<button class="btn' + (a.enlace ? '' : ' btn-primary') + '" type="button" data-av-visto="' + esc(a.id) + '">Visto, no mostrar más</button>') + '</div>'));
    if (auto) guardar('pa-av-' + a.id + '-' + S.data.hoy, true);
  }
  function marcarVisto(id) {
    guardar('pa-visto-' + id, true);
    (S.data.valoraciones.leidos = S.data.valoraciones.leidos || []).push(id);
    (S.data.eventos || []).forEach(function (e) { if (e.id === id) e.visto = true; });
    api({ action: 'aviso_visto', id: id }).catch(function () {});
    cerrarHoja(); toast('Marcado como visto. Lo tienes en Menú → Avisos.');
    if (!S.vista) render();   // desaparece del día (y sale el siguiente aviso pendiente, si lo hay)
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
      '<span class="view-title">' + esc(titulo) + '</span>' + botonCalc() + '</header>';
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
    var solo = !!d.soloEventos;
    var html = cabeceraVista('Menú', solo ? 'Eventos' : 'Semana') +
      '<section class="me"><div class="who big">' + esc((u.nombre || '?').charAt(0).toUpperCase()) + '</div><div><b>' + esc(u.nombre) + '</b>' +
      '<div class="hint">' + esc(u.email) + (u.grupo ? ' · ' + esc(u.grupo) : '') + (solo ? ' · solo eventos' : '') + '</div></div>' +
      '<button class="btn-ghost" type="button" id="compartir2">Compartir app</button>' + (solo ? '' : htmlPerfilSexo()) + '</section>';

    html += seccion('s-eventos', 'Mis eventos', htmlEventos(d), evs.length ? String(evs.length) : '', '★');
    html += '<button class="set-link" type="button" id="ir-calendario"><span class="set-ico">▦</span>Calendario de eventos<span class="go">›</span></button>';
    html += seccion('s-avisos', 'Avisos', htmlAvisos(avisos), nuevosAv ? String(nuevosAv) : '', '!');
    html += seccion('s-push', 'Notificaciones', htmlPush(), pushEstado() === 'activas' ? 'activas' : '', '🔔');
    if (!solo) html += seccion('s-guard', 'Mis guardados', '<div id="guard-body"><div class="hint">Cargando…</div></div>', (d.guardadas || []).length ? String((d.guardadas || []).length) : '', '🔖');
    if (!solo) html += seccion('s-notas', 'Notas del coach', htmlNotasSemana(d) + '<div class="part-lbl" style="margin-top:10px">Ejercicios recomendados</div>' + htmlRecsAtleta(d.recomendaciones || []), '', '✎');
    if (!solo) html += '<button class="set-link" type="button" id="ir-ranking"><span class="set-ico">🏆</span>Leaderboard<span class="go">›</span></button>';
    if (!solo) html += seccion('s-marcas', 'Mis marcas', htmlMarcas(d), '', '◆');
    if (!solo) html += seccion('s-desc', '% Descuentos', '<div id="desc-body"><div class="hint">Cargando…</div></div>', d.descuentosPendientes ? d.descuentosPendientes + ' pendiente' + (d.descuentosPendientes > 1 ? 's' : '') : '', '%');
    if (d.staff) html += seccion('s-coach', 'Coach', htmlCoach(d), d.solicitudesPendientes ? d.solicitudesPendientes + ' solicitud' + (d.solicitudesPendientes > 1 ? 'es' : '') : '', '⚑');
    html += seccion('s-tema', 'Apariencia', '<div class="seg" role="group" aria-label="Tema">' + Object.keys(TEMAS).map(function (k) {
      return '<button type="button" data-tema="' + k + '" aria-pressed="' + (tema === k) + '">' + TEMAS[k] + '</button>'; }).join('') + '</div>' +
      '<div class="hint">Automático sigue el modo claro u oscuro de tu móvil u ordenador.</div>', '', '◐');
    html += seccion('s-instalar', 'Instalar la app', htmlInstalar(), '', '↓');
    html += '<button class="btn" type="button" id="logout">Cerrar sesión</button><div class="hint" style="text-align:center">Fabrik Program · ' + esc(WEB_VERSION) + '</div>';
    $app.innerHTML = html;
    document.getElementById('atras').onclick = volverSemana;
    document.getElementById('logout').onclick = function () { S.vista = null; auth.signOut(); };
    document.getElementById('compartir2').onclick = compartirApp;
    if (!solo) {
      document.getElementById('ir-ranking').onclick = function () { abrirLeaderboard(); };
      document.getElementById('s-desc').addEventListener('toggle', function () { if (this.open) cargarDescuentos(); });
      document.getElementById('s-guard').addEventListener('toggle', function () { if (this.open) cargarGuardados(); });
    }
    enlazarMarcas();
    var ab = S._abrir; S._abrir = null; if (ab && document.getElementById(ab)) { document.getElementById(ab).open = true; if (ab === 's-desc') cargarDescuentos(); if (ab === 's-guard') cargarGuardados(); }
  }

  // ---------- Mis eventos ----------
  function diasHasta(iso) {
    var n = Math.round((Date.parse(iso) - Date.parse(S.data.hoy)) / 864e5);
    return n > 1 ? 'faltan ' + n + ' días' : n === 1 ? 'mañana' : n === 0 ? 'hoy' : 'pasado';
  }
  function cuandoEvento(e) {
    return fechaCorta(e.inicio) + (e.fin && e.fin !== e.inicio ? ' – ' + fechaCorta(e.fin) : '') + (e.hora ? ' · ' + e.hora : '');
  }
  var TXT_INSCRIPCION = { 'Libre': 'Inscripción libre', 'Con aprobación': 'Inscripción con aprobación del coach', 'Cerrada': 'Inscripción cerrada' };
  function estadoSolicitud(e) {
    var s = ((S.data && S.data.misSolicitudes) || []).filter(function (x) { return x.id === e.id; })[0];
    return s ? s.estado : '';
  }
  function tarjetaEvento(e, abierto) {
    var notas = e.notas || [], avs = e.avisos || [], est = estadoSolicitud(e);
    return '<details class="ev-card' + (e.mio ? ' mio' : '') + '" id="ev-' + esc(e.id) + '"' + (abierto ? ' open' : '') + '><summary><div class="ev-sum"><span class="ev-tipo">' + esc(e.tipo) + '</span>' +
      '<b>' + esc(e.nombre) + '</b><span class="hint">' + esc(cuandoEvento(e)) + (e.lugar ? ' · ' + esc(e.lugar) : '') + '</span></div>' +
      (e.inicio && !e.pasado ? '<span class="cd sm">' + esc(diasHasta(e.inicio)) + '</span>' : '') + '</summary><div class="exp-body">' +
      (e.descripcion ? '<p class="ev-desc">' + esc(e.descripcion) + '</p>' : '') +
      (e.enlace ? '<a class="btn" href="' + esc(e.enlace) + '" target="_blank" rel="noopener">Abrir enlace</a>' : '') +
      (e.nombresParticipantes && e.nombresParticipantes.length ? '<div class="ev-part"><span class="hint">Van (' + e.nombresParticipantes.length + '):</span> ' + e.nombresParticipantes.map(esc).join(', ') + '</div>' :
        e.nParticipantes ? '<div class="hint">' + e.nParticipantes + ' apuntado' + (e.nParticipantes > 1 ? 's' : '') + '</div>' : '') +
      (avs.length ? '<div class="ev-avs">' + avs.map(function (a) { return '<div class="ev-av"><b>! ' + esc(a.titulo) + '</b>' + (a.mensaje ? '<p>' + esc(a.mensaje) + '</p>' : '') + '</div>'; }).join('') + '</div>' : '') +
      (notas.length ? '<details class="cnote ev" open><summary><span class="cn-ico">★</span><span class="coach-sum">Notas y entrenos del coach (' + notas.length + ')</span></summary><div class="exp-body">' +
        notas.map(function (n) {
          return '<div class="cn-item"><div class="cn-lbl">' + esc(n.tipo) + ' · ' + (n.fecha ? fechaCorta(n.fecha) : '') + (n.alcance === 'SEMANA' ? ' (semana)' : '') + '</div><p>' + esc(n.texto) + '</p>' +
            (n.video ? '<button type="button" class="btn-ghost sm" data-video-url="' + esc(n.video) + '" data-video-nombre="' + esc(e.nombre) + '">▶ Vídeo</button>' : '') + '</div>';
        }).join('') + '</div></details>' : '') +
      (!e.pasado ? botonesCalendario(e) : '') +
      (!e.mio && !e.pasado && !/^AVISO$/i.test(e.tipo) ? (e.solicitado ? '<div class="hint">Solicitud enviada · pendiente de que la apruebe el coach.</div>' :
        e.inscripcion === 'Cerrada' ? '<div class="hint">' + TXT_INSCRIPCION.Cerrada + '.</div>' :
        '<button class="btn" type="button" data-unirme="' + esc(e.id) + '">' + (e.inscripcion === 'Libre' ? 'Apuntarme' : 'Pedir plaza') + '</button>' +
        '<div class="hint">' + esc(TXT_INSCRIPCION[e.inscripcion] || '') + '</div>') : '') +
      (e.mio && !e.pasado && !(S.data && S.data.soloEventos) ? '<button class="btn-ghost sm" type="button" data-salir="' + esc(e.id) + '">Desapuntarme</button>' : '') +
      (est === 'Rechazada' && !e.mio ? '<div class="hint">Tu última solicitud fue rechazada.</div>' : '') +
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
    // apuntarse desde un desplegable
    var abiertos = l.filter(function (e) { return !e.mio && !e.pasado && !e.solicitado && e.inscripcion !== 'Cerrada' && !/^AVISO$/i.test(e.tipo); });
    if (abiertos.length && !d.soloEventos) h = '<div class="unirme"><label for="ev-unirme">Apuntarme a un evento</label><div class="pl-row"><select id="ev-unirme"><option value="">— Elige —</option>' +
      abiertos.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.tipo) + ' · ' + esc(e.nombre) + ' · ' + fechaCorta(e.inicio) + (e.inscripcion === 'Libre' ? '' : ' (con aprobación)') + '</option>'; }).join('') +
      '</select><button class="btn btn-primary" type="button" data-unirme="sel">Enviar</button></div></div>' + h;
    var sols = d.misSolicitudes || [];
    if (sols.length) h += '<details class="hist"' + (sols.some(function (s) { return s.estado === 'Pendiente'; }) ? ' open' : '') + '><summary>Mis solicitudes (' + sols.length + ')</summary><div class="exp-body">' +
      sols.map(function (s) { return '<div class="sol-mia"><span>' + esc(s.evento) + '<span class="hint"> · ' + esc(s.fecha) + '</span></span><span class="est est-' + norm(s.estado).toLowerCase().replace(/\s+/g, '-') + '">' + esc(s.estado) + '</span></div>'; }).join('') +
      '</div></details>';
    return h;
  }

  // ---------- Avisos ----------
  function misAvisos(d) {
    return d.avisosLista || (d.eventos || []).filter(function (e) { return e.aviso && e.visible; });
  }
  function htmlAvisos(lista) {
    var activos = lista.filter(function (a) { return !a.pasado; }), viejos = lista.filter(function (a) { return a.pasado; });
    var item = function (a) {
      return '<div class="av-item' + (a.visto ? ' visto' : '') + (a.siempre ? ' fijo' : '') + '"><div><b>' + esc(a.nombre) + '</b><div class="hint">' + esc(a.tipo) + ' · ' + esc(cuandoEvento(a)) + (a.visto ? ' · visto' : '') + '</div>' +
        (a.descripcion ? '<p>' + esc(a.descripcion) + '</p>' : '') + (a.siempre ? '<div class="fijo-txt">📌 ' + esc(txtSiempre(a)) + '</div>' : '') + '</div>' +
        '<div class="av-acc">' + (a.enlace ? '<a class="btn-ghost" href="' + esc(a.enlace) + '" target="_blank" rel="noopener">Abrir</a>' : '') +
        (!a.visto && !a.pasado && !a.siempre ? '<button class="btn-ghost" type="button" data-av-visto="' + esc(a.id) + '">Visto</button>' : '') + '</div></div>';
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

  // ---------- Coach ----------
  function htmlCoach(d) {
    return '<div class="coach-grid">' +
      '<button class="btn btn-primary co-pub" type="button" id="co-publicar">＋ Publicar aviso o nota</button>' +
      '<button class="btn" type="button" id="co-eventos">Eventos</button>' +
      '<button class="btn" type="button" id="co-avisos">Avisos · quién los ha visto</button>' +
      '<button class="btn" type="button" id="co-misnotas">Mis notas</button>' +
      '<button class="btn" type="button" id="co-atletas">Atletas · ficha</button>' +
      '<button class="btn" type="button" id="co-solic">Solicitudes' + (d.solicitudesPendientes ? ' (' + d.solicitudesPendientes + ')' : '') + '</button>' +
      '<button class="btn' + (segPend(d) ? ' seg-alert' : '') + '" type="button" data-seg-abrir>Seguimiento' + (segPend(d) ? ' (' + segPend(d) + ')' : '') + '</button></div>' +
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
        var on = opciones && opciones.marcado && opciones.marcado(a);
        return '<button type="button" class="res' + (a.seguimiento ? ' seg' : '') + (on ? ' on' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '" data-e="' + esc(a.email) + '"><b>' + esc(a.nombre) + '</b><span>' + esc(a.email) + '</span>' +
          '<span class="chip">' + (a.seguimiento ? '<b class="seg-tag">Seguimiento</b> · ' : '') + esc(a.grupo || '—') + (a.activo === false ? ' · desactivado' : '') + '</span></button>';
      }).join('') : '<div class="hint">Nadie coincide con la búsqueda.</div>';
    }
    var cargarLista = S._atletas ? Promise.resolve({ ok: true, atletas: S._atletas }) : api({ action: 'atletas' });
    cargarLista.then(function (r) {
      if (!r.ok) throw new Error(r.detalle || r.error);
      S._atletas = r.atletas;
      lista = r.atletas.filter(function (a) { return !opciones || !opciones.soloActivos || a.activo; })
        .sort(function (a, b) { return (b.seguimiento ? 1 : 0) - (a.seguimiento ? 1 : 0) || a.nombre.localeCompare(b.nombre); });
      pintar();
    }).catch(function (e) { document.getElementById(contenedorId + '-r').innerHTML = '<div class="err">' + esc(mensajeError(e.message)) + '</div>'; });
    document.getElementById(contenedorId + '-q').oninput = pintar;
    cont._pintar = function () { if (lista.length) pintar(); };
    cont.onclick = function (ev) {
      var b = ev.target.closest('.res');
      if (b) {
        var a = lista.filter(function (x) { return x.email === b.dataset.e; })[0];
        if (opciones && opciones.sinConfirmar) { alElegir(a); cont._pintar(); return; }
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
  var TIPOS_EVENTO = ['Competición', 'Toma de marcas', 'Wod especial', 'Carrera', 'HYROX', 'DEKA', 'Día especial', 'Clase especial', 'Inscripción', 'Otro'];
  function abrirEventosCoach() {
    abrirHoja('<div class="row"><h2>Eventos y avisos</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div>' +
      '<button class="btn btn-primary" type="button" id="ev-nuevo">＋ Nuevo evento</button>' +
      '<div id="evc-lista"><div class="hint">Cargando…</div></div>');
    document.getElementById('ev-nuevo').onclick = function () { abrirFormEvento({}); };

    api({ action: 'eventos' }).then(function (r) { if (r.ok) { S.data.eventos = r.eventos; pintarEventosCoach(); } });
  }
  function pintarEventosCoach() {
    var el = document.getElementById('evc-lista'); if (!el) return;
    var l = (S.data.eventos || []).filter(function (e) { return !/^AVISO$/i.test(e.tipo); }).sort(function (a, b) { return (a.pasado - b.pasado) || (a.inicio < b.inicio ? -1 : 1); });
    el.innerHTML = l.length ? l.map(function (e) {
      return '<div class="evc' + (e.pasado ? ' pasado' : '') + '"><div class="evc-top"><span class="ev-tipo">' + esc(e.tipo) + '</span><b>' + esc(e.nombre) + '</b></div>' +
        '<div class="hint">' + esc(cuandoEvento(e)) + ' · ' + esc(textoPara(e.para)) + (e.aviso ? ' · aviso al entrar' : '') + ' · ' + (e.participantes || []).length + ' atleta' + ((e.participantes || []).length === 1 ? '' : 's') +
          ' · ' + esc(TXT_INSCRIPCION[e.inscripcion] || '') + '</div>' +
        (e.pendientes ? '<button class="btn-ghost sm pend" type="button" data-solic-ev>' + e.pendientes + ' solicitud' + (e.pendientes > 1 ? 'es' : '') + ' por aprobar ›</button>' : '') +
        '<div class="evc-acc"><button class="btn-ghost" type="button" data-ev-edit="' + esc(e.id) + '">Editar</button>' +
        '<button class="btn-ghost" type="button" data-ev-part="' + esc(e.id) + '">Atletas</button>' +
        '<button class="btn-ghost" type="button" data-ev-aviso="' + esc(e.id) + '">Aviso</button>' +
        '<button class="btn-ghost" type="button" data-ev-nota="' + esc(e.id) + '">Nota</button>' +
        '<button class="btn-ghost" type="button" data-ev-del="' + esc(e.id) + '">Retirar</button></div></div>';
    }).join('') : '<div class="hint">Todavía no hay eventos.</div>';
  }
  function emailsPara(p) { return String(p || '').indexOf('@') >= 0 ? String(p).toLowerCase().split(/[,;\s]+/).filter(function (x) { return x.indexOf('@') > 0; }) : []; }
  function atletaPorEmail(em) {
    var l = (S._atletas || []).concat(S.data.atletas || []);
    return l.filter(function (a) { return a.email === em; })[0] || { email: em, nombre: em.split('@')[0] };
  }
  function textoPara(p) {
    var ems = emailsPara(p); if (!ems.length) return p;
    var n = ems.map(function (em) { return atletaPorEmail(em).nombre.split(' ')[0]; });
    return n.length > 3 ? n.slice(0, 3).join(', ') + ' y ' + (n.length - 3) + ' más' : n.join(', ');
  }
  function eventoPorId(id) { return (S.data.eventos || []).filter(function (e) { return e.id === id; })[0]; }
  /** Formulario de evento: los mismos campos (y desplegables) que la pestaña EVENTOS del Sheet, más los participantes. */
  function tiposEvento() { var l = (S.data && S.data.tiposEvento) || TIPOS_EVENTO; return l.filter(function (x) { return !/^AVISO$/i.test(x); }); }
  function abrirFormEvento(e) {
    e = e || {};
    var op = function (l, act) { return l.map(function (x) { return '<option' + (x === act ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); };
    var tipos = tiposEvento(), tipo = e.tipo || 'Competición';
    if (tipos.indexOf(tipo) < 0) tipos = tipos.concat([tipo]);
    var campo = function (col, ayuda, html) { var m = /id="([\w-]+)"/.exec(html); return '<div class="cs"><label class="cs-col"' + (m ? ' for="' + m[1] + '"' : '') + '>' + col + '</label>' + html + (ayuda ? '<div class="hint">' + ayuda + '</div>' : '') + '</div>'; };
    abrirHoja('<div class="row"><h2>' + (e.id ? 'Editar evento' : 'Nuevo evento') + '</h2><button class="btn-ghost" type="button" id="evf-volver">‹ Volver</button></div>' +
      '<p class="hint">Los mismos campos que la pestaña EVENTOS del Sheet.</p>' +
      '<form id="evf" class="avf cs-form">' +
      campo('EVENTO', '', '<input id="ef-n" maxlength="60" required placeholder="Ej. Alhambra Games 2027 · DEKA Sevilla" value="' + esc(e.nombre || '') + '">') +
      campo('TIPO', 'Si falta alguno, elige «＋ Nuevo tipo…»: queda guardado también en el Sheet (LISTAS).',
        '<select id="ef-t">' + op(tipos, tipo) + '<option value="__nuevo">＋ Nuevo tipo…</option></select><input id="ef-tn" maxlength="30" placeholder="Nombre del tipo nuevo" hidden>') +
      '<div class="two">' + campo('INICIO', '', '<input id="ef-i" type="date" required value="' + esc(e.inicio || '') + '">') +
        campo('FIN', 'Si dura más de un día', '<input id="ef-f" type="date" value="' + esc(e.fin && e.fin !== e.inicio ? e.fin : '') + '">') + '</div>' +
      '<div class="two">' + campo('HORA', '', '<input id="ef-h" type="time" value="' + esc(e.hora || '') + '">') +
        campo('LUGAR', '', '<input id="ef-l" maxlength="80" value="' + esc(e.lugar || '') + '">') + '</div>' +
      campo('ENLACE', 'Inscripción o información', '<input id="ef-u" type="url" placeholder="https://…" value="' + esc(e.enlace || '') + '">') +
      campo('DESCRIPCIÓN', '', '<textarea id="ef-d" rows="3" maxlength="1000" placeholder="Lo que leerán los atletas">' + esc(e.descripcion || '') + '</textarea>') +
      '<div class="two">' + campo('PARA', 'Quién lo ve en «Mis eventos»', '<select id="ef-p">' + op(['Participantes', 'Todos', 'Box', 'Individual', 'Otro', 'Coach'], /@/.test(e.para || '') ? 'Participantes' : e.para || 'Participantes') + '</select>') +
        campo('INSCRIPCIÓN', 'Cómo se apuntan', '<select id="ef-ins">' + op(['Con aprobación', 'Libre', 'Cerrada'], e.inscripcion || 'Con aprobación') + '</select>') + '</div>' +
      '<label class="chk"><input type="checkbox" id="ef-a"' + (e.aviso ? ' checked' : '') + '> AVISO AL ENTRAR · sale al abrir la app cada día entre inicio y fin, hasta que lo marquen como visto</label>' +
      '<label class="chk"><input type="checkbox" id="ef-act"' + (e.activo === false ? '' : ' checked') + '> ACTIVO · desmárcalo para prepararlo sin que lo vean todavía</label>' +
      campo('PARTICIPANTES', 'Toca un atleta para añadirlo o quitarlo. También pueden apuntarse ellos desde Menú → Mis eventos.',
        '<div id="ef-chips" class="chips-sel"></div><div id="ef-bus"></div>') +
      '<button class="btn btn-primary" type="submit" id="ef-ok">Guardar evento</button></form>');
    document.getElementById('evf-volver').onclick = abrirEventosCoach;
    var sel = {};
    (e.participantes || []).forEach(function (a) { sel[a.email] = a; });
    function chips() {
      var ks = Object.keys(sel);
      document.getElementById('ef-chips').innerHTML = ks.length ? ks.map(function (k) { return '<button type="button" class="chip-x" data-quitar="' + esc(k) + '">' + esc(sel[k].nombre) + ' ×</button>'; }).join('') :
        '<span class="hint">Nadie todavía.</span>';
      var bus = document.getElementById('ef-bus'); if (bus && bus._pintar) bus._pintar();
    }
    chips();
    document.getElementById('ef-chips').onclick = function (ev) { var b = ev.target.closest('[data-quitar]'); if (b) { delete sel[b.dataset.quitar]; chips(); } };
    buscadorAtletas('ef-bus', function (a) { if (sel[a.email]) delete sel[a.email]; else sel[a.email] = a; chips(); },
      { soloActivos: true, sinConfirmar: true, marcado: function (a) { return !!sel[a.email]; } });
    document.getElementById('ef-t').onchange = function () {
      var t = this.value, nuevo = t === '__nuevo';
      document.getElementById('ef-tn').hidden = !nuevo; if (nuevo) document.getElementById('ef-tn').focus();
      if (t === 'Inscripción') document.getElementById('ef-a').checked = true;
      if (t === 'Competición') document.getElementById('ef-p').value = 'Participantes';
    };
    document.getElementById('evf').onsubmit = function (ev) {
      ev.preventDefault();
      var tipoF = val('ef-t') === '__nuevo' ? val('ef-tn') : val('ef-t');
      if (!tipoF) { toast('Escribe el nombre del tipo nuevo.'); return; }
      var b = document.getElementById('ef-ok'); b.disabled = true; b.textContent = 'Guardando…';
      api({ action: 'evento_guardar', evento: { id: e.id, nombre: val('ef-n'), tipo: tipoF, para: val('ef-p'), inicio: val('ef-i'), fin: val('ef-f'), hora: val('ef-h'),
        lugar: val('ef-l'), enlace: val('ef-u'), descripcion: val('ef-d'), aviso: document.getElementById('ef-a').checked, activo: document.getElementById('ef-act').checked,
        inscripcion: val('ef-ins'), emails: Object.keys(sel) } }).then(function (r) {
        if (!r.ok) throw new Error(r.detalle || r.error);
        S.data.eventos = r.eventos; S._atletas = null;
        if (tiposEvento().indexOf(tipoF) < 0) S.data.tiposEvento = (S.data.tiposEvento || TIPOS_EVENTO).concat([tipoF]);
        toast('Evento guardado'); abrirEventosCoach();
      }).catch(function (er) { b.disabled = false; b.textContent = 'Guardar evento'; toast(mensajeError(er.message)); });
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
        (ev ? '' : '<label class="lbl-s">Grupo si se aprueba</label><select data-grupo-de="' + i + '"><option>Box</option><option>Individual</option><option>Otro</option><option>Coach</option></select>' +
          '<label class="lbl-s">Acceso</label><select data-acceso-de="' + i + '"><option value="">Completo (programación y todo)</option><option value="Solo eventos">Solo eventos</option></select>' +
          '<label class="lbl-s">Evento (opcional)</label><select data-evento-de="' + i + '"><option value="">—</option>' +
          ((S.data && S.data.eventos) || []).filter(function (e) { return !e.pasado; }).map(function (e) { return '<option>' + esc(e.nombre) + '</option>'; }).join('') + '</select>') +
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
      html += '<button class="btn seg-btn' + (a.seguimiento ? ' on' : '') + '" type="button" data-seguir="' + (a.seguimiento ? '0' : '1') + '">' +
        (a.seguimiento ? '<span>● En seguimiento</span><span class="hint">Quitar</span>' : '<span>Poner en seguimiento</span><span class="hint">Su feedback sale primero y sus notas te avisan</span>') + '</button>';
      var pendA = ((S.data && S.data.seguimiento && S.data.seguimiento.pendientes) || []).filter(function (n) { return n.email === a.email; });
      if (pendA.length) html += '<div class="seg-list">' + pendA.map(segItem).join('') + '</div>';
      html += '<div class="two-btn"><button class="btn btn-primary" type="button" id="fi-nota">Nota para ' + esc(a.nombre.split(' ')[0]) + '</button><button class="btn" type="button" id="fi-av">Aviso solo para él/ella</button></div>';
      var notasAct = (f.notas || []).filter(function (n) { return n.activa; });
      html += seccion('fi-notas', 'Notas', notasAct.length ? notasAct.map(function (n) {
        return '<div class="av-item"><div><b>' + esc(n.tipo) + '</b> <span class="hint">' + (n.fecha ? fechaCorta(n.fecha) : '') + (n.hasta ? ' – ' + fechaCorta(n.hasta) : '') +
          ' · ' + (n.alcance === 'BLOQUE' ? 'bloque ' + esc(n.bloque || n.clave) : n.alcance === 'SEMANA' ? 'semana' : n.alcance === 'FASE' ? 'fase ' + esc(cap(n.fase)) : 'día') + (n.evento ? ' · ' + esc(n.evento) : '') + (n.por ? ' · ' + esc(n.por) : '') + '</span><p>' + esc(n.texto) + '</p></div>' +
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
    var paraA = { modo: 'atletas', atletas: [{ email: f.atleta && f.atleta.email, nombre: f.atleta && f.atleta.nombre }] };
    var bn = document.getElementById('fi-nota'); if (bn) bn.onclick = function () { abrirPublicar({ tab: 'nota', para: paraA, volver: function () { abrirFicha(f.atleta.email); } }); };
    var ba = document.getElementById('fi-av'); if (ba) ba.onclick = function () { abrirPublicar({ tab: 'aviso', para: paraA, volver: function () { abrirFicha(f.atleta.email); } }); };
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

  // ---------- Guardados (v17) ----------
  //  · Cada bloque tiene un marcador: guardado = tarea pendiente en Menú → Mis guardados (por semana y día). Se vacían al empezar ciclo.
  //  · Los metcons guardados no caducan (el texto queda en la hoja METCONS); quitarlos pide confirmación.
  var ICO_GUARDAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.2-6.5 4.2v-16a1 1 0 0 1 1-1z" fill="var(--g-fill,none)" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>';
  function estaGuardado(iso, n) { return ((S.data && S.data.guardadas) || []).indexOf(iso + '|' + n) >= 0; }
  function botonGuardar(x, b) {
    if (!x || !b.n || (S.data && S.data.soloEventos)) return '';
    var on = estaGuardado(x.iso, b.n), m = esMetcon(b);
    return '<button type="button" class="b-save' + (on ? ' on' : '') + '" data-guardar="' + esc(x.iso + '|' + b.n) + '" data-titulo="' + esc(b.titulo) + '"' + (m ? ' data-metcon="1"' : '') +
      ' aria-pressed="' + on + '" aria-label="' + (on ? 'Quitar de guardados' : 'Guardar') + ' el bloque ' + esc(b.n) + '" title="' + (m ? 'Guardar metcon (no caduca)' : 'Guardar para hacerlo') + '">' + ICO_GUARDAR + '</button>';
  }
  function alternarGuardado(btn) {
    var k = btn.dataset.guardar.split('|'), on = btn.getAttribute('aria-pressed') === 'true', metcon = !!btn.dataset.metcon;
    if (on && metcon && btn.dataset.seguro !== '1') {   // un metcon guardado no se quita de un toque
      btn.dataset.seguro = '1'; btn.classList.add('pide');
      toast('Es un metcon guardado. Toca otra vez el marcador para quitarlo.');
      setTimeout(function () { if (btn.isConnected) { btn.dataset.seguro = ''; btn.classList.remove('pide'); } }, 4000);
      return;
    }
    btn.disabled = true;
    api({ action: 'guardado', dia: k[0], bloque: Number(k[1]), titulo: btn.dataset.titulo, metcon: metcon, confirmar: on && metcon }).then(function (r) {
      if (!r.ok) throw new Error(r.detalle || r.error);
      S.data.guardadas = r.guardadas; S.guardados = null;
      var ya = r.estado === 'guardado';
      btn.disabled = false; btn.dataset.seguro = ''; btn.classList.remove('pide'); btn.classList.toggle('on', ya);
      btn.setAttribute('aria-pressed', String(ya)); btn.setAttribute('aria-label', (ya ? 'Quitar de guardados' : 'Guardar') + ' el bloque ' + k[1]);
      toast(ya ? (metcon ? 'Metcon guardado. Lo tienes siempre en Menú → Mis guardados.' : 'Guardado en Menú → Mis guardados') : 'Quitado de guardados');
    }).catch(function (e) { btn.disabled = false; toast(mensajeError(e.message)); });
  }

  function lunesIso(iso) {
    var d = new Date(iso + 'T12:00:00Z'), w = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - w); return d.toISOString().slice(0, 10);
  }
  function nombreDiaIso(iso) { return NOMBRE_DIA[['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][new Date(iso + 'T12:00:00Z').getUTCDay()]]; }

  function cargarGuardados() {
    var w = document.getElementById('guard-body'); if (!w) return;
    if (S.guardados) pintarGuardados();
    api({ action: 'guardados' }).then(function (r) { if (r.ok) { S.guardados = r.guardados; pintarGuardados(); } })
      .catch(function (e) { if (!S.guardados && document.getElementById('guard-body')) document.getElementById('guard-body').innerHTML = '<div class="hint">' + esc(mensajeError(e.message)) + '</div>'; });
  }
  function pintarGuardados() {
    var w = document.getElementById('guard-body'), G = S.guardados; if (!w || !G) return;
    var sems = {}, h = '';
    G.bloques.forEach(function (g) { var l = g.lunes || lunesIso(g.fecha); ((sems[l] = sems[l] || {})[g.fecha] = sems[l][g.fecha] || []).push(g); });
    var lunes = Object.keys(sems).sort();
    h += '<div class="part-lbl">Bloques pendientes del ciclo</div>';
    if (!lunes.length) h += '<div class="hint">Toca el marcador 🔖 de un bloque para guardarlo aquí como tarea pendiente. Se vacía al empezar un ciclo nuevo.</div>';
    var hoyL = lunesIso(S.data.hoy || new Date().toISOString().slice(0, 10));
    lunes.forEach(function (l) {
      var todos = [].concat.apply([], Object.keys(sems[l]).map(function (f) { return sems[l][f]; })), hechos = todos.filter(function (g) { return g.hecho; }).length;
      h += '<details class="gd-sem"' + (l === hoyL || lunes.length === 1 ? ' open' : '') + '><summary>Semana del ' + esc(fechaCorta(l)) + '<span class="gd-cnt">' + hechos + '/' + todos.length + '</span></summary><div class="exp-body">' +
        Object.keys(sems[l]).sort().map(function (f) {
          return '<div class="gd-dia"><div class="part-lbl">' + esc(nombreDiaIso(f)) + ' ' + esc(diaMes(f)) + '</div>' + sems[l][f].map(function (g) {
            return '<div class="gd-item' + (g.hecho ? ' hecho' : '') + '"><label class="chk"><input type="checkbox" data-g-hecho="' + esc(g.id) + '"' + (g.hecho ? ' checked' : '') + '>' +
              '<span><b>' + esc(g.bloque) + '</b> · ' + esc(g.titulo || 'Bloque') + '</span></label>' +
              '<span class="gd-acc"><button type="button" class="btn-ghost sm" data-g-ir="' + esc(g.fecha + '|' + g.bloque) + '">Ver</button>' +
              '<button type="button" class="btn-ghost sm" data-g-x="' + esc(g.id) + '">Quitar</button></span></div>';
          }).join('') + '</div>';
        }).join('') + '</div></details>';
    });
    h += '<div class="part-lbl" style="margin-top:12px">Metcons guardados</div>';
    h += G.metcons.length ? G.metcons.map(function (m) {
      return '<details class="gd-met"><summary><b>' + esc(m.titulo || 'Metcon') + '</b><span class="hint"> · ' + esc(fechaCorta(m.fecha)) + '</span></summary><div class="exp-body">' +
        (m.texto ? '<div class="board">' + pizarra(m.texto, {}) + '</div>' : '<div class="hint">Texto no disponible.</div>') +
        '<div class="gd-acc"><button type="button" class="btn-ghost sm" data-g-ir="' + esc(m.fecha + '|' + m.bloque) + '">Ver el día</button>' +
        '<button type="button" class="btn-ghost sm" data-g-x="' + esc(m.id) + '" data-g-metcon="1">Borrar</button></div></div></details>';
    }).join('') : '<div class="hint">Los metcons que guardes se quedan aquí siempre, aunque cambie el ciclo.</div>';
    w.innerHTML = h;
  }
  function irAlBloque(fecha, n) {
    var l = lunesIso(fecha), sem = ((S.data && S.data.semanas) || []).filter(function (s) { return s.iso === l; })[0];
    var ir = function () {
      var i = S.data.dias.findIndex(function (x) { return x.iso === fecha; });
      if (i < 0) { toast('Ese día ya no está en la programación.'); return; }
      S.dia = i; S.vista = null; render();
      setTimeout(function () { var el = document.getElementById('b-' + n); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 40);
    };
    if (!sem) { toast('Esa semana ya no está disponible.'); return; }
    if (sem.clave === S.data.semana) ir(); else { toast('Cargando la semana…'); cargar(sem.clave).then(ir); }
  }
  function clickGuardados(t) {
    var b;
    if ((b = t.closest('[data-guardar]'))) { alternarGuardado(b); return true; }
    if ((b = t.closest('[data-g-hecho]'))) {
      api({ action: 'guardado_hecho', id: b.dataset.gHecho, hecho: b.checked }).then(function (r) { if (r.ok) { S.guardados = r.guardados; pintarGuardados(); } })
        .catch(function (e) { b.checked = !b.checked; toast(mensajeError(e.message)); });
      return true;
    }
    if ((b = t.closest('[data-g-ir]'))) { var k = b.dataset.gIr.split('|'); irAlBloque(k[0], k[1]); return true; }
    if ((b = t.closest('[data-g-x]'))) {
      var met = !!b.dataset.gMetcon;
      if (met && !confirmar(b, '¿Borrar? Toca otra vez')) return true;
      b.disabled = true;
      api({ action: 'guardado_borrar', id: b.dataset.gX, confirmar: met }).then(function (r) {
        if (!r.ok) throw new Error(r.detalle || r.error);
        S.guardados = r.guardados; S.data.guardadas = r.guardadas; pintarGuardados(); toast(met ? 'Metcon borrado de tus guardados' : 'Quitado');
      }).catch(falloApi(b));
      return true;
    }
    return false;
  }

  // =====================================================================
  //  PUBLICAR (coach) · un solo formulario para avisos y notas, con el mismo «Para»:
  //  Todos · Participantes de un evento · Atletas concretos (· un grupo, como opción avanzada)
  // =====================================================================
  var TIPOS_NOTA = ['Nota', 'Técnica', 'Carga', 'Adaptación', 'Estrategia', 'Movilidad', 'Ejercicio', 'Competición'];
  var GRUPOS = ['Box', 'Individual', 'Otro', 'Coach'];

  function eventosVivos() { return ((S.data && S.data.eventos) || []).filter(function (e) { return !e.pasado; }); }
  function opciones(l, act) { return l.map(function (x) { var v = typeof x === 'string' ? x : x.v, t = typeof x === 'string' ? x : x.t; return '<option value="' + esc(v) + '"' + (v === act ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join(''); }

  /** Selector «Para» reutilizable. pre: { modo: todos|evento|atletas|grupo, evento, atletas: [{email,nombre}], grupo } */
  function htmlPara(id, pre) {
    pre = pre || {};
    var m = pre.modo || 'todos', evs = eventosVivos();
    var radio = function (v, t) { return '<label class="para-op"><input type="radio" name="' + id + '-m" value="' + v + '"' + (m === v ? ' checked' : '') + '><span>' + t + '</span></label>'; };
    return '<fieldset class="para" id="' + id + '"><legend>Para</legend><div class="para-ops">' +
      radio('todos', 'Todos') + radio('evento', 'Participantes de un evento') + radio('atletas', 'Atletas concretos') + '</div>' +
      '<div class="para-x" data-x="evento"' + (m === 'evento' ? '' : ' hidden') + '>' +
        (evs.length ? '<select id="' + id + '-ev" aria-label="Evento"><option value="">— Elige el evento —</option>' + opciones(evs.map(function (e) { return { v: e.nombre, t: e.nombre + ' · ' + (e.nParticipantes || 0) + ' atleta' + (e.nParticipantes === 1 ? '' : 's') }; }), pre.evento) + '</select>' :
          '<div class="hint">No hay eventos activos. Créalo en Menú → Coach → Eventos.</div>') + '</div>' +
      '<div class="para-x ind-box" data-x="atletas"' + (m === 'atletas' ? '' : ' hidden') + '><div class="hint">Busca y toca los atletas (toca otra vez para quitar).</div>' +
        '<div id="' + id + '-chips" class="chips-sel"></div><div id="' + id + '-bus"></div></div>' +
      '<details class="para-av"' + (m === 'grupo' ? ' open' : '') + '><summary>Avanzado: un grupo</summary>' +
        '<label class="para-op"><input type="radio" name="' + id + '-m" value="grupo"' + (m === 'grupo' ? ' checked' : '') + '><span>Grupo</span></label>' +
        '<select id="' + id + '-gr" aria-label="Grupo">' + opciones(GRUPOS, pre.grupo) + '</select></details></fieldset>';
  }
  function enlazarPara(id, pre) {
    var sel = {}, busOk = false, fs = document.getElementById(id);
    ((pre && pre.atletas) || []).forEach(function (a) { sel[a.email] = a; });
    function chips() {
      var ks = Object.keys(sel), el = document.getElementById(id + '-chips');
      el.innerHTML = ks.length ? ks.map(function (k) { return '<button type="button" class="chip-x" data-quitar="' + esc(k) + '">' + esc(sel[k].nombre) + ' ×</button>'; }).join('') : '<span class="hint">Nadie elegido todavía.</span>';
      var b = document.getElementById(id + '-bus'); if (b && b._pintar) b._pintar();
    }
    function modo() { var r = fs.querySelector('input[name="' + id + '-m"]:checked'); return r ? r.value : 'todos'; }
    function ver() {
      var m = modo();
      fs.querySelectorAll('.para-x').forEach(function (x) { x.hidden = x.dataset.x !== m; });
      if (m === 'atletas' && !busOk) {
        busOk = true; chips();
        buscadorAtletas(id + '-bus', function (a) { if (sel[a.email]) delete sel[a.email]; else sel[a.email] = a; chips(); },
          { soloActivos: true, sinConfirmar: true, marcado: function (a) { return !!sel[a.email]; } });
      }
    }
    fs.addEventListener('change', ver);
    document.getElementById(id + '-chips').onclick = function (ev) { var b = ev.target.closest('[data-quitar]'); if (b) { delete sel[b.dataset.quitar]; chips(); } };
    ver();
    return function () {
      var m = modo();
      return { modo: m, evento: m === 'evento' ? val(id + '-ev') : '', emails: m === 'atletas' ? Object.keys(sel) : [], grupo: m === 'grupo' ? val(id + '-gr') : '',
        nombres: Object.keys(sel).map(function (k) { return sel[k].nombre; }) };
    };
  }
  function paraValido(p) {
    if (p.modo === 'evento' && !p.evento) return 'Elige el evento.';
    if (p.modo === 'atletas' && !p.emails.length) return 'Elige al menos un atleta.';
    return '';
  }

  /** opts: { tab: 'aviso'|'nota', para: {…}, alcance, fase, nota: {tipo, texto, video}, volver } */
  function abrirPublicar(opts) {
    opts = opts || {};
    var d = S.data || {}, x = d.dias && d.dias[S.dia], tab = opts.tab || 'aviso';
    var fases = (d.ciclo && d.ciclo.fases) || [];
    var bloques = x ? x.bloques.map(function (b) { return { v: String(b.n), t: b.n + ' · ' + cap(b.titulo) }; }) : [];
    var n = opts.nota || {}, al = opts.alcance || 'Día';
    abrirHoja('<div class="row"><h2>Publicar</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div>' +
      '<div class="seg pub-tabs" role="group" aria-label="Qué publicar"><button type="button" data-pub="aviso" aria-pressed="' + (tab === 'aviso') + '">Aviso</button>' +
      '<button type="button" data-pub="nota" aria-pressed="' + (tab === 'nota') + '">Nota del coach</button></div>' +
      '<p class="hint" id="pub-expl"></p>' +
      '<form id="pubf" class="avf">' + htmlPara('pp', opts.para) +
      // --- aviso ---
      '<div data-solo="aviso"><label for="pa-t">Título</label><input id="pa-t" maxlength="80" placeholder="Ej. Box cerrado el sábado por la tarde">' +
      '<label for="pa-m">Mensaje</label><textarea id="pa-m" rows="3" maxlength="1000" placeholder="Lo que verán al abrir la app"></textarea>' +
      '<div class="two"><div><label for="pa-d">Desde</label><input id="pa-d" type="date" value="' + esc(d.hoy || '') + '"></div><div><label for="pa-h">Hasta (opcional)</label><input id="pa-h" type="date"></div></div>' +
      '<div class="two"><div><label for="pa-hr">Hora (opcional)</label><input id="pa-hr" type="time"></div><div><label for="pa-u">Enlace (opcional)</label><input id="pa-u" type="url" placeholder="https://…"></div></div>' +
      '<label class="chk"><input type="checkbox" id="pa-sv"> 📌 Siempre visible (el atleta no lo puede ocultar)</label></div>' +
      // --- nota ---
      '<div data-solo="nota"><div id="pn-plw"></div>' +
      '<label>Dónde se ve</label><div class="seg" role="group" id="pn-al">' + ['Bloque', 'Día', 'Semana', 'Fase'].map(function (a) {
        return '<button type="button" data-val="' + a + '" aria-pressed="' + (a === al) + '">' + (a === 'Bloque' ? 'Un bloque' : a === 'Día' ? 'El día' : a === 'Semana' ? 'La semana' : 'La fase') + '</button>'; }).join('') + '</div>' +
      '<div id="pn-fw"><div class="two"><div><label for="pn-f">Fecha</label><input id="pn-f" type="date" value="' + esc(x ? x.iso : d.hoy || '') + '"></div>' +
      '<div><label for="pn-h">Repetir hasta (opcional)</label><input id="pn-h" type="date"></div></div></div>' +
      '<div id="pn-bw"><label for="pn-b">Bloque</label>' + (bloques.length ? '<select id="pn-b">' + opciones(bloques) + '</select>' : '<input id="pn-b" inputmode="numeric" placeholder="nº de bloque">') +
      '<div class="hint">Los bloques son los del día que estás viendo; si cambias la fecha, comprueba el número.</div></div>' +
      '<div id="pn-fsw"><label for="pn-fs">Fase del ciclo</label>' + (fases.length ? '<select id="pn-fs">' + opciones(fases.map(function (f) { return f.nombre; }), opts.fase) + '</select>' : '<div class="hint">No hay fases en FABRIK.</div>') +
      '<div class="hint">Se ve al tocar la fase arriba (Acumulación, Transformación…), durante toda la fase.</div></div>' +
      '<label for="pn-t">Tipo</label><select id="pn-t">' + opciones(TIPOS_NOTA, n.tipo || 'Nota') + '</select>' +
      '<label for="pn-x">Nota</label><textarea id="pn-x" rows="4" maxlength="1500" placeholder="Ej. Hoy prioriza la técnica: 75 % máximo en el C&amp;J">' + esc(n.texto || '') + '</textarea>' +
      '<label for="pn-v">Vídeo (opcional)</label><input id="pn-v" type="url" placeholder="Enlace de YouTube" value="' + esc(n.video || '') + '">' +
      '<label class="chk"><input type="checkbox" id="pn-pl"> Guardar también como plantilla</label></div>' +
      '<button class="btn btn-primary" type="submit" id="pub-ok">Publicar</button></form>');
    var leerPara = enlazarPara('pp', opts.para);
    var alcance = al;
    function pintarTab() {
      document.querySelectorAll('[data-solo]').forEach(function (z) { z.hidden = z.dataset.solo !== tab; });
      document.querySelectorAll('[data-pub]').forEach(function (z) { z.setAttribute('aria-pressed', String(z.dataset.pub === tab)); });
      document.getElementById('pub-expl').textContent = tab === 'aviso' ?
        'Sale al abrir la app cada día del periodo, hasta que el atleta pulsa «Visto». Lo tiene siempre en Menú → Avisos.' :
        'Se ve dentro del día, del bloque, de la semana o al tocar la fase. Queda en tu histórico (Menú → Coach → Mis notas).';
      document.getElementById('pub-ok').textContent = tab === 'aviso' ? 'Publicar aviso' : 'Guardar nota';
      if (tab === 'nota') cargarPlantillas();
    }
    function pintarAlcance() {
      document.getElementById('pn-bw').hidden = alcance !== 'Bloque';
      document.getElementById('pn-fsw').hidden = alcance !== 'Fase';
      document.getElementById('pn-fw').hidden = alcance === 'Fase';
    }
    document.querySelector('.pub-tabs').onclick = function (ev) { var b = ev.target.closest('[data-pub]'); if (b) { tab = b.dataset.pub; pintarTab(); } };
    document.getElementById('pn-al').onclick = function (ev) {
      var b = ev.target.closest('[data-val]'); if (!b) return;
      alcance = b.dataset.val;
      this.querySelectorAll('button').forEach(function (z) { z.setAttribute('aria-pressed', String(z === b)); });
      pintarAlcance();
    };
    pintarTab(); pintarAlcance();
    document.getElementById('pubf').onsubmit = function (ev) {
      ev.preventDefault();
      var p = leerPara(), err = paraValido(p);
      if (err) { toast(err); return; }
      var b = document.getElementById('pub-ok'), txt = b.textContent; b.disabled = true; b.textContent = 'Guardando…';
      var fallo = function (e) { b.disabled = false; b.textContent = txt; toast(mensajeError(e.message)); };
      if (tab === 'aviso') {
        if (!val('pa-t')) { fallo(new Error('Pon un título.')); return; }
        api({ action: 'aviso_guardar', aviso: { titulo: val('pa-t'), mensaje: val('pa-m'), desde: val('pa-d'), hasta: val('pa-h'), hora: val('pa-hr'), enlace: val('pa-u'), siempre: document.getElementById('pa-sv').checked,
          para: p.modo === 'evento' ? 'Participantes' : p.modo === 'atletas' ? 'Atletas' : p.modo === 'grupo' ? p.grupo : 'Todos', evento: p.evento, emails: p.emails } })
          .then(function (r) { if (!r.ok) throw new Error(r.detalle || r.error); toast('Aviso publicado'); S.avisosCoach = r.avisos; cerrarHoja(); if (opts.volver) opts.volver(); else cargar(S.data.semana); })
          .catch(fallo);
        return;
      }
      if (!val('pn-x')) { fallo(new Error('Escribe la nota.')); return; }
      var nota = { alcance: alcance, fecha: val('pn-f'), hasta: val('pn-h'), bloque: alcance === 'Bloque' ? val('pn-b') : '', fase: alcance === 'Fase' ? val('pn-fs') : '',
        tipo: val('pn-t'), texto: val('pn-x'), video: val('pn-v'), evento: p.evento, emails: p.emails, grupo: p.grupo };
      var guardarPl = document.getElementById('pn-pl').checked;
      api({ action: 'nota_crear', nota: nota }).then(function (r) {
        if (!r.ok) throw new Error(r.detalle || r.error);
        if (guardarPl) api({ action: 'plantilla_guardar', plantilla: { tipo: nota.tipo, texto: nota.texto, video: nota.video } }).catch(function () {});
        toast(r.creadas > 1 ? 'Nota guardada para ' + r.creadas + ' atletas' : 'Nota guardada'); cerrarHoja();
        if (opts.volver) opts.volver(); else cargar(S.data.semana);
      }).catch(fallo);
    };
  }

  // ---------- plantillas ----------
  function cargarPlantillas() {
    var w = document.getElementById('pn-plw'); if (!w || w._ok) return; w._ok = 1;
    var pintar = function (l) {
      S.plantillas = l;
      if (!document.getElementById('pn-plw')) return;
      w.innerHTML = l.length ? '<label for="pn-pls">Plantilla</label><div class="pl-row"><select id="pn-pls"><option value="">— Elegir una plantilla —</option>' +
        l.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.nombre) + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="btn-ghost sm" id="pn-plx" hidden>Borrar</button></div>' : '';
      var s = document.getElementById('pn-pls'); if (!s) return;
      s.onchange = function () {
        var p = l.filter(function (x) { return x.id === s.value; })[0];
        document.getElementById('pn-plx').hidden = !p;
        if (!p) return;
        document.getElementById('pn-t').value = p.tipo; document.getElementById('pn-x').value = p.texto; document.getElementById('pn-v').value = p.video || '';
      };
      document.getElementById('pn-plx').onclick = function () {
        if (!confirmar(this, '¿Borrar plantilla?')) return;
        api({ action: 'plantilla_borrar', id: s.value }).then(function (r) { if (r.ok) { w._ok = 0; w.innerHTML = ''; pintar(r.plantillas); toast('Plantilla borrada'); } });
      };
    };
    if (S.plantillas) pintar(S.plantillas);
    api({ action: 'plantillas' }).then(function (r) { if (r.ok) pintar(r.plantillas); }).catch(function () {});
  }

  // ---------- Mis notas (histórico del coach) ----------
  function abrirMisNotas() {
    abrirHoja('<div class="row"><h2>Mis notas</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div>' +
      '<div class="two"><input class="search" id="mn-q" type="search" placeholder="Buscar texto, atleta o evento"><select id="mn-e" aria-label="Qué notas ver"><option value="act">Activas</option><option value="todas">Todas</option></select></div>' +
      '<button class="btn" type="button" id="mn-nueva">＋ Nueva nota</button><div id="mn-l"><div class="hint">Cargando…</div></div>');
    document.getElementById('mn-nueva').onclick = function () { abrirPublicar({ tab: 'nota', volver: abrirMisNotas }); };
    var lista = [];
    function pintar() {
      var el = document.getElementById('mn-l'); if (!el) return;
      var q = norm(val('mn-q')).trim(), solo = val('mn-e') === 'act';
      var f = lista.filter(function (n) { return (!solo || n.activa) && (!q || norm(n.texto + ' ' + (n.atletas || []).join(' ') + ' ' + (n.evento || '')).indexOf(q) >= 0); });
      el.innerHTML = f.length ? f.map(function (n, i) {
        var para = n.atletas && n.atletas.length ? n.atletas.join(', ') : n.evento ? 'Participantes · ' + n.evento : n.paraTodos && /^GRUPO/i.test(n.paraTodos) ? n.paraTodos : 'Todos';
        var donde = n.alcance === 'FASE' ? 'Fase ' + cap(n.fase) : n.alcance === 'BLOQUE' ? 'Bloque ' + (n.bloque || n.clave) : n.alcance === 'SEMANA' ? 'Semana' : 'Día';
        return '<div class="mn' + (n.activa ? '' : ' off') + '"><div class="mn-top"><span class="ev-tipo">' + esc(n.tipo) + '</span><span class="hint">' + (n.fecha ? fechaCorta(n.fecha) : '') +
          (n.hasta && n.alcance !== 'FASE' ? ' – ' + fechaCorta(n.hasta) : '') + ' · ' + esc(donde) + (n.activa ? '' : ' · retirada') + '</span></div>' +
          '<div class="mn-para">Para: <b>' + esc(para) + '</b></div><p>' + esc(n.texto) + '</p>' +
          '<div class="mn-acc"><button class="btn-ghost sm" type="button" data-mn-dup="' + i + '">Duplicar</button>' +
          (n.activa ? '<button class="btn-ghost sm" type="button" data-mn-off="' + i + '">Retirar</button>' : '') + '</div></div>';
      }).join('') : '<div class="hint">' + (lista.length ? 'Nada coincide.' : 'Todavía no has puesto ninguna nota.') + '</div>';
      el._f = f;
    }
    document.getElementById('mn-q').oninput = pintar; document.getElementById('mn-e').onchange = pintar;
    document.getElementById('mn-l').onclick = function (ev) {
      var b = ev.target.closest('[data-mn-dup],[data-mn-off]'); if (!b) return;
      var n = this._f[+(b.dataset.mnDup || b.dataset.mnOff)];
      if (b.dataset.mnDup !== undefined) {
        var para = n.atletas && n.atletas.length ? { modo: 'atletas', atletas: [] } : n.evento ? { modo: 'evento', evento: n.evento } : { modo: 'todos' };
        abrirPublicar({ tab: 'nota', para: para, alcance: n.alcance === 'FASE' ? 'Fase' : n.alcance === 'BLOQUE' ? 'Bloque' : n.alcance === 'SEMANA' ? 'Semana' : 'Día', fase: n.fase,
          nota: { tipo: n.tipo, texto: n.texto, video: n.video }, volver: abrirMisNotas });
        return;
      }
      if (!confirmar(b, '¿Retirar?')) return;
      b.disabled = true;
      n.ids.reduce(function (pr, id) { return pr.then(function () { return api({ action: 'nota_off', id: id, mias: true }); }); }, Promise.resolve())
        .then(function (r) { if (r && r.ok) { lista = r.notas; pintar(); toast('Nota retirada'); } }).catch(function (e) { toast(mensajeError(e.message)); });
    };
    api({ action: 'notas_mias' }).then(function (r) { if (!r.ok) throw new Error(r.detalle || r.error); lista = r.notas; pintar(); })
      .catch(function (e) { var el = document.getElementById('mn-l'); if (el) el.innerHTML = '<div class="err">' + esc(mensajeError(e.message)) + '</div>'; });
  }

  // ---------- Avisos del coach (con «visto por») ----------
  function abrirAvisosCoach() {
    abrirHoja('<div class="row"><h2>Avisos</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div>' +
      '<button class="btn btn-primary" type="button" id="ac-nuevo">＋ Nuevo aviso</button><div id="ac-l"><div class="hint">Cargando…</div></div>');
    document.getElementById('ac-nuevo').onclick = function () { abrirPublicar({ tab: 'aviso', volver: abrirAvisosCoach }); };
    var pintar = function (l) {
      var el = document.getElementById('ac-l'); if (!el) return;
      el.innerHTML = l.length ? l.map(function (a) {
        var L = a.lectura || { total: 0, vistos: 0, faltan: [] }, pc = L.total ? Math.round(L.vistos / L.total * 100) : 0;
        return '<div class="ac"><div class="mn-top"><b>' + esc(a.titulo) + '</b><span class="hint">' + fechaCorta(a.desde) + (a.hasta ? ' – ' + fechaCorta(a.hasta) : '') + '</span></div>' +
          '<div class="mn-para">Para: <b>' + esc(a.paraTexto) + '</b>' + (a.por ? ' · ' + esc(a.por) : '') + (a.siempre ? ' · 📌 siempre visible' : '') + '</div>' + (a.mensaje ? '<p>' + esc(a.mensaje) + '</p>' : '') +
          '<div class="lect"><div class="lect-bar"><i style="width:' + pc + '%"></i></div><span>Visto por <b>' + L.vistos + ' de ' + L.total + '</b></span></div>' +
          (L.faltan.length ? '<details class="hist"><summary>Faltan (' + L.faltan.length + ')</summary><div class="exp-body hint">' + L.faltan.map(esc).join(', ') + '</div></details>' : '') +
          (a.esEvento ? '' : '<div class="mn-acc"><button class="btn-ghost sm" type="button" data-ac-off="' + esc(a.id) + '">Retirar</button></div>') + '</div>';
      }).join('') : '<div class="hint">No hay avisos activos de hoy en adelante.</div>';
    };
    document.getElementById('ac-l').onclick = function (ev) {
      var b = ev.target.closest('[data-ac-off]'); if (!b || !confirmar(b, '¿Retirar?')) return;
      api({ action: 'aviso_off', id: b.dataset.acOff }).then(function (r) { if (r.ok) { pintar(r.avisos); toast('Aviso retirado'); } });
    };
    api({ action: 'avisos_lista' }).then(function (r) { if (r.ok) pintar(r.avisos); })
      .catch(function (e) { var el = document.getElementById('ac-l'); if (el) el.innerHTML = '<div class="err">' + esc(mensajeError(e.message)) + '</div>'; });
  }

  // ---------- Fases del ciclo: al tocarlas, objetivos y notas ----------
  function notasDeFase(nombre) { return ((S.data && S.data.notasFase) || {})[norm(nombre).trim()] || []; }
  function abrirFase(i) {
    var c = S.data && S.data.ciclo, f = c && c.fases[i]; if (!f) return;
    var notas = notasDeFase(f.nombre), staff = S.data.staff;
    abrirHoja('<div class="row"><h2>' + esc(cap(f.nombre)) + '</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div>' +
      '<div class="hint">' + (f.inicio ? fechaCorta(f.inicio) + ' – ' + fechaCorta(f.fin) + ' · ' : '') + f.semanas + ' semanas' +
      (i === c.actual ? ' · <b>fase actual (semana ' + c.semana + ')</b>' : i < c.actual ? ' · terminada' : ' · próxima') + '</div>' +
      (f.objetivos ? '<div class="part-lbl" style="margin-top:12px">Objetivos</div><div class="goals">' + esc(f.objetivos) + '</div>' : '') +
      '<div class="part-lbl" style="margin-top:12px">Notas del coach para esta fase</div>' +
      (notas.length ? notas.map(function (n) {
        return '<div class="wk-item' + (n.evento ? ' ev' : '') + '"><span class="hint">' + esc(n.tipo) + (n.evento ? ' · ' + esc(n.evento) : '') + (n.atleta ? ' · solo para ti' : '') + (n.por ? ' · ' + esc(n.por) : '') + '</span><p>' + esc(n.texto) + '</p>' +
          (n.video ? '<button type="button" class="btn-ghost sm" data-video-url="' + esc(n.video) + '" data-video-nombre="' + esc(f.nombre) + '">▶ Vídeo</button>' : '') + '</div>';
      }).join('') : '<div class="hint">Sin notas para esta fase.</div>') +
      (staff ? '<button class="btn" type="button" id="fa-nota">＋ Nota para esta fase</button>' : ''));
    var b = document.getElementById('fa-nota');
    if (b) b.onclick = function () { abrirPublicar({ tab: 'nota', alcance: 'Fase', fase: f.nombre }); };
  }

  // ---------- Calendario (mes) + añadir a Google Calendar / iPhone ----------
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function eventosCalendario() {
    return ((S.data && S.data.eventos) || []).filter(function (e) { return e.inicio && (e.mio || e.visible) && !/^AVISO$/i.test(e.tipo); });
  }
  function renderCalendario() {
    var d = S.data || {}, hoy = d.hoy || new Date().toISOString().slice(0, 10);
    var mes = S.calMes || hoy.slice(0, 7), y = +mes.slice(0, 4), m = +mes.slice(5, 7);
    var evs = eventosCalendario(), primero = new Date(Date.UTC(y, m - 1, 1)), dow = (primero.getUTCDay() + 6) % 7, dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var celdas = '';
    for (var k = 0; k < dow; k++) celdas += '<span class="cal-d vacio"></span>';
    for (var dd = 1; dd <= dias; dd++) {
      var iso = mes + '-' + (dd < 10 ? '0' : '') + dd;
      var ese = evs.filter(function (e) { return iso >= e.inicio && iso <= (e.fin || e.inicio); });
      celdas += '<button type="button" class="cal-d' + (iso === hoy ? ' hoy' : '') + (iso === S.calDia ? ' sel' : '') + (ese.some(function (e) { return e.mio; }) ? ' mio' : ese.length ? ' hay' : '') + '" data-cal-dia="' + iso + '">' +
        '<b>' + dd + '</b>' + (ese.length ? '<i>' + ese.slice(0, 3).map(function (e) { return '<em class="' + (e.mio ? 'm' : '') + '"></em>'; }).join('') + '</i>' : '') + '</button>';
    }
    var delMes = evs.filter(function (e) { return (e.fin || e.inicio) >= mes + '-01' && e.inicio <= mes + '-31'; });
    var lista = S.calDia ? evs.filter(function (e) { return S.calDia >= e.inicio && S.calDia <= (e.fin || e.inicio); }) : delMes;
    var mios = evs.filter(function (e) { return e.mio && !e.pasado; });
    var html = cabeceraVista('Calendario', 'Menú') +
      '<section class="cal"><div class="cal-nav"><button class="icon-btn" type="button" data-cal-mes="-1" aria-label="Mes anterior">‹</button><b>' + cap(MESES[m - 1]) + ' ' + y + '</b>' +
      '<button class="icon-btn" type="button" data-cal-mes="1" aria-label="Mes siguiente">›</button></div>' +
      '<div class="cal-sem">' + ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' +
      '<div class="cal-grid">' + celdas + '</div><div class="cal-ley"><span><em class="m"></em> Mis eventos</span><span><em></em> Otros eventos</span></div></section>' +
      '<div class="part-lbl">' + (S.calDia ? 'Eventos del ' + fechaCorta(S.calDia) + ' <button type="button" class="btn-ghost sm" data-cal-dia="">Ver todo el mes</button>' : 'Eventos de ' + MESES[m - 1]) + '</div>' +
      (lista.length ? lista.map(function (e) { return tarjetaEvento(e, false); }).join('') : '<div class="hint">No hay eventos.</div>') +
      (mios.length ? '<div class="part-lbl" style="margin-top:14px">Llévatelos a tu calendario</div>' +
        '<button class="btn" type="button" data-ics-todos>Añadir todos mis eventos (' + mios.length + ') · iPhone / Outlook</button>' +
        '<div class="hint">En Google Calendar, añádelos uno a uno desde cada evento («Google Calendar»). Se guardan como «Fabrik: nombre del evento».</div>' : '');
    $app.innerHTML = html;
    document.getElementById('atras').onclick = function () { S.vista = 'ajustes'; S._abrir = 's-eventos'; render(); };
  }
  function abrirCalendario() { S.vista = 'calendario'; S.calDia = null; render(); window.scrollTo({ top: 0 }); }

  function fechaGcal(iso, hora, masHoras) {
    if (!hora) return iso.replace(/-/g, '');
    var h = hora.split(':').map(Number), d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), h[0] + (masHoras || 0), h[1] || 0));
    return d.toISOString().slice(0, 16).replace(/[-:]/g, '') + '00';
  }
  function enlaceGoogle(e) {
    var fin = e.fin || e.inicio, dts = e.hora ? fechaGcal(e.inicio, e.hora) + '/' + fechaGcal(e.inicio, e.hora, 2) :
      e.inicio.replace(/-/g, '') + '/' + new Date(Date.parse(fin + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10).replace(/-/g, '');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('Fabrik: ' + e.nombre) + '&dates=' + dts +
      (e.hora ? '&ctz=Europe/Madrid' : '') + (e.lugar ? '&location=' + encodeURIComponent(e.lugar) : '') +
      '&details=' + encodeURIComponent((e.descripcion || '') + (e.enlace ? '\n' + e.enlace : '') + '\n\n' + (CFG.urlApp || ''));
  }
  function enlaceIcs(ids) { return CFG.apiUrl + '?ics=' + encodeURIComponent(ids.join(',')); }
  function botonesCalendario(e) {
    return '<div class="cal-add"><a class="btn-ghost sm" href="' + esc(enlaceGoogle(e)) + '" target="_blank" rel="noopener">＋ Google Calendar</a>' +
      '<a class="btn-ghost sm" href="' + esc(enlaceIcs([e.id])) + '" target="_blank" rel="noopener">＋ iPhone / Outlook</a></div>';
  }

  // ---------- Notificaciones (Firebase Cloud Messaging) ----------
  function pushPosible() { return !!(S.data && S.data.push && CFG.vapidKey && 'Notification' in window && 'serviceWorker' in navigator && window.PushManager); }
  function pushEstado() {
    if (!pushPosible()) return esIOS() && !esStandalone() ? 'instalar' : 'no';
    return Notification.permission === 'granted' && leer('pa-push-ok') ? 'activas' : Notification.permission === 'denied' ? 'bloqueadas' : 'apagadas';
  }
  function esIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function cargarMessaging() {
    if (window.firebase && firebase.messaging) return Promise.resolve();
    var v = ((document.querySelector('script[src*="firebase-app-compat"]') || {}).src || '').match(/firebasejs\/([\d.]+)\//);
    return new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = 'https://www.gstatic.com/firebasejs/' + (v ? v[1] : '10.12.2') + '/firebase-messaging-compat.js';
      s.onload = ok; s.onerror = function () { ko(new Error('No se pudo cargar el servicio de notificaciones.')); }; document.head.appendChild(s);
    });
  }
  function activarPush(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Activando…'; }
    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') throw new Error('Has dicho que no a las notificaciones. Puedes cambiarlo en los ajustes del navegador.');
      return cargarMessaging();
    }).then(function () { return navigator.serviceWorker.ready; })
      .then(function (reg) { return firebase.messaging().getToken({ vapidKey: CFG.vapidKey, serviceWorkerRegistration: reg }); })
      .then(function (token) { if (!token) throw new Error('No se pudo activar.'); return api({ action: 'push_token', token: token }).then(function () { guardar('pa-push-ok', token); }); })
      .then(function () { toast('Notificaciones activadas en este móvil'); if (S.vista === 'ajustes') { S._abrir = 's-push'; render(); } else render(); })
      .catch(function (e) { if (btn) { btn.disabled = false; btn.textContent = 'Activar notificaciones'; } toast(e.message); });
  }
  /** Al abrir la app con notificaciones activas: renueva el token (caduca) sin preguntar. */
  function renovarPush() {
    if (!pushPosible() || Notification.permission !== 'granted' || !leer('pa-push-ok') || S._pushRenovado) return;
    S._pushRenovado = true;
    cargarMessaging().then(function () { return navigator.serviceWorker.ready; })
      .then(function (reg) { return firebase.messaging().getToken({ vapidKey: CFG.vapidKey, serviceWorkerRegistration: reg }); })
      .then(function (t) { if (t) { guardar('pa-push-ok', t); return api({ action: 'push_token', token: t }); } }).catch(function () {});
  }
  function htmlPush() {
    var e = pushEstado();
    if (e === 'activas') return '<div class="hint">✓ Activadas en este móvil. Te avisaremos de avisos y notas nuevas del coach.</div>';
    if (e === 'bloqueadas') return '<div class="hint">Las tienes bloqueadas para esta web. Actívalas en los ajustes del navegador o del móvil.</div>';
    if (e === 'instalar') return '<div class="hint">En iPhone, primero instala la app en la pantalla de inicio (apartado «Instalar la app») y ábrela desde ahí.</div>';
    if (e === 'no') return '<div class="hint">' + (S.data && S.data.push ? 'Este navegador no admite notificaciones.' : 'El coach todavía no ha activado las notificaciones.') + '</div>';
    return '<button class="btn btn-primary" type="button" data-push-on>Activar notificaciones</button><div class="hint">Te llega un aviso al móvil cuando el coach publica algo para ti.</div>';
  }
  /** Tarjeta discreta en la semana, una sola vez, para animar a activarlas. */
  function bannerPush() {
    if (pushEstado() !== 'apagadas' || leer('pa-push-banner')) return '';
    return '<div class="push-banner"><span>🔔 Activa las notificaciones para enterarte de los avisos del coach.</span>' +
      '<div class="two-btn"><button class="btn-ghost sm" type="button" data-push-no>Ahora no</button><button class="btn btn-primary sm" type="button" data-push-on>Activar</button></div></div>';
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target, b;
    if ((b = t.closest('[data-fase]'))) { abrirFase(+b.dataset.fase); return; }
    if ((b = t.closest('[data-cal-mes]'))) {
      var base = S.calMes || (S.data.hoy || '').slice(0, 7), y = +base.slice(0, 4), m = +base.slice(5, 7) + Number(b.dataset.calMes);
      if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
      S.calMes = y + '-' + (m < 10 ? '0' : '') + m; S.calDia = null; render(); return;
    }
    if ((b = t.closest('[data-cal-dia]'))) { S.calDia = b.dataset.calDia || null; render(); return; }
    if (t.closest('[data-ics-todos]')) {
      window.open(enlaceIcs(eventosCalendario().filter(function (e) { return e.mio && !e.pasado; }).map(function (e) { return e.id; })), '_blank'); return;
    }
    if ((b = t.closest('[data-push-on]'))) { activarPush(b); return; }
    if (t.closest('[data-push-no]')) { guardar('pa-push-banner', 1); var x = t.closest('.push-banner'); if (x) x.remove(); return; }
    if (t.closest('#co-publicar')) { abrirPublicar({}); return; }
    if (t.closest('[data-solic-ev]')) { abrirSolicitudes(); return; }
    if (t.closest('#co-misnotas')) { abrirMisNotas(); return; }
    if (t.closest('#co-avisos')) { abrirAvisosCoach(); return; }
    if (t.closest('#ir-calendario')) { abrirCalendario(); return; }
  });

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
      '<div id="pr-tw" hidden><label for="pr-tt-m">Tiempo</label>' + campoTiempo('pr-tt', '') + '</div>' +
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
  function valorNum(x) { if (x.tipo === 'Tiempo') { var p = String(x.valor).split(':').map(Number), sg = 0; p.forEach(function (n) { sg = sg * 60 + (n || 0); }); return p.length === 1 ? sg * 60 : sg; } return parseFloat(String(x.valor).replace(',', '.')); }
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
    if (t) t.onchange = function () {
      var esT = t.value === 'Tiempo';
      v.placeholder = esT ? '' : PH_MARCA[t.value]; v.required = !esT; v.parentNode.hidden = esT;
      document.getElementById('pr-tw').hidden = !esT;
    };
    enlazarTiempo('pr-tt');
    var pn = document.getElementById('pr-n');
    if (pn) pn.onchange = function () { var tp = CATALOGO[norm(pn.value).trim()]; if (tp && t) { t.value = tp; t.onchange(); } };
    var pf = document.getElementById('prf');
    if (pf) pf.onsubmit = function (ev) {
      ev.preventDefault();
      var valor = val('pr-v');
      if (t.value === 'Tiempo') { valor = leerTiempo('pr-tt'); if (!valor) { toast(valor === null ? 'Revisa el tiempo: los segundos van de 0 a 59.' : 'Pon el tiempo (minutos y segundos).'); return; } }
      var b = document.getElementById('pr-ok'); b.disabled = true; b.textContent = 'Guardando…';
      api({ action: 'marca', marca: { marca: val('pr-n'), tipo: t.value, valor: valor, fecha: val('pr-f'), notas: val('pr-nt') } }).then(function (r) {
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
  // ---------- tiempos: huecos h · min · s (y texto libre con : , ; ' " . o espacios) ----------
  /** "12:45", "12,45", "12'45\"", "1.05.30", "1245" → {h,m,s}. null si no se entiende o los segundos pasan de 59. */
  function partesTiempo(txt) {
    var t = String(txt == null ? '' : txt).trim();
    if (!t) return null;
    var p = t.split(/[^0-9]+/).filter(function (x) { return x !== ''; }).map(Number);
    if (!p.length) return null;
    if (p.length === 1) {
      var d = String(p[0]);
      if (d.length <= 2) p = [p[0], 0];                                   // "12" → 12 min
      else if (d.length <= 4) p = [Number(d.slice(0, -2)), Number(d.slice(-2))];   // "1245" → 12:45
      else p = [Number(d.slice(0, -4)), Number(d.slice(-4, -2)), Number(d.slice(-2))]; // "10530" → 1:05:30
    }
    if (p.length > 3) return null;
    var h = p.length === 3 ? p[0] : 0, m = p[p.length - 2], s = p[p.length - 1];
    if (s > 59 || (p.length === 3 && m > 59)) return null;
    h += Math.floor(m / 60); m = m % 60;
    if (!h && !m && !s) return null;
    return { h: h, m: m, s: s };
  }
  function textoTiempo(o) {
    if (!o) return '';
    var dd = function (n) { return (n < 10 ? '0' : '') + n; };
    return o.h ? o.h + ':' + dd(o.m) + ':' + dd(o.s) : o.m + ':' + dd(o.s);
  }
  function campoTiempo(id, valor) {
    var o = partesTiempo(valor) || {};
    var caja = function (k, lbl, ph, max, v) {
      return '<label class="tz"><input id="' + id + '-' + k + '" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-max="' + max + '" placeholder="' + ph + '" value="' + (v != null && (v || k !== 'h') ? v : '') + '" aria-label="' + lbl + '"><span>' + lbl + '</span></label>';
    };
    return '<div class="tiempo" id="' + id + '" role="group" aria-label="Tiempo">' +
      caja('h', 'horas', '0', 2, o.h) + '<b aria-hidden="true">:</b>' + caja('m', 'min', '12', 3, o.m != null ? o.m : null) + '<b aria-hidden="true">:</b>' +
      caja('s', 'seg', '45', 2, o.s != null ? (o.s < 10 ? '0' + o.s : o.s) : null) + '</div>';
  }
  /** Lee los huecos. '' si están vacíos; null si hay un error (y lo marca en rojo). */
  function leerTiempo(id) {
    var g = function (k) { var e = document.getElementById(id + '-' + k); return e ? e.value.replace(/\D/g, '') : ''; };
    var h = g('h'), m = g('m'), s = g('s');
    var w = document.getElementById(id);
    if (!h && !m && !s) return '';
    var o = partesTiempo(h ? h + ':' + (m || 0) + ':' + (s || 0) : (m || 0) + ':' + (s || 0));
    if (w) w.classList.toggle('mal', !o);
    return o ? textoTiempo(o) : null;
  }
  /**
   * Comportamiento de los huecos:
   *  · "12:45" (o 12,45 · 12'45 · 12;45 · 12.45) escrito o pegado en cualquier hueco → se reparte solo.
   *  · Un número + separador ("12,") → se queda el número y salta al hueco siguiente.
   *  · Solo cifras; al llenar 2 cifras en horas o minutos, salta al siguiente.
   */
  function enlazarTiempo(id) {
    var w = document.getElementById(id);
    if (!w) return;
    var cajas = ['h', 'm', 's'].map(function (k) { return document.getElementById(id + '-' + k); });
    var MAX = [2, 3, 2];
    cajas.forEach(function (c, i) {
      c.oninput = function () {
        var v = c.value;
        w.classList.remove('mal');
        if (/[^0-9]/.test(v)) {
          var nums = v.split(/[^0-9]+/).filter(function (x) { return x !== ''; });
          if (nums.length >= 2) {
            var o = partesTiempo(v);
            if (o) { cajas[0].value = o.h ? o.h : ''; cajas[1].value = o.m; cajas[2].value = (o.s < 10 ? '0' : '') + o.s; cajas[2].focus(); return; }
          }
          c.value = (nums[0] || '').slice(0, MAX[i]);
          if (nums.length === 1 && cajas[i + 1]) { cajas[i + 1].focus(); try { cajas[i + 1].select(); } catch (e) {} }
          return;
        }
        if (v.length > MAX[i]) c.value = v = v.slice(0, MAX[i]);
        if (i < 2 && v.length >= 2) { cajas[i + 1].focus(); try { cajas[i + 1].select(); } catch (e) {} }
      };
      c.onfocus = function () { try { c.select(); } catch (e) {} };
      c.onkeydown = function (e) { if (e.key === 'Backspace' && !c.value && i > 0) cajas[i - 1].focus(); };
    });
  }

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
    var versiones = [''].concat((b.variantes || []).filter(function (v) { return v.tipo !== 'quita' && versionPermitida(v.nombre); }).map(function (v) { return v.nombre; }));
    var version = versionPre != null ? versionPre : (versiones.length > 1 && (d.eventos || []).some(function (e) { return e.mio && norm(e.nombre).indexOf(norm(versiones[1])) >= 0; }) ? versiones[1] : '');
    var previo = (d.resultados || {})[iso + '|' + n + '|' + version];
    var tipo = previo ? previo.tipo : formatoWod(b), nivel = previo ? previo.nivel : 'RX';
    var v = previo ? leerResultado(previo) : {};
    if (S._prefTiempo) { v.tiempo = S._prefTiempo; v.cap = false; tipo = 'Tiempo'; S._prefTiempo = null; }
    var seg = function (id, ops, actual) {
      return '<div class="seg" role="group" id="' + id + '">' + ops.map(function (o) {
        var val = o[0], lbl = o[1];
        return '<button type="button" data-val="' + esc(val) + '" aria-pressed="' + (val === actual) + '">' + esc(lbl) + '</button>';
      }).join('') + '</div>';
    };
    var campos = {
      'Tiempo': '<div class="rs-row"><div><label for="rs-t-m">Tiempo</label>' + campoTiempo('rs-t', v.tiempo) + '<div class="hint">Minutos y segundos. Las horas solo si pasas de 60 min.</div></div></div>' +
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
      var bloquear = function (si) { ['h', 'm', 's'].forEach(function (k) { var e = document.getElementById('rs-t-' + k); if (e) e.disabled = si; }); var w = document.getElementById('rs-t'); if (w) w.classList.toggle('off', si); };
      if (cap) cap.onchange = function () { document.getElementById('rs-capw').hidden = !cap.checked; bloquear(cap.checked); };
      if (cap && cap.checked) bloquear(true);
      enlazarTiempo('rs-t');
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
      if (estado.tipo === 'Tiempo') {
        var c = document.getElementById('rs-cap').checked; cuerpo.cap = c; cuerpo.reps = val('rs-cr');
        if (!c) { var tt = leerTiempo('rs-t'); if (!tt) { toast(tt === null ? 'Revisa el tiempo: los segundos van de 0 a 59.' : 'Pon tu tiempo (minutos y segundos).'); return; } cuerpo.tiempo = tt; }
      }
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
        html += '<section class="rk-day" id="rk-' + iso + '"><h2><button type="button" class="rk-dia" data-rk-dia="' + iso + '" aria-label="Ver el metcon del ' + NOMBRE_DIA[nom] + ' ' + diaMes(iso) + '">' +
          NOMBRE_DIA[nom] + ' ' + diaMes(iso) + '<span class="rk-ver">Ver metcon</span></button></h2>';
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
    $app.querySelectorAll('[data-rk-dia]').forEach(function (b) { b.onclick = function () { abrirMetconDia(b.dataset.rkDia); }; });
    if (rk.irA) { var el = document.getElementById('rk-' + rk.irA); rk.irA = null; if (el) setTimeout(function () { el.scrollIntoView({ block: 'start' }); }, 30); }
  }

  /** Ventana con el texto de los metcons de un día del leaderboard (de la hoja METCONS; si no, de la semana cargada). */
  function textoBloqueLocal(iso, num) {
    var x = (S.data.dias || []).filter(function (y) { return y.iso === iso; })[0];
    var b = x && (x.bloques || []).filter(function (y) { return String(y.n) === String(num); })[0];
    return b ? b.partes.map(function (p) { return (p.etiqueta ? p.etiqueta + '\n' : '') + p.texto; }).join('\n\n') : '';
  }
  function abrirMetconDia(iso) {
    var L = S.rk && S.rk.datos; if (!L) return;
    var vistos = {}, ms = L.metcons.filter(function (m) { if (m.dia !== iso) return false; var k = m.bloque + '|' + (m.version || ''); if (vistos[k]) return false; vistos[k] = 1; return true; });
    var nom = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][new Date(iso + 'T12:00:00Z').getUTCDay()];
    abrirHoja('<div class="row"><h2>' + NOMBRE_DIA[nom] + ' ' + diaMes(iso) + '</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div>' +
      ms.map(function (m) {
        var t = m.texto || textoBloqueLocal(iso, m.bloque);
        return '<div class="rk-metcon"><div class="rk-head"><span class="b-num">' + m.bloque + '</span><b>' + esc(m.titulo || 'Metcon') + '</b>' +
          (m.version ? '<span class="v-tag">' + esc(nombreVersion(m.version)) + '</span>' : '') + '</div>' +
          (t ? '<div class="board">' + pizarra(t, {}) + '</div>' : '<div class="hint">El texto de este metcon no está guardado.</div>') + '</div>';
      }).join(''));
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
  // =====================================================================
  //  EXTRA v4.1 · calculadora lb/kg · instalar en cualquier sistema · acceso «Solo eventos» · perfil
  // =====================================================================

  // ---------- calculadora lb ⇄ kg (ventana flotante, no tapa ni cambia la pantalla) ----------
  var LB = 0.45359237;
  var ICO_CALC = '<span class="calc-ico" aria-hidden="true">lb<i>⇄</i>kg</span>';
  function botonCalc() { return '<button class="icon-btn calc-btn" type="button" data-calc aria-label="Calculadora libras a kilos">' + ICO_CALC + '</button>'; }
  function redondear(x) { return Math.round(x * 10) / 10; }
  function fmtNum(x) { return isFinite(x) ? String(redondear(x)).replace('.', ',') : ''; }
  function leerNum(v) { var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? NaN : n; }
  function toggleCalc(forzar) {
    var el = document.getElementById('calc');
    if (el && forzar !== true) { el.remove(); guardar('pa-calc', false); return; }
    if (el) return;
    el = document.createElement('div');
    el.id = 'calc'; el.className = 'calc'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Calculadora libras y kilos');
    var ult = leer('pa-calc-v') || '';
    el.innerHTML = '<div class="calc-top"><b>Libras ⇄ kilos</b><button class="icon-btn" type="button" data-calc-cerrar aria-label="Cerrar">×</button></div>' +
      '<div class="calc-row"><label><input id="calc-lb" inputmode="decimal" autocomplete="off" placeholder="135"><span>lb</span></label><b aria-hidden="true">=</b>' +
      '<label><input id="calc-kg" inputmode="decimal" autocomplete="off" placeholder="61,2"><span>kg</span></label></div>' +
      '<div class="calc-chips" id="calc-chips">' + [45, 35, 95, 135, 185, 225].map(function (n) { return '<button type="button" data-lb="' + n + '">' + n + ' lb</button>'; }).join('') + '</div>' +
      '<div class="hint">Barra olímpica: 45 lb ≈ 20,4 kg · 35 lb ≈ 15,9 kg</div>';
    document.body.appendChild(el);
    var lb = document.getElementById('calc-lb'), kg = document.getElementById('calc-kg');
    lb.oninput = function () { var n = leerNum(lb.value); kg.value = isNaN(n) ? '' : fmtNum(n * LB); guardar('pa-calc-v', lb.value); };
    kg.oninput = function () { var n = leerNum(kg.value); lb.value = isNaN(n) ? '' : fmtNum(n / LB); guardar('pa-calc-v', lb.value); };
    if (ult) { lb.value = ult; lb.oninput(); }
    guardar('pa-calc', true);
  }

  // ---------- instalar la app: Windows/Mac/Android con botón; iPhone/iPad con pasos guiados ----------
  function esStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function entorno() {
    var ua = navigator.userAgent || '', ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
    var nav = /CriOS/.test(ua) ? 'chrome' : /FxiOS|Firefox/.test(ua) ? 'firefox' : /EdgiOS|Edg\//.test(ua) ? 'edge' : /SamsungBrowser/.test(ua) ? 'samsung' :
      /Chrome|Chromium/.test(ua) ? 'chrome' : /Safari/.test(ua) ? 'safari' : 'otro';
    var so = ios ? 'ios' : /Android/i.test(ua) ? 'android' : /Mac/i.test(ua) ? 'mac' : 'windows';
    return { so: so, nav: nav };
  }
  var ICO_IOS_SHARE = '<svg class="ico-inline" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  function pasosInstalar() {
    var e = entorno();
    if (e.so === 'ios') return '<ol class="steps">' +
      '<li>Pulsa <b>Compartir</b> ' + ICO_IOS_SHARE + (e.nav === 'safari' ? ' (abajo en el centro en iPhone; arriba en iPad).' : ' (en Chrome está arriba a la derecha, junto a la dirección).') + '</li>' +
      '<li>Desliza hacia abajo y toca <b>Añadir a pantalla de inicio</b>. Si no aparece: <b>Editar acciones</b> y actívala.</li>' +
      '<li>Pulsa <b>Añadir</b>. El icono de Fabrik aparece con tus apps y se abre a pantalla completa.</li></ol>' +
      '<div class="hint">Apple no deja que una web se instale sola con un botón: hay que hacerlo desde Compartir. Funciona en Safari y, desde iOS 16.4, también en Chrome y Edge.</div>';
    if (e.so === 'android') return '<ol class="steps">' +
      (e.nav === 'samsung' ? '<li>Menú <b>≡</b> (abajo) → <b>Añadir página a</b> → <b>Pantalla de inicio</b>.</li>' :
        e.nav === 'firefox' ? '<li>Menú <b>⋮</b> → <b>Instalar</b> (o <b>Añadir a pantalla de inicio</b>).</li>' :
        '<li>Menú <b>⋮</b> (arriba a la derecha) → <b>Instalar aplicación</b> (o <b>Añadir a pantalla de inicio</b>).</li>') +
      '<li>Pulsa <b>Instalar</b>. Aparece el icono de Fabrik con tus apps.</li></ol>';
    if (e.so === 'mac' && e.nav === 'safari') return '<ol class="steps"><li>Menú <b>Archivo → Añadir al Dock</b> (Safari 17 o posterior).</li><li>Pulsa <b>Añadir</b>. Se abre como una app más desde el Dock o Launchpad.</li></ol>';
    if (e.nav === 'firefox') return '<p>Firefox de ordenador no instala webs como app. Abre esta misma dirección en <b>Chrome</b> o <b>Edge</b> y pulsa <b>Instalar</b>.</p>';
    return '<ol class="steps"><li>En la barra de direcciones, pulsa el icono <b>Instalar</b> (una pantalla con una flecha). Si no aparece: menú <b>⋮</b> → <b>Enviar, guardar y compartir</b> → <b>Instalar página como aplicación</b> (Edge: <b>Aplicaciones → Instalar este sitio como una aplicación</b>).</li>' +
      '<li>Pulsa <b>Instalar</b>. Se crea un icono en el escritorio y en el menú Inicio (Windows) o en Aplicaciones (Mac).</li></ol>';
  }
  function instalar() {
    if (S.instalar) {
      S.instalar.prompt();
      S.instalar.userChoice.then(function (r) { S.instalar = null; if (r && r.outcome === 'accepted') toast('Instalando Fabrik Program…'); render(); });
      return;
    }
    abrirHoja('<div class="row"><h2>Instalar la app</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div>' + pasosInstalar());
  }
  function htmlInstalar() {
    if (esStandalone()) return '<div class="hint">Ya la tienes instalada: la estás usando como app. ✓</div>';
    return '<button class="btn btn-primary" type="button" data-instalar>Instalar la app en este ' + (/ios|android/.test(entorno().so) ? 'móvil' : 'ordenador') + '</button>' +
      (S.instalar ? '' : pasosInstalar());
  }
  function bannerInstalar() {
    if (esStandalone() || leer('pa-inst-cerrado')) return '';
    var e = entorno();
    if (!S.instalar && e.so !== 'ios' && e.so !== 'android') return '';
    return '<div class="inst-banner"><div><b>Instala Fabrik</b><span class="hint">Ábrela desde un icono, a pantalla completa.</span></div>' +
      '<button class="btn btn-primary" type="button" data-instalar>Instalar</button><button class="icon-btn" type="button" data-inst-cerrar aria-label="No mostrar más">×</button></div>';
  }
  window.addEventListener('appinstalled', function () { S.instalar = null; guardar('pa-inst-cerrado', true); toast('App instalada'); if (S.data) render(); });

  // ---------- acceso «Solo eventos»: sin programación, solo sus eventos ----------
  function renderSoloEventos(d) {
    var ini = (S.user.nombre || '?').trim().charAt(0).toUpperCase();
    var evs = (d.eventos || []).filter(function (e) { return e.mio; });
    var proximos = evs.filter(function (e) { return !e.pasado; }), pasados = evs.filter(function (e) { return e.pasado; });
    $app.innerHTML = '<header class="top"><div class="brand sm">Fabrik Program</div>' + botonCalc() +
      '<button class="icon-btn share" id="compartir" type="button" aria-label="Compartir la app">' + ICO_SHARE + '</button>' +
      '<button class="who" id="perfil" type="button" aria-label="Menú">' + esc(ini) + '</button></header>' + bannerInstalar() +
      '<div class="day-title"><h1>Tus eventos</h1></div>' +
      (proximos.length ? '<div class="ev-list">' + proximos.map(function (e, i) { return tarjetaEvento(e, i === 0); }).join('') + '</div>' :
        '<div class="empty">Todavía no tienes eventos asignados. Habla con Gabi.</div>') +
      (pasados.length ? '<details class="hist"><summary>Pasados (' + pasados.length + ')</summary><div class="exp-body">' + pasados.map(function (e) { return tarjetaEvento(e); }).join('') + '</div></details>' : '') +
      (S.aviso ? '<div class="stale">' + esc(S.aviso) + '</div>' : '');
    document.getElementById('perfil').onclick = function () { abrirAjustes(); };
    abrirAvisosPendientes(d);
  }

  // ---------- perfil: sexo (para el leaderboard) ----------
  function htmlPerfilSexo() {
    var s = (S.user || {}).sexo || '';
    return '<div class="me-sexo"><span class="lbl-s">Sexo · para el leaderboard' + (s ? '' : ' <b class="falta">(sin indicar)</b>') + '</span>' +
      '<div class="seg" role="group" aria-label="Sexo">' + ['Chico', 'Chica'].map(function (x) {
        return '<button type="button" data-sexo="' + x + '" aria-pressed="' + (s === x) + '">' + x + '</button>'; }).join('') + '</div></div>';
  }

  // ---------- versión de evento en resultados: solo quien está en ese evento ----------
  function versionPermitida(nombre) {
    if (!nombre) return true;
    var n = norm(nombre).trim(), hay = (S.data.eventos || []).filter(function (e) { return norm(e.nombre).indexOf(n) >= 0; });
    return !hay.length || hay.some(function (e) { return e.mio; });
  }

  document.addEventListener('click', function (e) {
    var t = e.target, b;
    if (t.closest('[data-calc]')) { toggleCalc(); return; }
    if (t.closest('[data-calc-cerrar]')) { toggleCalc(); return; }
    if ((b = t.closest('[data-lb]'))) { var lb = document.getElementById('calc-lb'); lb.value = b.dataset.lb; lb.oninput(); return; }
    if (t.closest('[data-instalar]')) { instalar(); return; }
    if (t.closest('[data-inst-cerrar]')) { guardar('pa-inst-cerrado', true); var bn = t.closest('.inst-banner'); if (bn) bn.remove(); return; }
    if ((b = t.closest('[data-sexo]'))) {
      var sexo = b.dataset.sexo;
      if (S.user && S.user.sexo === sexo) return;
      b.parentNode.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      api({ action: 'perfil', sexo: sexo }).then(function (r) {
        if (!r.ok) throw new Error(r.detalle || r.error);
        S.user = r.user; S._abrir = null; render(); toast('Guardado: ' + sexo);
      }).catch(function (er) { toast(mensajeError(er.message)); render(); });
    }
  });
  if (leer('pa-calc')) setTimeout(function () { toggleCalc(true); }, 0);

  // ---------- seguimiento (coach) ----------
  function segPend(d) { return d && d.seguimiento ? d.seguimiento.pendientes.length : 0; }
  function segItem(n) {
    return '<div class="seg-item' + (n.leida ? ' leida' : '') + '"><div class="seg-h"><b>' + esc(n.nombre) + '</b><span class="hint">' + esc(n.tipo) + ' · ' + fechaCorta(n.fecha) +
      (n.rpe ? ' · RPE ' + esc(n.rpe) : '') + '</span></div><p>«' + esc(n.texto) + '»</p>' +
      (n.leida ? '' : '<div class="two-btn"><button class="btn-ghost sm" type="button" data-seg-ficha="' + esc(n.email) + '">Ver ficha</button>' +
        '<button class="btn sm" type="button" data-seg-leido="' + esc(n.id) + '">Marcar como leído</button></div>') + '</div>';
  }
  function abrirSeguimiento(auto) {
    var sg = (S.data && S.data.seguimiento) || { pendientes: [], leidas: [], atletas: [] };
    abrirHoja('<div class="row"><h2>Seguimiento</h2><button class="btn-ghost" data-close type="button">' + (auto ? 'Luego' : 'Cerrar') + '</button></div>' +
      '<div class="hint">' + (sg.atletas.length ? 'En seguimiento: ' + sg.atletas.map(function (a) { return esc(a.nombre); }).join(', ') : 'Nadie en seguimiento. Actívalo desde la ficha del atleta o en ATLETAS → SEGUIMIENTO.') + '</div>' +
      (sg.pendientes.length ? '<div class="part-lbl">Notas sin leer (' + sg.pendientes.length + ')</div><div class="seg-list">' + sg.pendientes.map(segItem).join('') + '</div>' +
        (sg.pendientes.length > 1 ? '<button class="btn" type="button" data-seg-todo>Marcar todo como leído</button>' : '') : '<div class="hint">No hay notas nuevas.</div>') +
      (sg.leidas.length ? '<details class="hist"><summary>Leídas (' + sg.leidas.length + ')</summary><div class="exp-body seg-list">' + sg.leidas.map(segItem).join('') + '</div></details>' : ''));
  }
  function segLeido(ids, b) {
    if (b) b.disabled = true;
    api({ action: 'seguimiento_leido', ids: ids }).then(function (r) {
      if (!r.ok) throw new Error(r.detalle || r.error);
      S.data.seguimiento = r.seguimiento; toast('Marcado como leído');
      if (!$scrim.hidden) abrirSeguimiento(); if (S.vista === 'ficha' || S.vista === 'ajustes') render();
    }).catch(function (e) { if (b) b.disabled = false; toast(mensajeError(e.message)); });
  }
  function avisoSeguimiento(d) {
    if (!d.staff || S._segMostrado || !segPend(d) || !$scrim.hidden) return;
    S._segMostrado = true; abrirSeguimiento(true);
  }
  document.addEventListener('click', function (e) {
    var t = e.target, b;
    if (t.closest('[data-seg-abrir]')) { abrirSeguimiento(); return; }
    if ((b = t.closest('[data-seg-leido]'))) { segLeido([b.dataset.segLeido], b); return; }
    if ((b = t.closest('[data-seg-todo]'))) { segLeido(S.data.seguimiento.pendientes.map(function (n) { return n.id; }), b); return; }
    if ((b = t.closest('[data-seg-ficha]'))) { cerrarHoja(); abrirFicha(b.dataset.segFicha); return; }
    if ((b = t.closest('[data-seguir]'))) {
      var f = S.ficha; if (!f || !f.atleta) return;
      b.disabled = true;
      api({ action: 'seguimiento', email: f.atleta.email, valor: b.dataset.seguir === '1' }).then(function (r) {
        if (!r.ok) throw new Error(r.detalle || r.error);
        S.ficha = r.ficha; S.ficha.email = f.atleta.email; S._atletas = null;
        return api({ action: 'seguimiento_notas' });
      }).then(function (r) { if (r && r.ok) S.data.seguimiento = r.seguimiento; render(); toast(b.dataset.seguir === '1' ? 'En seguimiento' : 'Quitado del seguimiento'); })
        .catch(function (er) { b.disabled = false; toast(mensajeError(er.message)); });
    }
  });

  // =====================================================================
  //  TIMER · detección por parte (sin dependencias: se prueba en Node con fabrik/partes.json)
  //  Grupos: intervalo {cada, rondas, cap?} · cuenta {dur, etiqueta} · onoff {on, off, rondas}
  //          descanso {dur} · series {series, descanso, pasos:[{t:'tiempo'|'tap'|'pausa', s?, txt?}]} · crono {}
  //  Solo hay timer donde Gabi escribe un tiempo de estructura. Isometrías y tempos se ignoran.
  // =====================================================================
  var TM_TIEMPO = /(\d+)[ \t]*'[ \t]*(?:(\d{1,2})[ \t]*(?:"|''|”|″)?)?|(\d+)[ \t]*(?:"|''|”|″)/;
  /** Primer tiempo del texto, en segundos. Rangos «2/3'» → 2'; «90"/2'» → 90". */
  function tmSeg(s) {
    s = String(s || '');
    var r = s.match(/(\d+)[ \t]*\/[ \t]*\d+[ \t]*'/);
    if (r && s.indexOf(r[0]) <= s.search(TM_TIEMPO)) return Number(r[1]) * 60;
    var m = s.match(TM_TIEMPO);
    if (!m) return null;
    if (m[3]) return Number(m[3]);
    return Number(m[1]) * 60 + Number(m[2] || 0);
  }
  function tmFmt(s) {
    if (s == null) return '—';
    s = Math.round(s); var m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function tmNum(s) { var m = String(s || '').match(/(\d+)/); return m ? Number(m[1]) : null; }

  /** Cuántas series hay escritas debajo de un EVERY sin «X N»: «2 SETS 75%», «SET 1/2/3/4:», «80/83/85/88/90/90%». */
  function tmSeriesDebajo(lineas, desde) {
    var suma = 0, maxSet = 0, porc = 0;
    for (var i = desde; i < lineas.length; i++) {
      var l = lineas[i];
      if (/^(EVERY|EMOM|E\d+MOM|AMRAP|TIME ?CAP|REST\b|THEN|INTO|[A-Z](\.\d)?\))/.test(l)) break;
      var a = l.match(/^(\d+)\s*SETS?\s+\d/); if (a) suma += Number(a[1]);
      var b = l.match(/^SETS?\s+([\d\/]+)\s*:/); if (b) b[1].split('/').forEach(function (x) { maxSet = Math.max(maxSet, Number(x) || 0); });
      var c = l.match(/^(\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?){2,})\s*%/); if (c && !porc) porc = c[1].split('/').length;
    }
    return suma || maxSet || porc || null;
  }

  /** Ejercicio que toca en cada ronda: «1': …», «ODD: … / EVEN: …», «ALTERNANDO A Y B» + «A) …». */
  function tmEstaciones(lineas, desde) {
    var min = [], oe = [], abc = [], alt = false;
    for (var i = desde; i < lineas.length; i++) {
      var l = lineas[i];
      if (/^(EVERY|EMOM|E\d+MOM|AMRAP|TIME ?CAP|REST\b)/.test(l) && i > desde) break;
      var m;
      if ((m = l.match(/^(\d+)\s*'\s*:\s*(.+)/))) min[Number(m[1]) - 1] = m[2];
      else if ((m = l.match(/^(ODD|EVEN|IMPAR|PAR)\s*:\s*(.+)/))) oe[/ODD|IMPAR/.test(m[1]) ? 0 : 1] = m[1] + ': ' + m[2];
      else if (/ALTERNANDO/.test(l)) alt = true;
      else if (alt && (m = l.match(/^([A-F])\)\s*(.+)/))) abc.push(m[1] + ') ' + m[2]);
    }
    if (min.length && min.every(Boolean)) return min;
    if (oe[0] && oe[1]) return oe;
    if (abc.length > 1) return abc;
    return null;
  }

  function detectarTimer(texto, etiqueta) {
    var cab = String(etiqueta || '').toUpperCase().replace(/^[A-Z](\.\d)?\s*·\s*/, '').trim();
    var lineas = ((cab && /\d\s*('|")|SETS?|NO TIME/.test(cab) ? cab + '\n' : '') + String(texto || '').toUpperCase()).split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); });
    var g = [], total = null, notas = [], hayCuenta = false, forTime = false, restNeeded = false, repetir = 1, saltar = false;
    var setsCtx = null; // { series, pasos:[], tap:[] } mientras se leen ejercicios bajo «N SETS»
    var capRonda = null;
    lineas.forEach(function (l) { var m = l.match(/TIME ?CAP PER ROUND\s*(.+)/); if (m) capRonda = tmSeg(m[1]); });
    function cerrarTap() { if (setsCtx && setsCtx.tap.length) { setsCtx.pasos.push({ t: 'tap', txt: setsCtx.tap.join(' · ') }); setsCtx.tap = []; } }
    function cerrarSets(descanso) {
      if (!setsCtx) return;
      cerrarTap();
      if (descanso != null && !hayCuenta && setsCtx.pasos.length) g.push({ k: 'series', series: setsCtx.series, descanso: descanso, pasos: setsCtx.pasos });
      setsCtx = null;
    }
    for (var i = 0; i < lineas.length; i++) {
      var l = lineas[i], m;
      if (!l) { if (setsCtx && !setsCtx.pasos.length && !setsCtx.tap.length) setsCtx = null; if (saltar && !lineas[i + 1]) saltar = false; continue; }
      if (/^ADAPTACI/.test(l)) break;                                   // lo que sigue es otra versión
      if (/^ISOM[EÉ]TRIC/.test(l) || /^DIN[AÁ]MICA$/.test(l)) { setsCtx = null; saltar = true; continue; }
      if (saltar) { if (/^[A-Z](\.\d)?\)/.test(l)) saltar = false; else continue; }
      if (/^[*(]/.test(l) || /^RIR|^RPE|^\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)*\s*%/.test(l)) continue;
      var tot = l.match(/\((\d+\s*'(?:\s*\d+\s*")?)\)/);
      if (tot && /METCON|VENTANA|TIME ?CAP\/AMRAP|AMRAP\/TIME/.test(l)) total = tmSeg(tot[1]);
      if (/FOR TIME|NO TIME ?CAP/.test(l)) forTime = true;
      var rp = l.match(/^(?:[A-Z ]*METCON\s*:?\s*)?(\d+)\s*SETS?\s*\((\d+\s*'(?:\s*\d+\s*")?)\)/);
      if (rp) { repetir = Number(rp[1]); total = tmSeg(rp[2]); continue; }
      if (/REST NEEDED/.test(l)) { restNeeded = true; setsCtx = null; continue; }
      // ON / OFF
      if ((m = l.match(/((?:\d+\s*(?:'|")\s*\+?\s*)+)\s*ON\s*X?\s*(\d+\s*(?:'|")(?:\s*\d+\s*")?)\s*OFF(?:\s*X?\s*(\d+)\s*(?:SETS?|ROUNDS?))?/))) {
        var on = 0; m[1].replace(/(\d+)\s*('|")/g, function (_, n, u) { on += Number(n) * (u === "'" ? 60 : 1); return _; });
        var rondas = m[3] ? Number(m[3]) : (setsCtx ? setsCtx.series : tmNum((lineas[i + 1] || '').match(/^\d+\s*SETS?/) ? lineas[i + 1] : ''));
        if (!rondas) { var mins = 0; for (var q = i + 1; q < lineas.length && !/^ADAPTACI/.test(lineas[q]); q++) if (/^\d+\s*'\s*:/.test(lineas[q])) mins++; rondas = mins || null; }
        g.push({ k: 'onoff', on: on, off: tmSeg(m[2]), rondas: rondas || null, etiqueta: /AMRAP/.test(l) ? 'AMRAP' : 'ON/OFF' });
        hayCuenta = true; setsCtx = null; continue;
      }
      // EMOM / E2MOM
      if ((m = l.match(/\bE(\d*)MOM\s*(\d+\s*'(?:\s*\d+\s*")?)/))) {
        var cada = (Number(m[1]) || 1) * 60, dur = tmSeg(m[2]);
        var ge = { k: 'intervalo', cada: cada, rondas: Math.max(1, Math.round(dur / cada)), etiqueta: m[1] ? 'E' + m[1] + 'MOM' : 'EMOM' };
        var es = tmEstaciones(lineas, i + 1); if (es) ge.estaciones = es;
        g.push(ge);
        hayCuenta = true; setsCtx = null; continue;
      }
      // EVERY T (X N)
      if ((m = l.match(/\bEVERY\s+(.+)/)) && tmSeg(m[1]) != null) {
        var cadaE = tmSeg(m[1]), n = null, dePie = false;
        var x = m[1].match(/X\s*(\d+)(?:\s*\/\s*\d+)?\s*(?:SETS?|ROUNDS?|RONDAS?)?/);
        if (x) n = Number(x[1]);
        else {
          var sig = (lineas[i + 1] || '').match(/^(\d+)\s*(?:SETS?|ROUNDS?)\b\s*$/);
          if (sig) { n = Number(sig[1]); dePie = true; }
          else n = tmSeriesDebajo(lineas, i + 1);
        }
        var gr = { k: 'intervalo', cada: cadaE, rondas: n, etiqueta: 'EVERY ' + tmFmt(cadaE) };
        if (dePie) gr.dePie = true;
        if (capRonda) gr.cap = capRonda;
        var esE = tmEstaciones(lineas, i + 1); if (esE) gr.estaciones = esE;
        g.push(gr); hayCuenta = true; setsCtx = null; continue;
      }
      // AMRAP T / TIME CAP T (sin «PER ROUND»)
      if ((m = l.match(/\b(AMRAP|TIME ?CAP)\s*:?\s*(\d+\s*(?:'|")(?:\s*\d+\s*")?)/)) && !/PER ROUND/.test(l)) {
        g.push({ k: 'cuenta', dur: tmSeg(m[2]), etiqueta: m[1] === 'AMRAP' ? 'AMRAP' : 'TIME CAP' });
        hayCuenta = true; setsCtx = null; continue;
      }
      // N SETS (abre contexto de series; «4X5 …» también)
      if ((m = l.match(/^(\d+)(?:\/\d+)?\s*(?:SETS?|ROUNDS?)\b/)) || (m = l.match(/^(\d+)\s*X\s*\d+(?:\+\d+)?\s+[A-Z]/))) {
        if (setsCtx && !hayCuenta) { cerrarTap(); cerrarSets(setsCtx.pasos.some(function (x) { return x.t === 'pausa'; }) ? 0 : null); }
        if (!hayCuenta) { setsCtx = { series: Number(m[1]), pasos: [], tap: [] }; if (!/SETS?|ROUNDS?/.test(l.slice(0, 12))) setsCtx.tap.push(l); }
        continue;
      }
      // REST
      if ((m = l.match(/^REST\s+(.+)/))) {
        var t = tmSeg(m[1]);
        if (t == null) continue;
        if (/PER (SET|ROUND|SERIE|RONDA)/.test(l)) { cerrarSets(t); continue; }
        if (setsCtx) {
          // descanso dentro de la serie; si es el último REST del bloque de series, es el descanso entre series
          var masAbajo = false;
          for (var j = i + 1; j < lineas.length && lineas[j]; j++) if (/^REST\b/.test(lineas[j])) masAbajo = true;
          var hayEjDespues = !!(lineas[i + 1] && !/^(REST|THEN|INTO)/.test(lineas[i + 1]));
          if (!masAbajo && !hayEjDespues) {
            if (setsCtx.series === 1) { cerrarSets(0); if (!hayCuenta) g.push({ k: 'descanso', dur: t }); }
            else cerrarSets(t);
            continue;
          }
          cerrarTap(); setsCtx.pasos.push({ t: 'pausa', s: t }); continue;
        }
        if (g.length) g.push({ k: 'descanso', dur: t });
        continue;
      }
      if (/^(THEN|INTO)\b/.test(l)) continue;
      // línea de ejercicio dentro de series
      if (setsCtx) {
        var est = l.match(/^((?:\d+\s*(?:'|")\s*\+?\s*)+)\s*(?!ON\b)([A-Z].*)/);
        var ult = setsCtx.pasos[setsCtx.pasos.length - 1];
        if (est) {
          var sEst = 0; est[1].replace(/(\d+)\s*('|")/g, function (_, n, u) { sEst += Number(n) * (u === "'" ? 60 : 1); return _; });
          cerrarTap(); setsCtx.pasos.push({ t: 'tiempo', s: sEst, txt: est[2] });
        } else if (!/^\d/.test(l) && !setsCtx.tap.length && ult && ult.t === 'tiempo') ult.txt += ' ' + l;
        else setsCtx.tap.push(l);
      }
    }
    if (setsCtx && !hayCuenta) { cerrarTap(); cerrarSets(setsCtx.pasos.some(function (x) { return x.t === 'pausa'; }) ? 0 : null); }
    // «METCON: AMRAP 14'» que contiene «TIME CAP 2' → AMRAP 10' → TIME CAP 2'»: el primero es el total
    if (g.length > 2 && g[0].k === 'cuenta' && tmTotal(g.slice(1)) === g[0].dur) { total = g[0].dur; g = g.slice(1); }
    if (repetir > 1 && g.length) notas.push('Se repite ' + repetir + ' veces');
    // descansos sueltos al final no sirven
    while (g.length && g[g.length - 1].k === 'descanso') g.pop();
    while (g.length && g[0].k === 'descanso') g.shift();
    if (!g.length && forTime && !restNeeded) g.push({ k: 'crono', etiqueta: 'FOR TIME' });
    // comprobación con el total que escribe Gabi, p. ej. «VENTANAS (14')» o «(16'30")»
    var conf = 'alta';
    if (g.some(function (x) { return (x.k === 'intervalo' || x.k === 'onoff') && !x.rondas; })) conf = 'revisar';
    if (total) {
      var s = tmTotal(g) * repetir;
      if (s !== total) {
        var alt = g.map(function (x) { return x.dePie ? Object.assign({}, x, { rondas: 1 }) : x; });
        if (tmTotal(alt) * repetir === total) { g = alt; notas.push('Ajustado al total ' + tmFmt(total)); }
        else { conf = 'revisar'; notas.push('No cuadra con el total ' + tmFmt(total) + ' (sale ' + tmFmt(s) + ')'); }
      } else notas.push('Cuadra con el total ' + tmFmt(total));
    }
    g.forEach(function (x) { delete x.dePie; });
    return g.length ? { grupos: g, repetir: repetir, total: tmTotal(g) * repetir, confianza: conf, notas: notas } : null;
  }

  /** Duración fija en segundos (los pasos «hecho» de las series no cuentan). */
  function tmTotal(g) {
    return g.reduce(function (a, x) {
      if (x.k === 'intervalo') return a + (x.cada || 0) * (x.rondas || 0);
      if (x.k === 'cuenta' || x.k === 'descanso') return a + (x.dur || 0);
      if (x.k === 'onoff') return a + ((x.on || 0) + (x.off || 0)) * (x.rondas || 0);
      if (x.k === 'series') return a + (x.series || 0) * x.pasos.reduce(function (b, p) { return b + (p.s || 0); }, 0) + Math.max(0, (x.series || 0) - 1) * (x.descanso || 0);
      return a;
    }, 0);
  }

  function tmResumen(x) {
    if (x.k === 'intervalo') return (x.etiqueta || 'EVERY') + ' · ' + (x.rondas || '?') + ' × ' + tmFmt(x.cada) + (x.cap ? ' (cap ' + tmFmt(x.cap) + ')' : '');
    if (x.k === 'cuenta') return x.etiqueta + ' ' + tmFmt(x.dur);
    if (x.k === 'onoff') return (x.rondas || '?') + ' × (' + tmFmt(x.on) + ' on + ' + tmFmt(x.off) + ' off)';
    if (x.k === 'descanso') return 'Descanso ' + tmFmt(x.dur);
    if (x.k === 'series') return x.series + ' series · descanso ' + tmFmt(x.descanso) + (x.pasos.some(function (p) { return p.t !== 'tap'; }) ? ' · ' + x.pasos.filter(function (p) { return p.t !== 'tap'; }).map(function (p) { return (p.t === 'pausa' ? 'pausa ' : '') + tmFmt(p.s); }).join(' + ') : '');
    if (x.k === 'crono') return 'Cronómetro (' + (x.etiqueta || 'FOR TIME') + ')';
    return '';
  }

  // =====================================================================
  //  TIMER · botón por parte → «Tu timer» (editar y confirmar) → reloj a pantalla completa
  // =====================================================================
  var TM = { reg: [], run: null };
  var PIP = {};   // burbuja flotante (imagen en imagen)
  function tmHash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function tmClave(r) { return 'pa-tm-' + r.iso + '|' + r.n + '|' + tmHash(r.texto); }
  function tmCorto(det) {
    var g = det.grupos, s = g.length === 1 ? tmResumen(g[0]) : g.length + ' tramos · ' + tmFmt(det.total);
    return (det.repetir > 1 ? det.repetir + '× ' : '') + s;
  }
  /** Botón ▶ Timer para una parte (o '' si Gabi no indicó tiempo). */
  function tmBoton(p, b, x) {
    var det = detectarTimer(p.texto, p.etiqueta);
    if (!det || !x) return '';
    var ver = ''; (b.variantes || []).forEach(function (v) { if ((v.partes || []).indexOf(p) >= 0) ver = v.nombre; });
    var r = { det: det, texto: p.texto, etq: p.etiqueta, iso: x.iso, n: b.n, titulo: b.titulo, version: ver, metcon: esMetcon(b) };
    var guardado = leer(tmClave(r)); if (guardado && guardado.grupos) r.propio = guardado;
    var i = TM.reg.push(r) - 1;
    var sum = tmCorto(r.propio || det);
    return '<button class="tm-btn' + (r.propio ? ' propio' : '') + '" type="button" data-tm="' + i + '" aria-label="Timer · ' + esc(sum) + '" title="Timer · ' + esc(sum) + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.5v11l9-5.5z" fill="currentColor"/></svg></button>';
  }

  // ---------- editor ----------
  function tmCopia(o) { return JSON.parse(JSON.stringify(o)); }
  function tmCampoDur(id, s) {
    s = Math.max(0, Math.round(s || 0));
    return '<span class="tm-dur"><input data-d="' + id + '-m" inputmode="numeric" value="' + Math.floor(s / 60) + '" aria-label="minutos"><b>:</b>' +
      '<input data-d="' + id + '-s" inputmode="numeric" value="' + (s % 60 < 10 ? '0' : '') + (s % 60) + '" aria-label="segundos"></span>';
  }
  function tmCampoNum(id, n, lbl) { return '<label class="tm-n">' + lbl + '<input data-n="' + id + '" inputmode="numeric" value="' + (n == null ? '' : n) + '" placeholder="?"></label>'; }
  function tmFilaHtml(g, i) {
    var h = '<div class="tm-row" data-row="' + i + '"><div class="tm-row-h"><b>' + esc(
      g.k === 'intervalo' ? g.etiqueta || 'EVERY' : g.k === 'cuenta' ? g.etiqueta : g.k === 'onoff' ? 'ON / OFF' : g.k === 'descanso' ? 'Descanso' : g.k === 'series' ? 'Series' : 'Cronómetro') +
      '</b><button class="icon-btn sm" type="button" data-tm-quitar="' + i + '" aria-label="Quitar">×</button></div><div class="tm-row-b">';
    if (g.k === 'intervalo') h += tmCampoNum(i + '-rondas', g.rondas, 'Rondas') + '<span class="tm-x">×</span><span class="tm-l">cada</span>' + tmCampoDur(i + '-cada', g.cada) +
      (g.cap ? '<span class="tm-l">cap</span>' + tmCampoDur(i + '-cap', g.cap) : '');
    if (g.k === 'cuenta' || g.k === 'descanso') h += tmCampoDur(i + '-dur', g.dur);
    if (g.k === 'onoff') h += tmCampoNum(i + '-rondas', g.rondas, 'Rondas') + '<span class="tm-l">on</span>' + tmCampoDur(i + '-on', g.on) + '<span class="tm-l">off</span>' + tmCampoDur(i + '-off', g.off);
    if (g.k === 'series') {
      h += tmCampoNum(i + '-series', g.series, 'Series') + '<span class="tm-l">descanso</span>' + tmCampoDur(i + '-descanso', g.descanso);
      h += '<div class="tm-pasos">' + g.pasos.map(function (p, j) {
        return '<div>' + (p.t === 'tap' ? '<span class="hint">Pulsas «Hecho»:</span> ' + esc(p.txt) :
          (p.t === 'pausa' ? '<span class="tm-l">pausa</span>' : '<span class="tm-l">' + esc(p.txt || 'trabajo') + '</span>') + tmCampoDur(i + '-p' + j, p.s)) + '</div>';
      }).join('') + '</div>';
    }
    if (g.k === 'crono') h += '<span class="hint">Cuenta hacia arriba. Al parar, te lleva a apuntar el resultado.</span>';
    if (g.estaciones) h += '<div class="tm-est">' + g.estaciones.map(function (e, j) { return '<span>' + (j + 1) + ': ' + esc(e) + '</span>'; }).join('') + '</div>';
    return h + '</div></div>';
  }
  function tmLeerEditor(r) {
    var q = function (sel) { var e = $scrim.querySelector(sel); return e ? e.value : ''; };
    var dur = function (id) { return (parseInt(q('[data-d="' + id + '-m"]'), 10) || 0) * 60 + (parseInt(q('[data-d="' + id + '-s"]'), 10) || 0); };
    var num = function (id) { var v = parseInt(q('[data-n="' + id + '"]'), 10); return v > 0 ? v : null; };
    r.edit.grupos.forEach(function (g, i) {
      if (g.k === 'intervalo') { g.rondas = num(i + '-rondas'); g.cada = dur(i + '-cada'); if (g.cap) g.cap = dur(i + '-cap'); }
      if (g.k === 'cuenta' || g.k === 'descanso') g.dur = dur(i + '-dur');
      if (g.k === 'onoff') { g.rondas = num(i + '-rondas'); g.on = dur(i + '-on'); g.off = dur(i + '-off'); }
      if (g.k === 'series') { g.series = num(i + '-series') || 1; g.descanso = dur(i + '-descanso'); g.pasos.forEach(function (p, j) { if (p.t !== 'tap') p.s = dur(i + '-p' + j); }); }
    });
    var rp = parseInt(q('#tm-rep'), 10); if (r.edit.repetir > 1 || rp > 1) r.edit.repetir = rp > 0 ? rp : 1;
  }
  function tmAbrirEditor(i) {
    var r = TM.reg[i]; if (!r) return;
    r.edit = tmCopia(r.propio || r.det);
    tmPintarEditor(r, i);
  }
  function tmPintarEditor(r, i) {
    var e = r.edit, falta = e.grupos.some(function (g) { return (g.k === 'intervalo' || g.k === 'onoff') && !g.rondas; });
    abrirHoja('<div class="row"><h2>Tu timer</h2><button class="btn-ghost" data-close type="button">Cerrar</button></div>' +
      '<div class="hint">' + esc(r.n + ' · ' + r.titulo) + (r.etq ? ' · ' + esc(r.etq) : '') + (r.version ? ' · versión ' + esc(nombreVersion(r.version)) : '') + '</div>' +
      '<details class="tm-orig"><summary>Lo que escribió Gabi</summary><div class="board small">' + esc(r.texto) + '</div></details>' +
      (e.repetir > 1 ? '<label class="tm-n">Repetir todo<input id="tm-rep" inputmode="numeric" value="' + e.repetir + '"> veces</label>' : '') +
      '<div id="tm-rows">' + e.grupos.map(tmFilaHtml).join('') + '</div>' +
      '<div class="tm-add"><button class="btn-ghost sm" type="button" data-tm-add="intervalo">＋ Intervalo</button><button class="btn-ghost sm" type="button" data-tm-add="cuenta">＋ Cuenta atrás</button>' +
      '<button class="btn-ghost sm" type="button" data-tm-add="descanso">＋ Descanso</button></div>' +
      '<div class="tm-total" id="tm-total">' + tmTextoTotal(e) + '</div>' +
      (falta ? '<div class="err">Pon cuántas rondas son (Gabi no lo indicó).</div>' : (r.det.confianza !== 'alta' ? '<div class="err">Revisa los tiempos: ' + esc(r.det.notas.join(' · ')) + '</div>' : '')) +
      '<div class="two-btn"><button class="btn" type="button" data-tm-reset="' + i + '">Lo de Gabi</button><button class="btn btn-primary" type="button" data-tm-go="' + i + '">Confirmar y empezar</button></div>');
    $scrim.querySelector('.sheet').oninput = function () { tmLeerEditor(r); document.getElementById('tm-total').textContent = tmTextoTotal(r.edit); };
  }
  function tmTextoTotal(e) {
    var t = tmTotal(e.grupos) * (e.repetir || 1), taps = e.grupos.some(function (g) { return g.k === 'series' || g.k === 'crono'; });
    return 'Total ' + (taps ? 'aprox. ' : '') + tmFmt(t) + (taps ? ' + lo que tardes en tus series' : '');
  }

  // ---------- pasos ----------
  function tmPasos(e) {
    var out = [], rep = e.repetir || 1;
    for (var k = 0; k < rep; k++) e.grupos.forEach(function (g, gi) {
      var pre = rep > 1 ? 'Set ' + (k + 1) + '/' + rep + ' · ' : '';
      if (g.k === 'intervalo') for (var r = 1; r <= (g.rondas || 0); r++)
        out.push({ k: 'work', dur: g.cada, tit: pre + (g.etiqueta || 'EVERY'), sub: 'Ronda ' + r + '/' + g.rondas, est: g.estaciones ? g.estaciones[(r - 1) % g.estaciones.length] : '', cap: g.cap });
      if (g.k === 'cuenta') out.push({ k: 'work', dur: g.dur, tit: pre + g.etiqueta, sub: tmFmt(g.dur) });
      if (g.k === 'descanso') out.push({ k: 'rest', dur: g.dur, tit: pre + 'Descanso', sub: '' });
      if (g.k === 'onoff') for (var o = 1; o <= (g.rondas || 0); o++) {
        out.push({ k: 'work', dur: g.on, tit: pre + (g.etiqueta === 'AMRAP' ? 'AMRAP' : 'ON'), sub: 'Ronda ' + o + '/' + g.rondas });
        out.push({ k: 'rest', dur: g.off, tit: pre + 'OFF', sub: 'Ronda ' + o + '/' + g.rondas });
      }
      if (g.k === 'series') for (var s = 1; s <= g.series; s++) {
        g.pasos.forEach(function (p) {
          if (p.t === 'tap') out.push({ k: 'tap', tit: pre + 'Serie ' + s + '/' + g.series, sub: p.txt });
          else out.push({ k: p.t === 'pausa' ? 'rest' : 'work', dur: p.s, tit: pre + (p.t === 'pausa' ? 'Pausa' : 'Serie ' + s + '/' + g.series), sub: p.t === 'pausa' ? '' : p.txt });
        });
        if (s < g.series && g.descanso) out.push({ k: 'rest', dur: g.descanso, tit: pre + 'Descanso', sub: 'Siguiente: serie ' + (s + 1) + '/' + g.series });
      }
      if (g.k === 'crono') out.push({ k: 'up', tit: g.etiqueta || 'FOR TIME', sub: 'Pulsa «Terminé» al acabar' });
    });
    return out.filter(function (p) { return p.k === 'tap' || p.k === 'up' || p.dur > 0; });
  }

  // ---------- reloj ----------
  function tmBeep(f, ms) {
    var R = TM.run; if (!R || !R.ac) return;
    try {
      var o = R.ac.createOscillator(), g = R.ac.createGain(), t = R.ac.currentTime;
      o.frequency.value = f; o.type = 'square'; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000); o.connect(g); g.connect(R.ac.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
    } catch (e) {}
  }
  function tmVibrar(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
  function tmWake(on) {
    var R = TM.run;
    try {
      if (on && navigator.wakeLock && R && !R.wl) navigator.wakeLock.request('screen').then(function (w) { R.wl = w; }).catch(function () {});
      if (!on && R && R.wl) { R.wl.release(); R.wl = null; }
    } catch (e) {}
  }
  // Al volver del segundo plano: recalcula con la hora real (salta los tramos que hayan pasado) y repinta.
  document.addEventListener('visibilitychange', function () {
    var R = TM.run; if (!R || R.fin) return;
    if (document.visibilityState === 'visible') { R.wl = null; tmWake(true); tmAudio(); tmTick(); tmPintar(); }
    else { tmGuardarRun(); tmPipAuto(); }
  });
  window.addEventListener('pagehide', function () { tmGuardarRun(); });
  function tmAudio() { var R = TM.run; try { if (R && R.ac && R.ac.state === 'suspended') R.ac.resume(); } catch (e) {} }

  function tmEmpezar(i) {
    var r = TM.reg[i]; if (!r) return;
    tmLeerEditor(r);
    if (r.edit.grupos.some(function (g) { return (g.k === 'intervalo' || g.k === 'onoff') && !g.rondas; })) { toast('Pon cuántas rondas son.'); return; }
    guardar(tmClave(r), r.edit); r.propio = r.edit;
    var pasos = tmPasos(r.edit);
    if (!pasos.length) { toast('No hay ningún tramo con tiempo.'); return; }
    cerrarHoja();
    var ac = null; try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    pasos.unshift({ k: 'rest', dur: 10, tit: 'Prepárate', sub: r.titulo, prep: true });
    var rr = { texto: r.texto, etq: r.etq, iso: r.iso, n: r.n, titulo: r.titulo, version: r.version, metcon: r.metcon };
    TM.run = { r: rr, pasos: pasos, i: 0, ini: Date.now(), pausa: 0, enPausa: null, ac: ac, ultSeg: null, total0: Date.now(), fin: false, capAvisado: false };
    tmMontarReloj(); tmGuardarRun(); tmPipIniciar();
  }
  function tmMontarReloj() {
    var el = document.getElementById('reloj');
    if (!el) { el = document.createElement('div'); el.id = 'reloj'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Timer'); document.body.appendChild(el); }
    el.className = 'reloj'; document.body.classList.add('con-reloj');
    tmWake(true); tmTick(); tmPintar(); clearInterval(TM.run.int); TM.run.int = setInterval(tmTick, 200);
  }

  // ---------- estado guardado: el timer sobrevive al segundo plano y a una recarga de la app ----------
  // Todo se calcula con la hora real (Date.now): aunque el móvil congele la app, al volver se sabe
  // exactamente en qué tramo y segundo va.
  var TM_KEY = 'pa-tm-run';
  function tmGuardarRun() {
    var R = TM.run; if (!R || R.fin) return;
    guardar(TM_KEY, { r: R.r, pasos: R.pasos, i: R.i, ini: R.ini, pausa: R.pausa, enPausa: R.enPausa, total0: R.total0 });
  }
  function tmBorrarRun() { try { localStorage.removeItem(TM_KEY); } catch (e) {} }
  function tmRestaurar() {
    if (TM.run) return;
    var s = leer(TM_KEY);
    if (!s || !s.pasos || !s.pasos.length || Date.now() - s.total0 > 4 * 3600 * 1000) { tmBorrarRun(); return; }
    var ac = null; try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    TM.run = { r: s.r, pasos: s.pasos, i: s.i, ini: s.ini, pausa: s.pausa || 0, enPausa: s.enPausa || null, ac: ac, ultSeg: null, total0: s.total0, fin: false, capAvisado: true };
    tmMontarReloj(); tmPipIniciar();
  }
  setTimeout(tmRestaurar, 0);

  function tmTranscurrido() { var R = TM.run; return ((R.enPausa || Date.now()) - R.ini - R.pausa) / 1000; }
  function tmTick() {
    var R = TM.run; if (!R || R.fin) return;
    if (R.enPausa) { tmPipDibujar(); return; }
    var saltos = 0, p, t;
    for (;;) {
      p = R.pasos[R.i]; t = tmTranscurrido();
      if (!(p.k === 'work' || p.k === 'rest') || t < p.dur) break;
      // el tramo terminó (en directo o mientras la app estaba en segundo plano): pasa al siguiente
      // con el reloj exacto en que acabó, sin perder ni ganar segundos
      if (R.i + 1 >= R.pasos.length) { R.i = R.pasos.length; return tmFinal(); }
      R.ini = R.ini + R.pausa + p.dur * 1000; R.pausa = 0; R.i++; R.ultSeg = null; R.capAvisado = false; saltos++;
      if (saltos > 1000) break;
    }
    if (saltos) { tmAvisoTramo(); tmPintar(); tmGuardarRun(); tmPipDibujar(); return; }
    if (p.k === 'work' || p.k === 'rest') {
      var seg = Math.ceil(p.dur - t);
      if (seg !== R.ultSeg) {
        R.ultSeg = seg;
        if (seg <= 3 && seg >= 1) tmBeep(880, 120);
        if (p.cap && !R.capAvisado && t >= p.cap) { R.capAvisado = true; tmBeep(660, 400); tmVibrar([150, 80, 150]); }
      }
    }
    tmPintar(true); tmPipDibujar();
  }
  function tmAvisoTramo() { var p = TM.run.pasos[TM.run.i]; tmBeep(p.k === 'rest' ? 520 : 1040, 450); tmVibrar(p.k === 'rest' ? 200 : [250, 100, 250]); }
  /** Saltar o «Hecho»: el siguiente tramo empieza ahora. */
  function tmSiguiente() {
    var R = TM.run;
    R.i++; R.ini = Date.now(); R.pausa = 0; R.ultSeg = null; R.capAvisado = false;
    if (R.i >= R.pasos.length) return tmFinal();
    tmAvisoTramo(); tmPintar(); tmGuardarRun(); tmPipDibujar();
  }
  /** Pausa / seguir (desde el botón, desde la burbuja o desde los controles del sistema). */
  function tmPausa(on) {
    var R = TM.run; if (!R || R.fin) return;
    if (on === undefined) on = !R.enPausa;
    if (on && !R.enPausa) R.enPausa = Date.now();
    else if (!on && R.enPausa) { R.pausa += Date.now() - R.enPausa; R.enPausa = null; tmWake(true); }
    else return;
    tmPintar(); tmGuardarRun(); tmPipDibujar(); tmPipSync();
  }
  function tmFinal(cronoSeg) {
    var R = TM.run; R.fin = true; clearInterval(R.int); tmWake(false); tmBorrarRun();
    tmPipDibujar('FIN'); setTimeout(tmPipCerrar, 5000);
    tmBeep(1040, 700); tmVibrar([300, 120, 300, 120, 300]);
    var el = document.getElementById('reloj'); if (!el) return;
    var total = (Date.now() - R.total0) / 1000 - 10;
    el.className = 'reloj fin';
    var segF = cronoSeg != null ? cronoSeg : Math.max(0, total);
    el.innerHTML = '<div class="rl-top"><span>' + esc(R.r.n + ' · ' + R.r.titulo) + '</span></div>' +
      '<div class="rl-caja">' + tmPanel(segF, null, 'rojo') + '</div>' +
      '<div class="rl-info"><div class="rl-tit rojo">' + (cronoSeg != null ? 'Tu tiempo' : '¡Terminado!') + '</div></div><div class="rl-btns">' +
      (R.r.metcon ? '<button class="btn btn-primary" type="button" data-rl="resultado"' + (cronoSeg != null ? ' data-t="' + Math.round(cronoSeg) + '"' : '') + '>Apuntar resultado</button>' : '') +
      '<button class="btn" type="button" data-rl="salir">Cerrar</button></div>';
  }
  // ---------- dígitos LED de 7 segmentos (marcador de box) ----------
  var LED_SEG = {
    a: '12,3 48,3 53,8 48,13 12,13 7,8', g: '12,45 48,45 53,50 48,55 12,55 7,50', d: '12,87 48,87 53,92 48,97 12,97 7,92',
    f: '8,12 13,17 13,41 8,46 3,41 3,17', e: '8,54 13,59 13,83 8,88 3,83 3,59',
    b: '52,12 57,17 57,41 52,46 47,41 47,17', c: '52,54 57,59 57,83 52,88 47,83 47,59' };
  var LED_DIG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };
  /** SVG con dígitos LED (encendidos + segmentos apagados de fondo, como un marcador real). */
  function tmLed(txt, cls) {
    var x = 0, h = '';
    String(txt).split('').forEach(function (ch) {
      if (ch === ':') { h += '<circle class="on" cx="' + (x + 12) + '" cy="32" r="5.5"/><circle class="on" cx="' + (x + 12) + '" cy="70" r="5.5"/>'; x += 24; return; }
      var on = LED_DIG[ch] || '';
      Object.keys(LED_SEG).forEach(function (k) { h += '<polygon class="' + (on.indexOf(k) >= 0 ? 'on' : 'off') + '" points="' + LED_SEG[k] + '" transform="translate(' + x + ' 0)"/>'; });
      x += 68;
    });
    return '<svg class="led ' + (cls || '') + '" viewBox="-6 -2 ' + (x + 6) + ' 104" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g transform="skewX(-6) translate(10 0)">' + h + '</g></svg>';
  }
  /** Reloj en formato marcador: MM:SS (o H:MM:SS). */
  function tmLedTxt(s) {
    s = Math.max(0, Math.round(s)); var hh = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = s % 60, p = function (n) { return (n < 10 ? '0' : '') + n; };
    return hh ? hh + ':' + p(m) + ':' + p(r) : p(Math.floor(s / 60)) + ':' + p(r);
  }
  /** Reloj MM:SS en una línea (vertical y horizontal). */
  function tmReloj(seg, color) {
    return tmLed(tmLedTxt(seg), color);
  }
  function tmRonda(p) {
    var m = /(?:Ronda|Serie) (\d+)\/(\d+)/.exec((p.sub || '') + ' ' + (p.tit || ''));
    return m ? { n: +m[1], de: +m[2] } : null;
  }
  function tmPanel(seg, p, color) {
    var rd = p ? tmRonda(p) : null;
    return '<div class="rl-led ' + color + '">' +
      (p ? '<div class="rl-rd">' + tmLed(rd ? (rd.n < 10 ? '0' : '') + rd.n : '  ', 'verde') + '<span>' + (rd ? 'de ' + rd.de : '&nbsp;') + '</span></div>' : '') +
      '<div class="rl-t" role="timer" aria-live="off" aria-label="' + tmFmt(seg) + '">' + tmReloj(seg, color) + '</div></div>';
  }
  function tmPintar(soloTiempo) {
    var R = TM.run, el = document.getElementById('reloj'); if (!R || !el) return;
    var p = R.pasos[R.i], t = tmTranscurrido(), sig = R.pasos[R.i + 1];
    var seg = p.k === 'up' || p.k === 'tap' ? Math.floor(t) : Math.max(0, Math.ceil(p.dur - t));
    var color = p.k === 'rest' && !p.prep ? 'verde' : 'rojo';
    var prog = p.dur ? Math.min(1, t / p.dur) : 0;
    if (soloTiempo && el.querySelector('.rl-t')) {
      if (R.ultPint !== seg) { R.ultPint = seg; el.querySelector('.rl-t').innerHTML = tmReloj(seg, color); }
      var b = el.querySelector('.rl-bar i'); if (b) b.style.width = (prog * 100) + '%';
      return;
    }
    R.ultPint = seg;
    el.className = 'reloj ' + (p.prep ? 'prep' : p.k) + (R.enPausa ? ' pausado' : '');
    el.innerHTML = '<div class="rl-top"><span class="rl-nom">' + esc(R.r.n + ' · ' + R.r.titulo) + '</span><span class="rl-der"><span>Tramo ' + R.i + '/' + (R.pasos.length - 1) + '</span>' +
      (tmPipSoportado() ? '<button class="rl-pip' + (PIP.abierta ? ' on' : '') + '" type="button" data-rl="burbuja" aria-label="' + (PIP.abierta ? 'Cerrar la burbuja flotante' : 'Abrir el timer en una burbuja flotante') + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="12" y="11.5" width="7.5" height="5.5" rx="1.2" fill="currentColor"/></svg>' +
        '<span>' + (PIP.abierta ? 'Cerrar' : 'Burbuja') + '</span></button>' : '') + '</span></div>' +
      '<div class="rl-caja">' + tmPanel(seg, p, color) + (p.dur ? '<div class="rl-bar ' + color + '"><i style="width:' + (prog * 100) + '%"></i></div>' : '') + '</div>' +
      '<div class="rl-info"><div class="rl-tit ' + color + '">' + esc(p.tit) + '</div>' +
      (p.sub && !/^(Ronda|Serie) \d+\/\d+$/.test(p.sub) ? '<div class="rl-sub">' + esc(p.sub) + '</div>' : '') +
      (p.est ? '<div class="rl-est">' + esc(p.est) + '</div>' : '') +
      (p.cap ? '<div class="rl-sub">Time cap a los ' + tmFmt(p.cap) + '</div>' : '') +
      '<div class="rl-sig">' + (sig ? 'Después: ' + esc(sig.tit) + (sig.dur ? ' · ' + tmFmt(sig.dur) : '') : 'Último tramo') + '</div></div>' +
      '<div class="rl-btns">' +
      (p.k === 'tap' ? '<button class="btn btn-primary rl-big" type="button" data-rl="hecho">Hecho ✓</button>' : '') +
      (p.k === 'up' ? '<button class="btn btn-primary rl-big" type="button" data-rl="termine">Terminé</button>' : '') +
      '<div class="rl-row"><button class="btn" type="button" data-rl="pausa">' + (R.enPausa ? 'Seguir' : 'Pausa') + '</button>' +
      '<button class="btn" type="button" data-rl="saltar">Saltar</button>' +
      '<button class="btn" type="button" data-rl="salir">Salir</button></div></div>';
  }
  function tmCerrar() {
    var R = TM.run; if (R) { clearInterval(R.int); tmWake(false); try { if (R.ac) R.ac.close(); } catch (e) {} }
    TM.run = null; tmBorrarRun(); tmPipCerrar(); var el = document.getElementById('reloj'); if (el) el.remove(); document.body.classList.remove('con-reloj');
    if (S.recargarAlCerrar) { S.recargarAlCerrar = false; setTimeout(recargarApp, 50); }
  }

  document.addEventListener('click', function (e) {
    var t = e.target, b;
    if ((b = t.closest('[data-tm]'))) { tmAbrirEditor(+b.dataset.tm); return; }
    if ((b = t.closest('[data-tm-quitar]'))) { var r1 = TM.reg[+($scrim.querySelector('[data-tm-go]') || {}).dataset.tmGo]; if (!r1) return; tmLeerEditor(r1); r1.edit.grupos.splice(+b.dataset.tmQuitar, 1); tmPintarEditor(r1, TM.reg.indexOf(r1)); return; }
    if ((b = t.closest('[data-tm-add]'))) {
      var r2 = TM.reg[+$scrim.querySelector('[data-tm-go]').dataset.tmGo]; tmLeerEditor(r2);
      var k = b.dataset.tmAdd;
      r2.edit.grupos.push(k === 'intervalo' ? { k: 'intervalo', cada: 60, rondas: 5, etiqueta: 'EVERY' } : k === 'cuenta' ? { k: 'cuenta', dur: 600, etiqueta: 'CUENTA ATRÁS' } : { k: 'descanso', dur: 60 });
      tmPintarEditor(r2, TM.reg.indexOf(r2)); return;
    }
    if ((b = t.closest('[data-tm-reset]'))) { var r3 = TM.reg[+b.dataset.tmReset]; r3.edit = tmCopia(r3.det); try { localStorage.removeItem(tmClave(r3)); } catch (x) {} r3.propio = null; tmPintarEditor(r3, +b.dataset.tmReset); return; }
    if ((b = t.closest('[data-tm-go]'))) { tmEmpezar(+b.dataset.tmGo); return; }
    if ((b = t.closest('[data-rl]'))) {
      var R = TM.run, a = b.dataset.rl; if (!R) return;
      if (a === 'salir') { tmCerrar(); return; }
      tmAudio();
      if (a === 'pausa') { tmPausa(); return; }
      if (a === 'burbuja') { tmPipAbrir(); return; }
      if (a === 'saltar' || a === 'hecho') { tmSiguiente(); return; }
      if (a === 'termine') { var seg = tmTranscurrido(); R.i = R.pasos.length; tmFinal(seg); return; }
      if (a === 'resultado') {
        var rr = R.r, tt = b.dataset.t ? textoTiempo({ h: Math.floor(+b.dataset.t / 3600), m: Math.floor(+b.dataset.t % 3600 / 60), s: +b.dataset.t % 60 }) : null;
        tmCerrar(); if (!S.data) { toast('Abre la app y apunta el resultado desde el bloque.'); return; }
        S._prefTiempo = tt; abrirResultado(rr.iso, rr.n, rr.version || ''); return;
      }
    }
  });

  // =====================================================================
  //  BURBUJA FLOTANTE · el marcador en una ventanita «imagen en imagen» encima de cualquier app.
  //  Se dibuja en un canvas que se emite como vídeo; el botón ▶/❚❚ de la ventanita pausa el timer.
  // =====================================================================
  function tmPipSoportado() {
    try {
      var v = HTMLVideoElement.prototype, c = HTMLCanvasElement.prototype;
      return !!c.captureStream && !!(('requestPictureInPicture' in v && document.pictureInPictureEnabled !== false) || 'webkitSetPresentationMode' in v);
    } catch (e) { return false; }
  }
  function tmPipIniciar() {
    if (!tmPipSoportado() || PIP.v) return;
    try {
      var c = document.createElement('canvas'); c.width = 640; c.height = 360;
      var v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
      v.setAttribute('autopictureinpicture', ''); try { v.autoPictureInPicture = true; } catch (e) {}
      v.className = 'tm-pip-v'; v.setAttribute('aria-hidden', 'true');
      PIP = { c: c, ctx: c.getContext('2d'), v: v, abierta: false, ignorar: false };
      tmPipDibujar();
      v.srcObject = c.captureStream(10);
      document.body.appendChild(v);
      v.play().catch(function () {});
      v.addEventListener('pause', function () { if (!PIP.ignorar && PIP.abierta) tmPausa(true); });
      v.addEventListener('play', function () { if (!PIP.ignorar && PIP.abierta) tmPausa(false); });
      v.addEventListener('enterpictureinpicture', function () { PIP.abierta = true; tmPintar(); });
      v.addEventListener('leavepictureinpicture', function () { PIP.abierta = false; if (TM.run) tmPintar(); });
      v.addEventListener('webkitpresentationmodechanged', function () { PIP.abierta = v.webkitPresentationMode === 'picture-in-picture'; if (TM.run) tmPintar(); });
      if (navigator.mediaSession) {
        try { navigator.mediaSession.metadata = new MediaMetadata({ title: 'Timer · ' + (TM.run.r.titulo || ''), artist: 'Fabrik Program' }); } catch (e) {}
        [['play', function () { tmPausa(false); }], ['pause', function () { tmPausa(true); }],
         ['enterpictureinpicture', function () { tmPipAbrir(); }]].forEach(function (h) { try { navigator.mediaSession.setActionHandler(h[0], h[1]); } catch (e) {} });
      }
    } catch (e) { PIP = {}; }
  }
  /** Abrir / cerrar la burbuja con el botón (necesita el toque del usuario). */
  function tmPipAbrir() {
    var v = PIP.v; if (!v) { tmPipIniciar(); v = PIP.v; } if (!v) { toast('Tu navegador no permite la burbuja.'); return; }
    try {
      if (PIP.abierta) {
        if (document.pictureInPictureElement && document.exitPictureInPicture) document.exitPictureInPicture().catch(function () {});
        else if (v.webkitSetPresentationMode) v.webkitSetPresentationMode('inline');
        return;
      }
      var abrir = function () {
        if (v.requestPictureInPicture) return v.requestPictureInPicture();
        v.webkitSetPresentationMode('picture-in-picture');
      };
      var pr = v.play(); tmPipSync();
      Promise.resolve(pr).catch(function () {}).then(abrir).catch(function () { toast('No se pudo abrir la burbuja.'); });
    } catch (e) { toast('No se pudo abrir la burbuja.'); }
  }
  /** Al pasar a segundo plano: intenta abrir la burbuja sola (Android/Chrome y iPhone lo permiten según versión). */
  function tmPipAuto() {
    var v = PIP.v; if (!v || PIP.abierta || !TM.run || TM.run.fin) return;
    try { if (v.requestPictureInPicture) v.requestPictureInPicture().catch(function () {}); } catch (e) {}
  }
  /** El vídeo de la burbuja sigue al timer: en pausa muestra ▶, corriendo muestra ❚❚. */
  function tmPipSync() {
    var v = PIP.v, R = TM.run; if (!v || !R) return;
    PIP.ignorar = true;
    if (R.enPausa) setTimeout(function () { try { v.pause(); } catch (e) {} setTimeout(function () { PIP.ignorar = false; }, 50); }, 150);
    else Promise.resolve(v.play()).catch(function () {}).then(function () { setTimeout(function () { PIP.ignorar = false; }, 50); });
  }
  function tmPipCerrar() {
    var v = PIP.v; if (!v) return;
    try { if (document.pictureInPictureElement === v) document.exitPictureInPicture().catch(function () {}); else if (v.webkitPresentationMode === 'picture-in-picture') v.webkitSetPresentationMode('inline'); } catch (e) {}
    try { v.pause(); v.srcObject = null; v.remove(); } catch (e) {}
    PIP = {};
  }
  /** Dígitos LED en el canvas (los mismos segmentos que el marcador grande). */
  function tmPipLed(ctx, txt, cx, y, h, color) {
    var sc = h / 104, w = 0;
    String(txt).split('').forEach(function (ch) { w += ch === ':' ? 24 : 68; });
    ctx.save(); ctx.translate(cx - (w * sc) / 2, y); ctx.transform(1, 0, -0.105, 1, 0, 0); ctx.scale(sc, sc);
    var x = 0;
    String(txt).split('').forEach(function (ch) {
      if (ch === ':') {
        ctx.fillStyle = color; ctx.shadowBlur = 0;
        [32, 70].forEach(function (cy) { ctx.beginPath(); ctx.arc(x + 12, cy, 5.5, 0, 7); ctx.fill(); });
        x += 24; return;
      }
      var on = LED_DIG[ch] || '';
      Object.keys(LED_SEG).forEach(function (k) {
        var pts = LED_SEG[k].split(' ').map(function (p) { return p.split(',').map(Number); });
        ctx.beginPath(); pts.forEach(function (p, j) { if (j) ctx.lineTo(x + p[0], p[1]); else ctx.moveTo(x + p[0], p[1]); }); ctx.closePath();
        var lit = on.indexOf(k) >= 0;
        ctx.fillStyle = lit ? color : 'rgba(255,255,255,.06)'; ctx.shadowBlur = 0; ctx.fill();
      });
      x += 68;
    });
    ctx.restore();
  }
  function tmPipDibujar(fin) {
    var ctx = PIP.ctx, R = TM.run; if (!ctx || !R) return;
    var W = 640, H = 360, p = R.pasos[Math.min(R.i, R.pasos.length - 1)];
    var t = tmTranscurrido(), seg = fin ? 0 : (p.k === 'up' || p.k === 'tap' ? Math.floor(t) : Math.max(0, Math.ceil(p.dur - t)));
    var color = !fin && p.k === 'rest' && !p.prep ? '#20f05a' : '#ff2b1c', rd = tmRonda(p);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.shadowBlur = 0; ctx.font = '700 30px system-ui, sans-serif'; ctx.textBaseline = 'top';
    ctx.fillStyle = color; ctx.textAlign = 'left';
    ctx.fillText(String(fin ? 'TERMINADO' : R.enPausa ? 'EN PAUSA' : p.tit).toUpperCase().slice(0, 26), 24, 22);
    if (rd && !fin) { ctx.fillStyle = '#20f05a'; ctx.textAlign = 'right'; ctx.fillText('R ' + rd.n + '/' + rd.de, W - 24, 22); }
    tmPipLed(ctx, tmLedTxt(seg), W / 2, 92, 190, color);
    if (p.dur && !fin) {
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(24, 318, W - 48, 10);
      ctx.fillStyle = color; ctx.fillRect(24, 318, (W - 48) * Math.min(1, t / p.dur), 10);
    }
    if (R.enPausa && !fin) { ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 70, W, 240); }
  }

  // ---------- Pedir acceso ----------
  function pantallaSolicitud(email, estado) {
    var cuerpo;
    if (estado === 'Pendiente') cuerpo = '<p>Tu registro está <b>pendiente</b>. Gabi lo revisará pronto; cuando lo apruebe, vuelve a abrir la app.</p>';
    else if (estado === 'Rechazada') cuerpo = '<p>Tu registro no ha sido aprobado. Si crees que es un error, habla con Gabi.</p>';
    else cuerpo = '<p>Este correo todavía no tiene acceso. Regístrate: Gabi verá tu nombre y tu correo y lo aprobará.</p>' +
      '<form id="solf" class="field"><label for="sol-n">Nombre completo</label><input id="sol-n" required minlength="3" maxlength="80" autocomplete="name" placeholder="Ej. Ana García López">' +
      '<button class="btn btn-primary" type="submit" id="sol-ok">Enviar registro</button></form>';
    $app.innerHTML = '<section class="login"><div class="brand">Fabrik Program</div><div class="hint">Has entrado como <b>' + esc(email) + '</b></div>' + cuerpo +
      '<button class="btn" id="salir" type="button">Entrar con otra cuenta</button>' + redesHtml() + '</section>';
    document.getElementById('salir').onclick = function () { auth.signOut(); };
    var f = document.getElementById('solf');
    if (f) f.onsubmit = function (ev) {
      ev.preventDefault();
      var b = document.getElementById('sol-ok'); b.disabled = true; b.textContent = 'Enviando…';
      api({ action: 'solicitar', nombre: val('sol-n') }).then(function (r) {
        if (r.solicitud === 'Pendiente') pantallaSolicitud(email, 'Pendiente');
        else throw new Error(r.detalle || r.error);
      }).catch(function (e) { b.disabled = false; b.textContent = 'Enviar registro'; toast(mensajeError(e.message)); });
    };
  }


  // ---------- hojas ----------
  function abrirHoja(html) {
    $scrim.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + '</div>';
    $scrim.hidden = false;
    var f = $scrim.querySelector('input,button,select'); if (f) f.focus();
  }
  function cerrarHoja() { $scrim.hidden = true; $scrim.innerHTML = ''; if (S.recargarAlCerrar) { S.recargarAlCerrar = false; setTimeout(recargarApp, 50); } }
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
    if (clickGuardados(t)) return;
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
    if ((b = t.closest('[data-av-cerrar]'))) { cerrarHoja(); if (!S.vista && S.data) setTimeout(function () { abrirAvisosPendientes(S.data); }, 150); return; }
    if ((b = t.closest('[data-av-visto]'))) { marcarVisto(b.dataset.avVisto); if (S.vista === 'ajustes') { S._abrir = 's-avisos'; render(); } return; }
    if ((b = t.closest('[data-ir-evento]'))) { abrirAjustes('s-eventos'); setTimeout(function () { var el = document.getElementById('ev-' + b.dataset.irEvento); if (el) { el.open = true; el.scrollIntoView({ block: 'center' }); } }, 30); return; }
    if ((b = t.closest('[data-unirme]'))) {
      var idU = b.dataset.unirme === 'sel' ? val('ev-unirme') : b.dataset.unirme;
      if (!idU) { toast('Elige un evento.'); return; }
      var evU = ((S.data && S.data.eventos) || []).filter(function (e) { return e.id === idU; })[0] || {};
      if (!confirmar(b, evU.inscripcion === 'Libre' ? '¿Apuntarme? Toca otra vez' : '¿Pedir plaza? Toca otra vez')) return;
      b.disabled = true;
      api({ action: 'evento_solicitar', id: idU }).then(ok).then(function (r) {
        S.data.eventos = r.eventos; S.data.misSolicitudes = r.misSolicitudes; S._abrir = 's-eventos'; render();
        toast(r.estado === 'apuntado' ? 'Apuntado a ' + (evU.nombre || 'el evento') : 'Solicitud enviada al coach');
      }).catch(falloApi(b));
      return;
    }
    if ((b = t.closest('[data-salir]'))) {
      if (!confirmar(b, '¿Desapuntarme? Toca otra vez')) return;
      b.disabled = true;
      api({ action: 'evento_salir', id: b.dataset.salir }).then(ok).then(function (r) {
        S.data.eventos = r.eventos; S.data.misSolicitudes = r.misSolicitudes; S._abrir = 's-eventos'; render(); toast('Ya no estás apuntado');
      }).catch(falloApi(b));
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

    if ((b = t.closest('[data-ev-edit]'))) { abrirFormEvento(eventoPorId(b.dataset.evEdit)); return; }
    if ((b = t.closest('[data-ev-part]'))) { abrirParticipantes(b.dataset.evPart); return; }
    if ((b = t.closest('[data-ev-nota]'))) { var ev0 = eventoPorId(b.dataset.evNota); abrirPublicar({ tab: 'nota', para: { modo: 'evento', evento: ev0.nombre }, volver: abrirEventosCoach }); return; }
    if ((b = t.closest('[data-ev-aviso]'))) { var ev1 = eventoPorId(b.dataset.evAviso); abrirPublicar({ tab: 'aviso', para: { modo: 'evento', evento: ev1.nombre }, volver: abrirEventosCoach }); return; }
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
      var gsel = document.querySelector('[data-grupo-de="' + b.dataset.i + '"]'), asel = document.querySelector('[data-acceso-de="' + b.dataset.i + '"]'),
        esel = document.querySelector('[data-evento-de="' + b.dataset.i + '"]');
      if (aprobar && asel && asel.value && !(esel && esel.value)) { b.disabled = false; toast('Con «Solo eventos», elige el evento.'); return; }
      api({ action: 'solicitud_resolver', email: s.email, tipo: s.tipo, detalle: s.detalle, aprobar: aprobar, grupo: gsel ? gsel.value : 'Box',
        acceso: asel ? asel.value : '', eventos: esel && esel.value ? [esel.value] : [] }).then(ok).then(function (r) {
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
  // ---------- siempre la última versión ----------
  // Tras 5 minutos sin usarla, el primer toque (o volver a la pestaña) busca versión nueva de la app
  // y recarga los datos. Si hay versión nueva, la página se recarga sola una vez (con el service worker
  // «primero red», una recarga basta para ver la última versión).
  var WEB_VERSION = 'v4 · web 18';
  var ultimaActividad = Date.now(), habiaControlador = !!(navigator.serviceWorker && navigator.serviceWorker.controller), recargando = false;
  function recargarApp() {
    if (recargando) return;
    if (!$scrim.hidden || (TM.run && !TM.run.fin)) { S.recargarAlCerrar = true; return; }   // no cortar a alguien que está escribiendo o con el timer en marcha
    recargando = true; location.reload();
  }
  function alVolver() {
    var parado = Date.now() - ultimaActividad > 5 * 60 * 1000;
    ultimaActividad = Date.now();
    if (!parado) return;
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistration)
      navigator.serviceWorker.getRegistration().then(function (r) { if (r) r.update().catch(function () {}); });
    if (S.user && !S.cargando) cargar(S.data && S.data.semana);
  }
  ['pointerdown', 'keydown'].forEach(function (t) { document.addEventListener(t, alVolver, { passive: true, capture: true }); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') alVolver(); });
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('controllerchange', function () { if (habiaControlador) recargarApp(); habiaControlador = true; });

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