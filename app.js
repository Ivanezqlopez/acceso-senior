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
  addDoc, updateDoc, query, where, serverTimestamp, runTransaction, arrayUnion
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
    ...data, numero, estado: 'pendiente', asignadoDni: null, asignadoNombre: null, fecha: serverTimestamp()
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

// Asignar (o liberar) un caso a un facilitador
async function assignCase(id, dni, nombre) {
  await ensureReady();
  await updateDoc(doc(db, 'cases', id), {
    asignadoDni: dni || null,
    asignadoNombre: nombre || null
  });
}

// Agregar una nota de seguimiento al caso
async function addCaseNote(id, nota) {
  await ensureReady();
  await updateDoc(doc(db, 'cases', id), { notas: arrayUnion(nota) });
}

// Adjuntar un enlace (link) al caso
async function addCaseLink(id, enlace) {
  await ensureReady();
  await updateDoc(doc(db, 'cases', id), { enlaces: arrayUnion(enlace) });
}

async function loginUser(email, pass) {
  await ensureReady();
  const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
  return snap.docs.map((d) => d.data()).find((u) => u.pass === pass) || null;
}

async function getAllUsers() {
  await ensureReady();
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map((d) => d.data()).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
}

// Crear usuario (uso del admin). Devuelve {ok} o {error}
async function createUser(u) {
  await ensureReady();
  const existing = await getDoc(doc(db, 'users', u.dni));
  if (existing.exists()) return { error: 'Ya existe un usuario con ese DNI.' };
  const dup = await getDocs(query(collection(db, 'users'), where('email', '==', u.email)));
  if (!dup.empty) return { error: 'Ya existe un usuario con ese correo.' };
  await setDoc(doc(db, 'users', u.dni), u);
  return { ok: true };
}

async function updateUserRole(dni, rol) {
  await ensureReady();
  await updateDoc(doc(db, 'users', dni), { rol });
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

// Signature visual: recorrido del caso en 3 pasos (Recibido → En proceso → Resuelto)
function statusTrack(estado) {
  const steps = ['Recibido', 'En proceso', 'Resuelto'];
  const idx = estado === 'resuelto' ? 2 : (estado === 'en proceso' ? 1 : 0);
  const inner = steps.map((label, i) => {
    const cls = 'track-step' + (i <= idx ? ' reached' : '') + (i === idx ? ' current' : '');
    return `<div class="${cls}"><span class="track-dot"></span><span class="track-label">${label}</span></div>`;
  }).join('');
  return `<div class="track${idx === 2 ? ' complete' : ''}">${inner}</div>`;
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
      `<span class="ticket-ok">✅ ¡Listo, ${escapeHtml(nombre)}!</span><br>` +
      `Su consulta fue registrada con éxito.<br><br>` +
      `<span class="ticket-num">Caso N° ${caseId}</span>` +
      statusTrack('pendiente') +
      `<div style="margin-top:8px">En breve un facilitador se pondrá en contacto con usted. ¡Que tenga un excelente día! 🌟</div>`
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
  // Guardamos la sección en la dirección para que al recargar vuelva acá.
  const hash = (id === 'view-panel') ? '#panel' : '#chat';
  if (location.hash !== hash) { try { history.replaceState(null, '', hash); } catch (e) { location.hash = hash; } }
}
let allCases = [];
let caseFilter = 'todos';

$('#btn-panel').addEventListener('click', () => showView('view-panel'));
$('#btn-back').addEventListener('click', () => showView('view-chat'));

/* ---------- Pestañas y filtros ---------- */
function activateTab(tabId) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach((p) => {
    const on = p.id === tabId;
    p.classList.toggle('active', on);
    p.hidden = !on;
  });
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => activateTab(t.dataset.tab)));

document.querySelectorAll('#case-filters .chip').forEach((ch) => ch.addEventListener('click', () => {
  document.querySelectorAll('#case-filters .chip').forEach((x) => x.classList.toggle('active', x === ch));
  caseFilter = ch.dataset.filter;
  renderCases();
}));

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
  try { sessionStorage.setItem('panel_session', JSON.stringify(user)); } catch (e) {}
  await renderPanel();
});

