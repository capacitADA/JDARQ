// ============================================
// JDARQ — JD Arquisoluciones S.A.S
// NIT: 901.223.583-8 | Tel: 310 553 3937
// Versión: 1.0 — Julio 2026
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore, collection, addDoc, getDocs, deleteDoc,
    doc, updateDoc, query, orderBy, runTransaction, getDoc, setDoc
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
// CONSTANTES EMPRESA
// ============================================
const EMPRESA_NOMBRE   = 'JD Arquisoluciones S.A.S';
const EMPRESA_NIT      = '901.223.583-8';
const EMPRESA_TEL      = '310 553 3937';
const EMPRESA_CONTACTO = 'Cristian David Londoño Romero';
const LOGO_URL         = 'https://raw.githubusercontent.com/capacitADA/JDARQ/main/JDARQ-logo.png';
const SELLO_URL        = 'https://raw.githubusercontent.com/capacitADA/JDARQ/main/SELLO_jdarq.png';
const FUENTE_FIRMA     = 'https://raw.githubusercontent.com/capacitADA/JDARQ/main/Meddon-Regular.ttf';

// ============================================
// VARIABLES GLOBALES
// ============================================
let clientes    = [];
let equipos     = [];
let servicios   = [];
let tecnicos    = [];
let tiendas     = [];
let currentView = 'panel';
let sesionActual = null;
let selectedClienteId = null;
let selectedEquipoId  = null;
let fotosNuevas = [null, null, null];
let fotosOT     = [null, null];
let firmaJefeDataUrl = '';

const TIPOS_DOC  = ['CC','CE','PA','NIT','TI'];
const TIPOS_SERV = ['Reparación','Garantía','Ajuste','Modificación','Servicio','Mejora','Combinación'];
const TIPOS_FALLA = ['BPM','Daños Logísticos','Locativo','Eléctricas','Refrigeración','Seguridad','SST','Tanqueo Planta','Puertas','Influencia Externa'];
const PARAMS_EVAL = [
    { cat:'FUNCIONAMIENTO', items:['La falla reportada fue solucionada con el trabajo realizado.'] },
    { cat:'CALIDAD',        items:['La calidad del trabajo está de acuerdo a la requerida por el personal o el equipo.'] },
    { cat:'LIMPIEZA Y ORGANIZACIÓN', items:[
        'El equipo o área intervenida se dejó armado y/o organizado como se encontraba en un inicio.',
        'Los escombros y suciedad generada por el técnico fueron retirados del lugar.',
        'Se indicó la causa de la novedad al personal que recibió el trabajo.'
    ]},
    { cat:'CAPACITACIÓN',   items:[
        'Se indicó cómo prevenir que el problema se vuelva a presentar.',
        'Se indicó cómo actuar en caso de que el problema se vuelva a presentar.'
    ]},
    { cat:'SERVICIO',       items:['Se encuentra satisfecho con el servicio ejecutado.'] }
];

// ============================================
// HELPERS
// ============================================
const getCl  = id => clientes.find(c => c.id === id);
const getEq  = id => equipos.find(e => e.id === id);
const getTec = id => tecnicos.find(t => t.id === id);
const getTienda = codigo => tiendas.find(t => t.codigo === String(codigo));
const getEquiposCliente  = cid => equipos.filter(e => e.clienteId === cid);
const getServiciosEquipo = eid => servicios.filter(s => s.equipoId === eid);
const getServiciosCliente = cid => servicios.filter(s => getEquiposCliente(cid).some(e => e.id === s.equipoId));

function fmtFecha(f) {
    if (!f) return '';
    return new Date(f + 'T12:00:00').toLocaleDateString('es-CO');
}
function esAdmin() { return sesionActual?.rol === 'admin'; }

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
    fotosNuevas = [null, null, null];
    fotosOT     = [null, null];
    firmaJefeDataUrl = '';
}

function actualizarTopbar() {
    const right = document.getElementById('topbarRight');
    if (!right) return;
    if (!sesionActual) {
        right.innerHTML = `<span class="topbar-user">Sin sesión</span>`;
        return;
    }
    const ini = sesionActual.nombre.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
    right.innerHTML = `<div class="topbar-sesion">
        <div class="topbar-avatar">${ini}</div>
        <div>
          <div style="font-size:.68rem;color:white;font-weight:700;">${sesionActual.nombre.split(' ')[0]}</div>
          ${esAdmin() ? '<span class="topbar-rol-badge">Admin</span>' : ''}
        </div>
        <button class="topbar-salir" onclick="cerrarSesion()">Salir</button>
    </div>`;
}

function cerrarSesion() {
    sesionActual = null;
    actualizarTopbar();
    renderView();
    toast('👋 Sesión cerrada');
}

function goTo(view, cid = null, eid = null) {
    currentView = view;
    selectedClienteId = cid;
    selectedEquipoId  = eid;
    closeModal();
    renderView();
    document.querySelectorAll('.bni').forEach(b => {
        b.classList.toggle('active',
            b.dataset.page === view ||
            (view === 'detalle'   && b.dataset.page === 'clientes') ||
            (view === 'historial' && b.dataset.page === 'clientes')
        );
    });
}

// ============================================
// CARGA DE DATOS
// ============================================
async function cargarDatos() {
    const main = document.getElementById('mainContent');
    main.innerHTML = '<div class="loading-screen" style="position:relative;min-height:200px;background:transparent;"><div class="loading-spinner"></div></div>';
    try {
        const [cs, es, ss, ts, ti] = await Promise.all([
            getDocs(query(collection(db, 'empresas'),  orderBy('nombre'))),
            getDocs(collection(db, 'equipos')),
            getDocs(query(collection(db, 'servicios'), orderBy('fecha', 'desc'))),
            getDocs(collection(db, 'tecnicos')),
            getDocs(collection(db, 'tiendas'))
        ]);
        clientes  = cs.docs.map(d => ({ id: d.id, ...d.data() }));
        equipos   = es.docs.map(d => ({ id: d.id, ...d.data() }));
        servicios = ss.docs.map(d => ({ id: d.id, ...d.data() }));
        tecnicos  = ts.docs.map(d => ({ id: d.id, ...d.data() }));
        tiendas   = ti.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        main.innerHTML = `<div class="page" style="text-align:center;padding:2rem;">
            <p>⚠️ Error al cargar datos</p>
            <button class="btn btn-gold" style="margin-top:1rem" onclick="location.reload()">Reintentar</button>
        </div>`;
        return;
    }
    // Manejar ruta QR antes de renderizar la app
    if (manejarRutaAprobacion()) return;
    renderView();
}

// ============================================
// RENDER PRINCIPAL
// ============================================
function renderView() {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('topbarEl').style.display  = 'flex';
    document.getElementById('botnavEl').style.display  = 'flex';
    actualizarTopbar();
    const main = document.getElementById('mainContent');
    switch (currentView) {
        case 'panel':     main.innerHTML = renderPanel();     break;
        case 'clientes':  main.innerHTML = renderClientes();  break;
        case 'detalle':   main.innerHTML = renderDetalle();   break;
        case 'historial': main.innerHTML = renderHistorial(); break;
        case 'equipos':   main.innerHTML = renderEquipos();   break;
        case 'servicios': main.innerHTML = renderServicios(); break;
        case 'tecnicos':  main.innerHTML = renderTecnicos();  break;
        default:          main.innerHTML = renderPanel();
    }
    document.querySelectorAll('.bni').forEach(b => b.classList.toggle('active', b.dataset.page === currentView));
}

