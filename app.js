/* ============================================================
   Acceso Senior con IA — App móvil (versión Firebase)
   Flujo conversacional "FaciliBot" del manual + panel de gestión.
   Los datos (usuarios y casos) viven en Firebase Firestore, así
   se COMPARTEN entre todos: lo que carga un consultante lo ve el
   facilitador desde cualquier dispositivo.
   ============================================================ */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, setDoc, getDocs,
  addDoc, updateDoc, query, where, serverTimestamp, runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

/* ---------- Usuarios de prueba (se cargan solos la 1ª vez) ---------- */
const SEED_USERS = [
  { dni: '12345678', nombre: 'Pepe',                email: 'pepe@gmail.com',            pass: '1234', telefono: '1140000001', rol: 'consultante' },
  { dni: '98765432', nombre: 'Juan',                email: 'juan@gmail.com',            pass: '1234', telefono: '1140000002', rol: 'admin' },
  { dni: '87654321', nombre: 'Juan Facilitador',    email: 'juan_facilitador@gmail.com', pass: '1234', telefono: '1140000003', rol: 'facilitador' },
  { dni: '11111111', nombre: 'María',               email: 'maria@gmail.com',           pass: '1234', telefono: '1140000004', rol: 'consultante' },
  { dni: '22222222', nombre: 'Carlos',              email: 'carlos@gmail.com',          pass: '1234', telefono: '1140000005', rol: 'consultante' },
  { dni: '33333333', nombre: 'Pedro Facilitador',   email: 'pedro_fac@gmail.com',       pass: '1234', telefono: '1140000006', rol: 'facilitador' },
  { dni: '44444444', nombre: 'Rosa Facilitadora',   email: 'rosa_fac@gmail.com',        pass: '1234', telefono: '1140000007', rol: 'facilitador' }
];

const PROBLEM_TYPES = [
  { name: 'Trámites digitales', kw: ['tramite', 'trámite', 'turno', 'anses', 'jubilacion', 'jubilación', 'pension', 'mi argentina', 'gobierno', 'formulario'] },
  { name: 'Salud', kw: ['salud', 'medico', 'médico', 'obra social', 'receta', 'pami', 'hospital', 'turno medico'] },
  { name: 'Banca digital', kw: ['banco', 'banca', 'cajero', 'tarjeta', 'home banking', 'transferencia', 'cuenta', 'plazo fijo', 'cbu'] },
  { name: 'Conectividad', kw: ['internet', 'wifi', 'señal', 'datos', 'conexion', 'conexión', 'router', 'no anda'] },
  { name: 'Dispositivos', kw: ['celular', 'telefono', 'teléfono', 'computadora', 'pantalla', 'aplicacion', 'aplicación', 'app', 'whatsapp', 'mail', 'correo', 'clave', 'contraseña'] },
  { name: 'Otro', kw: [] }
];

/* ============================================================
   Inicialización de Firebase
   ============================================================ */
const $ = (sel) => document.querySelector(sel);
const configured = firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('PEGA');

// Modo diagnóstico: abrir la app con ?debug=1 para ver mensajes técnicos en el chat.
const DEBUG = new URLSearchParams(location.search).has('debug');
function dbg(msg) { if (DEBUG) addMsg('🐞 ' + msg, 'system'); }

let db = null, auth = null;

// Promesa que resuelve true cuando Firebase está listo (auth + seed)
const ready = (async () => {
  if (!configured) { showOverlay(overlayConfig()); return false; }
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    await signInAnonymously(auth);
    await seedIfEmpty();
    return true;
  } catch (e) {
    console.error('Firebase init error:', e);
    showOverlay(overlayError(e));
    return false;
  }
})();

async function ensureReady() {
  const ok = await ready;
  if (!ok) throw new Error('firebase-not-ready');
}

