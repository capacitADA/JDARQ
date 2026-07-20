// ============================================
// JDARQ — JD Arquisoluciones
// Versión: 1.0 — Julio 2026
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore, collection, addDoc, getDocs, deleteDoc,
    doc, updateDoc, query, orderBy, runTransaction, getDoc, setDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey:            "AIzaSyBf8Zu84MPTjx60MsFstL6esFgYEpVurxA",
    authDomain:        "jdarq-65151.firebaseapp.com",
    projectId:         "jdarq-65151",
    storageBucket:     "jdarq-65151.firebasestorage.app",
    messagingSenderId: "332208097404",
    appId:             "1:332208097404:web:2e869b22f0b6f0a96ae1f9"
};

const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

// ============================================
// VARIABLES GLOBALES
// ============================================
let empresas    = [];
let tecnicos    = [];
let incidencias = [];
let sesionActual = null;
let currentView  = 'panel';
let selectedEmpresaId   = null;
let selectedIncidenciaId = null;
let fotosEvidencia = [null, null, null];
let firmaJefeDataUrl = '';

const TIPOS_DOC    = ['CC','CE','PA','NIT','TI'];
const TIPOS_SERV   = ['Preventivo','Correctivo','Emergencia','Instalacion','Otro'];
const ESTADOS_EQ   = ['Operativo','Fuera de servicio','Requiere seguimiento'];

// ============================================
// HELPERS
// ============================================
const getEmpresa   = id => empresas.find(e => e.id === id);
const getTecnico   = id => tecnicos.find(t => t.id === id);
const getIncidencia = id => incidencias.find(i => i.id === id);
const getIncEmpresa = eid => incidencias.filter(i => i.empresaId === eid);
const getTecnEmpresa = eid => tecnicos.filter(t => t.empresaId === eid);

function fmtFecha(f) {
    if (!f) return '';
    return new Date(f + 'T12:00:00').toLocaleDateString('es-CO');
}
function esAdmin()      { return sesionActual?.rol === 'admin'; }
function esTecnico()    { return sesionActual?.rol === 'tecnico'; }
function esEmpresa()    { return sesionActual?.rol === 'empresa'; }

function toast(msg, dur = 3000) {
    const t = document.getElementById('toastEl');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), dur);
}

function showModal(html) {
    const ov = document.getElementById('overlayEl');
    ov.innerHTML = html;
    ov.classList.remove('hidden');
    ov.onclick = e => { if (e.target === ov) closeModal(); };
}

function closeModal() {
    document.getElementById('overlayEl').classList.add('hidden');
    document.getElementById('overlayEl').innerHTML = '';
    fotosEvidencia = [null, null, null];
    firmaJefeDataUrl = '';
}

function actualizarTopbar() {
    const right = document.getElementById('topbarRight');
    if (!right) return;
    if (!sesionActual) {
        right.innerHTML = `<span class="topbar-user">Sin sesion</span>`;
    } else {
        const ini = sesionActual.nombre.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
        const rolBadge = esAdmin() ? `<span class="topbar-rol-badge">Admin</span>` : '';
        right.innerHTML = `<div class="topbar-sesion">
            <div class="topbar-avatar">${ini}</div>
            <div>
              <div style="font-size:.68rem;color:white;font-weight:700;">${sesionActual.nombre.split(' ')[0]}</div>
              ${rolBadge}
            </div>
            <button class="topbar-salir" onclick="cerrarSesion()">Salir</button>
        </div>`;
    }
}

function cerrarSesion() {
    sesionActual = null;
    actualizarTopbar();
    currentView = 'panel';
    renderView();
    toast('👋 Sesion cerrada');
}

function goTo(view, eid = null, iid = null) {
    currentView = view;
    selectedEmpresaId    = eid;
    selectedIncidenciaId = iid;
    closeModal();
    renderView();
    document.querySelectorAll('.bni').forEach(b => {
        b.classList.toggle('active', b.dataset.page === view);
    });
}

// ============================================
// CONSECUTIVO
// ============================================
async function obtenerConsecutivo(empresaId) {
    const ref = doc(db, 'consecutivos', empresaId || 'general');
    let nuevo;
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const actual = snap.exists() ? (snap.data().ultimo || 0) : 0;
        nuevo = actual + 1;
        tx.set(ref, { ultimo: nuevo }, { merge: true });
    });
    return `INC-${String(nuevo).padStart(5,'0')}`;
}

// ============================================
// CARGA DE DATOS
// ============================================
async function cargarDatos() {
    const main = document.getElementById('mainContent');
    main.innerHTML = '<div class="loading-screen" style="position:relative;min-height:200px;background:transparent;"><div class="loading-spinner"></div></div>';
    try {
        const [empSnap, tecSnap, incSnap] = await Promise.all([
            getDocs(query(collection(db, 'empresas'),    orderBy('nombre'))),
            getDocs(query(collection(db, 'tecnicos'),    orderBy('nombre'))),
            getDocs(query(collection(db, 'incidencias'), orderBy('fecha', 'desc')))
        ]);
        empresas    = empSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        tecnicos    = tecSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        incidencias = incSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        main.innerHTML = `<div class="page" style="text-align:center;padding:2rem;">
            <p>⚠️ Error al cargar datos</p>
            <button class="btn btn-gold" style="margin-top:1rem" onclick="location.reload()">Reintentar</button>
        </div>`;
        return;
    }
    renderView();
}