// ============================================
// PANEL
// ============================================
function renderPanel() {
    const hoy    = new Date();
    const pref   = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
    const total  = servicios.length;
    const mes    = servicios.filter(s => s.fecha?.startsWith(pref)).length;
    const pendQR = servicios.filter(s => s.pendienteAprobacion && !s.aprobado).length;
    const aprobados = servicios.filter(s => s.aprobado).length;
    const eqTotal= equipos.length;
    const eqOp   = equipos.filter(e => e.estado === 'Operativo').length;
    const eqFs   = equipos.filter(e => e.estado === 'Fuera de servicio').length;

    const col = (t, v, c, sub) => `
        <div style="background:white;border-radius:10px;padding:10px;border:1px solid var(--border);box-shadow:var(--shadow);">
          <div style="font-size:.68rem;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:4px;">${t}</div>
          <div style="font-size:1.6rem;font-weight:800;color:${c};">${v}</div>
          ${sub ? `<div style="font-size:.68rem;color:var(--hint);">${sub}</div>` : ''}
        </div>`;

    const pendientes = servicios.filter(s => s.pendienteAprobacion && !s.aprobado);

    return `<div class="page">
<div class="panel-header">
  <img src="${LOGO_URL}" onerror="this.style.display='none'">
  <div class="panel-header-txt">
    <div class="title">${EMPRESA_NOMBRE}</div>
    <div class="sub">NIT ${EMPRESA_NIT}</div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
  ${col('Órdenes totales', total, 'var(--negro)', 'Histórico')}
  ${col('Este mes', mes, 'var(--dorado)', hoy.toLocaleString('es-CO',{month:'long'}))}
  ${col('Aprobadas', aprobados, '#16a34a', 'Con sello')}
  ${col('Pendientes', pendQR, pendQR > 0 ? 'var(--rojo)' : '#16a34a', 'Sin aprobar')}
</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
  ${col('Activos', eqTotal, 'var(--negro)', 'Registrados')}
  ${col('Operativos', eqOp, '#16a34a', '')}
  ${col('Fuera serv.', eqFs, 'var(--rojo)', '')}
</div>

${pendientes.length > 0 && esAdmin() ? `
<div style="background:#fff8f0;border:1.5px solid var(--dorado);border-radius:var(--radius);padding:.85rem;margin-bottom:12px;">
  <div style="font-weight:700;font-size:.82rem;color:var(--rojo);margin-bottom:.5rem;">⏳ Pendientes de aprobación (${pendientes.length})</div>
  ${pendientes.slice(0,3).map(s => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f0e8d8;font-size:.78rem;">
      <span style="font-weight:700;">${s.idMtto||'—'}</span>
      <span style="color:#555;">${s.tiendaNombre||s.tiendaCodigo||''}</span>
      <button class="btn btn-gold btn-sm" onclick="aprobarOrden('${s.id}')">✅ Aprobar</button>
    </div>`).join('')}
</div>` : ''}

<div style="background:white;border-radius:var(--radius);padding:.85rem;border:1px solid var(--border);">
  <div style="font-weight:700;font-size:.8rem;margin-bottom:.6rem;">📋 Órdenes recientes</div>
  ${servicios.slice(0,6).map(s => `
    <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f5f5f5;font-size:.78rem;cursor:pointer;" onclick="goTo('historial','${s.clienteId||''}','${s.equipoId||''}')">
      <span style="font-weight:700;color:var(--dorado);">${s.idMtto||'—'}</span>
      <span>${s.tiendaNombre||s.tiendaCodigo||'—'}</span>
      <span style="color:${s.aprobado?'#16a34a':'var(--hint)'};">${s.aprobado?'✅':'⏳'}</span>
    </div>`).join('')}
</div>
</div>`;
}

// ============================================
// CLIENTES
// ============================================
function renderClientes() {
    return `<div class="page">
<div class="sec-head">
  <h2>Clientes (${clientes.length})</h2>
  ${esAdmin() ? `<button class="btn btn-gold btn-sm" onclick="modalNuevoCliente()">+ Nuevo</button>` : ''}
</div>
<input class="search" placeholder="🔍 Buscar cliente..." oninput="filtrarClientes(this.value)">
<div id="clientesGrid">
${clientes.map(c => `
  <div class="cc" data-search="${(c.nombre+(c.nit||'')).toLowerCase()}">
    <div style="display:flex;justify-content:space-between;">
      <div class="cc-name">${c.nombre}</div>
      ${esAdmin() ? `<div><button class="ib" onclick="modalEditarCliente('${c.id}')">✏️</button><button class="ib" onclick="confirmarEliminarCliente('${c.id}')">🗑️</button></div>` : ''}
    </div>
    <div class="cc-row">🪪 NIT: ${c.nit||'—'}</div>
    <div class="cc-row">📞 ${c.telefono||'—'}</div>
    <div class="cc-meta">${getEquiposCliente(c.id).length} activo(s) · ${getServiciosCliente(c.id).length} orden(es)</div>
    <button class="link-btn" onclick="goTo('detalle','${c.id}')">Ver activos →</button>
  </div>`).join('')}
</div>
</div>`;
}

window.filtrarClientes = v => {
    document.querySelectorAll('#clientesGrid .cc').forEach(c => {
        c.style.display = (c.dataset.search||'').includes(v.toLowerCase()) ? '' : 'none';
    });
};

// ============================================
// DETALLE CLIENTE
// ============================================
function renderDetalle() {
    const c = getCl(selectedClienteId);
    if (!c) { goTo('clientes'); return ''; }
    const eqs = getEquiposCliente(c.id);
    return `<div class="page">
<button class="back" onclick="goTo('clientes')">← Volver</button>
<div class="info-box">
  <div class="cc-name">${c.nombre}</div>
  <div class="cc-row">🪪 NIT: ${c.nit||'—'}</div>
  <div class="cc-row">📞 ${c.telefono||'—'}</div>
  ${c.direccion ? `<div class="cc-row">📍 ${c.direccion}</div>` : ''}
</div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.65rem;">
  <span style="font-weight:700;">Activos (${eqs.length})</span>
  <div style="display:flex;gap:6px;">
    <button class="btn btn-gray btn-sm" onclick="descargarHistorialCliente('${c.id}')">📥 Historial</button>
    ${esAdmin() ? `<button class="btn btn-gold btn-sm" onclick="modalNuevoEquipo('${c.id}')">+ Activo</button>` : ''}
  </div>
</div>
${eqs.map(e => `
  <div class="ec">
    <div style="display:flex;justify-content:space-between;">
      <div>
        <div class="ec-name">${e.tipo ? e.tipo+' · ' : ''}${e.marca} ${e.modelo}</div>
        <div class="ec-meta">📍 ${e.ubicacion||'—'} · Serie: ${e.serie||'S/N'}</div>
        <div class="ec-meta">${getServiciosEquipo(e.id).length} orden(es)</div>
        <div class="ec-meta">Estado: <strong style="color:${e.estado==='Operativo'?'#16a34a':e.estado==='Fuera de servicio'?'var(--rojo)':'var(--dorado)'};">${e.estado||'—'}</strong></div>
      </div>
      ${esAdmin() ? `<div><button class="ib" onclick="modalEditarEquipo('${e.id}')">✏️</button><button class="ib" onclick="confirmarEliminarEquipo('${e.id}')">🗑️</button></div>` : ''}
    </div>
    <div class="ec-btns">
      <button class="ab" onclick="goTo('historial','${c.id}','${e.id}')">📋 Órdenes</button>
      <button class="ab" onclick="modalNuevaOrden('${e.id}')">➕ Nueva OT</button>
      <button class="ab" onclick="modalQREquipo('${e.id}')">📱 QR</button>
    </div>
  </div>`).join('')}
</div>`;
}

// ============================================
// HISTORIAL DE ORDENES POR EQUIPO
// ============================================
function renderHistorial() {
    const e = getEq(selectedEquipoId);
    if (!e) { goTo('clientes'); return ''; }
    const c  = getCl(e.clienteId);
    const ss = getServiciosEquipo(e.id).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
    return `<div class="page">
<button class="back" onclick="goTo('detalle','${e.clienteId}')">← Volver</button>
<div style="margin-bottom:.65rem;">
  <div class="ec-name">${e.tipo ? e.tipo+' · ' : ''}${e.marca} ${e.modelo}</div>
  <div class="ec-meta">${e.ubicacion} · ${c?.nombre||''}</div>
</div>
${ss.map(s => `
  <div class="si">
    <div class="si-top">
      <span class="badge b-gold">${s.idMtto||'—'}</span>
      <span class="badge ${s.aprobado?'b-green':'b-gold'}">${s.aprobado?'✅ Aprobada':'⏳ Pendiente'}</span>
      <span style="font-size:.72rem;color:var(--hint);">${fmtFecha(s.fecha)}</span>
    </div>
    <div class="si-info">🏪 ${s.tiendaNombre||s.tiendaCodigo||'—'} · ${s.tipoAsistencia||'—'}</div>
    <div class="si-info">🔧 ${s.tecnico||'—'}</div>
    ${s.descripcion ? `<div class="si-info">${s.descripcion.slice(0,80)}${s.descripcion.length>80?'...':''}</div>` : ''}
    ${s.fotos?.length ? `<div class="fotos-strip">${s.fotos.map(f=>`<img class="fthumb" src="${f}" loading="lazy">`).join('')}</div>` : ''}
    <div style="display:flex;justify-content:flex-end;gap:.4rem;margin-top:.35rem;">
      <button class="ab" onclick="verOrdenPDF('${s.id}')">📄 Ver OT</button>
      ${esAdmin() && !s.aprobado ? `<button class="ab" onclick="aprobarOrden('${s.id}')">✅ Aprobar</button>` : ''}
      ${esAdmin() ? `<button class="ib" onclick="eliminarServicio('${s.id}')">🗑️</button>` : ''}
    </div>
  </div>`).join('')}
</div>`;
}

// ============================================
// EQUIPOS (Vista global)
// ============================================
function renderEquipos() {
    return `<div class="page">
<div class="sec-head"><h2>Activos (${equipos.length})</h2></div>
<input class="search" placeholder="🔍 Buscar..." oninput="filtrarEquipos(this.value)">
<div id="equiposGrid">
${equipos.map(e => {
    const c = getCl(e.clienteId);
    return `<div class="ec" data-search="${(e.marca+e.modelo+(c?.nombre||'')+e.ubicacion).toLowerCase()}">
      <div class="ec-name">${e.tipo ? e.tipo+' · ':'' }${e.marca} ${e.modelo}</div>
      <div class="ec-meta">👤 ${c?.nombre||'—'} · 📍 ${e.ubicacion||'—'}</div>
      <div class="ec-meta">Estado: <strong>${e.estado||'—'}</strong></div>
      <div class="ec-btns">
        <button class="ab" onclick="goTo('historial','${e.clienteId}','${e.id}')">📋 Órdenes</button>
        <button class="ab" onclick="modalNuevaOrden('${e.id}')">➕ Nueva OT</button>
        <button class="ab" onclick="modalQREquipo('${e.id}')">📱 QR</button>
      </div>
    </div>`;
}).join('')}
</div>
</div>`;
}
window.filtrarEquipos = v => {
    document.querySelectorAll('#equiposGrid .ec').forEach(c => {
        c.style.display = (c.dataset.search||'').includes(v.toLowerCase()) ? '' : 'none';
    });
};

// ============================================
// SERVICIOS (Vista global)
// ============================================
function renderServicios() {
    return `<div class="page">
<div class="sec-head"><h2>Órdenes (${servicios.length})</h2></div>
${servicios.map(s => {
    const e = getEq(s.equipoId);
    const c = e ? getCl(e.clienteId) : null;
    return `<div class="si">
      <div class="si-top">
        <span class="badge b-gold">${s.idMtto||'—'}</span>
        <span class="badge ${s.aprobado?'b-green':'b-gold'}">${s.aprobado?'✅ Aprobada':'⏳ Pendiente'}</span>
        <span style="font-size:.72rem;color:var(--hint);">${fmtFecha(s.fecha)}</span>
      </div>
      <div class="si-info">🏢 ${c?.nombre||'—'} · 🏪 ${s.tiendaNombre||s.tiendaCodigo||'—'}</div>
      <div class="si-info">🔧 ${s.tecnico||'—'} · ${s.tipoAsistencia||'—'}</div>
      <div style="display:flex;justify-content:flex-end;gap:.4rem;margin-top:.35rem;">
        <button class="ab" onclick="verOrdenPDF('${s.id}')">📄 Ver OT</button>
        ${esAdmin() && !s.aprobado ? `<button class="ab" onclick="aprobarOrden('${s.id}')">✅ Aprobar</button>` : ''}
      </div>
    </div>`;
}).join('')}
</div>`;
}

// ============================================
// TÉCNICOS
// ============================================
function renderTecnicos() {
    return `<div class="page">
<div class="sec-head">
  <h2>Técnicos (${tecnicos.length})</h2>
  ${esAdmin() ? `<button class="btn btn-gold btn-sm" onclick="modalNuevoTecnico()">+ Nuevo</button>` : ''}
</div>
${tecnicos.map(t => {
    const activo = sesionActual?.id === t.id;
    return `<div class="ec" style="${activo?'border:2px solid var(--dorado);':''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="ec-name">${t.nombre} ${activo?'<span class="badge b-gold">✓ Activo</span>':''}</div>
          <div class="ec-meta">CC ${t.cedula||'—'} · 📞 ${t.telefono||'—'}</div>
          <div class="ec-meta">Cargo: ${t.cargo||'—'}</div>
        </div>
        <div style="display:flex;gap:.3rem;">
          ${esAdmin() ? `<button class="ib" onclick="modalEditarTecnico('${t.id}')">✏️</button><button class="ib" onclick="eliminarTecnico('${t.id}')">🗑️</button>` : ''}
        </div>
      </div>
      ${!activo
        ? `<button class="btn btn-gold btn-sm btn-full" style="margin-top:.5rem;" onclick="abrirLogin('${t.id}')">🔑 Ingresar como ${t.nombre.split(' ')[0]}</button>`
        : `<button class="btn btn-gray btn-sm btn-full" style="margin-top:.5rem;" onclick="cerrarSesion()">🚪 Cerrar sesión</button>`}
    </div>`;
}).join('')}
</div>`;
}

// ============================================
// LOGIN TÉCNICO — PIN + CÉDULA
// ============================================
let _pinActual = '';

function abrirLogin(tid) {
    const t = getTec(tid);
    _pinActual = '';
    showModal(`<div class="modal" style="max-width:320px;">
      <div class="modal-h"><h3>🔑 Ingresar</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <div style="font-weight:700;margin-bottom:.5rem;">${t.nombre}</div>
        <label class="fl">Cédula</label>
        <input class="fi" id="loginCed" type="number" placeholder="Número de cédula" style="margin-bottom:.65rem;">
        <label class="fl">Clave (4 dígitos)</label>
        <div class="pin-display">
          ${[0,1,2,3].map(i=>`<div class="pin-digit" id="pd${i}"></div>`).join('')}
        </div>
        <div class="numpad">
          ${[1,2,3,4,5,6,7,8,9].map(n=>`<div class="num-btn" onclick="pinNum('${tid}',${n})">${n}</div>`).join('')}
          <div class="num-btn del" onclick="pinDel()">⌫</div>
          <div class="num-btn zero" onclick="pinNum('${tid}',0)">0</div>
          <div class="num-btn ok"  onclick="pinLogin('${tid}')">✓</div>
        </div>
        <div id="loginMsg"></div>
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-gold" onclick="pinLogin('${tid}')">Ingresar</button>
        </div>
      </div>
    </div>`);
    pinUpdateDisplay();
}

function pinNum(tid, n) { if (_pinActual.length >= 4) return; _pinActual += String(n); pinUpdateDisplay(); if (_pinActual.length === 4) pinLogin(tid); }
function pinDel()        { _pinActual = _pinActual.slice(0,-1); pinUpdateDisplay(); }
function pinUpdateDisplay() {
    for (let i=0; i<4; i++) {
        const d = document.getElementById('pd'+i);
        if (!d) continue;
        d.className = 'pin-digit';
        if (i < _pinActual.length)       { d.textContent='●'; d.classList.add('filled'); }
        else if (i === _pinActual.length) { d.textContent='_'; d.classList.add('active'); }
        else { d.textContent=''; }
    }
}
function pinLogin(tid) {
    const t   = getTec(tid);
    const ced = document.getElementById('loginCed')?.value?.trim();
    const msg = document.getElementById('loginMsg');
    if (!ced)                { if(msg) msg.innerHTML='<div class="login-warn">⚠️ Cédula requerida</div>'; return; }
    if (_pinActual.length<4) { if(msg) msg.innerHTML='<div class="login-warn">⚠️ Clave de 4 dígitos</div>'; return; }
    if (t.cedula !== ced || t.clave !== _pinActual) {
        if(msg) msg.innerHTML='<div class="login-error">❌ Credenciales incorrectas</div>';
        _pinActual=''; pinUpdateDisplay(); return;
    }
    sesionActual = { ...t };
    _pinActual   = '';
    closeModal();
    actualizarTopbar();
    currentView = 'panel';
    renderView();
    toast(`✅ Bienvenido, ${t.nombre.split(' ')[0]}`);
}

// ============================================
// MODAL NUEVA ORDEN DE TRABAJO
// ============================================
function modalNuevaOrden(eid) {
    if (!sesionActual) { toast('🔑 Debes iniciar sesión primero'); return; }
    const e  = getEq(eid);
    const c  = getCl(e?.clienteId);
    const hoy = new Date().toISOString().split('T')[0];
    fotosOT  = [null, null];

    showModal(`<div class="modal modal-wide" onclick="event.stopPropagation()">
      <div class="modal-h" style="background:var(--negro);border-bottom:2px solid var(--dorado);">
        <h3 style="color:var(--dorado);">📋 ORDEN DE TRABAJO — ${c?.nombre||''}</h3>
        <button class="xbtn" style="color:white;" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-b">

        <!-- DATOS TÉCNICO -->
        <div style="background:var(--bg2);padding:8px;border-radius:var(--radius);margin-bottom:10px;">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Técnico</div>
          <div style="font-size:.85rem;font-weight:700;">${sesionActual.nombre}</div>
          <div style="font-size:.76rem;color:#555;">CC ${sesionActual.cedula||'—'} · Cargo: ${sesionActual.cargo||'Técnico'}</div>
        </div>

        <!-- ACTIVO -->
        <div style="background:#fffbeb;padding:8px;border-radius:var(--radius);margin-bottom:10px;border:1px solid var(--dorado);">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Activo</div>
          <div style="font-size:.85rem;font-weight:700;">${e?.tipo||''} ${e?.marca||''} ${e?.modelo||''}</div>
          <div style="font-size:.76rem;color:#555;">📍 ${e?.ubicacion||'—'} · Serie: ${e?.serie||'S/N'}</div>
        </div>

        <!-- ID MTTO Y FECHA -->
        <div class="fr">
          <div>
            <label class="fl">ID MTTO ★</label>
            <input class="fi" id="otIdMtto" placeholder="205299">
          </div>
          <div>
            <label class="fl">Fecha</label>
            <input class="fi" type="date" id="otFecha" value="${hoy}">
          </div>
        </div>

        <!-- TIENDA -->
        <label class="fl">Código de tienda ★</label>
        <input class="fi" id="otTiendaCod" placeholder="6A1B2C009" oninput="buscarTienda(this.value)">
        <div id="tiendaInfo" style="font-size:.76rem;color:#16a34a;margin-top:2px;min-height:16px;"></div>

        <!-- TIPO DE ASISTENCIA -->
        <label class="fl">Tipo de asistencia (Marque X)</label>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px;margin-bottom:8px;">
          ${TIPOS_SERV.map(t => `<label style="display:flex;align-items:center;gap:5px;font-size:.8rem;padding:3px;border:1px solid var(--border);border-radius:6px;cursor:pointer;"><input type="radio" name="otTipoAsist" value="${t}" ${t==='Servicio'?'checked':''}> ${t}</label>`).join('')}
        </div>

        <!-- TIPO DE FALLA -->
        <label class="fl">Tipo de falla (Marque X)</label>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px;margin-bottom:8px;">
          ${TIPOS_FALLA.map(f => `<label style="display:flex;align-items:center;gap:5px;font-size:.78rem;padding:3px;border:1px solid var(--border);border-radius:6px;cursor:pointer;"><input type="checkbox" class="otFalla" value="${f}"> ${f}</label>`).join('')}
        </div>

        <!-- DESCRIPCIÓN -->
        <label class="fl">Descripción detallada de la solicitud ★</label>
        <textarea class="fi" id="otDescSolicitud" rows="3" placeholder="Descripción de la solicitud..."></textarea>

        <label class="fl">Actividades ejecutadas ★</label>
        <textarea class="fi" id="otActividades" rows="3" placeholder="Actividades realizadas..."></textarea>

        <label class="fl">Repuestos cambiados</label>
        <textarea class="fi" id="otRepuestos" rows="2" placeholder="Repuestos utilizados..."></textarea>

        <label class="fl">Recomendaciones</label>
        <textarea class="fi" id="otRecomendaciones" rows="2" placeholder="Recomendaciones..."></textarea>

        <!-- EVALUACIÓN DEL SERVICIO -->
        <div style="background:var(--bg2);padding:6px 8px;margin:10px 0 6px;border-radius:6px;font-weight:700;font-size:.78rem;text-align:center;">EVALUACIÓN DEL SERVICIO</div>
        <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:10px;">
          <div style="display:grid;grid-template-columns:auto 60px 60px;background:var(--negro);color:var(--dorado);font-size:.68rem;font-weight:700;padding:4px 6px;">
            <div>Parámetro</div><div style="text-align:center;">SI</div><div style="text-align:center;">NO</div>
          </div>
          ${PARAMS_EVAL.map(p => p.items.map((item,i) => `
            <div style="display:grid;grid-template-columns:auto 60px 60px;border-top:1px solid var(--border);padding:4px 6px;align-items:center;background:white;">
              <div style="font-size:.7rem;">${i===0?`<span style="font-size:.62rem;font-weight:700;color:var(--dorado);">${p.cat}: </span>`:''}${item}</div>
              <div style="text-align:center;"><input type="radio" name="eval_${p.cat.replace(/\s+/g,'')}_${i}" value="SI" checked></div>
              <div style="text-align:center;"><input type="radio" name="eval_${p.cat.replace(/\s+/g,'')}_${i}" value="NO"></div>
            </div>`).join('')).join('')}
        </div>

        <!-- CALIFICACIÓN -->
        <div style="background:var(--bg2);padding:6px 8px;margin-bottom:8px;border-radius:6px;font-weight:700;font-size:.78rem;text-align:center;">CALIFICA MI SERVICIO</div>
        <div style="display:flex;justify-content:center;gap:20px;margin-bottom:12px;">
          ${[['Excelente','😊'],['Bueno','😐'],['Malo','😞']].map(([v,e]) => `
            <label style="text-align:center;cursor:pointer;">
              <div style="font-size:1.5rem;">${e}</div>
              <div style="font-size:.72rem;font-weight:700;">${v}</div>
              <input type="radio" name="otCalif" value="${v}" ${v==='Excelente'?'checked':''} style="margin-top:2px;">
            </label>`).join('')}
        </div>

        <!-- HORA ENTRADA / SALIDA -->
        <div class="fr">
          <div><label class="fl">Hora de entrada</label><input class="fi" type="time" id="otHoraEntrada"></div>
          <div><label class="fl">Hora de salida</label><input class="fi" type="time" id="otHoraSalida"></div>
        </div>

        <!-- FUNCIONARIO DE LA TIENDA -->
        <div style="background:var(--bg2);padding:6px 8px;margin:10px 0 6px;border-radius:6px;font-weight:700;font-size:.78rem;text-align:center;">FUNCIONARIO DE LA TIENDA</div>
        <div class="fr">
          <div><label class="fl">Nombre</label><input class="fi" id="otFuncNombre" placeholder="Nombre completo"></div>
          <div><label class="fl">Cargo</label><input class="fi" id="otFuncCargo" placeholder="Cargo"></div>
        </div>
        <label class="fl">Teléfono</label>
        <input class="fi" id="otFuncTel" type="tel" placeholder="Teléfono de contacto" style="margin-bottom:10px;">

        <!-- FOTOS -->
        <div style="background:var(--bg2);padding:6px 8px;margin-bottom:8px;border-radius:6px;font-weight:700;font-size:.78rem;text-align:center;">EVIDENCIAS FOTOGRÁFICAS</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
          ${[['ANTES',0],['DESPUÉS',1]].map(([lbl,i]) => `
            <div>
              <div style="font-size:.72rem;font-weight:700;text-align:center;margin-bottom:4px;">${lbl}</div>
              <div class="foto-slot" id="fslotOT${i}" onclick="document.getElementById('finputOT${i}').click()">
                <span>+ Foto</span>
                <input type="file" id="finputOT${i}" accept="image/*" style="display:none" onchange="previewFotoOT(this,${i})">
              </div>
            </div>`).join('')}
        </div>

        <!-- FIRMA DEL JEFE -->
        <div style="background:var(--bg2);padding:6px 8px;margin-bottom:8px;border-radius:6px;font-weight:700;font-size:.78rem;text-align:center;">FIRMA FUNCIONARIO DE LA TIENDA</div>
        <canvas id="firmaOTCanvas" class="firma-canvas" width="340" height="120"></canvas>
        <div style="display:flex;gap:.5rem;margin-top:.35rem;margin-bottom:12px;">
          <button class="btn btn-gray btn-sm" onclick="limpiarFirmaOT()">Limpiar</button>
          <span style="font-size:.72rem;color:var(--hint);align-self:center;">Firma del jefe/funcionario de la tienda</span>
        </div>

        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-gray" onclick="guardarOrden('${eid}', false)">💾 Guardar sin sello</button>
          <button class="btn btn-gold" onclick="generarOT('${eid}')">📄 Generar PDF</button>
        </div>
      </div>
    </div>`);

    setTimeout(() => iniciarFirmaCanvas('firmaOTCanvas'), 100);
}

window.buscarTienda = (codigo) => {
    const info = document.getElementById('tiendaInfo');
    if (!info) return;
    const t = getTienda(codigo.trim().toUpperCase());
    if (t) info.textContent = `✅ ${t.nombre} · ${t.municipio}, ${t.departamento}`;
    else if (codigo.length > 3) info.textContent = '';
};

// ============================================
// FIRMA CANVAS
// ============================================
function iniciarFirmaCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 340;
    let drawing = false, lx = 0, ly = 0;
    const pos = ev => { const r=canvas.getBoundingClientRect(); const s=ev.touches?ev.touches[0]:ev; return [s.clientX-r.left, s.clientY-r.top]; };
    canvas.addEventListener('mousedown',  e => { drawing=true;  [lx,ly]=pos(e); });
    canvas.addEventListener('mousemove',  e => { if(!drawing) return; const [x,y]=pos(e); ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(x,y); ctx.strokeStyle='#1a1a6e'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.stroke(); [lx,ly]=[x,y]; });
    canvas.addEventListener('mouseup',    () => drawing=false);
    canvas.addEventListener('mouseleave', () => drawing=false);
    canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing=true;  [lx,ly]=pos(e); }, {passive:false});
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); if(!drawing) return; const [x,y]=pos(e); ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(x,y); ctx.strokeStyle='#1a1a6e'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.stroke(); [lx,ly]=[x,y]; }, {passive:false});
    canvas.addEventListener('touchend',   () => drawing=false);
}

window.limpiarFirmaOT = () => {
    const c = document.getElementById('firmaOTCanvas');
    if (c) c.getContext('2d').clearRect(0,0,c.width,c.height);
    firmaJefeDataUrl = '';
};

// ============================================
// PREVIEW FOTOS
// ============================================
window.previewFotoOT = (input, idx) => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        fotosOT[idx] = e.target.result;
        const slot = document.getElementById(`fslotOT${idx}`);
        if (slot) slot.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius);">`;
    };
    reader.readAsDataURL(file);
};