/* ---------- Acceso a datos (Firestore) ---------- */
async function seedIfEmpty() {
  const snap = await getDocs(collection(db, 'users'));
  if (!snap.empty) return;
  await Promise.all(SEED_USERS.map((u) => setDoc(doc(db, 'users', u.dni), u)));
}

async function getUserByDni(dni) {
  await ensureReady();
  const snap = await getDoc(doc(db, 'users', dni));
  return snap.exists() ? snap.data() : null;
}

async function nextCaseNumber() {
  const ref = doc(db, 'counters', 'cases');
  return runTransaction(db, async (tx) => {
    const s = await tx.get(ref);
    const current = s.exists() ? (s.data().value || 1000) : 1000;
    const next = current + 1;
    tx.set(ref, { value: next });
    return next;
  });
}

async function createCase(data) {
  await ensureReady();
  const numero = await nextCaseNumber();
  await addDoc(collection(db, 'cases'), {
    ...data, numero, estado: 'pendiente', fecha: serverTimestamp()
  });
  return numero;
}

async function registerUserIfNeeded(u) {
  await ensureReady();
  const existing = await getDoc(doc(db, 'users', u.dni));
  if (!existing.exists()) {
    await setDoc(doc(db, 'users', u.dni), { ...u, pass: '1234', rol: 'consultante' });
  }
}

async function getCasesByDni(dni) {
  await ensureReady();
  const snap = await getDocs(query(collection(db, 'cases'), where('dni', '==', dni)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.numero || 0) - (a.numero || 0));
}

async function getAllCases() {
  await ensureReady();
  const snap = await getDocs(collection(db, 'cases'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.numero || 0) - (a.numero || 0));
}

async function setCaseStatus(id, estado) {
  await ensureReady();
  await updateDoc(doc(db, 'cases', id), { estado });
}

async function loginUser(email, pass) {
  await ensureReady();
  const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
  return snap.docs.map((d) => d.data()).find((u) => u.pass === pass) || null;
}

/* ============================================================
   Utilidades
   ============================================================ */
function cleanDni(text) {
  const digits = (text || '').replace(/[.\-\s]/g, '').match(/\d{6,9}/);
  return digits ? digits[0] : null;
}
function isValidDni(dni) { return /^\d{7,8}$/.test(dni || ''); }

