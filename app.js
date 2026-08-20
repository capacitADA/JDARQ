// ============================================
// JDARQ — JD Arquisoluciones S.A.S
// NIT: 901.223.583-8 | Tel: 310 553 3937
// Contacto: Cristian David Londoño Romero
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore, collection, addDoc, getDocs, deleteDoc,
    doc, updateDoc, setDoc, getDoc, query, where, orderBy, writeBatch, runTransaction, onSnapshot
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
// CONSTANTES
// ============================================
const EMPRESA_NOMBRE   = 'JD Arquisoluciones S.A.S';
const EMPRESA_NIT      = '901.223.583-8';
const EMPRESA_TEL      = '310 553 3937';
const EMPRESA_CONTACTO = 'Cristian David Londoño Romero';
const LOGO_URL         = 'https://raw.githubusercontent.com/capacitADA/JDARQ/main/JDARQ-logo.png';
const SELLO_URL        = 'https://raw.githubusercontent.com/capacitADA/JDARQ/main/SELLO_jdarq.png';
const FUENTE_FIRMA     = 'https://raw.githubusercontent.com/capacitADA/JDARQ/main/Meddon-Regular.ttf';

const TIPOS_ASISTENCIA = ['Reparación','Garantía','Ajuste','Modificación','Servicio','Mejora','Combinación'];
const TIPOS_FALLA      = ['BPM','Daños Logísticos','Locativo','Eléctricas','Refrigeración','Seguridad','SST','Tanqueo Planta','Puertas','Influencia Externa'];
const PARAMS_EVAL = [
    { cat:'FUNCIONAMIENTO',       items:['La falla reportada fue solucionada con el trabajo realizado.'] },
    { cat:'CALIDAD',              items:['La calidad del trabajo está de acuerdo a la requerida por el personal o el equipo.'] },
    { cat:'LIMPIEZA Y ORGANIZACIÓN', items:[
        'El equipo o área intervenida se dejó armado y/o organizado como se encontraba en un inicio.',
        'Los escombros y suciedad generada por el técnico fueron retirados del lugar.',
        'Se indicó la causa de la novedad al personal que recibió el trabajo.'
    ]},
    { cat:'CAPACITACIÓN', items:[
        'Se indicó cómo prevenir que el problema se vuelva a presentar.',
        'Se indicó cómo actuar en caso de que el problema se vuelva a presentar.'
    ]},
    { cat:'SERVICIO', items:['Se encuentra satisfecho con el servicio ejecutado.'] }
];

// ============================================
// VARIABLES GLOBALES
// ============================================
let clientes    = [];
let tiendas     = [];
let equipos     = [];
let servicios   = [];
let tecnicos    = [];
let sesionActual = null;
let currentView  = 'panel';
let selectedClienteId = null;
let selectedTiendaId  = null;
let selectedEquipoId  = null;
let fotosOT = [null, null];

// ============================================
// HELPERS
// ============================================
const getCl     = id => clientes.find(c => c.id === id);
const getTienda = id => tiendas.find(t => t.id === id);
const getEq     = id => equipos.find(e => e.id === id);
const getTec    = id => tecnicos.find(t => t.id === id);
const getServiciosEquipo  = eid => servicios.filter(s => s.equipoId === eid);
const getEquiposTienda    = tid => equipos.filter(e => e.tiendaId === tid);
const getTiendasCliente   = cid => tiendas.filter(t => t.clienteId === cid);
const getServiciosCliente = cid => {
    const eids = equipos.filter(e => e.clienteId === cid).map(e => e.id);
    return servicios.filter(s => eids.includes(s.equipoId));
};

function fmtFecha(f) {
    if (!f) return '';
    try { return new Date(f + 'T12:00:00').toLocaleDateString('es-CO'); } catch(e) { return f; }
}
function esAdmin() { return sesionActual?.rol === 'admin'; }

function toast(msg, dur = 3000) {
    const t = document.getElementById('toastEl');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), dur);
}

function showModal(html) {
    const ov = document.getElementById('overlayEl');
    ov.innerHTML = html;
    ov.classList.remove('hidden');
    ov.onclick = e => { if (e.target === ov) closeModal(); };
}

function closeModal() {
    const ov = document.getElementById('overlayEl');
    ov.classList.add('hidden');
    ov.innerHTML = '';
    fotosOT = [null, null];
}

function actualizarTopbar() {
    const right = document.getElementById('topbarRight');
    if (!right) return;
    if (!sesionActual) {
        right.innerHTML = `<span class="topbar-user" id="topbarUser">Sin sesión</span>`;
        return;
    }
    const ini = sesionActual.nombre.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    right.innerHTML = `<div class="topbar-right">
        <div class="user-avatar">${ini}</div>
        <span style="font-size:.72rem;color:white;">${sesionActual.nombre.split(' ')[0]}</span>
        ${esAdmin()?'<span class="rol-badge">Admin</span>':''}
        <button class="btn-salir" onclick="cerrarSesion()">Salir</button>
    </div>`;
}

function cerrarSesion() {
    sesionActual = null;
    actualizarTopbar();
    currentView = 'panel';
    renderView();
    toast('Sesión cerrada');
}

function goTo(view, cid = null, tid = null, eid = null) {
    currentView = view;
    selectedClienteId = cid;
    selectedTiendaId  = tid;
    selectedEquipoId  = eid;
    closeModal();
    renderView();
    document.querySelectorAll('.bni').forEach(b => b.classList.toggle('active', b.dataset.page === view));
}

// ============================================
// TIEMPO REAL — SERVICIOS
// ============================================
// Se activa una sola vez. Mantiene el array 'servicios' sincronizado
// automáticamente con Firestore (aprobaciones por QR desde otro
// dispositivo, cambios de otro admin, etc.) sin recargar la página.
let servicesListenerAttached = false;
function escucharServiciosEnTiempoReal() {
    if (servicesListenerAttached) return;
    servicesListenerAttached = true;
    onSnapshot(
        query(collection(db, 'servicios'), orderBy('creadoEn', 'desc')),
        (snap) => {
            servicios = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // El modal vive en #overlayEl, aparte de #mainContent, así que
            // refrescar aquí no cierra ningún formulario abierto.
            renderView();
        },
        (err) => { console.warn('Error en listener de servicios:', err); }
    );
}

// ============================================
// CARGA DE DATOS
// ============================================
async function cargarDatos() {
    const main = document.getElementById('mainContent');
    if (main) main.innerHTML = '<div style="text-align:center;padding:2rem;"><div class="loading-spinner"></div></div>';
    try {
        const [cs, ts, es, tecs] = await Promise.all([
            getDocs(query(collection(db, 'empresas'),    orderBy('nombre'))),
            getDocs(query(collection(db, 'tiendas'),     orderBy('nombre'))),
            getDocs(collection(db, 'equipos')),
            getDocs(query(collection(db, 'tecnicos'),    orderBy('nombre')))
        ]);
        clientes  = cs.docs.map(d => ({ id: d.id, ...d.data() }));
        tiendas   = ts.docs.map(d => ({ id: d.id, ...d.data() }));
        equipos   = es.docs.map(d => ({ id: d.id, ...d.data() }));
        tecnicos  = tecs.docs.map(d => ({ id: d.id, ...d.data() }));
        if (servicios.length === 0) {
            // Primera carga: aseguramos tener datos antes de renderizar.
            const ss = await getDocs(query(collection(db, 'servicios'), orderBy('creadoEn', 'desc')));
            servicios = ss.docs.map(d => ({ id: d.id, ...d.data() }));
        }
    } catch (err) {
        if (main) main.innerHTML = `<div class="page" style="text-align:center;padding:2rem;">
            <p>Error al cargar datos</p>
            <button class="btn btn-blue" onclick="location.reload()">Reintentar</button>
        </div>`;
        return;
    }
    escucharServiciosEnTiempoReal();
    if (manejarRutaAprobacion()) return;
    if (manejarRutaTienda()) return;
    renderView();
}

// ============================================
// RENDER PRINCIPAL
// ============================================
function renderView() {
    actualizarTopbar();
    const tb = document.getElementById('topbarEl');
    const bn = document.getElementById('botnavEl');
    if(tb) tb.style.display = 'flex';
    if(bn) bn.style.display = 'flex';
    const main = document.getElementById('mainContent');
    switch (currentView) {
        case 'panel':         main.innerHTML = renderPanel();         break;
        case 'clientes':      main.innerHTML = renderClientes();      break;
        case 'detalle':       main.innerHTML = renderDetalleCliente(); break;
        case 'detalle-tienda':main.innerHTML = renderDetalleTienda(); break;
        case 'historial':     main.innerHTML = renderHistorial();     break;
        case 'servicios':     main.innerHTML = renderServicios();     break;
        case 'tecnicos':      main.innerHTML = renderTecnicos();      break;
        default: main.innerHTML = renderPanel();
    }
    document.querySelectorAll('.bni').forEach(b => b.classList.toggle('active', b.dataset.page === currentView));
}