// ============================================
// GUARDAR ORDEN (sin PDF)
// ============================================
async function guardarOrden(eid, conSello = false) {
    const e           = getEq(eid);
    const tiendaCod   = document.getElementById('otTiendaCod')?.value?.trim().toUpperCase();
    const tienda      = getTienda(tiendaCod);
    const idMtto      = document.getElementById('otIdMtto')?.value?.trim();
    const fecha       = document.getElementById('otFecha')?.value;
    const tipoAsist   = document.querySelector('input[name="otTipoAsist"]:checked')?.value || '';
    const fallas      = Array.from(document.querySelectorAll('.otFalla:checked')).map(cb => cb.value);
    const descSolic   = document.getElementById('otDescSolicitud')?.value?.trim();
    const actividades = document.getElementById('otActividades')?.value?.trim();
    const repuestos   = document.getElementById('otRepuestos')?.value?.trim() || '';
    const recomend    = document.getElementById('otRecomendaciones')?.value?.trim() || '';
    const calif       = document.querySelector('input[name="otCalif"]:checked')?.value || 'Excelente';
    const horaEnt     = document.getElementById('otHoraEntrada')?.value || '';
    const horaSal     = document.getElementById('otHoraSalida')?.value  || '';
    const funcNombre  = document.getElementById('otFuncNombre')?.value?.trim() || '';
    const funcCargo   = document.getElementById('otFuncCargo')?.value?.trim()  || '';
    const funcTel     = document.getElementById('otFuncTel')?.value?.trim()    || '';

    if (!idMtto)      { toast('⚠️ Ingresa el ID MTTO'); return null; }
    if (!tiendaCod)   { toast('⚠️ Ingresa el código de tienda'); return null; }
    if (!descSolic)   { toast('⚠️ Completa la descripción de la solicitud'); return null; }
    if (!actividades) { toast('⚠️ Completa las actividades ejecutadas'); return null; }

    const firmaCanvas = document.getElementById('firmaOTCanvas');
    const firmaJefe   = firmaCanvas ? firmaCanvas.toDataURL('image/png') : '';

    const payload = {
        equipoId:     eid,
        clienteId:    e?.clienteId || '',
        idMtto, fecha, tipoAsistencia: tipoAsist,
        tiposFalla:   fallas,
        descripcion:  descSolic,
        actividades,  repuestos, recomendaciones: recomend,
        calificacion: calif,
        horaEntrada: horaEnt, horaSalida: horaSal,
        funcNombre, funcCargo, funcTel,
        tiendaCodigo: tiendaCod,
        tiendaNombre: tienda?.nombre || '',
        tiendaMunicipio: tienda?.municipio || '',
        tiendaDepartamento: tienda?.departamento || '',
        tecnico:     sesionActual?.nombre || '',
        tecnicoCedula: sesionActual?.cedula || '',
        tecnicoCargo:  sesionActual?.cargo || 'Técnico',
        firmaJefe,
        fotos: fotosOT.filter(Boolean),
        aprobado: conSello,
        pendienteAprobacion: !conSello,
        creadoEn: new Date().toISOString()
    };

    try {
        const ref = await addDoc(collection(db, 'servicios'), payload);
        toast('✅ Orden guardada');
        await cargarDatos();
        return { id: ref.id, ...payload };
    } catch(err) {
        toast('⚠️ Error al guardar: ' + err.message);
        return null;
    }
}