$('#btn-logout').addEventListener('click', () => {
  session = null;
  try { sessionStorage.removeItem('panel_session'); } catch (e) {}
  $('#login-box').hidden = false;
  $('#cases-box').hidden = true;
  $('#login-form').reset();
});

async function renderPanel() {
  $('#login-box').hidden = true;
  $('#cases-box').hidden = false;
  const isAdmin = session.rol === 'admin';
  $('#role-badge').textContent = isAdmin ? `Admin · ${session.nombre}` : `Facilitador · ${session.nombre}`;
  $('#panel-subtitle').textContent = isAdmin ? 'Administración general' : 'Gestión de casos';
  $('#tab-usuarios-btn').hidden = !isAdmin;
  if (!isAdmin) activateTab('tab-casos');

  await loadCases();
  if (isAdmin) await loadUsers();
}

async function loadCases() {
  const list = $('#cases-list');
  list.innerHTML = '<p class="empty">Cargando casos…</p>';
  try { allCases = await getAllCases(); }
  catch (e) { list.innerHTML = '<p class="empty">No se pudieron cargar los casos.</p>'; return; }
  renderStats();
  renderCases();
}

function renderStats() {
  const c = allCases;
  $('#stats').innerHTML =
    statCard(c.length, 'Total') +
    statCard(c.filter((x) => x.estado === 'pendiente').length, 'Pendientes') +
    statCard(c.filter((x) => x.estado === 'en proceso').length, 'En proceso') +
    statCard(c.filter((x) => x.estado === 'resuelto').length, 'Resueltos');
}

function renderCases() {
  const list = $('#cases-list');
  let cases = allCases;
  if (caseFilter === 'mios') cases = cases.filter((c) => c.asignadoDni && c.asignadoDni === session.dni);
  else if (caseFilter === 'libres') cases = cases.filter((c) => !c.asignadoDni);

  if (!cases.length) {
    list.innerHTML = '<p class="empty">No hay casos para mostrar en esta vista.</p>';
    return;
  }
  list.innerHTML = '';
  cases.forEach((c) => list.appendChild(caseCard(c)));
}

function statCard(n, label) { return `<div class="stat"><b>${n}</b><span>${label}</span></div>`; }

function caseCard(c) {
  const div = document.createElement('div');
  const estado = c.estado || 'pendiente';
  div.className = 'case-card s-' + estado.replace(/\s+/g, '-');
  const fecha = toDate(c.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  div.innerHTML =
    `<div class="case-head">
       <span class="case-id">Caso N° ${c.numero ?? '—'}</span>
       <span class="case-cat">${escapeHtml(c.categoria || 'Otro')}</span>
     </div>
     <div class="case-meta">${escapeHtml(c.nombre || '')} · DNI ${escapeHtml(c.dni || '')}${c.telefono ? ' · Tel ' + escapeHtml(c.telefono) : ''}</div>
     <div class="case-desc">${escapeHtml(c.descripcion || '')}</div>
     <div class="case-meta">📅 ${fecha}</div>
     ${statusTrack(estado)}`;

  // Selector de estado
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
    try { await setCaseStatus(c.id, sel.value); await loadCases(); }
    catch (e) { sel.disabled = false; alert('No se pudo actualizar el estado.'); }
  });
  div.appendChild(sel);

  // Fila de asignación
  const assign = document.createElement('div');
  assign.className = 'case-assign';
  const mine = c.asignadoDni && c.asignadoDni === session.dni;
  if (c.asignadoDni) {
    assign.innerHTML = `<span class="assigned-to">👤 Asignado a: <b>${escapeHtml(c.asignadoNombre || 'Facilitador')}</b></span>` +
      (mine ? '<span class="mine-tag">Mi caso</span>' : '');
    if (mine || session.rol === 'admin') {
      const free = document.createElement('button');
      free.className = 'text-btn';
      free.textContent = 'Liberar';
      free.addEventListener('click', async () => {
        free.disabled = true;
        try { await assignCase(c.id, null, null); await loadCases(); }
        catch (e) { free.disabled = false; alert('No se pudo liberar el caso.'); }
      });
      assign.appendChild(free);
    }
  } else {
    assign.innerHTML = '<span class="unassigned">⚠ Sin asignar</span>';
    const take = document.createElement('button');
    take.className = 'take-btn';
    take.textContent = 'Tomar caso';
    take.addEventListener('click', async () => {
      take.disabled = true;
      try { await assignCase(c.id, session.dni, session.nombre); await loadCases(); }
      catch (e) { take.disabled = false; alert('No se pudo tomar el caso.'); }
    });
    assign.appendChild(take);
  }
  div.appendChild(assign);

  // Seguimiento (notas + enlaces): visible si el caso está asignado o ya tiene contenido
  const hasContent = (Array.isArray(c.notas) && c.notas.length) || (Array.isArray(c.enlaces) && c.enlaces.length);
  if (c.asignadoDni || hasContent) {
    const canEdit = !!(c.asignadoDni && (mine || session.rol === 'admin'));
    div.appendChild(buildFollowUp(c, canEdit));
  }
  return div;
}