// ============================================
// PANEL
// ============================================
function renderPanel() {
    const hoy  = new Date();
    const pref = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;

    // Estado activos
    const eqOp   = equipos.filter(e => e.estado === 'Activo' || e.estado === 'Operativo').length;
    const eqFs   = equipos.filter(e => e.estado === 'Fuera de servicio').length;
    const eqBaja = equipos.filter(e => e.estado === 'Dar de baja').length;
    const eqSin  = equipos.filter(e => !e.estado || (e.estado !== 'Activo' && e.estado !== 'Operativo' && e.estado !== 'Fuera de servicio' && e.estado !== 'Dar de baja')).length;

    // Servicios año actual
    const anio = String(hoy.getFullYear());
    const sAnio = servicios.filter(s => (s.creadoEn||s.fecha||'').startsWith(anio));
    const sMes  = servicios.filter(s => (s.creadoEn||s.fecha||'').startsWith(pref));

    const tipoCount = (lista, tipo) => lista.filter(s =>
        (s.tipoAsistencia||s.tipo||'').toLowerCase().includes(tipo.toLowerCase())
    ).length;

    const eqFuera = equipos.filter(e => e.estado === 'Fuera de servicio');

    const fila = (lbl, v) => `
        <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:.82rem;border-bottom:1px solid #f0f0f0;">
          <span>${lbl}</span>
          <strong style="color:${v>0?'var(--red)':'#16a34a'};">${v}</strong>
        </div>`;

    return `<div class="page">
<div style="background:var(--green);border-radius:10px;padding:12px 14px;margin-bottom:10px;display:flex;align-items:center;gap:10px;">
  <img src="${LOGO_URL}" onerror="this.style.display='none'" style="height:36px;border-radius:4px;">
  <div>
    <div style="color:white;font-weight:700;font-size:.95rem;">Panel Principal</div>
    <div style="color:rgba(255,255,255,.6);font-size:.72rem;">${EMPRESA_NOMBRE}</div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">

  <div style="background:white;border-radius:10px;padding:10px;border:1px solid var(--border);">
    <div style="font-size:.65rem;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:6px;">ESTADO</div>
    ${fila('Operativos', eqOp)}
    ${fila('Fuera serv.', eqFs)}
    ${fila('Dar de baja', eqBaja)}
    ${fila('Sin info', eqSin)}
  </div>

  <div style="background:white;border-radius:10px;padding:10px;border:1px solid var(--border);">
    <div style="font-size:.65rem;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:6px;">SERV. ANUAL</div>
    ${fila('Mantenm.', tipoCount(sAnio,'preventivo')+tipoCount(sAnio,'mantenimiento'))}
    ${fila('Reparación', tipoCount(sAnio,'correctivo')+tipoCount(sAnio,'reparación'))}
    ${fila('Instalación', tipoCount(sAnio,'instalacion'))}
  </div>

  <div style="background:white;border-radius:10px;padding:10px;border:1px solid var(--border);">
    <div style="font-size:.65rem;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:6px;">SERV. MES</div>
    ${fila('Mantenm.', tipoCount(sMes,'preventivo')+tipoCount(sMes,'mantenimiento'))}
    ${fila('Reparación', tipoCount(sMes,'correctivo')+tipoCount(sMes,'reparación'))}
    ${fila('Instalación', tipoCount(sMes,'instalacion'))}
  </div>

</div>

<div style="background:white;border-radius:10px;padding:.85rem;border:1px solid var(--border);margin-bottom:10px;">
  <div style="font-weight:700;font-size:.8rem;color:var(--red);margin-bottom:.5rem;">⚠️ Activos FUERA DE SERVICIO</div>
  ${eqFuera.length === 0
    ? '<div style="color:#94a3b8;font-size:.78rem;">No hay activos en este estado.</div>'
    : eqFuera.slice(0,5).map(e=>`
      <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f5f5f5;font-size:.78rem;">
        <span style="font-weight:700;">${e.tipo||e.tipo||e.nombre||'—'}</span>
        <span style="color:#555;">${e.tienda||'—'}</span>
      </div>`).join('')}
</div>

${esAdmin() && servicios.filter(s=>!s.aprobado).length ? `
<div style="background:#fff8f0;border:1.5px solid var(--gold);border-radius:10px;padding:.85rem;">
  <div style="font-weight:700;font-size:.8rem;color:var(--red);margin-bottom:.5rem;">Pendientes de aprobación (${servicios.filter(s=>!s.aprobado).length})</div>
  ${servicios.filter(s=>!s.aprobado).slice(0,3).map(s=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #f0e8d8;font-size:.78rem;">
      <span style="font-weight:700;">${s.idMtto||'—'}</span>
      <span>${s.tiendaNombre||s.tiendaCodigo||'—'}</span>
      <button class="ab" onclick="generarQRAprobacion('${s.id}')">Generar QR</button>
    </div>`).join('')}
</div>` : ''}
</div>`;
}

// ============================================
// CLIENTES
// ============================================
function renderClientes() {
    return `<div class="page">
<div class="sec-head">
  <h2>Clientes (${clientes.length})</h2>
  ${esAdmin()?`<button class="btn btn-blue btn-sm" onclick="modalNuevoCliente()">+ Nuevo</button>`:''}
</div>
<input class="search" placeholder="Buscar..." oninput="filtrarClientes(this.value)">
<div id="clientesGrid">
${clientes.map(c=>{
    const nt = getTiendasCliente(c.id).length;
    const ns = getServiciosCliente(c.id).length;
    return `<div class="cc" data-search="${(c.nombre+(c.nit||'')).toLowerCase()}">
        <div style="display:flex;justify-content:space-between;">
          <div class="cc-name">${c.nombre}</div>
          ${esAdmin()?`<div><button class="ib" onclick="modalEditarCliente('${c.id}')">✏️</button><button class="ib" onclick="eliminarCliente('${c.id}')">🗑️</button></div>`:''}
        </div>
        ${c.nit?`<div class="cc-row">NIT: ${c.nit}</div>`:''}
        ${c.telefono?`<div class="cc-row">${c.telefono}</div>`:''}
        <div class="cc-meta">${nt} tienda(s) · ${ns} incidencia(s)</div>
        <button class="link-btn" onclick="goTo('detalle','${c.id}')">Ver tiendas →</button>
    </div>`;
}).join('')}
</div>
</div>`;
}

window.filtrarClientes = v => {
    document.querySelectorAll('#clientesGrid .cc').forEach(c => {
        c.style.display = (c.dataset.search||'').includes(v.toLowerCase()) ? '' : 'none';
    });
};

// ============================================
// DETALLE CLIENTE → TIENDAS
// ============================================
function renderDetalleCliente() {
    const c = getCl(selectedClienteId);
    if (!c) { goTo('clientes'); return ''; }
    const tiendasCliente = getTiendasCliente(c.id);
    return `<div class="page">
<button class="back" onclick="goTo('clientes')">← Volver</button>
<div class="info-box">
  <div class="cc-name">${c.nombre}</div>
  ${c.nit?`<div class="cc-row">NIT: ${c.nit}</div>`:''}
  ${c.telefono?`<div class="cc-row">${c.telefono}</div>`:''}
</div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.65rem;">
  <span style="font-weight:700;">Tiendas (${tiendasCliente.length})</span>
  <input class="search" placeholder="Buscar tienda..." oninput="filtrarTiendasDetalle(this.value)" style="width:160px;margin:0;">
</div>
<div id="tiendasGrid">
${tiendasCliente.map(t=>{
    const ne = getEquiposTienda(t.id).length;
    const ns = servicios.filter(s=>getEquiposTienda(t.id).some(e=>e.id===s.equipoId)).length;
    return `<div class="ec" data-search="${(t.codigo+t.nombre+t.municipio).toLowerCase()}">
        <div class="ec-name">${t.nombre}</div>
        <div class="ec-meta">Cód: ${t.codigo} · ${t.municipio||''}, ${t.departamento||''}</div>
        ${t.latitud?`<a class="map-link" href="https://maps.google.com/?q=${t.latitud},${t.longitud}" target="_blank">Ver GPS</a>`:''}
        <div class="ec-meta">${ne} activo(s) · ${ns} incidencia(s)</div>
        <div class="ec-btns">
          <button class="ab" onclick="goTo('detalle-tienda','${c.id}','${t.id}')">Ver activos</button>
          <button class="ab" onclick="modalQRTienda('${t.id}')">QR</button>
        </div>
    </div>`;
}).join('')}
</div>
</div>`;
}

window.filtrarTiendasDetalle = v => {
    document.querySelectorAll('#tiendasGrid .ec').forEach(e => {
        e.style.display = (e.dataset.search||'').includes(v.toLowerCase()) ? '' : 'none';
    });
};

// ============================================
// DETALLE TIENDA → ACTIVOS
// ============================================
function renderDetalleTienda() {
    const t = getTienda(selectedTiendaId);
    const c = getCl(selectedClienteId);
    if (!t) { goTo('detalle', selectedClienteId); return ''; }
    const eqs = getEquiposTienda(t.id);
    return `<div class="page">
<input class="search" id="busqActivos" placeholder="🔍 Buscar activo..." oninput="filtrarActivos(this.value)" style="margin-bottom:.75rem;">
<button class="back" onclick="goTo('detalle','${c?.id}')">← ${c?.nombre||'Volver'}</button>
<div class="info-box">
  <div class="cc-name">${t.nombre}</div>
  <div class="cc-meta">Cód: ${t.codigo} · ${t.municipio||''}, ${t.departamento||''}</div>
  ${t.latitud?`<a class="map-link" href="https://maps.google.com/?q=${t.latitud},${t.longitud}" target="_blank">Ver en Google Maps</a>`:''}
</div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.65rem;">
  <span style="font-weight:700;">Activos (${eqs.length})</span>
  <div style="display:flex;gap:6px;">
    <button class="btn btn-gray btn-sm" onclick="descargarHistorialTienda('${t.id}')">Historial</button>
    ${esAdmin()?`<button class="btn btn-blue btn-sm" onclick="modalNuevoEquipo('${c?.id}','${t.id}')">+ Activo</button>`:''}
  </div>
</div>
${eqs.map(e=>{
    const ns = getServiciosEquipo(e.id).length;
    const ult = getServiciosEquipo(e.id)[0];
    return `<div class="ec" data-activo="${(e.tipo||e.nombre||'sin nombre').toLowerCase()}">
        <div style="display:flex;justify-content:space-between;">
          <div>
            <div class="ec-name">${e.tipo||e.nombre||'Sin nombre'}</div>
            ${e.descripcion?`<div class="ec-meta">${e.descripcion}</div>`:''}
            <div class="ec-meta">${ns} incidencia(s)${ult?` · Última: ${fmtFecha(ult.fecha||ult.creadoEn?.split('T')[0])}`:''}
            </div>
          </div>
          ${esAdmin()?`<div><button class="ib" onclick="modalEditarEquipo('${e.id}')">✏️</button><button class="ib" onclick="eliminarEquipo('${e.id}')">🗑️</button></div>`:''}
        </div>
        <div class="ec-btns">
          <button class="ab" onclick="goTo('historial','${c?.id}','${t.id}','${e.id}')">Incidencias</button>
          <button class="ab" onclick="modalNuevaIncidencia('${e.id}')">+ Nueva</button>
        </div>
    </div>`;
}).join('')}
</div>`;
}

window.descargarHistorialTienda = (tid) => {
    const t   = getTienda(tid);
    const eqs = getEquiposTienda(tid);
    let csv   = 'ID MTTO,Fecha,Activo,Tipo,Técnico,Aprobada\n';
    eqs.forEach(e => getServiciosEquipo(e.id).forEach(s => {
        csv += `${s.idMtto||''},${s.fecha||''},${e.tipo||e.nombre||''},${s.tipoAsistencia||''},${s.tecnico||''},${s.aprobado?'Sí':'No'}\n`;
    }));
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `Historial_${t?.nombre||tid}.csv`;
    a.click();
};

// ============================================
// HISTORIAL → INCIDENCIAS DEL ACTIVO
// ============================================
function renderHistorial() {
    const e = getEq(selectedEquipoId);
    if (!e) { goTo('detalle-tienda', selectedClienteId, selectedTiendaId); return ''; }
    const t  = getTienda(e.tiendaId || selectedTiendaId);
    const ss = getServiciosEquipo(e.id);
    return `<div class="page">
<button class="back" onclick="goTo('detalle-tienda','${selectedClienteId}','${e.tiendaId||selectedTiendaId}')">← ${t?.nombre||'Volver'}</button>
<div style="margin-bottom:.65rem;">
  <div class="ec-name">${e.tipo||e.nombre||'Sin nombre'}</div>
  ${e.descripcion?`<div class="ec-meta">${e.descripcion}</div>`:''}
</div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.65rem;">
  <span style="font-weight:700;">Incidencias (${ss.length})</span>
  <button class="btn btn-blue btn-sm" onclick="modalNuevaIncidencia('${e.id}')">+ Nueva</button>
</div>
${ss.map(s=>`
  <div class="si">
    <div class="si-top">
      <span class="badge b-gold">${s.idMtto||'—'}</span>
      <span class="badge ${s.aprobado?'b-green':'b-gold'}">${s.aprobado?'Aprobada':'Pendiente'}</span>
      <span style="font-size:.72rem;color:#94a3b8;">${fmtFecha(s.fecha||s.creadoEn?.split('T')[0])}</span>
    </div>
    <div class="si-info">${s.tiendaNombre||s.tiendaCodigo||'—'} · ${s.tipoAsistencia||'—'}</div>
    <div class="si-info">Técnico: ${s.tecnico||'—'}</div>
    ${s.descripcion?`<div class="si-info">${s.descripcion.slice(0,80)}</div>`:''}
    <div style="display:flex;gap:.4rem;margin-top:.35rem;justify-content:flex-end;">
      <button class="ab" onclick="verPDF('${s.id}')">PDF</button>
      ${esAdmin()&&!s.aprobado?`<button class="ab" onclick="generarQRAprobacion('${s.id}')">Generar QR</button>`:''}
      ${esAdmin()?`<button class="ib" onclick="eliminarServicio('${s.id}')">🗑️</button>`:''}
    </div>
  </div>`).join('')}
</div>`;
}

// ============================================
// SERVICIOS (vista global)
// ============================================
function renderServicios() {
    return `<div class="page">
<div class="sec-head"><h2>Incidencias (${servicios.length})</h2></div>
${servicios.map(s=>`
  <div class="si">
    <div class="si-top">
      <span class="badge b-gold">${s.idMtto||'—'}</span>
      <span class="badge ${s.aprobado?'b-green':'b-gold'}">${s.aprobado?'Aprobada':'Pendiente'}</span>
      <span style="font-size:.72rem;color:#94a3b8;">${fmtFecha(s.fecha||s.creadoEn?.split('T')[0])}</span>
    </div>
    <div class="si-info">${s.tiendaNombre||s.tiendaCodigo||'—'} · ${s.tipoAsistencia||'—'}</div>
    <div class="si-info">Técnico: ${s.tecnico||'—'}</div>
    <div style="display:flex;gap:.4rem;margin-top:.35rem;justify-content:flex-end;">
      <button class="ab" onclick="verPDF('${s.id}')">PDF</button>
      ${esAdmin()&&!s.aprobado?`<button class="ab" onclick="generarQRAprobacion('${s.id}')">Generar QR</button>`:''}
    </div>
  </div>`).join('')}
</div>`;
}

// ============================================
// TÉCNICOS
// ============================================
function renderTecnicos() {
    return `<div class="page">
<div class="sec-head">
  <h2>Técnicos (${tecnicos.length})</h2>
  ${esAdmin()?`<button class="btn btn-blue btn-sm" onclick="modalNuevoTecnico()">+ Nuevo</button>`:''}
</div>
${tecnicos.map(t=>{
    const activo = sesionActual?.id === t.id;
    return `<div class="ec" style="${activo?'border:2px solid var(--gold);':''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div class="ec-name">${t.nombre} ${activo?'<span class="badge b-gold">Activo</span>':''}</div>
            <div class="ec-meta">CC ${t.cedula||'—'} · ${t.telefono||'—'}</div>
            <div class="ec-meta">Cargo: ${t.cargo||'—'}</div>
          </div>
          ${esAdmin()?`<div><button class="ib" onclick="modalEditarTecnico('${t.id}')">✏️</button><button class="ib" onclick="eliminarTecnico('${t.id}')">🗑️</button></div>`:''}
        </div>
        ${!activo
          ? `<button class="btn btn-blue btn-sm" style="width:100%;margin-top:.5rem;" onclick="abrirLogin('${t.id}')">Ingresar como ${t.nombre.split(' ')[0]}</button>`
          : `<button class="btn btn-gray btn-sm" style="width:100%;margin-top:.5rem;" onclick="cerrarSesion()">Cerrar sesión</button>`}
    </div>`;
}).join('')}
</div>`;
}

// ============================================
// LOGIN TÉCNICO
// ============================================
let _pin = '';

function abrirLogin(tid) {
    const t = getTec(tid);
    _pin = '';
    showModal(`<div class="modal" style="max-width:320px;">
      <div class="modal-h"><h3>Ingresar</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <div style="font-weight:700;margin-bottom:.5rem;">${t.nombre}</div>
        <label class="fl">Cédula</label>
        <input class="fi" id="loginCed" type="number" style="margin-bottom:.65rem;">
        <label class="fl">Clave (4 dígitos)</label>
        <div class="pin-display">
          ${[0,1,2,3].map(i=>`<div class="pin-digit" id="pd${i}"></div>`).join('')}
        </div>
        <div class="numpad">
          ${[1,2,3,4,5,6,7,8,9].map(n=>`<div class="num-btn" onclick="pinNum('${tid}',${n})">${n}</div>`).join('')}
          <div class="num-btn del" onclick="pinDel()">⌫</div>
          <div class="num-btn" onclick="pinNum('${tid}',0)" style="grid-column:2;">0</div>
          <div class="num-btn ok" onclick="pinLogin('${tid}')">✓</div>
        </div>
        <div id="loginMsg"></div>
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-blue" onclick="pinLogin('${tid}')">Ingresar</button>
        </div>
      </div>
    </div>`);
    pinUpdateDisplay();
}

function pinNum(tid, n) { if (_pin.length>=4) return; _pin+=String(n); pinUpdateDisplay(); if(_pin.length===4) pinLogin(tid); }
function pinDel()        { _pin=_pin.slice(0,-1); pinUpdateDisplay(); }
function pinUpdateDisplay() {
    for(let i=0;i<4;i++){
        const d=document.getElementById('pd'+i);
        if(!d) continue;
        d.className='pin-digit';
        if(i<_pin.length)       {d.textContent='●';d.classList.add('filled');}
        else if(i===_pin.length){d.textContent='_';d.classList.add('active');}
        else {d.textContent='';}
    }
}
function pinLogin(tid) {
    const t   = getTec(tid);
    const ced = document.getElementById('loginCed')?.value?.trim();
    const msg = document.getElementById('loginMsg');
    if(!ced)           {if(msg)msg.innerHTML='<div class="login-warn">Cédula requerida</div>';return;}
    if(_pin.length<4)  {if(msg)msg.innerHTML='<div class="login-warn">Clave de 4 dígitos</div>';return;}
    if(t.cedula!==ced||t.clave!==_pin){
        if(msg)msg.innerHTML='<div class="login-error">Credenciales incorrectas</div>';
        _pin='';pinUpdateDisplay();return;
    }
    sesionActual={...t};
    _pin='';
    closeModal();
    actualizarTopbar();
    currentView='panel';
    renderView();
    toast(`Bienvenido, ${t.nombre.split(' ')[0]}`);
}

// ============================================
// MODAL NUEVA INCIDENCIA
// ============================================
function modalNuevaIncidencia(eid) {
    if(!sesionActual){toast('Debes iniciar sesión');return;}
    const e = getEq(eid);
    const t = getTienda(e?.tiendaId);
    const hoy = new Date().toISOString().split('T')[0];
    fotosOT = [null,null];

    showModal(`<div class="modal modal-wide" onclick="event.stopPropagation()">
      <div class="modal-h" style="background:#1a1a1a;border-bottom:2px solid #C9A84C;">
        <h3 style="color:#C9A84C;">Nueva Incidencia</h3>
        <button class="xbtn" style="color:white;" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-b">

        <!-- TÉCNICO -->
        <div style="background:var(--bg2);padding:8px;border-radius:var(--radius);margin-bottom:10px;">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Técnico</div>
          <div style="font-weight:700;">${sesionActual.nombre}</div>
          <div style="font-size:.76rem;color:#555;">CC ${sesionActual.cedula||'—'} · ${sesionActual.cargo||'Técnico'}</div>
        </div>

        <!-- ACTIVO -->
        <div style="background:#fffbeb;padding:8px;border-radius:var(--radius);margin-bottom:10px;border:1px solid var(--gold);">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Activo</div>
          <div style="font-weight:700;">${e?.nombre||'—'}</div>
          ${e?.descripcion?`<div style="font-size:.76rem;color:#555;">${e.descripcion}</div>`:''}
          ${t?`<div style="font-size:.76rem;color:#555;">${t.nombre} · ${t.municipio||''}</div>`:''}
        </div>

        <!-- ID MTTO Y CÓDIGO TIENDA -->
        <div class="fr">
          <div>
            <label class="fl">ID MTTO / N° Incidencia D1 ★</label>
            <input class="fi" id="otIdMtto" placeholder="246723" style="font-weight:700;font-size:1rem;">
          </div>
          <div>
            <label class="fl">Código de tienda ★</label>
            <input class="fi" id="otCodTienda" placeholder="${t?.codigo||'13116'}" value="${t?.codigo||''}" oninput="buscarTiendaOT(this.value)">
            <div id="tiendaOTInfo" style="font-size:.72rem;color:#16a34a;margin-top:2px;">${t?`✅ ${t.nombre} · ${t.municipio||''}`:''}</div>
          </div>
        </div>

        <!-- FECHA -->
        <label class="fl">Fecha</label>
        <input class="fi" type="date" id="otFecha" value="${hoy}" style="margin-bottom:10px;">

        <!-- TIPO ASISTENCIA -->
        <label class="fl">Tipo de asistencia</label>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px;margin-bottom:10px;">
          ${TIPOS_ASISTENCIA.map(t=>`<label style="display:flex;align-items:center;gap:5px;font-size:.8rem;padding:3px 6px;border:1px solid var(--border);border-radius:6px;cursor:pointer;">
            <input type="radio" name="otTipoAsist" value="${t}" ${t==='Servicio'?'checked':''}> ${t}
          </label>`).join('')}
        </div>

        <!-- TIPO FALLA -->
        <label class="fl">Tipo de falla</label>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px;margin-bottom:10px;">
          ${TIPOS_FALLA.map(f=>`<label style="display:flex;align-items:center;gap:5px;font-size:.78rem;padding:3px 6px;border:1px solid var(--border);border-radius:6px;cursor:pointer;">
            <input type="checkbox" class="otFalla" value="${f}"> ${f}
          </label>`).join('')}
        </div>

        <!-- DESCRIPCIÓN -->
        <label class="fl">Descripción detallada de la solicitud ★</label>
        <textarea class="fi" id="otDescSolicitud" rows="3" placeholder="Descripción de la solicitud..."></textarea>

        <label class="fl">Actividades ejecutadas ★</label>
        <textarea class="fi" id="otActividades" rows="3" placeholder="Actividades realizadas..."></textarea>

        <label class="fl">Repuestos cambiados</label>
        <textarea class="fi" id="otRepuestos" rows="2"></textarea>

        <label class="fl">Recomendaciones</label>
        <textarea class="fi" id="otRecomend" rows="2"></textarea>

        <!-- EVALUACIÓN -->
        <div style="background:var(--bg2);padding:6px 8px;margin:10px 0 6px;border-radius:6px;font-weight:700;font-size:.78rem;text-align:center;">EVALUACIÓN DEL SERVICIO</div>
        <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:10px;">
          <div style="display:grid;grid-template-columns:auto 50px 50px;background:#1a1a1a;color:#C9A84C;font-size:.68rem;font-weight:700;padding:4px 6px;">
            <div>Parámetro</div><div style="text-align:center;">SI</div><div style="text-align:center;">NO</div>
          </div>
          ${PARAMS_EVAL.map(p=>p.items.map((item,i)=>`
            <div style="display:grid;grid-template-columns:auto 50px 50px;border-top:1px solid var(--border);padding:4px 6px;align-items:center;background:white;">
              <div style="font-size:.7rem;">${i===0?`<strong>${p.cat}:</strong> `:''} ${item}</div>
              <div style="text-align:center;"><input type="radio" name="ev_${p.cat.replace(/\s+/g,'')}_${i}" value="SI" checked></div>
              <div style="text-align:center;"><input type="radio" name="ev_${p.cat.replace(/\s+/g,'')}_${i}" value="NO"></div>
            </div>`).join('')).join('')}
        </div>

        <!-- CALIFICACIÓN -->
        <label class="fl">Calificación del servicio</label>
        <div style="display:flex;justify-content:center;gap:24px;margin-bottom:12px;">
          ${[['Excelente'],['Bueno'],['Malo']].map(([v])=>`
            <label style="text-align:center;cursor:pointer;">
              <div style="font-size:.82rem;font-weight:700;">${v}</div>
              <input type="radio" name="otCalif" value="${v}" ${v==='Excelente'?'checked':''}  style="margin-top:4px;">
            </label>`).join('')}
        </div>

        <!-- HORAS -->
        <div class="fr">
          <div><label class="fl">Hora entrada</label><input class="fi" type="time" id="otHoraEnt"></div>
          <div><label class="fl">Hora salida</label><input class="fi" type="time" id="otHoraSal"></div>
        </div>

        <!-- FUNCIONARIO -->
        <div style="background:var(--bg2);padding:6px 8px;margin:10px 0 6px;border-radius:6px;font-weight:700;font-size:.78rem;text-align:center;">FUNCIONARIO DE LA TIENDA</div>
        <div class="fr">
          <div><label class="fl">Nombre</label><input class="fi" id="otFuncNombre"></div>
          <div><label class="fl">Cargo</label><input class="fi" id="otFuncCargo"></div>
        </div>
        <label class="fl">Teléfono</label>
        <input class="fi" id="otFuncTel" type="tel" style="margin-bottom:12px;">

        <!-- FOTOS -->
        <div style="background:var(--bg2);padding:6px 8px;margin-bottom:8px;border-radius:6px;font-weight:700;font-size:.78rem;text-align:center;">EVIDENCIAS FOTOGRÁFICAS</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
          ${[['ANTES',0],['DESPUÉS',1]].map(([lbl,i])=>`
            <div>
              <div style="font-size:.72rem;font-weight:700;text-align:center;margin-bottom:4px;">${lbl}</div>
              <div class="foto-slot" id="fslot${i}" onclick="document.getElementById('finput${i}').click()">
                <span>+ Foto</span>
                <input type="file" id="finput${i}" accept="image/*" style="display:none" onchange="previewFotoOT(this,${i})">
              </div>
            </div>`).join('')}
        </div>

        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-gray" onclick="guardarIncidencia('${eid}',false)">💾 Guardar</button>
          <button class="btn btn-blue" onclick="guardarIncidencia('${eid}',true)">📄 Guardar y PDF</button>
        </div>
      </div>
    </div>`);

}

window.buscarTiendaOT = (cod) => {
    const info = document.getElementById('tiendaOTInfo');
    if(!info) return;
    const t = tiendas.find(x=>x.codigo===cod.trim().toUpperCase());
    info.textContent = t ? `✅ ${t.nombre} · ${t.municipio||''}` : cod.length>3 ? '' : '';
    info.style.color = t ? '#16a34a' : '#94a3b8';
};

function iniciarFirmaCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if(!canvas) return;
    canvas.width  = canvas.offsetWidth||340;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    let drawing=false, lx=0, ly=0;
    const pos = ev => { const r=canvas.getBoundingClientRect(); const s=ev.touches?ev.touches[0]:ev; return [s.clientX-r.left,s.clientY-r.top]; };
    canvas.addEventListener('mousedown',  e=>{drawing=true;[lx,ly]=pos(e);});
    canvas.addEventListener('mousemove',  e=>{if(!drawing)return;const[x,y]=pos(e);ctx.beginPath();ctx.moveTo(lx,ly);ctx.lineTo(x,y);ctx.strokeStyle='#1a1a6e';ctx.lineWidth=2;ctx.lineCap='round';ctx.stroke();[lx,ly]=[x,y];});
    canvas.addEventListener('mouseup',    ()=>drawing=false);
    canvas.addEventListener('mouseleave', ()=>drawing=false);
    canvas.addEventListener('touchstart', e=>{e.preventDefault();drawing=true;[lx,ly]=pos(e);},{passive:false});
    canvas.addEventListener('touchmove',  e=>{e.preventDefault();if(!drawing)return;const[x,y]=pos(e);ctx.beginPath();ctx.moveTo(lx,ly);ctx.lineTo(x,y);ctx.strokeStyle='#1a1a6e';ctx.lineWidth=2;ctx.lineCap='round';ctx.stroke();[lx,ly]=[x,y];},{passive:false});
    canvas.addEventListener('touchend',   ()=>drawing=false);
}

window.limpiarFirmaOT = () => { const c=document.getElementById('firmaOTCanvas'); if(c) c.getContext('2d').clearRect(0,0,c.width,c.height); };

window.previewFotoOT = (input, idx) => {
    const file=input.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=e=>{
        fotosOT[idx]=e.target.result;
        const slot=document.getElementById(`fslot${idx}`);
        if(slot) slot.innerHTML=`<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius);">`;
    };
    reader.readAsDataURL(file);
};