// ============================================
// RENDER PRINCIPAL
// ============================================
function renderView() {
    const main    = document.getElementById('mainContent');
    const botnav  = document.getElementById('botnavEl');
    const topbar  = document.getElementById('topbarEl');

    // Mostrar UI
    document.getElementById('loadingScreen').style.display = 'none';
    topbar.style.display  = 'flex';
    botnav.style.display  = 'flex';

    // Ruta QR de aprobacion
    if (manejarRutaAprobacion()) return;

    switch (currentView) {
        case 'panel':       main.innerHTML = renderPanel();       break;
        case 'empresas':    main.innerHTML = renderEmpresas();    break;
        case 'incidencias': main.innerHTML = renderIncidencias(); break;
        case 'agenda':      main.innerHTML = renderAgenda();      break;
        case 'tecnicos':    main.innerHTML = renderTecnicos();    break;
        case 'detalle-empresa': main.innerHTML = renderDetalleEmpresa(); break;
        case 'detalle-inc': main.innerHTML = renderDetalleIncidencia(); break;
        default: main.innerHTML = renderPanel();
    }

    // Marcar nav activo
    document.querySelectorAll('.bni').forEach(b => {
        b.classList.toggle('active', b.dataset.page === currentView);
    });
}

// ============================================
// PANEL
// ============================================
function renderPanel() {
    const hoy    = new Date();
    const prefijo = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
    const total   = incidencias.length;
    const mesActual = incidencias.filter(i => i.fecha?.startsWith(prefijo)).length;
    const pendCedi  = incidencias.filter(i => i.tipoCentro === 'CEDI' && !i.aprobado).length;
    const aprobadas = incidencias.filter(i => i.aprobado).length;

    const col = (titulo, valor, color, sub) => `
        <div style="background:white;border-radius:10px;padding:10px;border:1px solid var(--border);box-shadow:var(--shadow);">
          <div style="font-size:.68rem;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:4px;">${titulo}</div>
          <div style="font-size:1.6rem;font-weight:800;color:${color};">${valor}</div>
          ${sub ? `<div style="font-size:.68rem;color:var(--hint);">${sub}</div>` : ''}
        </div>`;

    const incRecientes = incidencias.slice(0,5);

    return `<div class="page">
<div class="panel-header">
  <img src="https://raw.githubusercontent.com/capacitADA/JDARQ/main/JDARQ-logo.png" onerror="this.style.display='none'">
  <div class="panel-header-txt">
    <div class="title">Panel Principal</div>
    <div class="sub">JD Arquisoluciones</div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
  ${col('Total incidencias', total, 'var(--negro)', 'Histórico')}
  ${col('Este mes', mesActual, 'var(--dorado)', hoy.toLocaleString('es-CO',{month:'long'}))}
  ${col('Aprobadas', aprobadas, '#16a34a', 'Con sello')}
  ${col('Pend. CEDI', pendCedi, pendCedi > 0 ? 'var(--rojo)' : '#16a34a', 'Sin aprobar')}
</div>

${pendCedi > 0 ? `
<div style="background:#fff8f0;border:1.5px solid var(--dorado);border-radius:var(--radius);padding:.85rem;margin-bottom:12px;">
  <div style="font-weight:700;font-size:.82rem;color:var(--rojo);margin-bottom:.5rem;">⏳ CEDI pendientes de aprobación (${pendCedi})</div>
  ${incidencias.filter(i => i.tipoCentro === 'CEDI' && !i.aprobado).slice(0,3).map(i => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f0e8d8;font-size:.78rem;">
      <span style="font-weight:700;">${i.numero || i.id}</span>
      <span style="color:#555;">${i.empresaNombre || ''}</span>
      <button class="btn btn-gold btn-sm" onclick="goTo('detalle-inc',null,'${i.id}')">Ver</button>
    </div>`).join('')}
  ${esAdmin() ? `<button class="btn btn-red btn-full" onclick="goTo('incidencias')">Ver todas las pendientes</button>` : ''}
</div>` : ''}

<div style="background:white;border-radius:var(--radius);padding:.85rem;border:1px solid var(--border);">
  <div style="font-weight:700;font-size:.8rem;margin-bottom:.6rem;">📋 Incidencias recientes</div>
  ${incRecientes.length === 0 ? '<div style="color:var(--hint);font-size:.78rem;">Sin incidencias registradas.</div>' :
    incRecientes.map(i => `
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f5f5f5;font-size:.78rem;cursor:pointer;" onclick="goTo('detalle-inc',null,'${i.id}')">
        <span style="font-weight:700;color:var(--dorado);">${i.numero||'—'}</span>
        <span>${i.empresaNombre||'—'}</span>
        <span style="color:${i.aprobado?'#16a34a':'var(--hint)'};">${i.aprobado?'✅ Aprobada':'⏳ Pendiente'}</span>
      </div>`).join('')}
</div>
</div>`;
}

// ============================================
// EMPRESAS
// ============================================
function renderEmpresas() {
    return `<div class="page">
<div class="sec-head">
  <h2>Empresas (${empresas.length})</h2>
  ${esAdmin() ? `<button class="btn btn-gold btn-sm" onclick="modalNuevaEmpresa()">+ Nueva</button>` : ''}
</div>
<input class="search" placeholder="🔍 Buscar empresa..." oninput="filtrarEmpresas(this.value)" id="searchEmp">
<div id="empresasGrid">
${empresas.map(e => `
  <div class="cc" data-search="${(e.nombre+(e.nit||'')).toLowerCase()}">
    <div style="display:flex;justify-content:space-between;">
      <div class="cc-name">${e.nombre}</div>
      ${esAdmin() ? `<div><button class="ib" onclick="modalEditarEmpresa('${e.id}')">✏️</button></div>` : ''}
    </div>
    <div class="cc-row">🪪 NIT: ${e.nit||'—'}</div>
    <div class="cc-row">📞 ${e.telefono||'—'}</div>
    <div class="cc-meta">${getTecnEmpresa(e.id).length} técnico(s) · ${getIncEmpresa(e.id).length} incidencia(s)</div>
    <button class="link-btn" onclick="goTo('detalle-empresa','${e.id}')">Ver detalle →</button>
  </div>`).join('')}
</div>
</div>`;
}

window.filtrarEmpresas = v => {
    document.querySelectorAll('#empresasGrid .cc').forEach(c => {
        c.style.display = (c.dataset.search||'').includes(v.toLowerCase()) ? '' : 'none';
    });
};

function renderDetalleEmpresa() {
    const e = getEmpresa(selectedEmpresaId);
    if (!e) { goTo('empresas'); return ''; }
    const tecs = getTecnEmpresa(e.id);
    const incs = getIncEmpresa(e.id);
    return `<div class="page">
<button class="back" onclick="goTo('empresas')">← Volver</button>
<div class="info-box">
  <div class="cc-name">${e.nombre}</div>
  <div class="cc-row">🪪 NIT: ${e.nit||'—'}</div>
  <div class="cc-row">📞 ${e.telefono||'—'}</div>
  ${e.direccion ? `<div class="cc-row">📍 ${e.direccion}</div>` : ''}
</div>
<div class="sec-head">
  <span style="font-weight:700;">Técnicos (${tecs.length})</span>
  ${esAdmin() ? `<button class="btn btn-gold btn-sm" onclick="modalNuevoTecnico('${e.id}')">+ Técnico</button>` : ''}
</div>
${tecs.map(t => `
  <div class="ec" style="display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div class="ec-name">${t.nombre}</div>
      <div class="ec-meta">CC ${t.cedula||'—'} · 📞 ${t.telefono||'—'}</div>
    </div>
    <span class="tc-rol-badge rol-tec">Técnico</span>
  </div>`).join('')}
<div class="sec-head" style="margin-top:.75rem;">
  <span style="font-weight:700;">Incidencias (${incs.length})</span>
</div>
${incs.slice(0,10).map(i => `
  <div class="si" style="cursor:pointer;" onclick="goTo('detalle-inc','${e.id}','${i.id}')">
    <div class="si-top">
      <span class="badge b-gold">${i.numero||'—'}</span>
      <span style="font-size:.72rem;color:var(--hint);">${fmtFecha(i.fecha)}</span>
    </div>
    <div class="si-info">🔧 ${i.tecnicoNombre||'—'} · ${i.tipoServicio||'—'}</div>
    <div class="si-info">${i.aprobado ? '✅ Aprobada' : '⏳ Pendiente aprobación'}</div>
  </div>`).join('')}
</div>`;
}

// ============================================
// INCIDENCIAS
// ============================================
function renderIncidencias() {
    const pendCedi = incidencias.filter(i => i.tipoCentro === 'CEDI' && !i.aprobado);
    const todas    = incidencias;

    return `<div class="page">
<div class="sec-head">
  <h2>Incidencias</h2>
  ${sesionActual ? `<button class="btn btn-gold btn-sm" onclick="modalNuevaIncidencia()">+ Nueva</button>` : ''}
</div>

${esAdmin() && pendCedi.length > 0 ? `
<div style="margin-bottom:.75rem;">
  <div style="font-size:.78rem;font-weight:700;color:var(--rojo);margin-bottom:.4rem;">⏳ CEDI pendientes (${pendCedi.length})</div>
  ${pendCedi.map(i => `
    <div class="pend-card">
      <div class="pend-num">${i.numero||'—'}</div>
      <div class="pend-titulo">${i.empresaNombre||'—'} · ${i.lugar||'—'}</div>
      <div class="pend-meta">🔧 ${i.tecnicoNombre||'—'} · ${fmtFecha(i.fecha)}</div>
      <button class="btn btn-gold btn-sm btn-full" style="margin-top:.5rem;" onclick="aprobarIncidencia('${i.id}')">✅ Aprobar y sellar</button>
    </div>`).join('')}
</div>` : ''}

<div>
  <div style="font-size:.78rem;font-weight:700;color:#555;margin-bottom:.4rem;">Todas las incidencias</div>
  ${todas.map(i => `
    <div class="si" style="cursor:pointer;" onclick="goTo('detalle-inc',null,'${i.id}')">
      <div class="si-top">
        <span class="badge ${i.aprobado ? 'b-green' : 'b-gold'}">${i.numero||'—'}</span>
        <span style="font-size:.72rem;color:var(--hint);">${fmtFecha(i.fecha)}</span>
      </div>
      <div class="si-info">🏢 ${i.empresaNombre||'—'} · 📍 ${i.lugar||'—'}</div>
      <div class="si-info">🔧 ${i.tecnicoNombre||'—'} · ${i.tipoServicio||'—'}</div>
      <div class="si-info">${i.aprobado ? '✅ Aprobada con sello' : '⏳ Pendiente'}</div>
    </div>`).join('')}
</div>
</div>`;
}

function renderDetalleIncidencia() {
    const i = getIncidencia(selectedIncidenciaId);
    if (!i) { goTo('incidencias'); return ''; }
    const volver = selectedEmpresaId ? `goTo('detalle-empresa','${selectedEmpresaId}')` : `goTo('incidencias')`;

    return `<div class="page">
<button class="back" onclick="${volver}">← Volver</button>
<div class="info-box">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;">
    <div class="cc-name">${i.numero||'—'}</div>
    <span class="badge ${i.aprobado?'b-green':'b-gold'}">${i.aprobado?'Aprobada':'Pendiente'}</span>
  </div>
  <div class="cc-row">🏢 ${i.empresaNombre||'—'}</div>
  <div class="cc-row">📍 ${i.lugar||'—'} ${i.tipoCentro?`· ${i.tipoCentro}`:''}</div>
  <div class="cc-row">📅 ${fmtFecha(i.fecha)}</div>
  <div class="cc-row">🔧 ${i.tecnicoNombre||'—'} · CC ${i.tecnicoCedula||'—'}</div>
  <div class="cc-row">Tipo: ${i.tipoServicio||'—'}</div>
</div>

${i.descripcionFalla ? `<div class="info-box"><div style="font-weight:700;font-size:.78rem;margin-bottom:.35rem;">Falla encontrada</div><div style="font-size:.82rem;">${i.descripcionFalla}</div></div>` : ''}
${i.trabajoRealizado ? `<div class="info-box"><div style="font-weight:700;font-size:.78rem;margin-bottom:.35rem;">Trabajo realizado</div><div style="font-size:.82rem;">${i.trabajoRealizado}</div></div>` : ''}
${i.estadoEquipo ? `<div class="info-box"><div style="font-weight:700;font-size:.78rem;margin-bottom:.35rem;">Estado del equipo</div><div style="font-size:.82rem;color:${i.estadoEquipo==='Operativo'?'#16a34a':'var(--rojo)'};">${i.estadoEquipo}</div></div>` : ''}

${i.firmaJefe ? `
<div class="info-box">
  <div style="font-weight:700;font-size:.78rem;margin-bottom:.35rem;">Firma jefe de tienda</div>
  <img src="${i.firmaJefe}" style="max-width:180px;border:1px solid var(--border);border-radius:var(--radius);">
  ${i.celularJefe ? `<div class="cc-meta" style="margin-top:.3rem;">📱 ${i.celularJefe}</div>` : ''}
</div>` : ''}

${i.fotos?.length ? `
<div class="info-box">
  <div style="font-weight:700;font-size:.78rem;margin-bottom:.35rem;">Fotos de evidencia (${i.fotos.length})</div>
  <div class="fotos-strip">${i.fotos.map(f=>`<img class="fthumb" src="${f}">`).join('')}</div>
</div>` : ''}

${esAdmin() && !i.aprobado && i.tipoCentro === 'CEDI' ? `
<button class="btn btn-gold btn-full" style="margin-top:.75rem;" onclick="aprobarIncidencia('${i.id}')">✅ Aprobar y estampar sello</button>` : ''}

${i.aprobado && i.selladoEn ? `
<div style="text-align:center;padding:.75rem;background:#f0fdf4;border-radius:var(--radius);border:1px solid #bbf7d0;margin-top:.5rem;">
  <div style="font-size:.78rem;color:#15803d;font-weight:700;">✅ Aprobada el ${new Date(i.selladoEn).toLocaleString('es-CO')}</div>
</div>` : ''}
</div>`;
}

// ============================================
// AGENDA
// ============================================
function renderAgenda() {
    const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const año   = new Date().getFullYear();
    const conProximo = incidencias.filter(i => i.proximoMantenimiento);
    return `<div class="page">
<div class="sec-head"><h2>Agenda ${año}</h2></div>
<div class="tbl-wrap">
<table>
  <thead><tr><th>Mes</th><th>Fecha</th><th>Empresa</th><th>Lugar</th></tr></thead>
  <tbody>
  ${MESES.map((mes, idx) => {
    const mp    = String(idx+1).padStart(2,'0');
    const lista = conProximo.filter(i => i.proximoMantenimiento?.startsWith(`${año}-${mp}`));
    if (!lista.length) return `<tr><td style="color:var(--hint);">${mes}</td><td colspan="3" style="color:#ccc;">—</td></tr>`;
    return lista.map((i,j) => `<tr>
      ${j===0?`<td rowspan="${lista.length}" style="font-weight:700;">${mes}</td>`:''}
      <td>${fmtFecha(i.proximoMantenimiento)}</td>
      <td>${i.empresaNombre||'—'}</td>
      <td>${i.lugar||'—'}</td>
    </tr>`).join('');
  }).join('')}
  </tbody>
</table>
</div>
</div>`;
}

// ============================================
// TÉCNICOS
// ============================================
function renderTecnicos() {
    return `<div class="page">
<div class="sec-head">
  <h2>Técnicos (${tecnicos.length})</h2>
  ${esAdmin() ? `<button class="btn btn-gold btn-sm" onclick="modalNuevoTecnico(null)">+ Nuevo</button>` : ''}
</div>
${tecnicos.map(t => {
    const empresa = getEmpresa(t.empresaId);
    const isActive = sesionActual?.id === t.id;
    return `<div class="ec" style="${isActive?'border:2px solid var(--dorado);':''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="ec-name">${t.nombre} ${isActive?'<span style="background:var(--dorado);color:var(--negro);font-size:.58rem;padding:2px 6px;border-radius:10px;margin-left:4px;">✓ Activo</span>':''}</div>
          <div class="ec-meta">CC ${t.cedula||'—'}</div>
          <div class="ec-meta">📞 ${t.telefono||'—'}</div>
          ${empresa ? `<div class="ec-meta">🏢 ${empresa.nombre}</div>` : ''}
        </div>
        <span class="tc-rol-badge rol-tec">Técnico</span>
      </div>
      ${!isActive
        ? `<button class="btn btn-gold btn-sm btn-full" style="margin-top:.5rem;" onclick="abrirLogin('${t.id}')">🔑 Ingresar como ${t.nombre.split(' ')[0]}</button>`
        : `<button class="btn btn-gray btn-sm btn-full" style="margin-top:.5rem;" onclick="cerrarSesion()">🚪 Cerrar sesión</button>`}
    </div>`;
}).join('')}
</div>`;
}

// ============================================
// LOGIN TÉCNICO (PIN + Cédula)
// ============================================
let mlPinActual = '';

function abrirLogin(tid) {
    const t = getTecnico(tid);
    mlPinActual = '';
    showModal(`<div class="modal" style="max-width:320px;">
      <div class="modal-h"><h3>🔑 Ingresar</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <div style="font-weight:700;">${t.nombre}</div>
        <label class="fl">Cédula</label>
        <input class="fi" id="mlCedula" type="number" placeholder="Número de cédula">
        <label class="fl">Clave (4 dígitos)</label>
        <div class="pin-display">
          <div class="pin-digit" id="mlpd0"></div>
          <div class="pin-digit" id="mlpd1"></div>
          <div class="pin-digit" id="mlpd2"></div>
          <div class="pin-digit" id="mlpd3"></div>
        </div>
        <div class="numpad">
          ${[1,2,3,4,5,6,7,8,9].map(n=>`<div class="num-btn" onclick="mlPin('${tid}',${n})">${n}</div>`).join('')}
          <div class="num-btn del" onclick="mlDel()">⌫</div>
          <div class="num-btn zero" onclick="mlPin('${tid}',0)">0</div>
          <div class="num-btn ok" onclick="mlLogin('${tid}')">✓</div>
        </div>
        <div id="mlMsg"></div>
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-gold" onclick="mlLogin('${tid}')">Ingresar</button>
        </div>
      </div>
    </div>`);
    mlUpdateDisplay();
}

function mlPin(tid, n) { if (mlPinActual.length >= 4) return; mlPinActual += String(n); mlUpdateDisplay(); if (mlPinActual.length === 4) mlLogin(tid); }
function mlDel() { mlPinActual = mlPinActual.slice(0,-1); mlUpdateDisplay(); }
function mlUpdateDisplay() {
    for (let i=0; i<4; i++) {
        const d = document.getElementById('mlpd'+i);
        if (!d) continue;
        d.className = 'pin-digit';
        if (i < mlPinActual.length)      { d.textContent='●'; d.classList.add('filled'); }
        else if (i === mlPinActual.length){ d.textContent='_'; d.classList.add('active'); }
        else { d.textContent=''; }
    }
}
function mlLogin(tid) {
    const t      = getTecnico(tid);
    const cedula = document.getElementById('mlCedula')?.value?.trim();
    const msg    = document.getElementById('mlMsg');
    if (!cedula)              { if(msg) msg.innerHTML='<div class="login-warn">⚠️ Cédula requerida</div>'; return; }
    if (mlPinActual.length<4) { if(msg) msg.innerHTML='<div class="login-warn">⚠️ Clave de 4 dígitos</div>'; return; }
    if (t.cedula !== cedula || t.clave !== mlPinActual) {
        if(msg) msg.innerHTML='<div class="login-error">❌ Credenciales incorrectas</div>';
        mlPinActual=''; mlUpdateDisplay(); return;
    }
    sesionActual = t;
    mlPinActual  = '';
    closeModal();
    actualizarTopbar();
    currentView = 'panel';
    renderView();
    toast(`✅ Bienvenido, ${t.nombre.split(' ')[0]}`);
}

// ============================================
// MODAL NUEVA INCIDENCIA
// ============================================
function modalNuevaIncidencia() {
    if (!sesionActual) { toast('⚠️ Debes iniciar sesión'); return; }
    const empresaOpts = empresas.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('');
    const tipoOpts    = TIPOS_SERV.map(t => `<option>${t}</option>`).join('');
    const estadoOpts  = ESTADOS_EQ.map(e => `<option>${e}</option>`).join('');

    showModal(`<div class="modal">
      <div class="modal-h"><h3>📋 Nueva incidencia</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">

        <label class="fl">Técnico (nombre)</label>
        <input class="fi" id="niTecNombre" value="${sesionActual.nombre}" readonly>
        <label class="fl">Cédula técnico</label>
        <input class="fi" id="niTecCedula" value="${sesionActual.cedula||''}" readonly>

        <label class="fl">Empresa / Cliente</label>
        <select class="fi" id="niEmpresa">${empresaOpts}</select>

        <label class="fl">Tipo de centro</label>
        <select class="fi" id="niTipoCentro" onchange="toggleCedi()">
          <option value="Tienda">Tienda</option>
          <option value="CEDI">CEDI</option>
        </select>

        <label class="fl">Lugar / Dirección</label>
        <input class="fi" id="niLugar" placeholder="Tienda #045 Ibagué">

        <label class="fl">Fecha</label>
        <input class="fi" id="niFecha" type="date" value="${new Date().toISOString().split('T')[0]}">

        <label class="fl">Tipo de servicio</label>
        <select class="fi" id="niTipo">${tipoOpts}</select>

        <label class="fl">Descripción de la falla</label>
        <textarea class="fi" id="niDescFalla" rows="3" placeholder="Describe la falla encontrada..."></textarea>

        <label class="fl">Trabajo realizado</label>
        <textarea class="fi" id="niTrabajo" rows="3" placeholder="Describe el trabajo realizado..."></textarea>

        <label class="fl">Estado del equipo</label>
        <select class="fi" id="niEstado">${estadoOpts}</select>

        <label class="fl">Próximo mantenimiento</label>
        <input class="fi" id="niProximo" type="date">

        <!-- FIRMA JEFE (solo tiendas) -->
        <div id="bloqueJefe">
          <label class="fl">Celular jefe de tienda</label>
          <input class="fi" id="niCelJefe" type="tel" placeholder="3XX XXX XXXX">
          <label class="fl">Firma jefe de tienda</label>
          <canvas id="firmaCanvas" class="firma-canvas" width="340" height="130"></canvas>
          <div style="display:flex;gap:.5rem;margin-top:.35rem;">
            <button class="btn btn-gray btn-sm" onclick="limpiarFirma()">Limpiar firma</button>
          </div>
        </div>

        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-gold" onclick="guardarIncidencia()">Guardar incidencia</button>
        </div>
      </div>
    </div>`);

    iniciarFirmaCanvas();
}

function toggleCedi() {
    const tipo  = document.getElementById('niTipoCentro')?.value;
    const bloque = document.getElementById('bloqueJefe');
    if (!bloque) return;
    bloque.style.display = tipo === 'CEDI' ? 'none' : 'block';
}

function iniciarFirmaCanvas() {
    const canvas = document.getElementById('firmaCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let dibujando = false;

    const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        const src = e.touches ? e.touches[0] : e;
        return { x: src.clientX - r.left, y: src.clientY - r.top };
    };

    canvas.addEventListener('mousedown', e => { dibujando=true; ctx.beginPath(); const p=getPos(e); ctx.moveTo(p.x,p.y); });
    canvas.addEventListener('mousemove', e => { if(!dibujando) return; const p=getPos(e); ctx.lineTo(p.x,p.y); ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.stroke(); });
    canvas.addEventListener('mouseup', () => { dibujando=false; });
    canvas.addEventListener('touchstart', e => { e.preventDefault(); dibujando=true; ctx.beginPath(); const p=getPos(e); ctx.moveTo(p.x,p.y); });
    canvas.addEventListener('touchmove', e => { e.preventDefault(); if(!dibujando) return; const p=getPos(e); ctx.lineTo(p.x,p.y); ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.stroke(); });
    canvas.addEventListener('touchend', () => { dibujando=false; });
}

window.limpiarFirma = () => {
    const canvas = document.getElementById('firmaCanvas');
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
};

async function guardarIncidencia() {
    const tecNombre  = document.getElementById('niTecNombre')?.value?.trim();
    const tecCedula  = document.getElementById('niTecCedula')?.value?.trim();
    const empresaId  = document.getElementById('niEmpresa')?.value;
    const tipoCentro = document.getElementById('niTipoCentro')?.value;
    const lugar      = document.getElementById('niLugar')?.value?.trim();
    const fecha      = document.getElementById('niFecha')?.value;
    const tipo       = document.getElementById('niTipo')?.value;
    const descFalla  = document.getElementById('niDescFalla')?.value?.trim();
    const trabajo    = document.getElementById('niTrabajo')?.value?.trim();
    const estado     = document.getElementById('niEstado')?.value;
    const proximo    = document.getElementById('niProximo')?.value||'';
    const celJefe    = document.getElementById('niCelJefe')?.value?.trim()||'';

    if (!lugar || !fecha || !descFalla) { toast('⚠️ Completa lugar, fecha y descripción'); return; }

    // Firma
    let firmaData = '';
    if (tipoCentro !== 'CEDI') {
        const canvas = document.getElementById('firmaCanvas');
        if (canvas) firmaData = canvas.toDataURL('image/png');
    }

    const empresa = getEmpresa(empresaId);
    let numero;
    try { numero = await obtenerConsecutivo(empresaId); }
    catch(e) { toast('⚠️ Error generando consecutivo'); return; }

    const payload = {
        numero, empresaId, empresaNombre: empresa?.nombre||'',
        tipoCentro, lugar, fecha, tipoServicio: tipo,
        tecnicoNombre: tecNombre, tecnicoCedula: tecCedula,
        descripcionFalla: descFalla, trabajoRealizado: trabajo,
        estadoEquipo: estado,
        proximoMantenimiento: proximo,
        firmaJefe: firmaData,
        celularJefe: celJefe,
        aprobado: false,
        fotos: [],
        creadoEn: new Date().toISOString()
    };

    try {
        await addDoc(collection(db, 'incidencias'), payload);
        toast('✅ Incidencia guardada: ' + numero);
        closeModal();
        await cargarDatos();
    } catch(e) {
        toast('⚠️ Error al guardar: ' + e.message);
    }
}

// ============================================
// APROBACION ADMIN (CEDI)
// ============================================
window.aprobarIncidencia = async (iid) => {
    if (!confirm('¿Aprobar esta incidencia y estampar el sello?')) return;
    try {
        await updateDoc(doc(db, 'incidencias', iid), {
            aprobado: true,
            selladoEn: new Date().toISOString(),
            aprobadoPor: sesionActual?.nombre || 'Admin'
        });
        toast('✅ Incidencia aprobada y sellada');
        await cargarDatos();
        goTo('incidencias');
    } catch(e) {
        toast('⚠️ Error al aprobar: ' + e.message);
    }
};

// ============================================
// RUTA QR APROBACION (jefe de tienda)
// ============================================
function manejarRutaAprobacion() {
    const hash = window.location.hash;
    if (!hash.startsWith('#/aprobar/')) return false;

    const token = hash.replace('#/aprobar/', '');
    const main  = document.getElementById('mainContent');
    const botnav = document.getElementById('botnavEl');
    if (botnav) botnav.style.display = 'none';

    main.innerHTML = `<div class="page" style="max-width:400px;">
      <div style="text-align:center;margin-bottom:1rem;">
        <img src="https://raw.githubusercontent.com/capacitADA/JDARQ/main/JDARQ-logo.png" style="height:48px;" onerror="this.style.display='none'">
      </div>
      <div id="qrContenido"><div class="loading-screen" style="position:relative;min-height:150px;background:transparent;"><div class="loading-spinner"></div></div></div>
    </div>`;

    cargarAprobacionQR(token);
    return true;
}

async function cargarAprobacionQR(token) {
    const cont = document.getElementById('qrContenido');
    try {
        const snap = await getDoc(doc(db, 'aprobaciones', token));
        if (!snap.exists()) { cont.innerHTML = '<div class="login-error">❌ Link inválido o expirado</div>'; return; }
        const data = snap.data();

        if (data.usado) { cont.innerHTML = '<div class="login-error">❌ Este link ya fue utilizado</div>'; return; }
        if (new Date(data.expira) < new Date()) { cont.innerHTML = '<div class="login-error">❌ Este link expiró</div>'; return; }

        const iSnap = await getDoc(doc(db, 'incidencias', data.incidenciaId));
        if (!iSnap.exists()) { cont.innerHTML = '<div class="login-error">❌ Incidencia no encontrada</div>'; return; }
        const inc = { id: iSnap.id, ...iSnap.data() };

        cont.innerHTML = `
          <div class="info-box" style="margin-bottom:.75rem;">
            <div style="background:var(--negro);color:var(--dorado);padding:6px 10px;border-radius:6px;font-weight:700;font-size:.8rem;margin-bottom:.65rem;">
              📋 Incidencia ${inc.numero||'—'}
            </div>
            <div class="cc-row">🏢 ${inc.empresaNombre||'—'}</div>
            <div class="cc-row">📍 ${inc.lugar||'—'}</div>
            <div class="cc-row">📅 ${fmtFecha(inc.fecha)}</div>
            <div class="cc-row">🔧 ${inc.tecnicoNombre||'—'}</div>
            <div class="cc-row">Tipo: ${inc.tipoServicio||'—'}</div>
            ${inc.trabajoRealizado ? `<div class="cc-row" style="margin-top:.4rem;">✅ ${inc.trabajoRealizado}</div>` : ''}
            <div class="cc-row">Estado: <strong style="color:${inc.estadoEquipo==='Operativo'?'#16a34a':'var(--rojo)'};">${inc.estadoEquipo||'—'}</strong></div>
          </div>
          <label class="fl">Tu número de celular</label>
          <input class="fi" id="qrCelular" type="tel" placeholder="3XX XXX XXXX" style="margin-bottom:.75rem;">
          <label class="fl">Firma aquí (jefe de tienda)</label>
          <canvas id="firmaQR" class="firma-canvas" width="340" height="130" style="margin-bottom:.35rem;"></canvas>
          <button class="btn btn-gray btn-sm" onclick="document.getElementById('firmaQR').getContext('2d').clearRect(0,0,340,130)" style="margin-bottom:.75rem;">Limpiar</button>
          <div style="font-size:.72rem;color:var(--hint);margin-bottom:.75rem;">
            Al firmar confirmas que el servicio fue realizado a satisfacción. Tu número de celular y firma quedan registrados.
          </div>
          <button class="btn btn-gold btn-full" onclick="confirmarAprobacionQR('${token}','${inc.id}')">✅ Aprobar y firmar</button>
        `;
        iniciarFirmaQR();
    } catch(e) {
        cont.innerHTML = `<div class="login-error">⚠️ Error: ${e.message}</div>`;
    }
}

function iniciarFirmaQR() {
    const canvas = document.getElementById('firmaQR');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let dibujando = false;
    const getPos = (e) => { const r=canvas.getBoundingClientRect(); const s=e.touches?e.touches[0]:e; return {x:s.clientX-r.left,y:s.clientY-r.top}; };
    canvas.addEventListener('mousedown', e=>{dibujando=true;ctx.beginPath();const p=getPos(e);ctx.moveTo(p.x,p.y);});
    canvas.addEventListener('mousemove', e=>{if(!dibujando)return;const p=getPos(e);ctx.lineTo(p.x,p.y);ctx.strokeStyle='#1a1a1a';ctx.lineWidth=2;ctx.lineCap='round';ctx.stroke();});
    canvas.addEventListener('mouseup', ()=>{dibujando=false;});
    canvas.addEventListener('touchstart', e=>{e.preventDefault();dibujando=true;ctx.beginPath();const p=getPos(e);ctx.moveTo(p.x,p.y);});
    canvas.addEventListener('touchmove', e=>{e.preventDefault();if(!dibujando)return;const p=getPos(e);ctx.lineTo(p.x,p.y);ctx.strokeStyle='#1a1a1a';ctx.lineWidth=2;ctx.lineCap='round';ctx.stroke();});
    canvas.addEventListener('touchend', ()=>{dibujando=false;});
}

window.confirmarAprobacionQR = async (token, incId) => {
    const celular = document.getElementById('qrCelular')?.value?.trim();
    const canvas  = document.getElementById('firmaQR');
    if (!celular) { toast('⚠️ Ingresa tu número de celular'); return; }
    const firmaData = canvas ? canvas.toDataURL('image/png') : '';

    // Ubicación GPS del dispositivo del jefe
    let gps = null;
    try {
        gps = await new Promise((res,rej) => navigator.geolocation.getCurrentPosition(
            p => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => res(null), { timeout: 5000 }
        ));
    } catch(e) { gps = null; }

    try {
        await updateDoc(doc(db, 'incidencias', incId), {
            aprobado:   true,
            selladoEn:  new Date().toISOString(),
            firmaJefe:  firmaData,
            celularJefe: celular,
            gpsJefe:    gps,
            userAgent:  navigator.userAgent
        });
        await updateDoc(doc(db, 'aprobaciones', token), { usado: true });
        document.getElementById('qrContenido').innerHTML = `
          <div style="text-align:center;padding:2rem;">
            <div style="font-size:3rem;margin-bottom:.75rem;">✅</div>
            <div style="font-weight:700;font-size:1.1rem;color:#15803d;">¡Aprobado!</div>
            <div style="font-size:.82rem;color:#555;margin-top:.35rem;">Incidencia cerrada correctamente</div>
          </div>`;
    } catch(e) {
        toast('⚠️ Error al aprobar: ' + e.message);
    }
};

// ============================================
// MODALES CRUD — EMPRESAS
// ============================================
window.modalNuevaEmpresa = () => {
    showModal(`<div class="modal">
      <div class="modal-h"><h3>🏢 Nueva empresa</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <label class="fl">Nombre</label><input class="fi" id="empNombre" placeholder="Razón social">
        <label class="fl">NIT</label><input class="fi" id="empNit" placeholder="900.XXX.XXX-X">
        <label class="fl">Teléfono</label><input class="fi" id="empTel" type="tel">
        <label class="fl">Dirección</label><input class="fi" id="empDir">
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-gold" onclick="guardarEmpresa()">Guardar</button>
        </div>
      </div>
    </div>`);
};

window.guardarEmpresa = async () => {
    const nombre = document.getElementById('empNombre')?.value?.trim();
    if (!nombre) { toast('⚠️ Nombre requerido'); return; }
    try {
        await addDoc(collection(db, 'empresas'), {
            nombre,
            nit:       document.getElementById('empNit')?.value?.trim()||'',
            telefono:  document.getElementById('empTel')?.value?.trim()||'',
            direccion: document.getElementById('empDir')?.value?.trim()||'',
            creadoEn:  new Date().toISOString()
        });
        toast('✅ Empresa creada'); closeModal(); await cargarDatos();
    } catch(e) { toast('⚠️ Error: ' + e.message); }
};

window.modalEditarEmpresa = (eid) => {
    const e = getEmpresa(eid);
    showModal(`<div class="modal">
      <div class="modal-h"><h3>✏️ Editar empresa</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <label class="fl">Nombre</label><input class="fi" id="empNombre" value="${e.nombre||''}">
        <label class="fl">NIT</label><input class="fi" id="empNit" value="${e.nit||''}">
        <label class="fl">Teléfono</label><input class="fi" id="empTel" value="${e.telefono||''}">
        <label class="fl">Dirección</label><input class="fi" id="empDir" value="${e.direccion||''}">
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-gold" onclick="actualizarEmpresa('${eid}')">Actualizar</button>
        </div>
      </div>
    </div>`);
};

window.actualizarEmpresa = async (eid) => {
    try {
        await updateDoc(doc(db, 'empresas', eid), {
            nombre:    document.getElementById('empNombre')?.value?.trim()||'',
            nit:       document.getElementById('empNit')?.value?.trim()||'',
            telefono:  document.getElementById('empTel')?.value?.trim()||'',
            direccion: document.getElementById('empDir')?.value?.trim()||''
        });
        toast('✅ Empresa actualizada'); closeModal(); await cargarDatos();
    } catch(e) { toast('⚠️ Error: ' + e.message); }
};

// ============================================
// MODALES CRUD — TÉCNICOS
// ============================================
window.modalNuevoTecnico = (preEmpresaId) => {
    const empOpts = empresas.map(e => `<option value="${e.id}" ${e.id===preEmpresaId?'selected':''}>${e.nombre}</option>`).join('');
    showModal(`<div class="modal">
      <div class="modal-h"><h3>👷 Nuevo técnico</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <label class="fl">Nombre completo</label><input class="fi" id="tecNombre">
        <label class="fl">Cédula</label><input class="fi" id="tecCedula" type="number">
        <label class="fl">Teléfono</label><input class="fi" id="tecTel" type="tel">
        <label class="fl">Empresa</label><select class="fi" id="tecEmpresa">${empOpts}</select>
        <label class="fl">Clave (4 dígitos)</label><input class="fi" id="tecClave" type="password" maxlength="4" placeholder="••••">
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-gold" onclick="guardarTecnico()">Guardar</button>
        </div>
      </div>
    </div>`);
};

window.guardarTecnico = async () => {
    const nombre  = document.getElementById('tecNombre')?.value?.trim();
    const cedula  = document.getElementById('tecCedula')?.value?.trim();
    const clave   = document.getElementById('tecClave')?.value?.trim();
    const empId   = document.getElementById('tecEmpresa')?.value;
    if (!nombre||!cedula||!clave) { toast('⚠️ Nombre, cédula y clave requeridos'); return; }
    if (clave.length !== 4)       { toast('⚠️ La clave debe ser de 4 dígitos'); return; }
    const empresa = getEmpresa(empId);
    try {
        await addDoc(collection(db, 'tecnicos'), {
            nombre, cedula, clave,
            telefono:      document.getElementById('tecTel')?.value?.trim()||'',
            empresaId:     empId,
            empresaNombre: empresa?.nombre||'',
            rol:           'tecnico',
            creadoEn:      new Date().toISOString()
        });
        toast('✅ Técnico creado'); closeModal(); await cargarDatos();
    } catch(e) { toast('⚠️ Error: ' + e.message); }
};

// ============================================
// GENERAR TOKEN QR PARA APROBACION
// ============================================
window.generarQRAprobacion = async (incId) => {
    const token   = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const expira  = new Date(Date.now() + 30*60*1000).toISOString();
    try {
        await setDoc(doc(db, 'aprobaciones', token), {
            incidenciaId: incId, expira, usado: false,
            creadoEn: new Date().toISOString()
        });
        const url = `${location.origin}${location.pathname}#/aprobar/${token}`;
        showQRModal(url, token);
    } catch(e) { toast('⚠️ Error generando QR: ' + e.message); }
};