// ============================================
// GENERAR OT — PDF
// ============================================
async function generarOT(eid) {
    const datos = await guardarOrden(eid, false);
    if (!datos) return;
    closeModal();
    await generarPDFOrden(datos);
}

async function verOrdenPDF(sid) {
    const s = servicios.find(x => x.id === sid);
    if (!s) return;
    await generarPDFOrden(s);
}

async function generarPDFOrden(s) {
    const e = getEq(s.equipoId);
    const c = getCl(e?.clienteId);
    const hoy = new Date(s.creadoEn || s.fecha + 'T12:00:00');
    const dd  = String(hoy.getDate()).padStart(2,'0');
    const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const mes = MESES[hoy.getMonth()];
    const aa  = String(hoy.getFullYear()).slice(-2);

    let selloBase64 = '';
    if (s.aprobado) {
        try { selloBase64 = await cargarImagenBase64(SELLO_URL); } catch(e) {}
    }

    function chk(val, lista) {
        return (lista||[]).includes(val)
            ? '<span style="font-weight:900;">&#9632;</span>'
            : '<span style="color:#ccc;">&#9744;</span>';
    }

    const lineas = (txt, n) => {
        const arr = (txt||'').split('\n').concat(Array(n).fill('')).slice(0, n);
        return arr.map((t,i) => `<tr style="height:18px;border-bottom:${i===n-1?'2px':'1px'} solid ${i===n-1?'#000':'#bbb'};"><td style="padding:1px 4px;font-size:8pt;">${t}&nbsp;</td></tr>`).join('');
    };

    const evalRows = PARAMS_EVAL.map(p => p.items.map((item, i) => {
        const key = `eval_${p.cat.replace(/\s+/g,'')}_${i}`;
        const val = 'SI';
        return `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:2px 5px;font-size:7pt;width:30px;">${i===0?`<strong>${p.cat}</strong>`:''}</td>
            <td style="padding:2px 5px;font-size:7pt;">${item}</td>
            <td style="text-align:center;font-size:9pt;">${chk('SI',[val])}</td>
            <td style="text-align:center;font-size:9pt;">${chk('NO',[val])}</td>
        </tr>`;
    }).join('')).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>OT_${s.idMtto||''}</title>
<style>
@font-face { font-family:'Meddon'; src:url('${FUENTE_FIRMA}') format('truetype'); }
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:Arial,sans-serif; background:#fff; padding:16px; font-size:8pt; width:794px; }
.blk { border:2px solid #000; border-collapse:collapse; width:100%; margin-top:-2px; }
.blk td, .blk th { border:1px solid #000; padding:2px 5px; vertical-align:middle; font-size:7.5pt; }
.hdr { font-weight:700; text-align:center; font-size:9pt; padding:4px; }
.lbl { font-weight:700; white-space:nowrap; width:1%; }
.nota { color:#c0392b; font-size:6pt; text-align:center; margin-top:6px; font-style:italic; }
</style>
</head>
<body>

<!-- CABECERA -->
<table style="width:100%;border-collapse:collapse;border:2px solid #000;margin-bottom:-2px;">
  <tr>
    <td style="width:60px;text-align:center;padding:4px;border-right:1px solid #000;">
      <img src="${LOGO_URL}" style="height:42px;" crossorigin="anonymous">
    </td>
    <td style="text-align:center;font-weight:700;font-size:10pt;">ORDEN DE TRABAJO MANTENIMIENTO</td>
    <td style="width:140px;text-align:right;padding:4px;border-left:1px solid #000;font-size:8pt;">
      <strong>ID MTTO: ${s.idMtto||''}</strong><br>
      FECHA: <strong>${dd} ${mes} ${aa}</strong>
    </td>
  </tr>
</table>

<!-- INFORMACIÓN CONTRATISTA -->
<table class="blk">
  <tr><td colspan="4" class="hdr">INFORMACIÓN CONTRATISTA</td></tr>
  <tr>
    <td class="lbl">Razón Social:</td><td colspan="3">${EMPRESA_NOMBRE}</td>
  </tr>
  <tr>
    <td class="lbl">N° NIT:</td><td>${EMPRESA_NIT}</td>
    <td class="lbl">Teléfono:</td><td>${EMPRESA_TEL}</td>
  </tr>
  <tr>
    <td class="lbl">Contacto:</td><td colspan="3">${EMPRESA_CONTACTO}</td>
  </tr>
</table>

<!-- INFORMACIÓN SOLICITANTE Y TIENDA -->
<table class="blk">
  <tr><td colspan="6" class="hdr">INFORMACIÓN SOLICITANTE Y TIENDA</td></tr>
  <tr>
    <td class="lbl">Nombre de la tienda:</td>
    <td colspan="2">${s.tiendaNombre||s.tiendaCodigo||''}</td>
    <td class="lbl">COD. TIENDA:</td>
    <td colspan="2">${s.tiendaCodigo||''}</td>
  </tr>
  <tr>
    <td class="lbl">Nombre del solicitante:</td>
    <td colspan="2">${s.funcNombre||''}</td>
    <td class="lbl">Departamento:</td>
    <td colspan="2">${s.tiendaDepartamento||''}</td>
  </tr>
  <tr>
    <td class="lbl">Municipio:</td>
    <td colspan="5">${s.tiendaMunicipio||''}</td>
  </tr>
</table>

<!-- TIPO DE ASISTENCIA -->
<table class="blk">
  <tr><td colspan="8" class="hdr">TIPO DE ASISTENCIA (Marque con una X)</td></tr>
  <tr>
    ${TIPOS_SERV.map(t => `<td style="text-align:center;font-size:7pt;">${t} ${chk(t,[s.tipoAsistencia])}</td>`).join('')}
  </tr>
</table>

<!-- TIPO DE FALLA -->
<table class="blk">
  <tr><td colspan="5" class="hdr">TIPO DE FALLA (Marque con una X)</td></tr>
  <tr>
    ${TIPOS_FALLA.slice(0,5).map(f => `<td style="text-align:center;font-size:7pt;">${f} ${chk(f,s.tiposFalla)}</td>`).join('')}
  </tr>
  <tr>
    ${TIPOS_FALLA.slice(5).map(f => `<td style="text-align:center;font-size:7pt;">${f} ${chk(f,s.tiposFalla)}</td>`).join('')}
  </tr>
</table>

<!-- DESCRIPCIÓN -->
<table class="blk"><tr><td class="hdr">Descripción detallada de la solicitud:</td></tr></table>
<table style="width:100%;border-collapse:collapse;border-left:2px solid #000;border-right:2px solid #000;">${lineas(s.descripcion,4)}</table>

<!-- ACTIVIDADES -->
<table class="blk"><tr><td class="hdr">Actividades ejecutadas:</td></tr></table>
<table style="width:100%;border-collapse:collapse;border-left:2px solid #000;border-right:2px solid #000;">${lineas(s.actividades,5)}</table>

<!-- REPUESTOS -->
<table class="blk"><tr><td class="hdr">Repuestos cambiados:</td></tr></table>
<table style="width:100%;border-collapse:collapse;border-left:2px solid #000;border-right:2px solid #000;">${lineas(s.repuestos,3)}</table>

<!-- RECOMENDACIONES -->
<table class="blk"><tr><td class="hdr">Recomendaciones:</td></tr></table>
<table style="width:100%;border-collapse:collapse;border-left:2px solid #000;border-right:2px solid #000;">${lineas(s.recomendaciones,3)}</table>

<!-- EVALUACIÓN DEL SERVICIO -->
<table class="blk">
  <tr><td colspan="4" class="hdr">EVALUACIÓN DEL SERVICIO</td></tr>
  <tr>
    <th style="width:80px;font-size:7pt;">PARÁMETROS</th>
    <th style="font-size:7pt;">Descripción</th>
    <th style="width:35px;text-align:center;font-size:7pt;">SI</th>
    <th style="width:35px;text-align:center;font-size:7pt;">NO</th>
  </tr>
  ${evalRows}
</table>

<!-- CALIFICACIÓN -->
<table class="blk">
  <tr><td colspan="3" class="hdr">CALIFICA MI SERVICIO (Marque con una X)</td></tr>
  <tr>
    <td style="text-align:center;width:33%;font-size:9pt;">😊 Excelente ${chk('Excelente',[s.calificacion])}</td>
    <td style="text-align:center;width:33%;font-size:9pt;">😐 Bueno ${chk('Bueno',[s.calificacion])}</td>
    <td style="text-align:center;width:34%;font-size:9pt;">😞 Malo ${chk('Malo',[s.calificacion])}</td>
  </tr>
</table>

<!-- CONSTANCIA DE ASISTENCIA -->
<table class="blk">
  <tr><td colspan="6" class="hdr">CONSTANCIA DE ASISTENCIA REALIZADA</td></tr>
  <tr>
    <th style="font-size:7pt;">Datos</th>
    <th style="font-size:7pt;">Contratista</th>
    <th style="font-size:7pt;">Cédula</th>
    <th style="font-size:7pt;">Hora entrada</th>
    <th style="font-size:7pt;">Hora salida</th>
    <th style="font-size:7pt;">Funcionario de la tienda</th>
  </tr>
  <tr>
    <td style="font-size:7pt;">Técnico</td>
    <td style="font-family:'Meddon',cursive;font-size:11pt;">${s.tecnico||''}</td>
    <td style="font-size:7pt;">${s.tecnicoCedula||''}</td>
    <td style="font-size:7pt;">${s.horaEntrada||''}</td>
    <td style="font-size:7pt;">${s.horaSalida||''}</td>
    <td style="font-size:7pt;">
      Nombre: ${s.funcNombre||''}<br>
      Teléfono: ${s.funcTel||''}<br>
      Cargo: ${s.funcCargo||''}
    </td>
  </tr>
  <tr>
    <td colspan="3" style="text-align:center;padding:4px;height:60px;vertical-align:bottom;">
      <div style="font-size:7pt;font-weight:700;margin-bottom:2px;">Firma Técnico Encargado / Cargo</div>
      ${s.firmaJefe ? `<img src="${s.firmaJefe}" style="max-height:50px;">` : '<div style="height:40px;border-top:1px solid #000;margin-top:4px;"></div>'}
    </td>
    <td colspan="3" style="text-align:center;padding:4px;height:60px;vertical-align:middle;">
      ${selloBase64 ? `<img src="${selloBase64}" style="max-height:60px;">` : '<div style="color:#ccc;font-size:7pt;">Pendiente de aprobación</div>'}
    </td>
  </tr>
</table>

<!-- FOTOS -->
${s.fotos?.length ? `
<table class="blk" style="margin-top:-2px;">
  <tr><td colspan="2" class="hdr">EVIDENCIAS FOTOGRÁFICAS</td></tr>
  <tr>
    <td style="width:50%;text-align:center;font-weight:700;font-size:7pt;">ANTES</td>
    <td style="width:50%;text-align:center;font-weight:700;font-size:7pt;">DESPUÉS</td>
  </tr>
  <tr>
    <td style="height:180px;text-align:center;vertical-align:middle;">${s.fotos[0]?`<img src="${s.fotos[0]}" style="max-width:100%;max-height:175px;">`:'&nbsp;'}</td>
    <td style="height:180px;text-align:center;vertical-align:middle;">${s.fotos[1]?`<img src="${s.fotos[1]}" style="max-width:100%;max-height:175px;">`:'&nbsp;'}</td>
  </tr>
</table>` : ''}

<div class="nota">Nota: Se debe diligenciar los campos de firma clara y legible, sin tachones y enmendados; este documento debe entregarse diligenciado en su totalidad de lo contrario no será válido.</div>

</body></html>`;

    toast('⏳ Generando PDF...');
    try {
        await Promise.all([
            window.html2canvas ? Promise.resolve() : cargarScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
            window.jspdf ? Promise.resolve() : cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
        ]);
        await new Promise(r => setTimeout(r, 300));
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;height:1200px;border:none;z-index:-1;';
        document.body.appendChild(iframe);
        iframe.contentDocument.open();
        iframe.contentDocument.write(html);
        iframe.contentDocument.close();
        await document.fonts.ready;
        await new Promise(r => setTimeout(r, 1200));
        const canvas = await window.html2canvas(iframe.contentDocument.body, {
            scale:2.5, backgroundColor:'#ffffff', useCORS:true, allowTaint:true, logging:false, windowWidth:794
        });
        document.body.removeChild(iframe);
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait' });
        const imgW = 210;
        const imgH = (canvas.height * imgW) / canvas.width;
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgW, imgH);
        pdf.save(`OT_${s.idMtto||s.id}_${s.tiendaCodigo||''}.pdf`);
        toast('✅ PDF descargado');
    } catch(err) {
        const blob = new Blob([html], { type:'text/html;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `OT_${s.idMtto||s.id}.html`; a.click();
        toast('⚠️ PDF falló — descargado como HTML');
    }
}

function cargarScript(src) {
    return new Promise((res,rej) => {
        const s = document.createElement('script');
        s.src = src; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
    });
}

function cargarImagenBase64(url) {
    return new Promise((res, rej) => {
        const img = new Image(); img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            c.getContext('2d').drawImage(img,0,0);
            res(c.toDataURL('image/png'));
        };
        img.onerror = rej;
        img.src = url;
    });
}

// ============================================
// APROBACIÓN ADMIN
// ============================================
window.aprobarOrden = async (sid) => {
    if (!confirm('¿Aprobar esta orden y estampar el sello?')) return;
    try {
        await updateDoc(doc(db, 'servicios', sid), {
            aprobado: true,
            pendienteAprobacion: false,
            aprobadoEn: new Date().toISOString(),
            aprobadoPor: sesionActual?.nombre || 'Admin'
        });
        toast('✅ Orden aprobada y sellada');
        await cargarDatos();
    } catch(e) { toast('⚠️ Error: ' + e.message); }
};

// ============================================
// FLUJO QR — APROBACIÓN JEFE DE TIENDA
// ============================================
function manejarRutaAprobacion() {
    const hash = window.location.hash;
    if (!hash.startsWith('#/aprobar/')) return false;
    const token = hash.replace('#/aprobar/', '');
    document.getElementById('botnavEl').style.display = 'none';
    document.getElementById('mainContent').innerHTML = `
        <div class="page" style="max-width:400px;">
          <div style="text-align:center;margin-bottom:1rem;">
            <img src="${LOGO_URL}" style="height:48px;" onerror="this.style.display='none'">
          </div>
          <div id="qrAprobacionContent">
            <div class="loading-screen" style="position:relative;min-height:150px;background:transparent;"><div class="loading-spinner"></div></div>
          </div>
        </div>`;
    cargarAprobacionQR(token);
    return true;
}

async function cargarAprobacionQR(token) {
    const cont = document.getElementById('qrAprobacionContent');
    try {
        const snap = await getDoc(doc(db, 'aprobaciones', token));
        if (!snap.exists()) { cont.innerHTML = '<div class="login-error">❌ Link inválido o expirado</div>'; return; }
        const data = snap.data();
        if (data.usado) { cont.innerHTML = '<div class="login-error">❌ Este link ya fue utilizado</div>'; return; }
        if (new Date(data.expira) < new Date()) { cont.innerHTML = '<div class="login-error">❌ Este link expiró</div>'; return; }
        const sSnap = await getDoc(doc(db, 'servicios', data.servicioId));
        if (!sSnap.exists()) { cont.innerHTML = '<div class="login-error">❌ Orden no encontrada</div>'; return; }
        const s = { id: sSnap.id, ...sSnap.data() };
        cont.innerHTML = `
          <div class="info-box" style="margin-bottom:.75rem;">
            <div style="background:var(--negro);color:var(--dorado);padding:6px 10px;border-radius:6px;font-weight:700;font-size:.8rem;margin-bottom:.65rem;">
              📋 Orden ${s.idMtto||'—'}
            </div>
            <div class="cc-row">🏪 ${s.tiendaNombre||s.tiendaCodigo||'—'}</div>
            <div class="cc-row">📍 ${s.tiendaMunicipio||''} ${s.tiendaDepartamento?'· '+s.tiendaDepartamento:''}</div>
            <div class="cc-row">📅 ${fmtFecha(s.fecha)}</div>
            <div class="cc-row">🔧 ${s.tecnico||'—'} · CC ${s.tecnicoCedula||'—'}</div>
            <div class="cc-row">Tipo: ${s.tipoAsistencia||'—'}</div>
            ${s.actividades ? `<div class="cc-row" style="margin-top:.4rem;">✅ ${s.actividades.slice(0,100)}</div>` : ''}
          </div>
          <label class="fl">Tu número de celular</label>
          <input class="fi" id="qrCel" type="tel" placeholder="3XX XXX XXXX" style="margin-bottom:.75rem;">
          <label class="fl">Tu firma (jefe/funcionario de la tienda)</label>
          <canvas id="firmaQRCanvas" class="firma-canvas" style="margin-bottom:.35rem;"></canvas>
          <button class="btn btn-gray btn-sm" onclick="document.getElementById('firmaQRCanvas').getContext('2d').clearRect(0,0,1000,300)" style="margin-bottom:.75rem;">Limpiar firma</button>
          <div style="font-size:.72rem;color:var(--hint);margin-bottom:.75rem;">Al firmar confirmas que el servicio fue realizado a satisfacción. Tu número de celular, firma y ubicación quedan registrados.</div>
          <button class="btn btn-gold btn-full" onclick="confirmarQR('${token}','${s.id}')">✅ Aprobar y firmar</button>`;
        setTimeout(() => iniciarFirmaCanvas('firmaQRCanvas'), 100);
    } catch(e) {
        cont.innerHTML = `<div class="login-error">⚠️ Error: ${e.message}</div>`;
    }
}

window.confirmarQR = async (token, sid) => {
    const cel    = document.getElementById('qrCel')?.value?.trim();
    const canvas = document.getElementById('firmaQRCanvas');
    if (!cel) { toast('⚠️ Ingresa tu número de celular'); return; }
    const firma  = canvas ? canvas.toDataURL('image/png') : '';
    let gps = null;
    try {
        gps = await new Promise((res) => navigator.geolocation.getCurrentPosition(
            p => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => res(null), { timeout: 5000 }
        ));
    } catch(e) {}
    try {
        await updateDoc(doc(db, 'servicios', sid), {
            aprobado: true, pendienteAprobacion: false,
            aprobadoEn: new Date().toISOString(),
            firmaJefeQR: firma, celularJefe: cel,
            gpsJefe: gps, userAgentJefe: navigator.userAgent
        });
        await updateDoc(doc(db, 'aprobaciones', token), { usado: true });
        document.getElementById('qrAprobacionContent').innerHTML = `
          <div style="text-align:center;padding:2rem;">
            <div style="font-size:3rem;margin-bottom:.75rem;">✅</div>
            <div style="font-weight:700;font-size:1.1rem;color:#15803d;">¡Aprobado!</div>
            <div style="font-size:.82rem;color:#555;margin-top:.35rem;">Orden cerrada correctamente</div>
          </div>`;
    } catch(e) { toast('⚠️ Error al aprobar: ' + e.message); }
};

// ============================================
// GENERAR QR DE APROBACIÓN
// ============================================
window.generarQRAprobacion = async (sid) => {
    const token  = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const expira = new Date(Date.now() + 30*60*1000).toISOString();
    try {
        await setDoc(doc(db, 'aprobaciones', token), {
            servicioId: sid, expira, usado: false, creadoEn: new Date().toISOString()
        });
        const url = `${location.origin}${location.pathname}#/aprobar/${token}`;
        mostrarQRModal(url);
    } catch(e) { toast('⚠️ Error generando QR: ' + e.message); }
};

function mostrarQRModal(url) {
    showModal(`<div class="modal" style="max-width:340px;">
      <div class="modal-h"><h3>📱 QR para jefe de tienda</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <div class="qr-container"><div id="qrRender"></div></div>
        <div style="font-size:.72rem;color:var(--hint);text-align:center;margin-top:.5rem;">Expira en 30 minutos · Un solo uso</div>
        <div style="font-size:.65rem;color:#555;word-break:break-all;margin-top:.35rem;">${url}</div>
        <div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cerrar</button></div>
      </div>
    </div>`);
    cargarScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js').then(() => {
        new window.QRCode(document.getElementById('qrRender'), { text: url, width: 220, height: 220 });
    });
}