// ============================================
// GUARDAR INCIDENCIA
// ============================================
function comprimirImagen(base64, maxW=800, calidad=0.7) {
    return new Promise(res => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if(w > maxW) { h = h * maxW / w; w = maxW; }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            res(canvas.toDataURL('image/jpeg', calidad));
        };
        img.src = base64;
    });
}

async function guardarIncidencia(eid, generarPDF) {
    const idMtto     = document.getElementById('otIdMtto')?.value?.trim();
    const codTienda  = document.getElementById('otCodTienda')?.value?.trim().toUpperCase();
    const fecha      = document.getElementById('otFecha')?.value;
    const tipoAsist  = document.querySelector('input[name="otTipoAsist"]:checked')?.value||'';
    const fallas     = Array.from(document.querySelectorAll('.otFalla:checked')).map(cb=>cb.value);
    const descSolic  = document.getElementById('otDescSolicitud')?.value?.trim();
    const actividades= document.getElementById('otActividades')?.value?.trim();
    const repuestos  = document.getElementById('otRepuestos')?.value?.trim()||'';
    const recomend   = document.getElementById('otRecomend')?.value?.trim()||'';
    const calif      = document.querySelector('input[name="otCalif"]:checked')?.value||'Excelente';
    const horaEnt    = document.getElementById('otHoraEnt')?.value||'';
    const horaSal    = document.getElementById('otHoraSal')?.value||'';
    const funcNombre = document.getElementById('otFuncNombre')?.value?.trim()||'';
    const funcCargo  = document.getElementById('otFuncCargo')?.value?.trim()||'';
    const funcTel    = document.getElementById('otFuncTel')?.value?.trim()||'';

    if(!sesionActual) {toast('⚠️ Debes iniciar sesión primero');return;}
    if(!idMtto)      {toast('⚠️ Ingresa el ID MTTO / N° Incidencia');return;}
    if(!codTienda)   {toast('⚠️ Ingresa el código de tienda');return;}
    if(!descSolic)   {toast('⚠️ Completa la descripción de la solicitud');return;}
    if(!actividades) {toast('⚠️ Completa las actividades ejecutadas');return;}

    const tienda = tiendas.find(x=>x.codigo===codTienda);
    const e      = getEq(eid);
    const fotosRaw = fotosOT.filter(Boolean);
    const fotos = await Promise.all(fotosRaw.map(f => comprimirImagen(f, 800, 0.6)));

    const payload = {
        equipoId:   eid,
        equipoNombre: e?.nombre||'',
        tiendaId:   tienda?.id||e?.tiendaId||'',
        clienteId:  e?.clienteId||'',
        idMtto, fecha, tipoAsistencia: tipoAsist,
        tiposFalla: fallas,
        descripcion: descSolic, actividades, repuestos, recomendaciones: recomend,
        calificacion: calif, horaEntrada: horaEnt, horaSalida: horaSal,
        funcNombre, funcCargo, funcTel,
        tiendaCodigo: codTienda,
        tiendaNombre: tienda?.nombre||'',
        tiendaMunicipio: tienda?.municipio||'',
        tiendaDepartamento: tienda?.departamento||'',
        tecnico: sesionActual?.nombre||'',
        tecnicoCedula: sesionActual?.cedula||'',
        tecnicoCargo:  sesionActual?.cargo||'Técnico',
        firmaJefe: '',
        fotos,
        aprobado: false,
        pendienteAprobacion: true,
        creadoEn: new Date().toISOString()
    };

    try {
        const docRef = await addDoc(collection(db,'servicios'), payload);
        const sid = docRef.id;
        toast('✅ Incidencia guardada: ' + idMtto);
        fotosOT = [null,null];
        closeModal();
        await cargarDatos();
        setTimeout(()=>{
            showModal(`<div class="modal" style="max-width:320px;">
              <div class="modal-h" style="background:#1a1a1a;border-bottom:2px solid #C9A84C;"><h3 style="color:#C9A84C;">✅ ${idMtto} guardada</h3><button class="xbtn" style="color:white;" onclick="closeModal()">✕</button></div>
              <div class="modal-b" style="text-align:center;padding:1.25rem;">
                <p style="font-size:.85rem;margin-bottom:1rem;">Muestra este QR al jefe de tienda para que apruebe y firme.</p>
                <button class="btn" style="background:#C9A84C;color:#1a1a1a;font-weight:700;width:100%;margin-bottom:.5rem;padding:.65rem;border:none;border-radius:10px;cursor:pointer;font-size:.9rem;" onclick="generarQRAprobacion('${sid}');closeModal();">📱 Generar QR de aprobación</button>
                <button class="btn btn-gray" style="width:100%;" onclick="closeModal()">Después</button>
              </div>
            </div>`);
        }, 400);
    } catch(err) {
        console.error('Error guardando incidencia:', err);
        toast('⚠️ Error: '+err.message);
    }
}