function showQRModal(url, token) {
    showModal(`<div class="modal">
      <div class="modal-h"><h3>📱 QR para jefe de tienda</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <div class="qr-container">
          <canvas id="qrCanvas"></canvas>
          <div style="font-size:.72rem;color:var(--hint);margin-top:.5rem;">Expira en 30 minutos · Un solo uso</div>
        </div>
        <div style="font-size:.72rem;color:#555;word-break:break-all;margin-top:.5rem;">${url}</div>
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cerrar</button>
        </div>
      </div>
    </div>`);
    // QR via CDN
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.onload = () => {
        new QRCode(document.getElementById('qrCanvas'), { text: url, width: 200, height: 200 });
    };
    document.head.appendChild(script);
}

// ============================================
// EXPONER AL SCOPE GLOBAL
// ============================================
window.goTo            = goTo;
window.closeModal      = closeModal;
window.cerrarSesion    = cerrarSesion;
window.abrirLogin      = abrirLogin;
window.mlPin           = mlPin;
window.mlDel           = mlDel;
window.mlLogin         = mlLogin;
window.modalNuevaIncidencia = modalNuevaIncidencia;
window.guardarIncidencia    = guardarIncidencia;
window.toggleCedi           = toggleCedi;
window.filtrarEmpresas      = window.filtrarEmpresas;

// ============================================
// INIT
// ============================================
(async () => { await cargarDatos(); })();