/* ---------- Seguimiento del caso: notas y enlaces ---------- */
function fmtWhen(iso) {
  try { return toDate(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return ''; }
}
function isHttpUrl(s) {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch (e) { return false; }
}

function buildFollowUp(c, canEdit) {
  const wrap = document.createElement('div');
  wrap.className = 'followup';

  // --- Notas ---
  const notas = (Array.isArray(c.notas) ? c.notas.slice() : []).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  const notasSec = document.createElement('div');
  notasSec.className = 'fu-section';
  notasSec.innerHTML =
    `<h4 class="fu-title">📝 Notas (${notas.length})</h4>` +
    (notas.length
      ? '<div class="fu-list">' + notas.map((n) =>
          `<div class="fu-note"><div class="fu-note-text">${escapeHtml(n.texto || '')}</div>` +
          `<div class="fu-meta">${escapeHtml(n.autor || '')} · ${fmtWhen(n.fecha)}</div></div>`
        ).join('') + '</div>'
      : '<p class="fu-empty">Sin notas todavía.</p>');
  if (canEdit) {
    const ta = document.createElement('textarea');
    ta.className = 'fu-textarea'; ta.rows = 2; ta.placeholder = 'Escriba una nota de seguimiento…';
    const btn = document.createElement('button');
    btn.className = 'fu-btn'; btn.textContent = 'Agregar nota';
    btn.addEventListener('click', async () => {
      const texto = ta.value.trim();
      if (texto.length < 2) { ta.focus(); return; }
      btn.disabled = true;
      try {
        await addCaseNote(c.id, { texto, autor: session.nombre, autorDni: session.dni, fecha: new Date().toISOString() });
        await loadCases();
      } catch (e) { btn.disabled = false; alert('No se pudo agregar la nota.'); }
    });
    notasSec.appendChild(ta);
    notasSec.appendChild(btn);
  }
  wrap.appendChild(notasSec);

  // --- Enlaces ---
  const enlaces = (Array.isArray(c.enlaces) ? c.enlaces.slice() : []).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  const linksSec = document.createElement('div');
  linksSec.className = 'fu-section';
  const lt = document.createElement('h4');
  lt.className = 'fu-title';
  lt.textContent = `🔗 Enlaces (${enlaces.length})`;
  linksSec.appendChild(lt);
  if (enlaces.length) {
    const listEl = document.createElement('div');
    listEl.className = 'fu-list';
    enlaces.forEach((l) => {
      const row = document.createElement('div');
      row.className = 'fu-link';
      if (isHttpUrl(l.url)) {
        const a = document.createElement('a');
        a.href = l.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = l.titulo || l.url;
        row.appendChild(a);
      } else {
        row.textContent = l.titulo || l.url || '';
      }
      const meta = document.createElement('div');
      meta.className = 'fu-meta';
      meta.textContent = `${l.autor || ''} · ${fmtWhen(l.fecha)}`;
      row.appendChild(meta);
      listEl.appendChild(row);
    });
    linksSec.appendChild(listEl);
  } else {
    const p = document.createElement('p');
    p.className = 'fu-empty';
    p.textContent = 'Sin enlaces todavía.';
    linksSec.appendChild(p);
  }
  if (canEdit) {
    const titulo = document.createElement('input');
    titulo.className = 'fu-input'; titulo.type = 'text'; titulo.placeholder = 'Título (opcional)';
    const url = document.createElement('input');
    url.className = 'fu-input'; url.type = 'url'; url.placeholder = 'https://…';
    const btn = document.createElement('button');
    btn.className = 'fu-btn'; btn.textContent = 'Adjuntar enlace';
    btn.addEventListener('click', async () => {
      const u = url.value.trim();
      if (!isHttpUrl(u)) { alert('Ingrese un enlace válido que empiece con http:// o https://'); url.focus(); return; }
      btn.disabled = true;
      try {
        await addCaseLink(c.id, { url: u, titulo: titulo.value.trim(), autor: session.nombre, autorDni: session.dni, fecha: new Date().toISOString() });
        await loadCases();
      } catch (e) { btn.disabled = false; alert('No se pudo adjuntar el enlace.'); }
    });
    linksSec.appendChild(titulo);
    linksSec.appendChild(url);
    linksSec.appendChild(btn);
  }
  wrap.appendChild(linksSec);

  return wrap;
}

/* ---------- Gestión de usuarios (admin) ---------- */
async function loadUsers() {
  const list = $('#users-list');
  list.innerHTML = '<p class="empty">Cargando…</p>';
  let users;
  try { users = await getAllUsers(); }
  catch (e) { list.innerHTML = '<p class="empty">No se pudieron cargar los usuarios.</p>'; return; }
  if (!users.length) { list.innerHTML = '<p class="empty">No hay usuarios.</p>'; return; }
  list.innerHTML = '';
  users.forEach((u) => list.appendChild(userCard(u)));
}

function userCard(u) {
  const div = document.createElement('div');
  div.className = 'user-card';
  const rol = u.rol || 'consultante';
  div.innerHTML =
    `<div class="case-head">
       <span class="case-id">${escapeHtml(u.nombre || '(sin nombre)')}</span>
       <span class="role-pill role-${rol}">${escapeHtml(rol)}</span>
     </div>
     <div class="case-meta">${escapeHtml(u.email || '')} · DNI ${escapeHtml(u.dni || '')}${u.telefono ? ' · Tel ' + escapeHtml(u.telefono) : ''}</div>`;

  const sel = document.createElement('select');
  sel.className = 'role-select-sm';
  [['consultante', 'Consultante'], ['facilitador', 'Facilitador'], ['admin', 'Administrador']].forEach(([v, l]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = 'Rol: ' + l;
    if (v === rol) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', async () => {
    sel.disabled = true;
    try { await updateUserRole(u.dni, sel.value); await loadUsers(); }
    catch (e) { sel.disabled = false; alert('No se pudo cambiar el rol.'); }
  });
  div.appendChild(sel);
  return div;
}

$('#create-user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#nu-msg');
  msg.hidden = true;
  msg.style.color = '';
  const dni = cleanDni($('#nu-dni').value);
  if (!isValidDni(dni)) { msg.textContent = 'El DNI debe tener 7 u 8 dígitos.'; msg.hidden = false; return; }
  const nombre = $('#nu-nombre').value.trim();
  const email = $('#nu-email').value.trim().toLowerCase();
  const telefono = $('#nu-telefono').value.replace(/[.\-\s()]/g, '');
  const rol = $('#nu-rol').value;
  const pass = $('#nu-pass').value || '1234';
  if (!nombre || !email) { msg.textContent = 'Completá nombre y correo.'; msg.hidden = false; return; }

  let res;
  try { res = await createUser({ dni, nombre, email, telefono, rol, pass }); }
  catch (err) { msg.textContent = 'No se pudo crear el usuario.'; msg.hidden = false; return; }
  if (res.error) { msg.textContent = res.error; msg.hidden = false; return; }

  msg.style.color = 'var(--ok)';
  msg.textContent = `✅ Usuario creado: ${nombre} (${rol}).`;
  msg.hidden = false;
  e.target.reset();
  $('#nu-pass').value = '1234';
  await loadUsers();
});

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

// Restaurar la sección donde estaba el usuario antes de recargar.
(async function restoreView() {
  if (location.hash === '#panel') {
    showView('view-panel');
    let saved = null;
    try { saved = sessionStorage.getItem('panel_session'); } catch (e) {}
    if (saved) {
      try { session = JSON.parse(saved); await renderPanel(); } catch (e) {}
    }
  }
})();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