// ============================================
// PDF
// ============================================
async function generarPDFOrden(s) {
    // 1. La firma y los datos de aprobación viven SOLO en 'aprobaciones'.
    //    Solo se consultan si el servicio está realmente aprobado.
    let firmaJefe = '';
    let aprobacionData = null;
    if (s.aprobado) {
        try {
            const apQ = query(collection(db,'aprobaciones'), where('servicioId','==', s.id));
            const apSnap = await getDocs(apQ);
            // Si hubiera más de un registro de aprobación para el mismo servicio,
            // se toma el más reciente (usado:true y con firma presente).
            const apDoc = apSnap.docs.find(d => d.data().firmaJefeQR) || apSnap.docs[0];
            if (apDoc) {
                aprobacionData = apDoc.data();
                firmaJefe = aprobacionData.firmaJefeQR || '';
            }
        } catch(e) {
            console.warn('Error cargando datos de aprobación:', e);
        }
    }
    // Si el servicio está marcado como aprobado pero no hay firma real en
    // 'aprobaciones', se trata como NO aprobado para efectos del sello/PDF.
    const aprobadoConFirma = !!(s.aprobado && firmaJefe);

    // 2. Generar firma del técnico con Meddon como imagen PNG
    let firmaTecBase64 = '';
    try {
        const font = new FontFace('Meddon', 'url(https://raw.githubusercontent.com/capacitADA/JDARQ/main/Meddon-Regular.ttf)');
        await font.load();
        document.fonts.add(font);
        const c = document.createElement('canvas');
        c.width = 340; c.height = 70;
        const ctx = c.getContext('2d');
        ctx.font = '32px Meddon';
        ctx.fillStyle = '#1a1a6e';
        ctx.fillText(s.tecnico||'', 10, 48);
        firmaTecBase64 = c.toDataURL('image/png');
    } catch(e) { console.warn('Meddon no cargó:', e); firmaTecBase64 = ''; }

    // Meddon se carga directamente en el @font-face del HTML
    const e   = getEq(s.equipoId);
    const hoy = new Date(s.creadoEn||Date.now());
    const dd  = String(hoy.getDate()).padStart(2,'0');
    const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const mes = MESES[hoy.getMonth()];
    const aa  = String(hoy.getFullYear());

    let selloBase64 = '';
    if(aprobadoConFirma){
        try { selloBase64 = await cargarImgBase64(SELLO_URL); } catch(e) {}
    }

    function chk(val, lista) {
        return (lista||[]).includes(val)
            ? '<span style="display:inline-block;min-width:13px;height:13px;line-height:13px;padding:0 1px;background:#000;color:#fff;font-weight:900;font-size:9pt;text-align:center;border-radius:2px;">X</span>'
            : '<span style="display:inline-block;min-width:13px;height:13px;border:1px solid #999;border-radius:2px;">&nbsp;</span>';
    }

    const lineas = (txt, n) => {
        const arr = (txt||'').split('\n').concat(Array(n).fill('')).slice(0,n);
        return arr.map((t,i)=>`<tr style="height:15px;border-bottom:${i===n-1?'2px':'1px'} solid ${i===n-1?'#000':'#ccc'};"><td style="padding:1px 4px;font-size:8pt;">${t}&nbsp;</td></tr>`).join('');
    };

    const evalRows = PARAMS_EVAL.map(p=>p.items.map((item,i)=>`
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:2px 5px;font-size:7pt;width:80px;">${i===0?`<strong>${p.cat}</strong>`:''}</td>
          <td style="padding:2px 5px;font-size:7pt;">${item}</td>
          <td style="text-align:center;font-size:8pt;">X</td>
          <td style="text-align:center;font-size:8pt;">&nbsp;</td>
        </tr>`).join('')).join('');

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>OT_${s.idMtto||''}</title>
<style>
@font-face{font-family:'Meddon';src:url('https://raw.githubusercontent.com/capacitADA/JDARQ/main/Meddon-Regular.ttf') format('truetype');}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,sans-serif;background:#fff;padding:7px;font-size:8pt;width:794px;}
.blk{border:2px solid #000;border-collapse:collapse;width:100%;margin-top:-2px;}
.blk td,.blk th{border:1px solid #000;padding:2px 5px;vertical-align:middle;font-size:7.5pt;}
.hd{font-weight:700;text-align:center;font-size:8.5pt;padding:3px;background:#eee;}
.lbl{font-weight:700;white-space:nowrap;width:1%;}
</style></head><body>

<table style="width:100%;border-collapse:collapse;border:2px solid #000;margin-bottom:-2px;">
<tr>
  <td style="width:70px;text-align:center;padding:4px;border-right:1px solid #000;">
    <img src="${LOGO_URL}" style="height:40px;" crossorigin="anonymous" onerror="this.style.display='none'">
  </td>
  <td style="text-align:center;font-weight:700;font-size:10pt;">ORDEN DE TRABAJO MANTENIMIENTO</td>
</tr>
</table>

<table class="blk">
  <tr><td colspan="4" class="hd">INFORMACIÓN CONTRATISTA</td></tr>
  <tr>
    <td class="lbl" style="width:20%;">Razón Social:</td>
    <td style="width:30%;">${EMPRESA_NOMBRE}</td>
    <td class="lbl" style="width:12%;">N° NIT:</td>
    <td>${EMPRESA_NIT}</td>
  </tr>
  <tr>
    <td class="lbl">Contacto:</td>
    <td>${EMPRESA_CONTACTO}</td>
    <td class="lbl">Teléfono:</td>
    <td>${EMPRESA_TEL}</td>
  </tr>
</table>

<table class="blk">
  <tr><td colspan="6" class="hd">INFORMACIÓN SOLICITANTE Y TIENDA D1</td></tr>
  <tr>
    <td class="lbl" style="width:17%;">Nombre tienda:</td>
    <td style="width:20%;">${s.tiendaNombre||''}</td>
    <td class="lbl" style="width:13%;">Cód. Tienda:</td>
    <td style="width:12%;">${s.tiendaCodigo||''}</td>
    <td class="lbl" style="width:13%;">ID Incidencia:</td>
    <td style="width:25%;">${s.idMtto||''}</td>
  </tr>
  <tr>
    <td class="lbl">Nombre solicitante:</td>
    <td>${s.funcNombre||''}</td>
    <td class="lbl">Activo:</td>
    <td>${s.equipoNombre||e?.tipo||e?.nombre||''}</td>
    <td class="lbl">Fecha:</td>
    <td>${dd}/${mes.slice(0,3)}/${aa}</td>
  </tr>
  <tr>
    <td class="lbl">Ciudad:</td>
    <td>${s.tiendaMunicipio||''}</td>
    <td class="lbl">Departamento:</td>
    <td colspan="3">${s.tiendaDepartamento||''}</td>
  </tr>
</table>

<table class="blk">
  <tr><td colspan="8" class="hd">TIPO DE ASISTENCIA (Marque con una X)</td></tr>
  <tr>${TIPOS_ASISTENCIA.map(t=>`<td style="text-align:center;font-size:7pt;">${t} ${chk(t,[s.tipoAsistencia])}</td>`).join('')}</tr>
</table>

<table class="blk">
  <tr><td colspan="5" class="hd">TIPO DE FALLA (Marque con una X)</td></tr>
  <tr>${TIPOS_FALLA.slice(0,5).map(f=>`<td style="text-align:center;font-size:7pt;">${f} ${chk(f,s.tiposFalla)}</td>`).join('')}</tr>
  <tr>${TIPOS_FALLA.slice(5).map(f=>`<td style="text-align:center;font-size:7pt;">${f} ${chk(f,s.tiposFalla)}</td>`).join('')}</tr>
</table>

<table class="blk"><tr><td class="hd">Descripción detallada de la solicitud:</td></tr></table>
<table style="width:100%;border-collapse:collapse;border-left:2px solid #000;border-right:2px solid #000;">${lineas(s.descripcion,3)}</table>

<table class="blk"><tr><td class="hd">Actividades ejecutadas:</td></tr></table>
<table style="width:100%;border-collapse:collapse;border-left:2px solid #000;border-right:2px solid #000;">${lineas(s.actividades,4)}</table>

<table class="blk"><tr><td class="hd">Repuestos cambiados:</td></tr></table>
<table style="width:100%;border-collapse:collapse;border-left:2px solid #000;border-right:2px solid #000;">${lineas(s.repuestos,2)}</table>

<table class="blk"><tr><td class="hd">Recomendaciones:</td></tr></table>
<table style="width:100%;border-collapse:collapse;border-left:2px solid #000;border-right:2px solid #000;">${lineas(s.recomendaciones,2)}</table>

<table class="blk">
  <tr><td colspan="4" class="hd">EVALUACIÓN DEL SERVICIO</td></tr>
  <tr>
    <th style="width:80px;font-size:7pt;">Parámetro</th>
    <th style="font-size:7pt;">Descripción</th>
    <th style="width:30px;text-align:center;font-size:7pt;">SI</th>
    <th style="width:30px;text-align:center;font-size:7pt;">NO</th>
  </tr>
  ${evalRows}
</table>

<table class="blk">
  <tr><td colspan="4" class="hd">CALIFICA MI SERVICIO (Marque con una X)</td></tr>
  <tr>
    ${[
      {v:'Excelente', face:'<circle cx="17" cy="17" r="15" fill="#fff" stroke="#000" stroke-width="1.6"/><circle cx="11" cy="14" r="1.6" fill="#000"/><circle cx="23" cy="14" r="1.6" fill="#000"/><path d="M9 20 Q17 27 25 20" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round"/>'},
      {v:'Bueno', face:'<circle cx="17" cy="17" r="15" fill="#fff" stroke="#000" stroke-width="1.6"/><circle cx="11" cy="14" r="1.6" fill="#000"/><circle cx="23" cy="14" r="1.6" fill="#000"/><line x1="9" y1="22" x2="25" y2="22" stroke="#000" stroke-width="1.6" stroke-linecap="round"/>'},
      {v:'Malo', face:'<circle cx="17" cy="17" r="15" fill="#fff" stroke="#000" stroke-width="1.6"/><circle cx="11" cy="14" r="1.6" fill="#000"/><circle cx="23" cy="14" r="1.6" fill="#000"/><path d="M9 24 Q17 17 25 24" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round"/>'}
    ].map(o=>{
      const marcado = s.calificacion===o.v;
      return `<td style="text-align:center;width:22%;padding:5px 2px;">
        <div style="display:inline-block;padding:3px;border-radius:50%;${marcado?'border:2.5px solid #c0392b;':'border:2.5px solid transparent;'}">
          <svg width="34" height="34" viewBox="0 0 34 34">${o.face}</svg>
        </div>
        <div style="font-size:7.5pt;font-weight:${marcado?'900':'400'};margin-top:1px;">${o.v} ${marcado?'<span style="color:#c0392b;">✔</span>':''}</div>
      </td>`;
    }).join('')}
    <td style="width:34%;font-size:6.3pt;text-align:left;padding:4px 6px;vertical-align:middle;border-left:2px solid #000;">
      Cualquier queja, reclamo o sugerencia comuníquese con el área de mantenimiento. No olvide calificar el servicio.
    </td>
  </tr>
</table>

<table class="blk">
  <tr><td colspan="7" class="hd">CONSTANCIA DE ASISTENCIA REALIZADA</td></tr>
  <tr>
    <th style="font-size:7pt;width:22%;">Datos</th>
    <th style="font-size:7pt;width:14%;">Contratistas</th>
    <th style="font-size:7pt;width:11%;">Cédula</th>
    <th style="font-size:7pt;width:10%;">H. Entrada</th>
    <th style="font-size:7pt;width:10%;">H. Salida</th>
    <th style="font-size:7pt;width:33%;" colspan="2">Funcionario de la tienda</th>
  </tr>
  <tr style="height:20px;">
    <td style="font-size:7pt;">${s.tecnico||''}</td>
    <td style="font-size:7pt;">${s.tecnicoCargo||'Técnico'}</td>
    <td style="font-size:7pt;text-align:center;">${s.tecnicoCedula||''}</td>
    <td style="font-size:7pt;text-align:center;">${s.horaEntrada||''}</td>
    <td style="font-size:7pt;text-align:center;">${s.horaSalida||''}</td>
    <td style="font-size:7pt;">Nombre:</td>
    <td style="font-size:7pt;">${s.funcNombre||''}</td>
  </tr>
  <tr style="height:18px;">
    <td></td><td></td><td></td><td></td><td></td>
    <td style="font-size:7pt;">Teléfono:</td>
    <td style="font-size:7pt;">${s.funcTel||''}</td>
  </tr>
  <tr style="height:18px;">
    <td></td><td></td><td></td><td></td><td></td>
    <td style="font-size:7pt;">Cargo:</td>
    <td style="font-size:7pt;">${s.funcCargo||''}</td>
  </tr>
  <tr>
    <td colspan="4" style="padding:4px;height:65px;vertical-align:bottom;text-align:center;">
      ${firmaTecBase64
        ? `<img src="${firmaTecBase64}" style="height:42px;display:block;">`
        : `<div style="font-family:'Meddon',cursive;font-size:15pt;color:#1a1a6e;">${s.tecnico||''}</div>`}
      <div style="border-top:1px solid #000;margin-top:2px;font-size:6.5pt;font-weight:700;">Firma Técnico Encargado / Cargo: ${s.tecnicoCargo||'Técnico'}</div>
    </td>
    <td colspan="3" style="padding:4px;height:65px;vertical-align:middle;text-align:center;position:relative;">
      ${aprobadoConFirma
        ? `<div style="position:relative;display:inline-block;">
             <img src="${selloBase64}" style="max-height:50px;display:block;">
             <img src="${firmaJefe}" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-height:36px;max-width:105px;">
           </div>`
        : '<div style="color:#aaa;font-size:7pt;">Pendiente de aprobación</div>'}
    </td>
  </tr>
</table>


<div style="font-size:6pt;color:#c0392b;text-align:center;margin-top:6px;font-style:italic;">
Nota: Se debe diligenciar los campos de firma clara y legible, sin tachones ni enmendados; este documento debe entregarse diligenciado en su totalidad de lo contrario no será válido.
</div>
</body></html>`;

    toast('Generando PDF...');
    try {
        if(!window.html2canvas) await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        if(!window.jspdf)       await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

        // HTML página 1 — es el acta completa (las fotos van aparte, en html2)
        const html1 = html;

        // HTML página 2 — solo fotos
        const html2 = s.fotos?.filter(Boolean).length ? `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;background:#fff;padding:16px;width:794px;}table{width:100%;border-collapse:collapse;}</style>
</head><body>
<table style="margin-bottom:8px;">
  <tr><td style="background:#1a1a1a;color:#C9A84C;font-weight:700;text-align:center;font-size:9pt;padding:5px;border:2px solid #000;">EVIDENCIAS FOTOGRÁFICAS — OT ${s.idMtto||''} · ${s.tiendaNombre||s.tiendaCodigo||''}</td></tr>
</table>
<table style="width:100%;border-collapse:collapse;">
  <tr>
    <td style="width:50%;font-weight:700;font-size:8pt;text-align:center;padding:4px;border:2px solid #000;background:#f5f5f5;">ANTES</td>
    <td style="width:50%;font-weight:700;font-size:8pt;text-align:center;padding:4px;border:2px solid #000;background:#f5f5f5;">DESPUÉS</td>
  </tr>
  <tr>
    <td style="height:260px;text-align:center;vertical-align:middle;padding:10px;border:2px solid #000;">
      ${s.fotos[0]?`<img src="${s.fotos[0]}" style="max-width:100%;max-height:240px;object-fit:contain;display:block;margin:0 auto;">`:'<span style="color:#bbb;font-size:7pt;">Sin foto</span>'}
    </td>
    <td style="height:260px;text-align:center;vertical-align:middle;padding:10px;border:2px solid #000;">
      ${s.fotos[1]?`<img src="${s.fotos[1]}" style="max-width:100%;max-height:240px;object-fit:contain;display:block;margin:0 auto;">`:'<span style="color:#bbb;font-size:7pt;">Sin foto</span>'}
    </td>
  </tr>
</table>
<div style="margin-top:6px;font-size:7pt;color:#555;text-align:center;">Técnico: ${s.tecnico||''} · CC ${s.tecnicoCedula||''} · Fecha: ${s.fecha||''}</div>
</body></html>` : null;

        const renderHtml = async (htmlStr) => {
            const iframe = document.createElement('iframe');
            iframe.style.cssText='position:fixed;left:-9999px;top:0;width:794px;height:1400px;border:none;';
            document.body.appendChild(iframe);
            iframe.contentDocument.open();
            iframe.contentDocument.write(htmlStr);
            iframe.contentDocument.close();
            await new Promise(r=>setTimeout(r,1500));
            const c = await window.html2canvas(iframe.contentDocument.body,{scale:1.8,backgroundColor:'#fff',useCORS:true,allowTaint:true,logging:false,windowWidth:794});
            document.body.removeChild(iframe);
            return c;
        };

        const {jsPDF} = window.jspdf;
        const pdf = new jsPDF({unit:'mm',format:'a4',orientation:'portrait'});
        const PAGE_W = 210, PAGE_H = 297;

        // Agrega una imagen a la página actual escalada a A4 SIN deformarla.
        // Si es más alta que la página, se reduce ancho y alto en la misma
        // proporción (nunca se recorta solo la altura, que era lo que
        // aplastaba/deformaba el contenido).
        function addImageFitPage(pdfDoc, canvas) {
            let w = PAGE_W;
            let h = (canvas.height * w) / canvas.width;
            if (h > PAGE_H) {
                const escala = PAGE_H / h;
                h = PAGE_H;
                w = w * escala;
            }
            const x = (PAGE_W - w) / 2;
            const y = 0;
            pdfDoc.addImage(canvas.toDataURL('image/jpeg', 0.82), 'JPEG', x, y, w, h);
        }

        // Página 1
        const c1 = await renderHtml(html1);
        addImageFitPage(pdf, c1);

        // Página de fotos — siempre en página nueva
        if(html2) {
            pdf.addPage();
            const c2 = await renderHtml(html2);
            addImageFitPage(pdf, c2);
        }

        pdf.save(`OT_${s.idMtto||s.id||'JD'}_${s.tiendaCodigo||''}.pdf`);
        toast('✅ PDF descargado');
    } catch(err) {
        console.error(err);
        const blob=new Blob([html],{type:'text/html;charset=utf-8'});
        const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
        a.download=`OT_${s.idMtto||'JD'}.html`; a.click();
        toast('PDF no disponible — descargado como HTML');
    }
}

async function verPDF(sid) {
    const s = servicios.find(x=>x.id===sid);
    if(s) await generarPDFOrden(s);
}

function cargarScript(src) {
    return new Promise((res,rej)=>{
        if(document.querySelector(`script[src="${src}"]`)){res();return;}
        const s=document.createElement('script');
        s.src=src;s.onload=res;s.onerror=rej;
        document.head.appendChild(s);
    });
}

function cargarImgBase64(url) {
    return new Promise((res,rej)=>{
        const img=new Image();img.crossOrigin='Anonymous';
        img.onload=()=>{
            const c=document.createElement('canvas');
            c.width=img.width;c.height=img.height;
            c.getContext('2d').drawImage(img,0,0);
            res(c.toDataURL('image/png'));
        };
        img.onerror=rej;img.src=url;
    });
}

// ============================================
// (Se eliminó la aprobación manual de admin sin firma.
// Toda aprobación válida debe pasar por el flujo de QR
// firmado por el jefe de tienda: generarQRAprobacion /
// confirmarAprobacionQR.)
// ============================================

window.eliminarServicio = async (sid) => {
    if(!confirm('¿Eliminar esta incidencia?')) return;
    try { await deleteDoc(doc(db,'servicios',sid)); toast('Incidencia eliminada'); await cargarDatos(); }
    catch(e){toast('Error: '+e.message);}
};

// ============================================
// QR APROBACIÓN — JEFE DE TIENDA
// ============================================
window.generarQRAprobacion = async (sid) => {
    const token  = Math.random().toString(36).slice(2)+Date.now().toString(36);
    const expira = new Date(Date.now()+30*60*1000).toISOString();
    try {
        await setDoc(doc(db,'aprobaciones',token),{servicioId:sid,expira,usado:false,creadoEn:new Date().toISOString()});
        const url = `${location.origin}${location.pathname}#/aprobar/${token}`;
        showModal(`<div class="modal" style="max-width:340px;">
          <div class="modal-h" style="background:#1a1a1a;border-bottom:2px solid #C9A84C;">
            <h3 style="color:#C9A84C;">QR para jefe de tienda</h3>
            <button class="xbtn" style="color:white;" onclick="closeModal()">✕</button>
          </div>
          <div class="modal-b" style="text-align:center;">
            <p style="font-size:.78rem;color:#555;margin-bottom:.75rem;">Muestra este QR al jefe de tienda para que apruebe desde su celular</p>
            <div id="qrRender" style="display:inline-block;margin-bottom:.5rem;"></div>
            <div style="font-size:.68rem;color:#94a3b8;margin-bottom:.75rem;">Expira en 30 min · Un solo uso</div>
            <div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cerrar</button></div>
          </div>
        </div>`);
        cargarScript('https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js').then(()=>{
            if(window.QRCode) new window.QRCode(document.getElementById('qrRender'),{text:url,width:220,height:220});
        });
    } catch(e){toast('Error generando QR: '+e.message);}
};

function manejarRutaAprobacion() {
    const hash=window.location.hash;
    if(!hash.startsWith('#/aprobar/')) return false;
    const token=hash.replace('#/aprobar/','');
    document.getElementById('botnavEl').style.display='none';
    const main=document.getElementById('mainContent');
    main.innerHTML=`<div style="max-width:420px;margin:0 auto;padding:1rem;">
      <div style="background:var(--green);color:white;border-radius:12px;padding:14px;margin-bottom:12px;border-bottom:3px solid var(--gold);text-align:center;">
        <img src="${LOGO_URL}" style="height:40px;margin-bottom:8px;" onerror="this.style.display='none'">
        <div style="color:#C9A84C;font-weight:700;">Aprobación de servicio</div>
      </div>
      <div id="aprobContenido"><div style="text-align:center;padding:2rem;color:#94a3b8;">Cargando...</div></div>
    </div>`;
    cargarAprobacionQR(token);
    return true;
}

async function cargarAprobacionQR(token) {
    const cont=document.getElementById('aprobContenido');
    try {
        const snap=await getDoc(doc(db,'aprobaciones',token));
        if(!snap.exists()){cont.innerHTML='<div style="background:#fee2e2;color:#991b1b;padding:1rem;border-radius:8px;">Link inválido o expirado</div>';return;}
        const data=snap.data();
        if(data.usado){cont.innerHTML='<div style="background:#fee2e2;color:#991b1b;padding:1rem;border-radius:8px;">Este link ya fue utilizado</div>';return;}
        if(new Date(data.expira)<new Date()){cont.innerHTML='<div style="background:#fee2e2;color:#991b1b;padding:1rem;border-radius:8px;">Este link expiró</div>';return;}
        const sSnap=await getDoc(doc(db,'servicios',data.servicioId));
        if(!sSnap.exists()){cont.innerHTML='<div style="background:#fee2e2;color:#991b1b;padding:1rem;border-radius:8px;">Servicio no encontrado</div>';return;}
        const s={id:sSnap.id,...sSnap.data()};
        cont.innerHTML=`
          <div style="background:white;border-radius:10px;padding:12px;border:1px solid #e0e0e0;margin-bottom:12px;">
            <div style="font-weight:700;font-size:.9rem;margin-bottom:6px;color:var(--gold);">Orden ${s.idMtto||'—'}</div>
            <div style="font-size:.78rem;color:#555;">${s.tiendaNombre||s.tiendaCodigo||'—'}</div>
            <div style="font-size:.78rem;color:#555;">${fmtFecha(s.fecha||s.creadoEn?.split('T')[0])}</div>
            <div style="font-size:.78rem;color:#555;">Técnico: ${s.tecnico||'—'}</div>
            <div style="font-size:.78rem;color:#555;margin-top:4px;">${(s.actividades||'').slice(0,120)}</div>
          </div>
          <div style="background:white;border-radius:10px;padding:12px;border:1px solid #e0e0e0;margin-bottom:12px;">
            <label style="display:block;font-size:.7rem;font-weight:700;color:#555;text-transform:uppercase;margin-bottom:4px;">Tu número de celular</label>
            <input id="jefeCel" type="tel" placeholder="3XX XXX XXXX" style="width:100%;border:1.5px solid #e0e0e0;border-radius:8px;padding:.5rem .75rem;font-size:.9rem;margin-bottom:10px;">
            <label style="display:block;font-size:.7rem;font-weight:700;color:#555;text-transform:uppercase;margin-bottom:4px;">Tu firma</label>
            <canvas id="firmaJefeQR" width="340" height="110" style="width:100%;height:110px;border:2px dashed #e0e0e0;border-radius:8px;background:white;touch-action:none;display:block;"></canvas>
            <button onclick="document.getElementById('firmaJefeQR').getContext('2d').clearRect(0,0,1000,300)" style="background:none;border:1px solid #e0e0e0;border-radius:6px;padding:4px 10px;font-size:.72rem;margin-top:4px;cursor:pointer;">Limpiar</button>
          </div>
          <div style="font-size:.7rem;color:#94a3b8;margin-bottom:12px;">Al firmar confirmas que el servicio fue realizado a satisfacción. Tu celular, firma y ubicación quedan registrados.</div>
          <button onclick="confirmarAprobacionQR('${token}','${s.id}')" style="background:#C9A84C;color:#1a1a1a;font-weight:700;border:none;border-radius:10px;padding:.85rem;width:100%;font-size:.95rem;cursor:pointer;">✅ Aprobar y firmar</button>`;
        setTimeout(()=>iniciarFirmaCanvas('firmaJefeQR'),100);
    } catch(e){cont.innerHTML=`<div style="background:#fee2e2;color:#991b1b;padding:1rem;border-radius:8px;">Error: ${e.message}</div>`;}
}

window.confirmarAprobacionQR = async (token,sid) => {
    const cel=document.getElementById('jefeCel')?.value?.trim();
    const canvas=document.getElementById('firmaJefeQR');
    if(!cel){alert('Ingresa tu número de celular');return;}
    const firma=canvas&&canvas.width>0?canvas.toDataURL('image/png'):'';
    let gps=null;
    try{gps=await new Promise(res=>navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lng:p.coords.longitude}),()=>res(null),{timeout:5000}));}catch(e){}
    const aprobadoEn = new Date().toISOString();
    try {
        // Datos sensibles (firma, celular, gps, dispositivo) SOLO en 'aprobaciones'.
        await updateDoc(doc(db,'aprobaciones',token),{
            usado:true,
            firmaJefeQR:firma,
            celularJefe:cel,
            gpsJefe:gps,
            userAgentJefe:navigator.userAgent,
            aprobadoEn
        });
        // 'servicios' solo guarda el estado, sin datos personales.
        await updateDoc(doc(db,'servicios',sid),{aprobado:true,pendienteAprobacion:false,aprobadoEn});
        document.getElementById('aprobContenido').innerHTML=`<div style="text-align:center;padding:2rem;"><div style="font-size:3rem;margin-bottom:.75rem;">✅</div><div style="font-weight:700;font-size:1.1rem;color:#16a34a;">¡Aprobado!</div><div style="font-size:.82rem;color:#555;margin-top:.35rem;">Orden cerrada correctamente</div></div>`;
    } catch(e){console.error('Error aprobación:',e);alert('Error al aprobar: '+e.message);}
};