// ============================================
// QR DEL EQUIPO (info + historial)
// ============================================
window.modalQREquipo = (eid) => {
    const e = getEq(eid);
    const c = getCl(e?.clienteId);
    const url = `${location.origin}${location.pathname}#/equipo/${eid}`;
    showModal(`<div class="modal" style="max-width:340px;">
      <div class="modal-h"><h3>📱 QR Activo</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b" style="text-align:center;">
        <div style="font-weight:700;margin-bottom:.35rem;">${e?.tipo||''} ${e?.marca||''} ${e?.modelo||''}</div>
        <div style="font-size:.76rem;color:#555;margin-bottom:.75rem;">${c?.nombre||''}</div>
        <div id="qrEquipoRender"></div>
        <a href="${url}" download class="btn btn-gold btn-full" style="margin-top:.75rem;text-decoration:none;">⬇️ Descargar QR</a>
        <div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cerrar</button></div>
      </div>
    </div>`);
    cargarScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js').then(() => {
        new window.QRCode(document.getElementById('qrEquipoRender'), { text: url, width: 220, height: 220 });
    });
};

// ============================================
// HISTORIAL CLIENTE (descarga CSV)
// ============================================
window.descargarHistorialCliente = (cid) => {
    const c   = getCl(cid);
    const eqs = getEquiposCliente(cid);
    let csv   = 'ID MTTO,Fecha,Tienda,Tipo,Técnico,Aprobada\n';
    eqs.forEach(e => {
        getServiciosEquipo(e.id).forEach(s => {
            csv += `${s.idMtto||''},${s.fecha||''},${s.tiendaCodigo||''},${s.tipoAsistencia||''},${s.tecnico||''},${s.aprobado?'Sí':'No'}\n`;
        });
    });
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `Historial_${c?.nombre||cid}.csv`;
    a.click();
};