function inferCategory(desc) {
  const t = (desc || '').toLowerCase();
  for (const type of PROBLEM_TYPES) {
    if (type.kw.some((k) => t.includes(k))) return type.name;
  }
  return 'Otro';
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function toDate(f) {
  if (!f) return new Date();
  if (typeof f.toDate === 'function') return f.toDate();
  return new Date(f);
}

/* ============================================================
   Estado de la conversación
   ============================================================ */
let S = freshSession();
function freshSession() {
  return {
    step: 'ask_dni',
    userData: { dni: null, nombre: null, telefono: null, email: null },
    problemData: { descripcion: null, categoria: null },
    dbUser: null,
    userLookupDone: false
  };
}

/* ---------- UI de mensajes ---------- */
const messagesEl = $('#messages');
function scrollDown() { messagesEl.scrollTop = messagesEl.scrollHeight; }

function addMsg(text, who = 'bot') {
  const div = document.createElement('div');
  div.className = `msg ${who}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollDown();
  return div;
}
function addTicket(html) {
  const div = document.createElement('div');
  div.className = 'ticket';
  div.innerHTML = html;
  messagesEl.appendChild(div);
  scrollDown();
}
function addQuickReplies(options) {
  const wrap = document.createElement('div');
  wrap.className = 'quick';
  options.forEach((opt) => {
    const b = document.createElement('button');
    b.textContent = opt.label;
    b.onclick = () => { wrap.remove(); handleUser(opt.value || opt.label); };
    wrap.appendChild(b);
  });
  messagesEl.appendChild(wrap);
  scrollDown();
}
function showTyping() {
  if ($('#typing')) return;
  const t = document.createElement('div');
  t.className = 'typing'; t.id = 'typing';
  t.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(t);
  scrollDown();
}
function hideTyping() { const t = $('#typing'); if (t) t.remove(); }

function botSay(text, after) {
  showTyping();
  setTimeout(() => {
    hideTyping();
    if (text) addMsg(text, 'bot');
    if (after) after();
  }, 420);
}

/* ============================================================
   Lógica conversacional — FaciliBot
   ============================================================ */
function startConversation() {
  messagesEl.innerHTML = '';
  S = freshSession();
  botSay('Hola, soy su asistente de Acceso Senior. Estoy para ayudarle paso a paso. 😊', () => {
    botSay('Para empezar, ¿podría decirme su número de DNI?');
  });
}

function handleUser(rawText) {
  const text = (rawText || '').trim();
  if (!text) return;
  addMsg(text, 'user');

  if (/\b(estado|seguimiento|c[oó]mo va|como va|mi caso|el caso)\b/i.test(text) && S.step !== 'status_dni') {
    return routeStatus(text);
  }

  switch (S.step) {
    case 'ask_dni':     return stepAskDni(text);
    case 'status_dni':  return stepStatusDni(text);
    case 'ask_problem': return stepAskProblem(text);
    case 'reg_name':    return stepRegName(text);
    case 'reg_phone':   return stepRegPhone(text);
    case 'confirm':     return stepConfirm(text);
    case 'done':        return stepDone(text);
    default:            return stepAskDni(text);
  }
}

function routeStatus(text) {
  if (S.userData.dni) return doStatusLookup(S.userData.dni);
  S.step = 'status_dni';
  botSay('Con gusto le digo el estado de su caso. ¿Me indica su número de DNI?');
}

async function stepAskDni(text) {
  const dni = cleanDni(text);
  if (!dni) return botSay('Disculpe, no pude identificar su número de DNI. ¿Podría indicármelo nuevamente?');
  if (!isValidDni(dni)) return botSay('El DNI que ingresó no parece válido. Debe tener entre 7 y 8 dígitos. ¿Podría verificarlo?');

  S.userData.dni = dni;
  S.userLookupDone = true;
  showTyping();
  let user;
  try { user = await getUserByDni(dni); }
  catch (e) {
    hideTyping();
    dbg('ERROR al buscar "' + dni + '": ' + ((e && (e.code || e.message)) || e));
    return botSay('Disculpe, tuve un problema al verificar su DNI. ¿Podría intentar nuevamente en unos segundos?');
  }
  hideTyping();
  dbg('busqué dni="' + dni + '" → encontrado=' + (!!user) + ' | auth=' + (auth && auth.currentUser ? auth.currentUser.uid.slice(0, 8) : 'SIN-SESION'));

  if (user) {
    S.dbUser = user;
    S.userData.nombre = user.nombre;
    S.userData.telefono = user.telefono;
    S.userData.email = user.email;
    S.step = 'ask_problem';
    return botSay(`¡Bienvenido/a de nuevo, ${user.nombre}! ¿En qué puedo ayudarle hoy? Cuénteme su problema o consulta.`);
  }
  S.step = 'reg_name';
  return botSay('No encontré una cuenta con ese DNI en nuestro sistema. No se preocupe, vamos a registrarlo. ¿Podría decirme su nombre completo (nombre y apellido)?');
}

function stepRegName(text) {
  if (text.replace(/[^a-záéíóúñ\s]/gi, '').trim().length < 3) {
    return botSay('¿Me dice su nombre y apellido, por favor? Por ejemplo: "Ana Gómez".');
  }
  S.userData.nombre = text.trim();
  S.step = 'reg_phone';
  return botSay(`Gracias, ${S.userData.nombre.split(' ')[0]}. ¿Me deja un número de teléfono para que el facilitador pueda contactarlo?`);
}

function stepRegPhone(text) {
  const phone = text.replace(/[.\-\s()]/g, '');
  if (!/^\d{6,15}$/.test(phone)) {
    return botSay('El teléfono debe contener solo números (puede incluir el código de área). ¿Me lo indica de nuevo?');
  }
  S.userData.telefono = phone;
  S.step = 'ask_problem';
  return botSay('¡Perfecto! Ya tengo sus datos. Ahora cuénteme: ¿cuál es el problema o consulta con la que necesita ayuda?');
}

function stepAskProblem(text) {
  if (text.length < 10) {
    return botSay('¿Podría contarme un poquito más sobre lo que necesita? Así el facilitador podrá ayudarlo mejor.');
  }
  S.problemData.descripcion = text.trim();
  S.problemData.categoria = inferCategory(text);
  S.step = 'confirm';
  const resumen =
    `Le confirmo los datos:\n\n` +
    `• Nombre: ${S.userData.nombre}\n` +
    `• DNI: ${S.userData.dni}\n` +
    (S.userData.telefono ? `• Teléfono: ${S.userData.telefono}\n` : '') +
    `• Consulta: ${S.problemData.descripcion}\n\n` +
    `¿Está todo correcto y registro su consulta?`;
  botSay(resumen, () => {
    addQuickReplies([{ label: 'Sí, registrar', value: 'si' }, { label: 'Corregir', value: 'no' }]);
  });
}

function stepConfirm(text) {
  if (/^(s[ií]|si|correcto|dale|ok|confirmo|registr)/i.test(text)) return createTicket();
  if (/^(no|corregir|cambiar|mal)/i.test(text)) {
    S.step = 'ask_problem';
    S.problemData = { descripcion: null, categoria: null };
    return botSay('Sin problema. Cuénteme nuevamente su consulta y la corrijo.');
  }
  botSay('¿Confirmamos la consulta? Puede responder "Sí" o "Corregir".', () => {
    addQuickReplies([{ label: 'Sí, registrar', value: 'si' }, { label: 'Corregir', value: 'no' }]);
  });
}

async function createTicket() {
  showTyping();
  try {
    if (!S.dbUser && S.userData.dni) {
      await registerUserIfNeeded({
        dni: S.userData.dni, nombre: S.userData.nombre,
        telefono: S.userData.telefono || '', email: S.userData.email || ''
      });
    }
    const caseId = await createCase({
      dni: S.userData.dni,
      nombre: S.userData.nombre,
      telefono: S.userData.telefono || '',
      descripcion: S.problemData.descripcion,
      categoria: S.problemData.categoria
    });
    hideTyping();
    const nombre = (S.userData.nombre || '').split(' ')[0];
    addTicket(
      `<b>✅ ¡Listo, ${escapeHtml(nombre)}!</b><br>` +
      `Su consulta fue registrada con éxito.<br><br>` +
      `<b>Caso N° ${caseId}</b><br>` +
      `Estado: <span class="st-pendiente">Pendiente</span><br><br>` +
      `En breve un facilitador se pondrá en contacto con usted. ¡Que tenga un excelente día! 🌟`
    );
    S.step = 'done';
    setTimeout(() => {
      addMsg('¿Necesita algo más? Puede cargar otra consulta o preguntar por el estado de un caso.', 'bot');
      addQuickReplies([{ label: 'Otra consulta', value: 'otra' }, { label: 'Ver estado de un caso', value: 'estado' }]);
    }, 700);
  } catch (e) {
    hideTyping();
    botSay('Disculpe, hubo un error al registrar su consulta. ¿Podría intentar nuevamente?');
  }
}

function stepDone(text) {
  if (/otra|nueva|consulta|problema/i.test(text)) {
    S.problemData = { descripcion: null, categoria: null };
    S.step = 'ask_problem';
    return botSay('¡Claro! Cuénteme su nueva consulta.');
  }
  if (/estado|caso|seguimiento/i.test(text)) return routeStatus(text);
  botSay('Estoy para ayudarle. ¿Desea cargar otra consulta o conocer el estado de un caso?', () => {
    addQuickReplies([{ label: 'Otra consulta', value: 'otra' }, { label: 'Ver estado de un caso', value: 'estado' }]);
  });
}

function stepStatusDni(text) {
  const dni = cleanDni(text);
  if (!isValidDni(dni)) return botSay('El DNI debe tener entre 7 y 8 dígitos. ¿Podría verificarlo?');
  S.userData.dni = dni;
  doStatusLookup(dni);
}

async function doStatusLookup(dni) {
  showTyping();
  let casos;
  try { casos = await getCasesByDni(dni); }
  catch (e) { hideTyping(); return botSay('Disculpe, no pude consultar el estado en este momento. ¿Podría intentar nuevamente?'); }
  hideTyping();
  S.step = 'done';
  if (!casos.length) {
    return botSay('No encontré casos registrados con ese DNI. ¿Desea cargar una nueva consulta?', () => {
      addQuickReplies([{ label: 'Cargar consulta', value: 'otra' }]);
    });
  }
  const lineas = casos.slice(0, 5).map((c) => `• Caso N° ${c.numero} — ${estadoLabel(c.estado)}\n   "${c.descripcion}"`).join('\n\n');
  botSay(`Esto es lo que encontré:\n\n${lineas}`, () => {
    addQuickReplies([{ label: 'Cargar otra consulta', value: 'otra' }]);
  });
}

function estadoLabel(e) {
  return { pendiente: 'Pendiente ⏳', 'en proceso': 'En proceso 🔧', resuelto: 'Resuelto ✅' }[e] || e;
}

/* ============================================================
   Eventos vista chat
   ============================================================ */
$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#input');
  const v = input.value;
  input.value = '';
  handleUser(v);
});
$('#btn-restart').addEventListener('click', startConversation);

/* ---------- Dictado por voz ---------- */
(function setupVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = $('#btn-mic');
  if (!SR) { micBtn.style.display = 'none'; return; }
  const rec = new SR();
  rec.lang = 'es-AR';
  rec.interimResults = false;
  let listening = false;
  micBtn.addEventListener('click', () => {
    if (listening) { rec.stop(); return; }
    try { rec.start(); } catch (e) { /* ya iniciado */ }
  });
  rec.onstart = () => { listening = true; micBtn.classList.add('listening'); };
  rec.onend = () => { listening = false; micBtn.classList.remove('listening'); };
  rec.onresult = (ev) => {
    $('#input').value = ev.results[0][0].transcript;
    $('#composer').dispatchEvent(new Event('submit'));
  };
})();

/* ============================================================
   Panel (Facilitador / Admin)
   ============================================================ */
let session = null;

function showView(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  $('#' + id).classList.add('active');
}
$('#btn-panel').addEventListener('click', () => showView('view-panel'));
$('#btn-back').addEventListener('click', () => showView('view-chat'));

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#login-email').value.trim().toLowerCase();
  const pass = $('#login-pass').value;
  const errEl = $('#login-error');
  errEl.hidden = true;
  let user = null;
  try { user = await loginUser(email, pass); }
  catch (err) { errEl.textContent = 'No se pudo conectar. Revisá la configuración de Firebase.'; errEl.hidden = false; return; }
  if (!user || (user.rol !== 'admin' && user.rol !== 'facilitador')) {
    errEl.textContent = 'Credenciales incorrectas.';
    errEl.hidden = false;
    return;
  }
  session = user;
  await renderPanel();
});

$('#btn-logout').addEventListener('click', () => {
  session = null;
  $('#login-box').hidden = false;
  $('#cases-box').hidden = true;
  $('#login-form').reset();
});

async function renderPanel() {
  $('#login-box').hidden = true;
  $('#cases-box').hidden = false;
  $('#role-badge').textContent = session.rol === 'admin' ? `Admin · ${session.nombre}` : `Facilitador · ${session.nombre}`;
  $('#panel-subtitle').textContent = session.rol === 'admin' ? 'Administración general' : 'Casos asignados';

  const list = $('#cases-list');
  list.innerHTML = '<p class="empty">Cargando casos…</p>';
  let cases = [];
  try { cases = await getAllCases(); }
  catch (e) { list.innerHTML = '<p class="empty">No se pudieron cargar los casos.</p>'; return; }

  const stats = {
    total: cases.length,
    pend: cases.filter((c) => c.estado === 'pendiente').length,
    proc: cases.filter((c) => c.estado === 'en proceso').length,
    res: cases.filter((c) => c.estado === 'resuelto').length
  };
  $('#stats').innerHTML =
    statCard(stats.total, 'Total') + statCard(stats.pend, 'Pendientes') +
    statCard(stats.proc, 'En proceso') + statCard(stats.res, 'Resueltos');

  if (!cases.length) {
    list.innerHTML = '<p class="empty">Todavía no hay casos cargados.<br>Los casos creados desde el asistente aparecerán aquí.</p>';
    return;
  }
  list.innerHTML = '';
  cases.forEach((c) => list.appendChild(caseCard(c)));
}

function statCard(n, label) { return `<div class="stat"><b>${n}</b><span>${label}</span></div>`; }

function caseCard(c) {
  const div = document.createElement('div');
  div.className = 'case-card';
  const fecha = toDate(c.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  div.innerHTML =
    `<div class="case-head">
       <span class="case-id">Caso N° ${c.numero ?? '—'}</span>
       <span class="case-cat">${escapeHtml(c.categoria || 'Otro')}</span>
     </div>
     <div class="case-meta">${escapeHtml(c.nombre || '')} · DNI ${escapeHtml(c.dni || '')}${c.telefono ? ' · Tel ' + escapeHtml(c.telefono) : ''}</div>
     <div class="case-desc">${escapeHtml(c.descripcion || '')}</div>
     <div class="case-meta">📅 ${fecha}</div>`;

  const sel = document.createElement('select');
  sel.className = 'status-select';
  ['pendiente', 'en proceso', 'resuelto'].forEach((est) => {
    const o = document.createElement('option');
    o.value = est;
    o.textContent = 'Estado: ' + est.charAt(0).toUpperCase() + est.slice(1);
    if (est === c.estado) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', async () => {
    sel.disabled = true;
    try { await setCaseStatus(c.id, sel.value); await renderPanel(); }
    catch (e) { sel.disabled = false; alert('No se pudo actualizar el estado.'); }
  });
  div.appendChild(sel);
  return div;
}

/* ============================================================
   Overlay de configuración / errores
   ============================================================ */
function showOverlay(html) {
  let ov = $('#overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'overlay';
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<div class="overlay-box">${html}</div>`;
}
function overlayConfig() {
  return `<h2>⚙️ Falta configurar Firebase</h2>
    <p>Abrí el archivo <b>firebase-config.js</b> y pegá los datos de tu proyecto
    de Firebase (las instrucciones están dentro del archivo).</p>
    <p>Una vez pegados, recargá esta página.</p>`;
}
function overlayError(e) {
  const msg = (e && e.code === 'auth/configuration-not-found')
    ? 'Parece que falta activar el inicio de sesión <b>Anónimo</b> en Firebase (Authentication → Sign-in method → Anónimo).'
    : 'No se pudo conectar con Firebase. Revisá los datos de <b>firebase-config.js</b> y las reglas de Firestore.';
  return `<h2>⚠️ Error de conexión</h2><p>${msg}</p>
    <p style="font-size:.8rem;color:#888">${escapeHtml((e && (e.code || e.message)) || '')}</p>`;
}

/* ============================================================
   Arranque
   ============================================================ */
startConversation();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