// ============================================
// QR TIENDA — FICHA PÚBLICA
// ============================================
window.modalQRTienda = (tid) => {
    const t=getTienda(tid);
    if(!t) return;
    const url=`${location.origin}${location.pathname}#/tienda/${tid}`;
    showModal(`<div class="modal" style="max-width:340px;">
      <div class="modal-h"><h3>QR Tienda</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b" style="text-align:center;">
        <div style="font-weight:700;margin-bottom:.25rem;">${t.nombre}</div>
        <div style="font-size:.76rem;color:#555;margin-bottom:.75rem;">Código: ${t.codigo} · ${t.municipio||''}</div>
        <div id="qrTiendaRender" style="display:inline-block;margin-bottom:.5rem;"></div>
        <div style="font-size:.68rem;color:#94a3b8;">Escanea para ver activos e historial</div>
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cerrar</button>
          <button class="btn btn-blue" onclick="imprimirQRTienda('${url}','${t.nombre}')">Imprimir</button>
        </div>
      </div>
    </div>`);
    cargarScript('https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js').then(()=>{
        if(window.QRCode) new window.QRCode(document.getElementById('qrTiendaRender'),{text:url,width:200,height:200});
    });
};

window.imprimirQRTienda = (url, nombre) => {
    const w=window.open('','_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>QR ${nombre}</title>
    <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"><\/script>
    </head><body style="text-align:center;font-family:Arial;padding:2rem;">
    <h2 style="font-size:14pt;">${nombre}</h2>
    <div id="qr" style="display:inline-block;margin:1rem 0;"></div>
    <div style="font-size:9pt;color:#555;">Escanea para ver activos e historial</div>
    <script>new QRCode(document.getElementById('qr'),{text:'${url}',width:250,height:250});setTimeout(()=>window.print(),800);<\/script>
    </body></html>`);
};

function manejarRutaTienda() {
    const hash=window.location.hash;
    if(!hash.startsWith('#/tienda/')) return false;
    const tid=hash.replace('#/tienda/','');
    const t=getTienda(tid);
    if(!t) return false;
    document.getElementById('botnavEl').style.display='none';
    const eqs=getEquiposTienda(tid);
    const totalInc=eqs.reduce((n,e)=>n+getServiciosEquipo(e.id).length,0);
    document.getElementById('mainContent').innerHTML=`
    <div style="max-width:600px;margin:0 auto;padding:1rem;">
      <div style="background:#1a1a1a;color:white;border-radius:12px;padding:16px;margin-bottom:12px;border-bottom:3px solid #C9A84C;">
        <img src="${LOGO_URL}" style="height:32px;margin-bottom:8px;" onerror="this.style.display='none'">
        <div style="font-size:1rem;font-weight:700;color:#C9A84C;">${t.nombre}</div>
        <div style="font-size:.78rem;opacity:.8;">${t.municipio||''}, ${t.departamento||''} · Cód: ${t.codigo}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <div style="background:white;border-radius:10px;padding:12px;text-align:center;border:1px solid #e0e0e0;">
          <div style="font-size:1.8rem;font-weight:800;color:#C9A84C;">${eqs.length}</div>
          <div style="font-size:.72rem;color:#666;">Activos</div>
        </div>
        <div style="background:white;border-radius:10px;padding:12px;text-align:center;border:1px solid #e0e0e0;">
          <div style="font-size:1.8rem;font-weight:800;color:#1a1a1a;">${totalInc}</div>
          <div style="font-size:.72rem;color:#666;">Incidencias</div>
        </div>
      </div>
      ${t.latitud?`<div style="margin-bottom:12px;"><a href="https://maps.google.com/?q=${t.latitud},${t.longitud}" target="_blank" style="background:#4285f4;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:.82rem;">Ver en Google Maps</a></div>`:''}
      <div style="font-weight:700;font-size:.85rem;margin-bottom:8px;">Activos (${eqs.length})</div>
      ${eqs.map(e=>{
        const inc=getServiciosEquipo(e.id);
        return `<div style="background:white;border-radius:10px;padding:12px;margin-bottom:8px;border:1px solid #e0e0e0;">
          <div style="font-weight:700;">${e.tipo||e.nombre||'Sin nombre'}</div>
          ${e.descripcion?`<div style="font-size:.76rem;color:#555;">${e.descripcion}</div>`:''}
          <div style="font-size:.72rem;color:#888;margin-top:4px;">${inc.length} incidencia(s)</div>
        </div>`;
      }).join('')}
    </div>`;
    return true;
}

// ============================================
// CRUD CLIENTES
// ============================================
window.modalNuevoCliente = () => {
    showModal(`<div class="modal">
      <div class="modal-h"><h3>Nuevo cliente</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <label class="fl">Nombre ★</label><input class="fi" id="cNombre">
        <label class="fl">NIT</label><input class="fi" id="cNit">
        <label class="fl">Teléfono</label><input class="fi" id="cTel" type="tel">
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-blue" onclick="guardarCliente()">Guardar</button>
        </div>
      </div>
    </div>`);
};
window.guardarCliente = async () => {
    const nombre=document.getElementById('cNombre')?.value?.trim();
    if(!nombre){toast('Nombre requerido');return;}
    try {
        await addDoc(collection(db,'empresas'),{nombre,nit:document.getElementById('cNit')?.value||'',telefono:document.getElementById('cTel')?.value||'',creadoEn:new Date().toISOString()});
        toast('✅ Cliente creado'); closeModal(); await cargarDatos();
    } catch(e){toast('Error: '+e.message);}
};
window.modalEditarCliente = (cid) => {
    const c=getCl(cid);
    showModal(`<div class="modal">
      <div class="modal-h"><h3>Editar cliente</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <label class="fl">Nombre</label><input class="fi" id="cNombre" value="${c.nombre||''}">
        <label class="fl">NIT</label><input class="fi" id="cNit" value="${c.nit||''}">
        <label class="fl">Teléfono</label><input class="fi" id="cTel" value="${c.telefono||''}">
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-blue" onclick="actualizarCliente('${cid}')">Actualizar</button>
        </div>
      </div>
    </div>`);
};
window.actualizarCliente = async (cid) => {
    try {
        await updateDoc(doc(db,'empresas',cid),{nombre:document.getElementById('cNombre').value,nit:document.getElementById('cNit').value,telefono:document.getElementById('cTel').value});
        toast('✅ Cliente actualizado'); closeModal(); await cargarDatos();
    } catch(e){toast('Error: '+e.message);}
};
window.eliminarCliente = async (cid) => {
    if(!confirm('¿Eliminar este cliente?')) return;
    try { await deleteDoc(doc(db,'empresas',cid)); toast('Cliente eliminado'); await cargarDatos(); }
    catch(e){toast('Error: '+e.message);}
};

// ============================================
// CRUD EQUIPOS/ACTIVOS
// ============================================
window.modalNuevoEquipo = (cid, tid) => {
    const t=getTienda(tid);
    showModal(`<div class="modal">
      <div class="modal-h"><h3>Nuevo activo</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        ${t?`<div style="background:var(--bg2);padding:8px;border-radius:var(--radius);font-size:.78rem;margin-bottom:10px;"><strong>${t.nombre}</strong></div>`:''}
        <label class="fl">Nombre del activo ★</label>
        <input class="fi" id="eqNombre" placeholder="Ej: Cielo raso, Puerta de muelle...">
        <label class="fl">Descripción</label>
        <input class="fi" id="eqDesc" placeholder="Detalle específico (opcional)">
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-blue" onclick="guardarEquipo('${cid}','${tid}')">Guardar</button>
        </div>
      </div>
    </div>`);
};
window.guardarEquipo = async (cid,tid) => {
    const nombre=document.getElementById('eqNombre')?.value?.trim();
    if(!nombre){toast('Nombre requerido');return;}
    try {
        await addDoc(collection(db,'equipos'),{clienteId:cid,tiendaId:tid,nombre,descripcion:document.getElementById('eqDesc')?.value?.trim()||'',creadoEn:new Date().toISOString()});
        toast('✅ Activo guardado'); closeModal(); await cargarDatos();
    } catch(e){toast('Error: '+e.message);}
};
window.modalEditarEquipo = (eid) => {
    const e=getEq(eid);
    showModal(`<div class="modal">
      <div class="modal-h"><h3>Editar activo</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <label class="fl">Nombre</label><input class="fi" id="eqNombre" value="${e?.nombre||''}">
        <label class="fl">Descripción</label><input class="fi" id="eqDesc" value="${e?.descripcion||''}">
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-blue" onclick="actualizarEquipo('${eid}')">Actualizar</button>
        </div>
      </div>
    </div>`);
};
window.actualizarEquipo = async (eid) => {
    try {
        await updateDoc(doc(db,'equipos',eid),{nombre:document.getElementById('eqNombre').value,descripcion:document.getElementById('eqDesc').value});
        toast('✅ Activo actualizado'); closeModal(); await cargarDatos();
    } catch(e){toast('Error: '+e.message);}
};
window.eliminarEquipo = async (eid) => {
    if(!confirm('¿Eliminar este activo?')) return;
    try { await deleteDoc(doc(db,'equipos',eid)); toast('Activo eliminado'); await cargarDatos(); }
    catch(e){toast('Error: '+e.message);}
};

// ============================================
// CRUD TÉCNICOS
// ============================================
window.modalNuevoTecnico = () => {
    showModal(`<div class="modal">
      <div class="modal-h"><h3>Nuevo técnico</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <label class="fl">Nombre completo ★</label><input class="fi" id="tNombre">
        <label class="fl">Cédula ★</label><input class="fi" id="tCedula" type="number">
        <label class="fl">Teléfono</label><input class="fi" id="tTel" type="tel">
        <label class="fl">Cargo</label><input class="fi" id="tCargo">
        <label class="fl">Rol</label>
        <select class="fi" id="tRol"><option value="tecnico">Técnico</option><option value="admin">Admin</option></select>
        <label class="fl">Clave (4 dígitos) ★</label>
        <input class="fi" id="tClave" type="password" maxlength="4">
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-blue" onclick="guardarTecnico()">Guardar</button>
        </div>
      </div>
    </div>`);
};
window.guardarTecnico = async () => {
    const nombre=document.getElementById('tNombre')?.value?.trim();
    const cedula=document.getElementById('tCedula')?.value?.trim();
    const clave=document.getElementById('tClave')?.value?.trim();
    if(!nombre||!cedula||!clave){toast('Nombre, cédula y clave requeridos');return;}
    if(clave.length!==4){toast('Clave de 4 dígitos');return;}
    try {
        await addDoc(collection(db,'tecnicos'),{nombre,cedula,clave,telefono:document.getElementById('tTel')?.value||'',cargo:document.getElementById('tCargo')?.value||'',rol:document.getElementById('tRol')?.value||'tecnico',creadoEn:new Date().toISOString()});
        toast('✅ Técnico creado'); closeModal(); await cargarDatos();
    } catch(e){toast('Error: '+e.message);}
};
window.modalEditarTecnico = (tid) => {
    const t=getTec(tid);
    showModal(`<div class="modal">
      <div class="modal-h"><h3>Editar técnico</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <label class="fl">Nombre</label><input class="fi" id="tNombre" value="${t.nombre||''}">
        <label class="fl">Cédula</label><input class="fi" id="tCedula" value="${t.cedula||''}">
        <label class="fl">Teléfono</label><input class="fi" id="tTel" value="${t.telefono||''}">
        <label class="fl">Cargo</label><input class="fi" id="tCargo" value="${t.cargo||''}">
        <label class="fl">Rol</label>
        <select class="fi" id="tRol"><option value="tecnico" ${t.rol==='tecnico'?'selected':''}>Técnico</option><option value="admin" ${t.rol==='admin'?'selected':''}>Admin</option></select>
        <label class="fl">Nueva clave (dejar vacío para no cambiar)</label>
        <input class="fi" id="tClave" type="password" maxlength="4">
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-blue" onclick="actualizarTecnico('${tid}')">Actualizar</button>
        </div>
      </div>
    </div>`);
};
window.actualizarTecnico = async (tid) => {
    const data={nombre:document.getElementById('tNombre').value,cedula:document.getElementById('tCedula').value,telefono:document.getElementById('tTel').value,cargo:document.getElementById('tCargo').value,rol:document.getElementById('tRol').value};
    const nc=document.getElementById('tClave')?.value?.trim();
    if(nc&&nc.length===4) data.clave=nc;
    try { await updateDoc(doc(db,'tecnicos',tid),data); toast('✅ Técnico actualizado'); closeModal(); await cargarDatos(); }
    catch(e){toast('Error: '+e.message);}
};
window.eliminarTecnico = async (tid) => {
    if(!confirm('¿Eliminar este técnico?')) return;
    try { await deleteDoc(doc(db,'tecnicos',tid)); toast('Técnico eliminado'); await cargarDatos(); }
    catch(e){toast('Error: '+e.message);}
};

// ============================================
// EXPONER AL SCOPE GLOBAL
// ============================================
window.goTo                  = goTo;
window.closeModal            = closeModal;
window.cerrarSesion          = cerrarSesion;
window.abrirLogin            = abrirLogin;
window.pinNum                = pinNum;
window.pinDel                = pinDel;
window.pinLogin              = pinLogin;
window.modalNuevaIncidencia  = modalNuevaIncidencia;
window.guardarIncidencia     = guardarIncidencia;
window.verPDF                = verPDF;
window.buscarTiendaOT        = buscarTiendaOT;
window.limpiarFirmaOT        = limpiarFirmaOT;
window.previewFotoOT         = previewFotoOT;
window.filtrarClientes       = filtrarClientes;
window.filtrarTiendasDetalle = filtrarTiendasDetalle;
window.filtrarActivos = function(v) {
    document.querySelectorAll('.ec[data-activo]').forEach(el => {
        el.style.display = (el.dataset.activo||'').includes(v.toLowerCase()) ? '' : 'none';
    });
};
window.descargarHistorialTienda = descargarHistorialTienda;

// ============================================
// INIT
// ============================================
// Asignar eventos al nav
document.querySelectorAll('.bni').forEach(btn => {
    btn.addEventListener('click', () => goTo(btn.dataset.page));
});

(async () => { await cargarDatos(); })();