// ============================================
// CRUD — CLIENTES
// ============================================
window.modalNuevoCliente = () => {
    showModal(`<div class="modal">
      <div class="modal-h"><h3>🏢 Nuevo cliente</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <label class="fl">Nombre ★</label><input class="fi" id="cNombre" placeholder="Razón social">
        <label class="fl">NIT</label><input class="fi" id="cNit" placeholder="900.000.000-0">
        <label class="fl">Teléfono</label><input class="fi" id="cTel" type="tel">
        <label class="fl">Dirección</label><input class="fi" id="cDir">
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-gold" onclick="guardarCliente()">Guardar</button>
        </div>
      </div>
    </div>`);
};
window.guardarCliente = async () => {
    const nombre = document.getElementById('cNombre')?.value?.trim();
    if (!nombre) { toast('⚠️ Nombre requerido'); return; }
    try {
        await addDoc(collection(db,'empresas'), {
            nombre, nit: document.getElementById('cNit')?.value?.trim()||'',
            telefono: document.getElementById('cTel')?.value?.trim()||'',
            direccion: document.getElementById('cDir')?.value?.trim()||'',
            creadoEn: new Date().toISOString()
        });
        toast('✅ Cliente guardado'); closeModal(); await cargarDatos();
    } catch(e) { toast('⚠️ Error: '+e.message); }
};
window.modalEditarCliente = (cid) => {
    const c = getCl(cid);
    showModal(`<div class="modal">
      <div class="modal-h"><h3>✏️ Editar cliente</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <label class="fl">Nombre</label><input class="fi" id="cNombre" value="${c.nombre||''}">
        <label class="fl">NIT</label><input class="fi" id="cNit" value="${c.nit||''}">
        <label class="fl">Teléfono</label><input class="fi" id="cTel" value="${c.telefono||''}">
        <label class="fl">Dirección</label><input class="fi" id="cDir" value="${c.direccion||''}">
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-gold" onclick="actualizarCliente('${cid}')">Actualizar</button>
        </div>
      </div>
    </div>`);
};
window.actualizarCliente = async (cid) => {
    try {
        await updateDoc(doc(db,'empresas',cid), {
            nombre: document.getElementById('cNombre').value,
            nit:    document.getElementById('cNit').value,
            telefono: document.getElementById('cTel').value,
            direccion: document.getElementById('cDir').value
        });
        toast('✅ Cliente actualizado'); closeModal(); await cargarDatos();
    } catch(e) { toast('⚠️ Error: '+e.message); }
};
window.confirmarEliminarCliente = (cid) => {
    if (!confirm('¿Eliminar este cliente y todos sus activos?')) return;
    eliminarCliente(cid);
};
async function eliminarCliente(cid) {
    const eids = getEquiposCliente(cid).map(e => e.id);
    try {
        for (const eid of eids) {
            for (const s of getServiciosEquipo(eid)) await deleteDoc(doc(db,'servicios',s.id));
            await deleteDoc(doc(db,'equipos',eid));
        }
        await deleteDoc(doc(db,'empresas',cid));
        await cargarDatos(); goTo('clientes'); toast('🗑️ Cliente eliminado');
    } catch(e) { toast('⚠️ Error: '+e.message); }
}

// ============================================
// CRUD — EQUIPOS
// ============================================
window.modalNuevoEquipo = (cid) => {
    showModal(`<div class="modal">
      <div class="modal-h"><h3>🔧 Nuevo activo</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <div class="fr">
          <div><label class="fl">Marca ★</label><input class="fi" id="eMarca"></div>
          <div><label class="fl">Modelo ★</label><input class="fi" id="eModelo"></div>
        </div>
        <label class="fl">Serie</label><input class="fi" id="eSerie">
        <label class="fl">Ubicación ★</label><input class="fi" id="eUbic" placeholder="Tienda #045 - Nevera 1">
        <label class="fl">Tipo</label><input class="fi" id="eTipo" placeholder="Nevera / Congelador / Aire...">
        <label class="fl">Estado</label>
        <select class="fi" id="eEstado">
          <option>Operativo</option><option>Fuera de servicio</option><option>Dar de baja</option>
        </select>
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-gold" onclick="guardarEquipo('${cid}')">Guardar</button>
        </div>
      </div>
    </div>`);
};
window.guardarEquipo = async (cid) => {
    const marca = document.getElementById('eMarca')?.value?.trim();
    const modelo= document.getElementById('eModelo')?.value?.trim();
    const ubic  = document.getElementById('eUbic')?.value?.trim();
    if (!marca||!modelo||!ubic) { toast('⚠️ Marca, modelo y ubicación requeridos'); return; }
    try {
        await addDoc(collection(db,'equipos'), {
            clienteId: cid, marca, modelo,
            serie:    document.getElementById('eSerie')?.value||'',
            ubicacion: ubic,
            tipo:     document.getElementById('eTipo')?.value||'',
            estado:   document.getElementById('eEstado')?.value||'Operativo'
        });
        toast('✅ Activo guardado'); closeModal(); await cargarDatos();
    } catch(e) { toast('⚠️ Error: '+e.message); }
};
window.modalEditarEquipo = (eid) => {
    const e = getEq(eid);
    showModal(`<div class="modal">
      <div class="modal-h"><h3>✏️ Editar activo</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <div class="fr">
          <div><label class="fl">Marca</label><input class="fi" id="eMarca" value="${e.marca||''}"></div>
          <div><label class="fl">Modelo</label><input class="fi" id="eModelo" value="${e.modelo||''}"></div>
        </div>
        <label class="fl">Serie</label><input class="fi" id="eSerie" value="${e.serie||''}">
        <label class="fl">Ubicación</label><input class="fi" id="eUbic" value="${e.ubicacion||''}">
        <label class="fl">Tipo</label><input class="fi" id="eTipo" value="${e.tipo||''}">
        <label class="fl">Estado</label>
        <select class="fi" id="eEstado">
          ${['Operativo','Fuera de servicio','Dar de baja'].map(s=>`<option ${e.estado===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-gold" onclick="actualizarEquipo('${eid}')">Actualizar</button>
        </div>
      </div>
    </div>`);
};
window.actualizarEquipo = async (eid) => {
    try {
        await updateDoc(doc(db,'equipos',eid), {
            marca:    document.getElementById('eMarca').value,
            modelo:   document.getElementById('eModelo').value,
            serie:    document.getElementById('eSerie').value,
            ubicacion: document.getElementById('eUbic').value,
            tipo:     document.getElementById('eTipo').value,
            estado:   document.getElementById('eEstado').value
        });
        toast('✅ Activo actualizado'); closeModal(); await cargarDatos();
    } catch(e) { toast('⚠️ Error: '+e.message); }
};
window.confirmarEliminarEquipo = (eid) => {
    if (!confirm('¿Eliminar este activo y sus órdenes?')) return;
    eliminarEquipo(eid);
};
async function eliminarEquipo(eid) {
    try {
        for (const s of getServiciosEquipo(eid)) await deleteDoc(doc(db,'servicios',s.id));
        await deleteDoc(doc(db,'equipos',eid));
        await cargarDatos(); toast('🗑️ Activo eliminado');
    } catch(e) { toast('⚠️ Error: '+e.message); }
}
window.eliminarServicio = async (sid) => {
    if (!confirm('¿Eliminar esta orden?')) return;
    try {
        await deleteDoc(doc(db,'servicios',sid));
        await cargarDatos(); toast('🗑️ Orden eliminada');
    } catch(e) { toast('⚠️ Error: '+e.message); }
};

// ============================================
// CRUD — TÉCNICOS
// ============================================
window.modalNuevoTecnico = () => {
    showModal(`<div class="modal">
      <div class="modal-h"><h3>👷 Nuevo técnico</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <label class="fl">Nombre completo ★</label><input class="fi" id="tNombre">
        <div class="fr">
          <div><label class="fl">Tipo doc</label><select class="fi" id="tTipo">${TIPOS_DOC.map(d=>`<option>${d}</option>`).join('')}</select></div>
          <div><label class="fl">Cédula ★</label><input class="fi" id="tCedula" type="number"></div>
        </div>
        <label class="fl">Teléfono</label><input class="fi" id="tTel" type="tel">
        <label class="fl">Cargo</label><input class="fi" id="tCargo" placeholder="Técnico / Ingeniero">
        <label class="fl">Rol</label>
        <select class="fi" id="tRol"><option value="tecnico">Técnico</option><option value="admin">Admin</option></select>
        <label class="fl">Clave (4 dígitos) ★</label>
        <input class="fi" id="tClave" type="password" maxlength="4" placeholder="••••">
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-gold" onclick="guardarTecnico()">Guardar</button>
        </div>
      </div>
    </div>`);
};
window.guardarTecnico = async () => {
    const nombre = document.getElementById('tNombre')?.value?.trim();
    const cedula = document.getElementById('tCedula')?.value?.trim();
    const clave  = document.getElementById('tClave')?.value?.trim();
    if (!nombre||!cedula||!clave) { toast('⚠️ Nombre, cédula y clave requeridos'); return; }
    if (clave.length !== 4) { toast('⚠️ Clave de 4 dígitos'); return; }
    try {
        await addDoc(collection(db,'tecnicos'), {
            nombre, cedula, clave,
            tipoDoc:  document.getElementById('tTipo')?.value||'CC',
            telefono: document.getElementById('tTel')?.value||'',
            cargo:    document.getElementById('tCargo')?.value||'',
            rol:      document.getElementById('tRol')?.value||'tecnico',
            creadoEn: new Date().toISOString()
        });
        toast('✅ Técnico guardado'); closeModal(); await cargarDatos();
    } catch(e) { toast('⚠️ Error: '+e.message); }
};
window.modalEditarTecnico = (tid) => {
    const t = getTec(tid);
    showModal(`<div class="modal">
      <div class="modal-h"><h3>✏️ Editar técnico</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
      <div class="modal-b">
        <label class="fl">Nombre</label><input class="fi" id="tNombre" value="${t.nombre||''}">
        <label class="fl">Cédula</label><input class="fi" id="tCedula" value="${t.cedula||''}">
        <label class="fl">Teléfono</label><input class="fi" id="tTel" value="${t.telefono||''}">
        <label class="fl">Cargo</label><input class="fi" id="tCargo" value="${t.cargo||''}">
        <label class="fl">Rol</label>
        <select class="fi" id="tRol"><option value="tecnico" ${t.rol==='tecnico'?'selected':''}>Técnico</option><option value="admin" ${t.rol==='admin'?'selected':''}>Admin</option></select>
        <label class="fl">Nueva clave (opcional)</label>
        <input class="fi" id="tClave" type="password" maxlength="4" placeholder="Dejar vacío para no cambiar">
        <div class="modal-foot">
          <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-gold" onclick="actualizarTecnico('${tid}')">Actualizar</button>
        </div>
      </div>
    </div>`);
};
window.actualizarTecnico = async (tid) => {
    const data = {
        nombre:   document.getElementById('tNombre').value,
        cedula:   document.getElementById('tCedula').value,
        telefono: document.getElementById('tTel').value,
        cargo:    document.getElementById('tCargo').value,
        rol:      document.getElementById('tRol').value
    };
    const nuevaClave = document.getElementById('tClave')?.value?.trim();
    if (nuevaClave && nuevaClave.length === 4) data.clave = nuevaClave;
    try {
        await updateDoc(doc(db,'tecnicos',tid), data);
        toast('✅ Técnico actualizado'); closeModal(); await cargarDatos();
    } catch(e) { toast('⚠️ Error: '+e.message); }
};
window.eliminarTecnico = async (tid) => {
    if (!confirm('¿Eliminar este técnico?')) return;
    try {
        await deleteDoc(doc(db,'tecnicos',tid));
        await cargarDatos(); toast('🗑️ Técnico eliminado');
    } catch(e) { toast('⚠️ Error: '+e.message); }
};

// ============================================
// EXPONER AL SCOPE GLOBAL
// ============================================
window.goTo                   = goTo;
window.closeModal             = closeModal;
window.cerrarSesion           = cerrarSesion;
window.abrirLogin             = abrirLogin;
window.pinNum                 = pinNum;
window.pinDel                 = pinDel;
window.pinLogin               = pinLogin;
window.modalNuevaOrden        = modalNuevaOrden;
window.guardarOrden           = guardarOrden;
window.generarOT              = generarOT;
window.verOrdenPDF            = verOrdenPDF;
window.buscarTienda           = buscarTienda;
window.limpiarFirmaOT         = limpiarFirmaOT;
window.previewFotoOT          = previewFotoOT;
window.aprobarOrden           = aprobarOrden;
window.generarQRAprobacion    = generarQRAprobacion;
window.confirmarQR            = confirmarQR;
window.modalQREquipo          = modalQREquipo;
window.descargarHistorialCliente = descargarHistorialCliente;
window.modalNuevoCliente      = modalNuevoCliente;
window.guardarCliente         = guardarCliente;
window.modalEditarCliente     = modalEditarCliente;
window.actualizarCliente      = actualizarCliente;
window.confirmarEliminarCliente = confirmarEliminarCliente;
window.modalNuevoEquipo       = modalNuevoEquipo;
window.guardarEquipo          = guardarEquipo;
window.modalEditarEquipo      = modalEditarEquipo;
window.actualizarEquipo       = actualizarEquipo;
window.confirmarEliminarEquipo = confirmarEliminarEquipo;
window.eliminarServicio       = eliminarServicio;
window.modalNuevoTecnico      = modalNuevoTecnico;
window.guardarTecnico         = guardarTecnico;
window.modalEditarTecnico     = modalEditarTecnico;
window.actualizarTecnico      = actualizarTecnico;
window.eliminarTecnico        = eliminarTecnico;
window.filtrarClientes        = filtrarClientes;
window.filtrarEquipos         = filtrarEquipos;

// ============================================
// INIT
// ============================================
(async () => { await cargarDatos(); })();
