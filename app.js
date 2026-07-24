// ============================================
// JD Arquisoluciones S.A.S - APP Firebase
// Versión: D1 SAS + JMC + RO + QR + Informes
// Última actualización: Mayo 2026
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
    query, orderBy, writeBatch, runTransaction, getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBf8Zu84MPTjx60MsFstL6esFgYEpVurxA",
    authDomain: "jdarq-65151.firebaseapp.com",
    projectId: "jdarq-65151",
    storageBucket: "jdarq-65151.firebasestorage.app",
    messagingSenderId: "332208097404",
    appId: "1:332208097404:web:d51faaaa80c9bc5afc1dc2"
};

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw5OJtITMcidLT8KO1T13fnEslWygu9b2rBJmGSMjPP0IpMQtxheC4O3XSHOaduSUg33Q/exec';

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);

// ============================================
// VARIABLES GLOBALES
// ============================================
let clientes = [], equipos = [], servicios = [], tecnicos = [], tiendas = [];
let jmcTiendas = [], d1Tiendas = [];
let currentView = 'panel';
let sesionActual = null;
let selectedClienteId = null;
let selectedTiendaId = null;
let selectedEquipoId = null;
let fotosNuevas = [null, null, null];
let fotosD1 = [null, null];
let d1FirmaDataUrl = '';
let _servicioEidActual = null;
let _jmcHtmlUltimo = null;
let _jmcTicketUltimo = '';
let _jmcRepuestosUltimo = '';

const CIUDADES = ['Bogota','Medellin','Cali','Bucaramanga','Barranquilla','Cucuta','Manizales','Pereira','Ibague','Villavicencio','Giron','Floridablanca','Piedecuesta','Pamplona','Soacha'];
const TIPOS_DOC = ['CC','CE','PA','NIT','TI'];
const ESPECIALIDADES = [
    { id: 'mecanico', label: 'Tecnico de refrigeracion' },
    { id: 'baja', label: 'Electricista baja tension' },
    { id: 'media', label: 'Electricista media tension' },
    { id: 'electronico', label: 'Electronico' },
    { id: 'ups', label: 'UPS' },
    { id: 'planta', label: 'Refrigeracion industrial' }
];

// ============================================
// FUNCIONES DE DRIVE
// ============================================
let _driveConnected = false;
function driveIsConnected() { return _driveConnected; }

async function conectarDriveAuto() {
    try {
        await fetch(APPS_SCRIPT_URL, { method: 'GET', mode: 'no-cors' });
        _driveConnected = true;
    } catch (e) { _driveConnected = false; }
}

async function driveUploadPDF(html, filename) {
    if (!filename.endsWith('.pdf')) filename = filename.replace('.html', '') + '.pdf';
    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST', mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html, filename })
        });
        return true;
    } catch(e) { return false; }
}

// ============================================
// CARGA DE DATOS
// ============================================
async function cargarDatos() {
    const main = document.getElementById('mainContent');
    main.innerHTML = '<div class="loading-screen"><div class="loading-spinner"></div><p>Cargando...</p></div>';
    try {
        const [cs, es, ss, ts, tis] = await Promise.all([
            getDocs(query(collection(db, 'empresas'), orderBy('nombre'))),
            getDocs(collection(db, 'equipos')),
            getDocs(query(collection(db, 'servicios'), orderBy('fecha', 'desc'))),
            getDocs(collection(db, 'tecnicos')),
            getDocs(collection(db, 'tiendas'))
        ]);
        clientes  = cs.docs.map(d => ({ id: d.id, ...d.data() }));
        equipos   = es.docs.map(d => ({ id: d.id, ...d.data() }));
        servicios = ss.docs.map(d => ({ id: d.id, ...d.data() }));
        tecnicos  = ts.docs.map(d => ({ id: d.id, ...d.data() }));
        tiendas   = tis.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        toast('⚠️ Error de conexión');
        main.innerHTML = '<div class="page" style="text-align:center;padding:2rem;"><p>⚠️ Error al cargar datos</p><button class="btn btn-blue" onclick="location.reload()">Reintentar</button></div>';
        return;
    }
    renderView();
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================
const getEq = id => equipos.find(e => e.id === id);
const getCl = id => clientes.find(c => c.id === id);
const getTec = id => tecnicos.find(t => t.id === id);
const getTienda = id => tiendas.find(t => t.id === id);
const getTiendasCliente = cid => tiendas.filter(t => t.clienteId === cid);
const getEquiposTienda = tid => equipos.filter(e => e.tiendaId === tid);
const getEquiposCliente = cid => equipos.filter(e => e.clienteId === cid);
const getServiciosEquipo = eid => servicios.filter(s => s.equipoId === eid);
const getServiciosCliente = cid => servicios.filter(s => getEquiposCliente(cid).some(e => e.id === s.equipoId));

function fmtFecha(f) {
    if (!f) return '';
    return new Date(f + 'T12:00:00').toLocaleDateString('es-ES');
}
function getMesActual() { return new Date().toISOString().slice(0, 7); }
function esAdmin() { return sesionActual?.rol === 'admin'; }
function esPropietario(creadoPor) { return sesionActual?.nombre === creadoPor; }
function puedeEditar(creadoPor) { return esAdmin() || esPropietario(creadoPor); }

function esClienteJMC(clienteId) { return getCl(clienteId)?.nombre === 'Jeronimo Martins Colombia'; }
function esClienteRO(clienteId) { return getCl(clienteId)?.nombre === 'Construciones Arquitectonicas RO'; }
function esClienteD1(clienteId) { return getCl(clienteId)?.nombre === 'D1 SAS'; }

function getTiendaJMC(sap) { return jmcTiendas.find(t => t.sap === String(sap)); }
function getTiendaD1(idTienda) { return d1Tiendas.find(t => t.idTienda === String(idTienda)); }

async function obtenerConsecutivoD1() {
    const ref = doc(db, 'consecutivos', 'd1');
    let nuevo;
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const actual = snap.exists() ? (snap.data().ultimo || 0) : 0;
        nuevo = actual + 1;
        tx.set(ref, { ultimo: nuevo }, { merge: true });
    });
    return `K-${nuevo}`;
}

function toast(msg, duration = 3000) {
    const t = document.getElementById('toastEl');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), duration);
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
    fotosNuevas = [null, null, null];
    fotosD1 = [null, null];
}

function actualizarTopbar() {
    const right = document.getElementById('topbarRight');
    if (!right) return;
    if (!sesionActual) {
        right.innerHTML = `<span class="topbar-user">Sin sesion</span>`;
    } else {
        const initials = sesionActual.nombre.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
        const rolBadge = esAdmin() ? `<span class="topbar-rol-badge">Admin</span>` : '';
        right.innerHTML = `<div class="topbar-sesion"><div class="topbar-avatar">${initials}</div><div><div style="font-size:0.68rem;color:white;font-weight:700;">${sesionActual.nombre.split(' ')[0]}</div>${rolBadge}</div><button class="topbar-salir" onclick="cerrarSesion()">Salir</button></div>`;
    }
}

function cerrarSesion() { sesionActual = null; actualizarTopbar(); renderView(); toast('👋 Sesion cerrada'); }

function goTo(view, cid = null, tid = null, eid = null) {
    currentView = view;
    selectedClienteId = cid;
    selectedTiendaId = tid;
    selectedEquipoId = eid;
    closeModal();
    renderView();
    document.querySelectorAll('.bni').forEach(b => {
        b.classList.toggle('active', b.dataset.page === view || (view === 'detalle' && b.dataset.page === 'clientes') || (view === 'historial' && b.dataset.page === 'clientes'));
    });
}

function renderView() {
    if (!sesionActual && currentView !== 'panel' && currentView !== 'tecnicos') currentView = 'panel';
    const main = document.getElementById('mainContent');
    document.getElementById('botnavEl').style.display = 'flex';
    switch (currentView) {
        case 'panel': main.innerHTML = renderPanel(); break;
        case 'clientes': main.innerHTML = renderClientes(); break;
        case 'detalle': main.innerHTML = renderDetalleCliente(); break;
        case 'detalle-tienda': main.innerHTML = renderDetalleTienda(); break;
        case 'historial': main.innerHTML = renderHistorial(); break;
        case 'equipos': main.innerHTML = renderEquipos(); break;
        case 'servicios': main.innerHTML = renderServicios(); if (window.aplicarFiltros) aplicarFiltros(); break;
        case 'mantenimientos': main.innerHTML = renderMantenimientos(); break;
        case 'tecnicos': main.innerHTML = renderTecnicos(); break;
        default: main.innerHTML = renderPanel();
    }
}

// ============================================
// RENDERIZADO DE VISTAS
// ============================================
function renderPanel() {
    const hoy = new Date();
    const prefijo = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
    const man  = servicios.filter(s => s.tipo === 'Mantenimiento');
    const rep  = servicios.filter(s => s.tipo === 'Reparacion');
    const inst = servicios.filter(s => s.tipo === 'Instalacion');
    const manM = man.filter(s  => s.fecha?.startsWith(prefijo));
    const repM = rep.filter(s  => s.fecha?.startsWith(prefijo));
    const instM= inst.filter(s => s.fecha?.startsWith(prefijo));
    const eqOp   = equipos.filter(e => e.estado === 'Operativo').length;
    const eqFs   = equipos.filter(e => e.estado === 'Fuera de servicio').length;
    const eqBaja = equipos.filter(e => e.estado === 'Dar de baja').length;
    const eqSin  = equipos.filter(e => !e.estado || e.estado === '').length;
    const row = (n,l,c) => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f0f0f0;font-size:0.78rem;"><span>${l}</span><span style="font-weight:700;color:${c};">${n}</span></div>`;
    const col = (titulo, color, rows) => `<div style="background:white;border-radius:10px;padding:10px;box-shadow:0 1px 6px rgba(0,0,0,0.08);"><div style="font-weight:700;font-size:0.72rem;color:#555;border-bottom:2px solid ${color};padding-bottom:4px;margin-bottom:6px;">${titulo}</div>${rows}</div>`;
    const eqsFuera = equipos.filter(e=>e.estado==='Fuera de servicio');
    return `<div class="page">
<div style="background:#0c214a;color:white;padding:10px 14px;border-radius:10px;margin-bottom:12px;display:flex;align-items:center;gap:10px;">
  <img src="https://raw.githubusercontent.com/capacitADA/JDARQ/main/JDARQ-logo.png" style="height:32px;filter:brightness(0) invert(1);" onerror="this.style.display='none'">
  <div><div style="font-weight:700;font-size:0.95rem;">Panel Principal</div><div style="font-size:0.72rem;opacity:0.85;">Refrigeración Industrial</div></div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
  ${col('ESTADO','#e4002b', row(eqOp,'Operativos','#16a34a')+row(eqFs,'Fuera serv.','#dc2626')+row(eqBaja,'Dar de baja','#f59e0b')+row(eqSin,'Sin info','#94a3b8'))}
  ${col('SERV. ANUAL','#2563eb', row(man.length,'Mantenm.','#2563eb')+row(rep.length,'Reparación','#dc2626')+row(inst.length,'Instalación','#16a34a'))}
  ${col('SERV. MES','#7c3aed', row(manM.length,'Mantenm.','#2563eb')+row(repM.length,'Reparación','#dc2626')+row(instM.length,'Instalación','#16a34a'))}
</div>
<div style="background:white;border-radius:10px;padding:10px;box-shadow:0 1px 6px rgba(0,0,0,0.08);">
  <div style="font-weight:700;font-size:0.8rem;margin-bottom:6px;color:#e4002b;">⚠️ Equipos FUERA DE SERVICIO</div>
  ${eqsFuera.length===0
    ? '<div style="color:#94a3b8;font-size:0.78rem;">No hay equipos en este estado.</div>'
    : eqsFuera.map(e=>{const cl=getCl(e.clienteId);return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f5f5f5;font-size:0.78rem;"><span>${e.marca} ${e.modelo} <span style="color:#94a3b8;">· ${e.ubicacion||''}</span></span><span style="color:#555;">${cl?.nombre||''}</span></div>`;}).join('')}
</div></div>`;
}


function renderClientes() {
    return `<div class="page">
        <div class="sec-head"><h2>Clientes (${clientes.length})</h2>${esAdmin() ? `<button class="btn btn-blue btn-sm" onclick="modalNuevoCliente()">+ Nuevo</button>` : ''}</div>
        <input class="search" placeholder="🔍 Buscar..." oninput="filtrarClientes(this.value)" id="searchClientes">
        <div id="clientesGrid">
        ${clientes.map(c => {
            const numTiendas = tiendas.filter(t => t.cliente === c.nombre).length;
            const numEquipos = getEquiposCliente(c.id).length;
            const numServ    = getServiciosCliente(c.id).length;
            return `<div class="cc" data-search="${(c.nombre+(c.nit||'')).toLowerCase()}">
                <div style="display:flex;justify-content:space-between;">
                    <div class="cc-name">${c.nombre}</div>
                    ${esAdmin() ? `<div><button class="ib" onclick="modalEditarCliente('${c.id}')">✏️</button><button class="ib" onclick="modalEliminarCliente('${c.id}')">🗑️</button></div>` : ''}
                </div>
                ${c.nit ? `<div class="cc-row">🪪 NIT: ${c.nit}</div>` : ''}
                ${c.telefono ? `<div class="cc-row">📞 ${c.telefono}</div>` : ''}
                <div class="cc-meta">${numTiendas} tienda(s) · ${numEquipos} activo(s) · ${numServ} servicio(s)</div>
                <button class="link-btn" onclick="goTo('detalle','${c.id}')">Ver tiendas →</button>
            </div>`;
        }).join('')}
        </div>
    </div>`;
}

function filtrarClientes(v) {
    const txt = v.toLowerCase();
    document.querySelectorAll('#clientesGrid .cc').forEach(c => { c.style.display = (c.dataset.search||'').includes(txt) ? '' : 'none'; });
}

function renderDetalleCliente() {
    const c = getCl(selectedClienteId);
    if (!c) { goTo('clientes'); return ''; }
    const tiendasCliente = getTiendasCliente(c.id);
    return `<div class="page">
        <div class="det-hdr">
            <button class="back" onclick="goTo('clientes')">← Volver</button>
            <div><div class="cc-name">${c.nombre}</div></div>
        </div>
        ${c.nit ? `<div class="info-box"><div class="cc-row">🪪 NIT: ${c.nit}</div>${c.telefono?`<div class="cc-row">📞 ${c.telefono}</div>`:''}</div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.65rem;">
            <span style="font-weight:700;">Tiendas (${tiendasCliente.length})</span>
            <input class="search" placeholder="🔍 Buscar tienda..." oninput="filtrarTiendasDetalle(this.value)" style="width:180px;margin:0;">
        </div>
        <div id="tiendasDetalleGrid">
        ${tiendasCliente.map(t => {
            const numEq  = getEquiposTienda(t.id).length;
            const numSrv = servicios.filter(s => getEquiposTienda(t.id).some(e => e.id === s.equipoId)).length;
            return `<div class="ec" data-search="${(t.codigo+t.nombre+t.municipio).toLowerCase()}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div>
                        <div class="ec-name">${t.nombre}</div>
                        <div class="ec-meta">📍 ${t.municipio||''} · ${t.departamento||''}</div>
                        <div class="ec-meta">Código: <strong>${t.codigo}</strong></div>
                        ${t.latitud ? `<a class="map-link" href="https://maps.google.com/?q=${t.latitud},${t.longitud}" target="_blank">🗺️ Ver GPS</a>` : ''}
                        <div class="ec-meta">${numEq} activo(s) · ${numSrv} incidencia(s)</div>
                    </div>
                </div>
                <div class="ec-btns">
                    <button class="ab" onclick="goTo('detalle-tienda','${c.id}','${t.id}')">🔧 Ver activos</button>
                    <button class="ab" onclick="modalQRTienda('${t.id}')">📱 QR</button>
                </div>
            </div>`;
        }).join('')}
        </div>
    </div>`;
}

window.filtrarTiendasDetalle = v => {
    document.querySelectorAll('#tiendasDetalleGrid .ec').forEach(el => {
        el.style.display = (el.dataset.search||'').includes(v.toLowerCase()) ? '' : 'none';
    });
};

function renderDetalleTienda() {
    const t = getTienda(selectedTiendaId);
    const c = getCl(selectedClienteId);
    if (!t) { goTo('detalle', selectedClienteId); return ''; }
    const eqs = getEquiposTienda(t.id);
    return `<div class="page">
        <div class="det-hdr">
            <button class="back" onclick="goTo('detalle','${c?.id}')">← ${c?.nombre||'Volver'}</button>
            <div>
                <div class="cc-name">${t.nombre}</div>
                <div class="ec-meta">📍 ${t.municipio||''}, ${t.departamento||''} · Cód: ${t.codigo}</div>
            </div>
        </div>
        ${t.latitud ? `<div style="margin-bottom:.5rem;"><a class="map-link" href="https://maps.google.com/?q=${t.latitud},${t.longitud}" target="_blank">🗺️ Ver ubicación en Google Maps</a></div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.65rem;">
            <span style="font-weight:700;">Activos (${eqs.length})</span>
            <div style="display:flex;gap:6px;">
                <button class="btn btn-gray btn-sm" onclick="descargarHistorialTienda('${t.id}')">📥 Historial</button>
                ${esAdmin() || sesionActual ? `<button class="btn btn-blue btn-sm" onclick="modalNuevoEquipo('${c?.id}','${t.id}')">+ Activo</button>` : ''}
            </div>
        </div>
        ${eqs.map(e => {
            const numSrv = getServiciosEquipo(e.id).length;
            return `<div class="ec">
                <div style="display:flex;justify-content:space-between;">
                    <div>
                        <div class="ec-name">${e.tipo ? e.tipo+' · ' : ''}${e.marca} ${e.modelo}</div>
                        <div class="ec-meta">📍 ${e.ubicacion||'Sin ubicación'} · Serie: ${e.serie||'S/N'}</div>
                        <div class="ec-meta" style="color:${e.estado==='Operativo'?'#16a34a':e.estado==='Fuera de servicio'?'#dc2626':'#f59e0b'};">
                            ● ${e.estado||'Sin estado'}
                        </div>
                        <div class="ec-meta">${numSrv} incidencia(s)</div>
                    </div>
                    ${esAdmin() ? `<div><button class="ib" onclick="modalEditarEquipo('${e.id}')">✏️</button><button class="ib" onclick="modalEliminarEquipo('${e.id}')">🗑️</button></div>` : ''}
                </div>
                <div class="ec-btns">
                    <button class="ab" onclick="goTo('historial','${c?.id}','${t.id}','${e.id}')">📋 Incidencias</button>
                    <button class="ab" onclick="modalNuevaIncidencia('${e.id}')">➕ Nueva</button>
                    <button class="ab" onclick="generarInformePDF('${e.id}')">📄 PDF</button>
                    <button class="ab" onclick="modalQR('${e.id}')">📱 QR</button>
                </div>
            </div>`;
        }).join('')}
    </div>`;
}

window.descargarHistorialTienda = (tid) => {
    const t   = getTienda(tid);
    const eqs = getEquiposTienda(tid);
    let csv   = 'ID MTTO,Fecha,Tipo,Técnico,Aprobada\n';
    eqs.forEach(e => getServiciosEquipo(e.id).forEach(s => {
        csv += `${s.idMtto||''},${s.fecha||''},${s.tipo||''},${s.tecnico||''},${s.aprobado?'Sí':'No'}\n`;
    }));
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `Historial_${t?.nombre||tid}.csv`;
    a.click();
};

function renderHistorial() {
    const e = getEq(selectedEquipoId);
    if (!e) { goTo('clientes'); return ''; }
    const c = getCl(e.clienteId);
    const ss = getServiciosEquipo(e.id).sort((a,b) => new Date(b.fecha)-new Date(a.fecha));
    return `<div class="page"><div class="det-hdr"><button class="back" onclick="goTo('detalle-tienda','${e.clienteId}','${e.tiendaId||selectedTiendaId}')">← Volver</button><div><div class="ec-name">${e.tipo ? e.tipo+' · ' : ''}${e.marca} ${e.modelo}</div><div class="ec-meta">${e.ubicacion} · ${c?.nombre}</div></div></div><div style="margin-bottom:2rem;"><span style="font-weight:700;">Historial (${ss.length})</span></div>${ss.map(s => `<div class="si"><div class="si-top"><span class="badge ${s.tipo==='Mantenimiento'?'b-blue':s.tipo==='Reparacion'?'b-red':'b-green'}">${s.tipo}</span><span>${fmtFecha(s.fecha)}</span></div><div class="si-info">🔧 ${s.tecnico}</div>${s.funcionarioNombre ? '<div class="si-info">✍️ Recibido por: <strong>'+s.funcionarioNombre+'</strong>'+(s.funcionarioId?' · '+s.funcionarioId:'')+'</div>' : ''}<div class="si-info">${s.descripcion}</div>${s.proximoMantenimiento ? `<div class="si-info" style="color:var(--gold);">📅 Proximo: ${fmtFecha(s.proximoMantenimiento)}</div>` : ''}<div class="fotos-strip">${(s.fotos||[]).map(f => `<img class="fthumb" src="${f}" loading="lazy">`).join('')}</div><div class="si-top" style="justify-content:flex-end;margin-top:4px;">${puedeEditar(s.tecnico) ? `<button class="ib" onclick="modalEditarServicio('${s.id}')">✏️</button>` : ''}${esAdmin() ? `<button class="ib" onclick="eliminarServicio('${s.id}')">🗑️</button>` : ''}</div></div>`).join('')}</div>`;
}

function renderEquipos() {
    return `<div class="page"><div class="sec-head"><h2>Activos (${equipos.length})</h2></div><input class="search" placeholder="🔍 Buscar..." oninput="filtrarEquipos(this.value)" id="searchEq"><div id="equiposGrid">${equipos.map(e => { const c = getCl(e.clienteId); const esD1 = esClienteD1(e.clienteId); return `<div class="ec" data-search="${(e.marca+e.modelo+(c?.nombre||'')).toLowerCase()}"><div class="ec-name">${e.marca} ${e.modelo}</div><div class="ec-meta">👤 ${c?.nombre||'Sin cliente'} · 📍 ${e.ubicacion}</div><div class="ec-btns"><button class="ab" onclick="goTo('historial','${e.clienteId}','${e.id}')">📋 Servicios</button>${esD1 ? `<button class="ab" onclick="modalActaD1('${e.id}')">➕ Nuevo D1</button>` : `<button class="ab" onclick="modalNuevoServicio('${e.id}')">➕ Nuevo</button>`}<button class="ab" onclick="generarInformePDF('${e.id}')">📄 PDF</button></div></div>`; }).join('')}</div></div>`;
}

function filtrarEquipos(v) { document.querySelectorAll('#equiposGrid .ec').forEach(c => { c.style.display = (c.dataset.search||'').includes(v.toLowerCase()) ? '' : 'none'; }); }

function renderServicios() {
    const años = [...new Set(servicios.map(s=>s.fecha?.slice(0,4)).filter(Boolean))].sort((a,b)=>b-a);
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return `<div class="page"><div class="sec-head"><h2>Servicios</h2></div><div class="filtros"><select class="fi" id="fAnio"><option value="">Todos los años</option>${años.map(a=>`<option>${a}</option>`).join('')}</select><select class="fi" id="fMes"><option value="">Todos los meses</option>${meses.map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}">${m}</option>`).join('')}</select><select class="fi" id="fTipo"><option value="">Todos los tipos</option><option>Mantenimiento</option><option>Reparacion</option><option>Instalacion</option></select><select class="fi" id="fCliente"><option value="">Todos los clientes</option>${clientes.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('')}</select><select class="fi" id="fTecnico"><option value="">Todos los tecnicos</option>${tecnicos.map(t=>`<option>${t.nombre}</option>`).join('')}</select><button class="btn btn-blue btn-full" onclick="aplicarFiltros()">Aplicar</button><button class="btn btn-gray btn-full" onclick="limpiarFiltros()">Limpiar</button></div><div id="listaServicios"></div></div>`;
}

function aplicarFiltros() {
    const anio = document.getElementById('fAnio')?.value||'', mes = document.getElementById('fMes')?.value||'', tipo = document.getElementById('fTipo')?.value||'', cid = document.getElementById('fCliente')?.value||'', tec = document.getElementById('fTecnico')?.value||'';
    let filtrados = [...servicios].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
    if (anio) filtrados = filtrados.filter(s=>s.fecha?.startsWith(anio));
    if (mes) filtrados = filtrados.filter(s=>s.fecha?.slice(5,7)===mes);
    if (tipo) filtrados = filtrados.filter(s=>s.tipo===tipo);
    if (cid) filtrados = filtrados.filter(s=>getEquiposCliente(cid).some(e=>e.id===s.equipoId));
    if (tec) filtrados = filtrados.filter(s=>s.tecnico===tec);
    const el = document.getElementById('listaServicios');
    if (!el) return;
    if (!filtrados.length) { el.innerHTML='<p class="cc-meta" style="text-align:center;">Sin resultados.</p>'; return; }
    el.innerHTML = filtrados.map(s => { const e = getEq(s.equipoId); const c = getCl(e?.clienteId); return `<div class="si"><div class="si-top"><span class="badge ${s.tipo==='Mantenimiento'?'b-blue':s.tipo==='Reparacion'?'b-red':'b-green'}">${s.tipo}</span><span>${fmtFecha(s.fecha)}</span></div><div class="si-info">👤 ${c?.nombre||'N/A'} · ${e?.marca||''} ${e?.modelo||''}</div><div class="si-info">📍 ${e?.ubicacion||''} · 🔧 ${s.tecnico}</div><div class="si-info">${s.descripcion}</div>${s.proximoMantenimiento?`<div class="si-info" style="color:var(--gold);">📅 Proximo: ${fmtFecha(s.proximoMantenimiento)}</div>`:''}</div>`; }).join('');
}

function limpiarFiltros() { ['fAnio','fMes','fTipo','fCliente','fTecnico'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; }); aplicarFiltros(); }

function renderMantenimientos() {
    const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const año = new Date().getFullYear();
    const mant = servicios.filter(s=>s.proximoMantenimiento);
    return `<div class="page"><div class="sec-head"><h2>Agenda ${año}</h2></div><div class="tbl-wrap"><table><thead><tr><th>Mes</th><th>Fecha</th><th>Cliente</th><th>Activo</th><th></th></tr></thead><tbody>${MESES.map((mes,idx) => { const mp = String(idx+1).padStart(2,'0'); const lista = mant.filter(m=>m.proximoMantenimiento?.startsWith(`${año}-${mp}`)); if (!lista.length) return `<tr><td style="color:var(--hint);">${mes}</td><td colspan="4" style="color:#cbd5e1;">—</td></tr>`; return lista.map((m,i) => { const e = getEq(m.equipoId); const c = getCl(e?.clienteId); return `<tr>${i===0?`<td rowspan="${lista.length}" style="font-weight:700;background:var(--bg2);">${mes}</td>`:''}<td>${fmtFecha(m.proximoMantenimiento)}</td><td>${c?.nombre||'N/A'}</td><td>${e?`${e.marca} ${e.modelo}`:'N/A'}</td><td><button class="rec-btn" onclick="modalRecordar('${e?.clienteId}','${e?.id}','${m.proximoMantenimiento}')">📱</button></td></tr>`; }).join(''); }).join('')}</tbody></table></div></div>`;
}

function renderTecnicos() {
    return `<div class="page"><div class="sec-head"><h2>Tecnicos (${tecnicos.length})</h2>${esAdmin() ? `<button class="btn btn-blue btn-sm" onclick="modalNuevoTecnico()">+ Nuevo</button>` : ''}</div>${tecnicos.map(t => { const esps = (t.especialidades||[]).map(id => ESPECIALIDADES.find(e=>e.id===id)?.label||id); const isActive = sesionActual && sesionActual.id === t.id; return `<div class="ec" style="${isActive ? 'border:2px solid #10b981;' : ''}"><div style="display:flex;justify-content:space-between;"><div><div class="ec-name">${t.nombre} ${isActive ? '<span style="background:#10b981;color:white;font-size:0.6rem;padding:2px 6px;border-radius:10px;margin-left:5px;">✓ Activo</span>' : ''}</div><div class="ec-meta">${t.tipoDoc}</div><div class="ec-meta">${t.cargo}</div><div class="ec-meta">📞 ${t.telefono}</div></div><div><span class="tc-rol-badge ${t.rol==='admin'?'rol-admin':'rol-tec'}">${t.rol==='admin'?'Admin':'Tecnico'}</span>${esAdmin() && !isActive ? `<div><button class="ib" onclick="modalEditarTecnico('${t.id}')">✏️</button><button class="ib" onclick="eliminarTecnico('${t.id}')">🗑️</button></div>` : ''}</div></div><div>${esps.map(e=>`<span class="esp-chip">${e}</span>`).join('')}</div><div class="ec-meta">📍 ${t.region||'Sin region'}</div>${!isActive ? `<button class="btn btn-blue btn-sm btn-full" onclick="abrirLogin('${t.id}')">🔑 Ingresar como ${t.nombre.split(' ')[0]}</button>` : `<button class="btn btn-gray btn-sm btn-full" onclick="cerrarSesion()">🚪 Cerrar sesión</button>`}</div>`; }).join('')}</div>`;
}

// ============================================
// LOGIN
// ============================================
let mlPinActual = '';

function abrirLogin(tid) {
    const t = getTec(tid);
    mlPinActual = '';
    showModal(`<div class="modal" style="max-width:320px;"><div class="modal-h"><h3>🔑 Ingresar</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><div style="font-weight:700;">${t.nombre}</div><div class="ec-meta">${t.tipoDoc}</div><label class="fl">Cedula</label><input class="fi" id="mlCedula" type="number"><label class="fl">Clave (4 digitos)</label><div class="pin-display"><div class="pin-digit" id="mlpd0"></div><div class="pin-digit" id="mlpd1"></div><div class="pin-digit" id="mlpd2"></div><div class="pin-digit" id="mlpd3"></div></div><div class="numpad">${[1,2,3,4,5,6,7,8,9].map(n=>`<div class="num-btn" onclick="mlPin('${tid}',${n})">${n}</div>`).join('')}<div class="num-btn del" onclick="mlDel()">⌫</div><div class="num-btn zero" onclick="mlPin('${tid}',0)">0</div><div class="num-btn ok" onclick="mlLogin('${tid}')">✓</div></div><div id="mlMsg"></div><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="mlLogin('${tid}')">Ingresar</button></div></div></div>`);
    mlUpdateDisplay();
}
function mlPin(tid, n) { if (mlPinActual.length >= 4) return; mlPinActual += String(n); mlUpdateDisplay(); if (mlPinActual.length === 4) mlLogin(tid); }
function mlDel() { mlPinActual = mlPinActual.slice(0,-1); mlUpdateDisplay(); }
function mlUpdateDisplay() { for (let i=0;i<4;i++) { const d = document.getElementById('mlpd'+i); if(!d) continue; d.className='pin-digit'; if(i<mlPinActual.length){ d.textContent='●'; d.classList.add('filled'); } else if(i===mlPinActual.length){ d.textContent='_'; d.classList.add('active'); } else { d.textContent=''; } } }
function mlLogin(tid) {
    const t = getTec(tid);
    const cedula = document.getElementById('mlCedula')?.value?.trim();
    const msg = document.getElementById('mlMsg');
    if (!cedula) { if(msg) msg.innerHTML='<div class="login-warn">⚠️ Cedula requerida</div>'; return; }
    if (mlPinActual.length<4) { if(msg) msg.innerHTML='<div class="login-warn">⚠️ Clave de 4 digitos</div>'; return; }
    if (t.cedula !== cedula || t.clave !== mlPinActual) { if(msg) msg.innerHTML='<div class="login-error">❌ Credenciales incorrectas</div>'; mlPinActual=''; mlUpdateDisplay(); return; }
    sesionActual = t;
    mlPinActual = '';
    closeModal();
    actualizarTopbar();
    currentView='panel';
    renderView();
    toast(`✅ Bienvenido, ${t.nombre.split(' ')[0]}`);
}

// ============================================
// MODAL RECORDAR
// ============================================
function modalRecordar(clienteId, equipoId, fecha) {
    const e = getEq(equipoId);
    const c = getCl(clienteId);
    const fechaF = new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    const esJMC = esClienteJMC(clienteId);
    let tel, destinatario, msg;
    if (esJMC) {
        const sap = e?.ubicacion;
        const tienda = getTiendaJMC(sap);
        if (tienda) {
            tel = tienda.telefono;
            destinatario = `${tienda.coordinador} · SAP ${sap}`;
            msg = `Hola *${tienda.coordinador}*, recordatorio: activo *${e?.marca} ${e?.modelo}* tienda *${tienda.tienda} (SAP ${sap})* requiere mantenimiento el *${fechaF}*. Confirmar visita. JD Arquisoluciones S.A.S 📞 3105533937`;
        } else { tel = c?.telefono; destinatario = c?.nombre; msg = `Hola *${c?.nombre}*, recordatorio: activo *${e?.marca} ${e?.modelo}* requiere mantenimiento el *${fechaF}*. JD Arquisoluciones S.A.S 📞 3105533937`; }
    } else { tel = c?.telefono; destinatario = c?.nombre; msg = `Hola *${c?.nombre}*, recordatorio: activo *${e?.marca} ${e?.modelo}* requiere mantenimiento el *${fechaF}*. JD Arquisoluciones S.A.S 📞 3105533937`; }
    showModal(`<div class="modal"><div class="modal-h"><h3>📱 Recordatorio WhatsApp</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><div class="ec-meta">Para <strong>${destinatario}</strong> · 📞 ${tel}</div><div class="wa-bubble">${msg}</div><textarea class="fi" id="waMsgEdit" rows="4">${msg}</textarea><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-wa" onclick="enviarWhatsApp('${tel}')">📱 Abrir WhatsApp</button></div></div></div>`);
}
function enviarWhatsApp(tel) { const msg = document.getElementById('waMsgEdit')?.value||''; const telLimpio = '57' + tel.replace(/\D/g,''); window.open(`https://wa.me/${telLimpio}?text=${encodeURIComponent(msg)}`, '_blank'); closeModal(); toast('📱 WhatsApp abierto'); }

// ============================================
// MANEJO DE FOTOS
// ============================================
async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const MAX = 800;
                const scale = Math.min(1, MAX / Math.max(img.width, img.height));
                const w = Math.round(img.width * scale);
                const h = Math.round(img.height * scale);
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.72));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
async function comprimirImagenD1(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const MAX = 600;
                const scale = Math.min(1, MAX / Math.max(img.width, img.height));
                const w = Math.round(img.width * scale);
                const h = Math.round(img.height * scale);
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function previewFoto(input, idx, isD1 = false) {
    if (!input.files || !input.files[0]) return;
    if (isD1) { fotosD1[idx] = input.files[0]; } else { fotosNuevas[idx] = input.files[0]; }
    const reader = new FileReader();
    reader.onload = e => { const slot = document.getElementById(`fslot${idx}${isD1 ? '_d1' : ''}`); if (slot) slot.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;"><button class="fslot-del" onclick="borrarFoto(event,${idx}, ${isD1})">✕</button><input type="file" id="finput${idx}${isD1 ? '_d1' : ''}" accept="image/*" style="display:none" onchange="previewFoto(this,${idx}, ${isD1})">`; };
    reader.readAsDataURL(input.files[0]);
}
function borrarFoto(e, idx, isD1 = false) {
    e.stopPropagation();
    if (isD1) {
        fotosD1[idx] = null;
        const slot = document.getElementById(`fslot${idx}_d1`);
        if (slot) { slot.innerHTML = `<div class="fslot-plus">+</div><div class="fslot-lbl">${idx === 0 ? 'ANTES' : 'DESPUÉS'}</div><input type="file" id="finput${idx}_d1" accept="image/*" style="display:none" onchange="previewFoto(this,${idx}, true)">`; slot.onclick = () => document.getElementById(`finput${idx}_d1`).click(); }
    } else {
        fotosNuevas[idx] = null;
        const slot = document.getElementById(`fslot${idx}`);
        if (slot) { slot.innerHTML = `<div class="fslot-plus">+</div><div class="fslot-lbl">Foto ${idx+1}</div><input type="file" id="finput${idx}" accept="image/*" style="display:none" onchange="previewFoto(this,${idx})">`; slot.onclick = () => document.getElementById(`finput${idx}`).click(); }
    }
}

// ============================================
// MODAL NUEVO SERVICIO NORMAL (NO D1)
// ============================================
async function guardarServicio(eid) {
    const desc = document.getElementById('sDesc')?.value?.trim();
    if(!desc){ toast('⚠️ Ingresa el diagnostico'); return; }
    const tipo = document.getElementById('sTipo').value;
    const fecha = document.getElementById('sFecha').value;
    const prox = tipo === 'Mantenimiento' ? (document.getElementById('proxFecha')?.value || null) : null;
    const fotosBase64 = [];
    for (let i = 0; i < fotosNuevas.length; i++) { if (fotosNuevas[i]) fotosBase64.push(await fileToBase64(fotosNuevas[i])); }
    try {
        await addDoc(collection(db, 'servicios'), { equipoId: eid, tipo, fecha, tecnico: sesionActual?.nombre || '', descripcion: desc, proximoMantenimiento: prox, fotos: fotosBase64 });
        closeModal(); await cargarDatos(); const e = getEq(eid); if(e) goTo('historial', e.clienteId, eid); toast('✅ Servicio guardado con ' + fotosBase64.length + ' foto(s)');
    } catch(err) { toast('❌ Error: ' + err.message); }
}
function onTipoChange() { const tipo = document.getElementById('sTipo')?.value; const box = document.getElementById('mantBox'); if (box) box.classList.toggle('hidden', tipo !== 'Mantenimiento'); }
function modalNuevoServicio(eid) {
    if (!sesionActual) { toast('🔑 Inicia sesion para continuar'); return; }
    const e = getEq(eid); const c = getCl(e?.clienteId); const hoy = new Date().toISOString().split('T')[0];
    const esJMC = esClienteJMC(e?.clienteId); const esRO = esClienteRO(e?.clienteId);
    fotosNuevas = [null, null, null]; _servicioEidActual = eid;
    const tiendaJMC = esJMC ? getTiendaJMC(e?.ubicacion) : null;
    showModal(`<div class="modal" onclick="event.stopPropagation()"><div class="modal-h"><h3>Nuevo servicio</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><div style="background:var(--bg2);padding:0.55rem;border-radius:8px;margin-bottom:0.65rem;"><strong>${c?.nombre}</strong><br><span style="font-size:0.75rem;">${e?.marca} ${e?.modelo} · 📍 ${e?.ubicacion}</span>${tiendaJMC ? `<br><span style="font-size:0.72rem;color:var(--green);">🏪 ${tiendaJMC.tienda} · ${tiendaJMC.ciudad}</span>` : ''}</div><div class="fr"><div><label class="fl">Tipo *</label><select class="fi" id="sTipo" onchange="onTipoChange()"><option>Mantenimiento</option><option>Reparacion</option><option>Instalacion</option></select></div><div><label class="fl">Fecha *</label><input class="fi" type="date" id="sFecha" value="${hoy}"></div></div><label class="fl">Tecnico</label><input class="fi" id="sTecnico" value="${sesionActual?.nombre||''}" readonly>${esJMC ? `<div style="background:#f5f3ff;border-radius:10px;padding:0.65rem;margin-top:0.65rem;display:flex;justify-content:space-between;align-items:center;"><span style="color:#5b21b6;">📋 Informe Jeronimo Martins</span><button class="btn btn-sm" style="background:#7c3aed;color:white;" onclick="modalInformeJMC('${eid}')">Abrir</button></div>` : ''}${esRO ? `<div style="background:#e8f4fd;border-radius:10px;padding:0.65rem;margin-top:0.65rem;display:flex;justify-content:space-between;align-items:center;"><span style="color:#1565c0;">📋 Informe KRYOTEC SAS</span><button class="btn btn-sm" style="background:#1976d2;color:white;" onclick="modalInformeRO('${eid}')">Abrir</button></div>` : ''}<label class="fl">Diagnostico / Descripcion *</label><textarea class="fi" id="sDesc" rows="3" placeholder="Trabajo realizado..."></textarea><div class="mant-box hidden" id="mantBox"><label class="fl">📅 Proximo mantenimiento</label><input class="fi" type="date" id="proxFecha"></div><label class="fl">📷 Fotos (max 3)</label><div class="foto-row">${[0,1,2].map(i => `<div style="flex:1;"><div class="fslot" id="fslot${i}" onclick="document.getElementById('finput${i}').click()"><div class="fslot-plus">+</div><div class="fslot-lbl">Foto ${i+1}</div><input type="file" id="finput${i}" accept="image/*" style="display:none" onchange="previewFoto(this,${i})"></div></div>`).join('')}</div><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="guardarServicio('${eid}')">💾 Guardar</button></div></div></div>`);
    onTipoChange();
}
function modalEditarServicio(sid) {
    const s = servicios.find(x => x.id === sid); if (!s) return;
    const esD1 = !!s.consecutivoD1;
    if (esD1) {
        const TIPOS_D1 = ['Preventivo','Correctivo','Emergencia'];
        const ESTADOS = ['Operativo','Fuera de servicio','Dar de baja'];
        showModal(`<div class="modal"><div class="modal-h"><h3>Editar servicio D1</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b">
            <div class="fr">
                <div><label class="fl">Tipo</label><select class="fi" id="esTipo">${TIPOS_D1.map(t=>`<option ${s.tipo===t?'selected':''}>${t}</option>`).join('')}</select></div>
                <div><label class="fl">Fecha</label><input class="fi" type="date" id="esFecha" value="${s.fecha}"></div>
            </div>
            <label class="fl">Falla encontrada</label><textarea class="fi" id="esFalla" rows="2">${s.falla||''}</textarea>
            <label class="fl">Trabajo realizado</label><textarea class="fi" id="esTrabajo" rows="2">${s.trabajoRealizado||''}</textarea>
            <label class="fl">Condición de entrega</label><textarea class="fi" id="esEntrega" rows="2">${s.condicionEntrega||''}</textarea>
            <label class="fl">Estado final</label><select class="fi" id="esEstado">${ESTADOS.map(t=>`<option ${s.estadoEntrega===t?'selected':''}>${t}</option>`).join('')}</select>
            <label class="fl">Observaciones</label><textarea class="fi" id="esObs" rows="2">${s.observaciones||''}</textarea>
            <div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="actualizarServicioD1('${sid}')">Guardar</button></div>
        </div></div>`);
    } else {
        showModal(`<div class="modal"><div class="modal-h"><h3>Editar servicio</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><div class="fr"><div><label class="fl">Tipo</label><select class="fi" id="esTipo"><option ${s.tipo==='Mantenimiento'?'selected':''}>Mantenimiento</option><option ${s.tipo==='Reparacion'?'selected':''}>Reparacion</option><option ${s.tipo==='Instalacion'?'selected':''}>Instalacion</option></select></div><div><label class="fl">Fecha</label><input class="fi" type="date" id="esFecha" value="${s.fecha}"></div></div><label class="fl">Diagnostico</label><textarea class="fi" id="esDesc" rows="3">${s.descripcion}</textarea><label class="fl">Proximo mantenimiento</label><input class="fi" type="date" id="esProx" value="${s.proximoMantenimiento||''}"><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="actualizarServicio('${sid}')">Guardar</button></div></div></div>`);
    }
}
async function actualizarServicio(sid) { const tipo = document.getElementById('esTipo')?.value; const fecha = document.getElementById('esFecha')?.value; const desc = document.getElementById('esDesc')?.value?.trim(); const prox = document.getElementById('esProx')?.value || null; try { await updateDoc(doc(db, 'servicios', sid), { tipo, fecha, descripcion: desc, proximoMantenimiento: prox }); closeModal(); await cargarDatos(); toast('✅ Servicio actualizado'); } catch(err) { toast('❌ Error: ' + err.message); } }
async function eliminarServicio(sid) { if (!confirm('¿Eliminar este servicio?')) return; try { await deleteDoc(doc(db, 'servicios', sid)); await cargarDatos(); toast('🗑️ Eliminado'); } catch(err) { toast('❌ Error: ' + err.message); } }

// ============================================
// FUNCIONES D1 - SELLO Y FIRMA
// ============================================
async function generarSelloD1(nombreTienda) {
    const SELLO_URL = 'https://raw.githubusercontent.com/capacitADA/JDARQ/main/SELLO_d1.png';
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const fontSize = Math.round(canvas.height * 0.13);
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.fillStyle = '#1a1a1a';
            ctx.textAlign = 'center';
            ctx.fillText((nombreTienda || 'D1').toUpperCase(), canvas.width / 2, canvas.height * 0.30);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('No se pudo cargar el sello D1'));
        img.src = SELLO_URL;
    });
}

function iniciarFirmaCanvasD1(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    let drawing = false, lastX = 0, lastY = 0;
    const getPos = ev => { const r = canvas.getBoundingClientRect(); const s = ev.touches ? ev.touches[0] : ev; return [s.clientX - r.left, s.clientY - r.top]; };
    canvas.addEventListener('mousedown', e => { drawing=true; [lastX,lastY]=getPos(e); });
    canvas.addEventListener('mousemove', e => { if(!drawing) return; const [x,y]=getPos(e); ctx.beginPath(); ctx.moveTo(lastX,lastY); ctx.lineTo(x,y); ctx.strokeStyle='#1a1a6e'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.stroke(); [lastX,lastY]=[x,y]; });
    canvas.addEventListener('mouseup', () => drawing=false);
    canvas.addEventListener('mouseleave', () => drawing=false);
    canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing=true; [lastX,lastY]=getPos(e); }, {passive:false});
    canvas.addEventListener('touchmove', e => { e.preventDefault(); if(!drawing) return; const [x,y]=getPos(e); ctx.beginPath(); ctx.moveTo(lastX,lastY); ctx.lineTo(x,y); ctx.stroke(); [lastX,lastY]=[x,y]; }, {passive:false});
    canvas.addEventListener('touchend', () => drawing=false);
}
function limpiarFirmaD1() { const canvas = document.getElementById('d1FirmaCanvas'); if (canvas) { const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); d1FirmaDataUrl = ''; } }

// ============================================
// MODAL ACTA D1 - FORMULARIO DE INGRESO DE DATOS
// ============================================
async function modalActaD1(eid) {
    if (!sesionActual) { toast('🔑 Debes iniciar sesión primero'); return; }
    const e = getEq(eid);
    if (!e) { toast('❌ Equipo no encontrado'); return; }
    if (!esClienteD1(e.clienteId)) { toast('❌ Este equipo no pertenece a D1 SAS'); return; }
    const tienda = getTiendaD1(e.idTienda);
    if (!tienda) toast('⚠️ No se encontró la tienda D1 para este equipo');
    const hoy = new Date();
    const dd = String(hoy.getDate()).padStart(2, '0');
    const aa = String(hoy.getFullYear()).slice(-2);
    const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const mes = meses[hoy.getMonth()];
    let consecutivo = '';
    try { consecutivo = await obtenerConsecutivoD1(); } catch (err) { toast('❌ Error obteniendo consecutivo: ' + err.message); consecutivo = `K-${Math.floor(Math.random() * 10000)}`; }
    fotosD1 = [null, null];
    d1FirmaDataUrl = '';
    showModal(`<div class="modal modal-wide" onclick="event.stopPropagation()"><div class="modal-h" style="background:#e4002b;"><h3 style="color:white;">📋 ACTA D1 SAS — ${consecutivo}</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><div style="background:#f0f0f0;padding:8px;margin-bottom:12px;text-align:center;font-weight:700;">DATOS DEL PROVEEDOR</div><div class="fr"><div><label class="fl">NOMBRE</label><input class="fi" readonly value="JD Arquisoluciones S.A.S"></div><div><label class="fl">NIT</label><input class="fi" readonly value="901.223.583-8"></div></div><div class="fr"><div><label class="fl">CONSECUTIVO</label><input class="fi" readonly value="${consecutivo}" style="font-family:monospace;font-weight:700;"></div><div><label class="fl"># COTIZACION</label><input class="fi" readonly value=""></div></div><div class="fr"><div><label class="fl">TIENDA (CEDI)</label><input class="fi" readonly value="${tienda?.tienda || e.ubicacion || ''}"></div><div><label class="fl">ID SERVICIO *</label><input class="fi" id="d1IdServicio" placeholder="Número de ticket / ID servicio"></div></div><div style="background:#f0f0f0;padding:8px;margin:12px 0 8px;text-align:center;font-weight:700;">TIPO DE SERVICIO SOLICITADO</div><div style="margin-bottom:8px;"><div style="font-weight:700;margin-bottom:4px;">TIPO MANTENIMIENTO</div><div style="display:flex;gap:12px;">${['Preventivo','Correctivo','Emergencia'].map(t => `<label style="display:flex;align-items:center;gap:4px;"><input type="radio" name="d1TipoMant" value="${t}" ${t === 'Preventivo' ? 'checked' : ''}> ${t}</label>`).join('')}</div></div><div style="margin-bottom:8px;"><div style="font-weight:700;margin-bottom:4px;">ESPECIALIDAD</div><div style="display:flex;flex-wrap:wrap;gap:8px;">${['Civil','Eléctrico','Metalmecánico','Refrigeración','Plomería','Cerrajería','Otro'].map(esp => { const match = esp === (e.especialidad || 'Refrigeración'); return `<label style="display:flex;align-items:center;gap:4px;background:${match?'#fff3e0':'transparent'};padding:2px 6px;border-radius:4px;border:${match?'1.5px solid #f59e0b':'1px solid #ddd'};"><input type="checkbox" class="d1Especialidad" value="${esp}" ${match ? 'checked' : ''} disabled> ${esp}</label>`; }).join('')}</div></div><div style="margin-bottom:12px;"><div style="font-weight:700;margin-bottom:4px;">INFORMACION DEL EQUIPO</div><div style="display:flex;flex-wrap:wrap;gap:8px;">${['Nevera','Aire acondicionado','Congelador','Cortina de aire','Otro'].map(tipoEq => { const match = tipoEq === (e.tipo || ''); const otroMatch = tipoEq === 'Otro' && !['Nevera','Aire acondicionado','Congelador','Cortina de aire'].includes(e.tipo || ''); return `<label style="display:flex;align-items:center;gap:4px;background:${match||otroMatch?'#fff3e0':'transparent'};padding:2px 6px;border-radius:4px;border:${match||otroMatch?'1.5px solid #f59e0b':'1px solid #ddd'};"><input type="checkbox" class="d1TipoEquipo" value="${tipoEq}" ${match||otroMatch ? 'checked' : ''} disabled> ${tipoEq}</label>`; }).join('')}</div></div><div style="background:#f0f0f0;padding:8px;margin:12px 0 8px;text-align:center;font-weight:700;">DESCRIPCIÓN DEL SERVICIO EJECUTADO</div><textarea class="fi" id="d1Falla" rows="3" placeholder="① ¿Cuál era la falla y cómo la halló?"></textarea><textarea class="fi" id="d1Trabajo" rows="3" placeholder="② ¿Qué hizo para repararla?"></textarea><textarea class="fi" id="d1Entrega" rows="2" placeholder="③ ¿Cómo lo entrega?"></textarea><div style="margin:10px 0;"><div style="font-weight:700;margin-bottom:6px;">④ ESTADO:</div><div style="display:flex;flex-wrap:wrap;gap:12px;">${['Operativo','Fuera de servicio','Dar de baja'].map(est => `<label style="display:flex;align-items:center;gap:4px;"><input type="radio" name="d1Estado" value="${est}" ${est === 'Operativo' ? 'checked' : ''}> ${est}</label>`).join('')}</div></div><div style="background:#f0f0f0;padding:8px;margin:12px 0 8px;text-align:center;font-weight:700;">EVIDENCIAS FOTOGRÁFICAS</div><div class="foto-row"><div style="flex:1;"><div class="fslot" id="fslot0_d1" onclick="document.getElementById('finput0_d1').click()"><div class="fslot-plus">+</div><div class="fslot-lbl">ANTES</div><input type="file" id="finput0_d1" accept="image/*" style="display:none" onchange="previewFoto(this, 0, true)"></div></div><div style="flex:1;"><div class="fslot" id="fslot1_d1" onclick="document.getElementById('finput1_d1').click()"><div class="fslot-plus">+</div><div class="fslot-lbl">DESPUÉS</div><input type="file" id="finput1_d1" accept="image/*" style="display:none" onchange="previewFoto(this, 1, true)"></div></div></div><div style="background:#f0f0f0;padding:8px;margin:12px 0 8px;text-align:center;font-weight:700;">OBSERVACIONES O RECOMENDACIONES</div><textarea class="fi" id="d1Observaciones" rows="2" placeholder="Observaciones..."></textarea><div style="background:#f0f0f0;padding:8px;margin:12px 0 8px;text-align:center;font-weight:700;">ENTREGA A SATISFACCIÓN D1 SAS</div><div class="fr"><div><label class="fl">FIRMA TÉCNICO (PROVEEDOR)</label><div style="border:1px solid #ccc;border-radius:8px;padding:8px;text-align:center;"><div style="font-family:'Meddon', cursive; font-size:16px;">${sesionActual?.nombre || ''}</div><div>C.C. ${sesionActual?.cedula || ''}</div><div style="font-size:0.7rem;color:#666;">${sesionActual?.cargo || ''}</div></div></div><div><label class="fl">SELLO Y FIRMA D1 SAS</label><div style="border:1px solid #ccc;border-radius:8px;padding:8px;"><canvas id="d1FirmaCanvas" width="300" height="80" style="width:100%;height:80px;border:1px dashed #aaa;border-radius:8px;background:#fafafa;"></canvas><button class="btn btn-gray btn-sm" style="margin-top:4px;" onclick="limpiarFirmaD1()">🗑️ Limpiar firma</button></div></div></div><div class="fr" style="margin-top:8px;"><div><label class="fl">Nombre funcionario D1</label><input class="fi" id="d1FuncNombre" placeholder="Nombre completo"></div><div><label class="fl">Identificación funcionario</label><input class="fi" id="d1FuncId" placeholder="Número de cédula"></div></div><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn" style="background:#e4002b;color:white;" onclick="exportarActaD1('${eid}', '${consecutivo}')">📄 Generar Acta PDF</button></div></div></div>`);
    setTimeout(() => { iniciarFirmaCanvasD1('d1FirmaCanvas'); }, 100);
}

// ============================================
// EXPORTAR ACTA D1 - GENERA EL PDF FINAL
// ============================================
async function exportarActaD1(eid, consecutivo) {
    const e = getEq(eid);
    const tienda = getTiendaD1(e?.idTienda);
    const idServicio = document.getElementById('d1IdServicio')?.value?.trim() || '';
    const tipoMant = document.querySelector('input[name="d1TipoMant"]:checked')?.value || 'Preventivo';
    const especialidadesSel = Array.from(document.querySelectorAll('.d1Especialidad:checked')).map(cb => cb.value);
    const equiposSel = Array.from(document.querySelectorAll('.d1TipoEquipo:checked')).map(cb => cb.value);
    const falla = document.getElementById('d1Falla')?.value?.trim() || '';
    const trabajo = document.getElementById('d1Trabajo')?.value?.trim() || '';
    const entrega = document.getElementById('d1Entrega')?.value?.trim() || '';
    const estado = document.querySelector('input[name="d1Estado"]:checked')?.value || 'Operativo';
    const observaciones = document.getElementById('d1Observaciones')?.value?.trim() || '';
    const funcNombre = document.getElementById('d1FuncNombre')?.value?.trim() || '';
    const funcId = document.getElementById('d1FuncId')?.value?.trim() || '';
    if (!idServicio) { toast('⚠️ Ingresa el ID de Servicio'); return; }
    if (!falla) { toast('⚠️ Describe la falla encontrada'); return; }
    if (!trabajo) { toast('⚠️ Describe el trabajo realizado'); return; }
    if (!entrega) { toast('⚠️ Describe cómo lo entrega'); return; }
    if (!funcNombre) { toast('⚠️ Ingresa el nombre del funcionario D1'); return; }
    if (!funcId) { toast('⚠️ Ingresa la identificación del funcionario'); return; }
    const fotosBase64 = [];
    for (let i = 0; i < fotosD1.length; i++) {
        fotosBase64.push(fotosD1[i] ? await comprimirImagenD1(fotosD1[i]) : '');
    }
    // Guardar en Firestore
    try {
        await addDoc(collection(db, 'servicios'), {
            equipoId: eid, tipo: tipoMant, fecha: new Date().toISOString().split('T')[0],
            tecnico: sesionActual?.nombre || '', descripcion: `[D1] ${falla} | ${trabajo} | ${entrega} | Estado: ${estado}`,
            proximoMantenimiento: null, fotos: fotosBase64.filter(f=>f),
            consecutivoD1: consecutivo, idServicioD1: idServicio,
            especialidades: especialidadesSel, equipos: equiposSel, falla,
            trabajoRealizado: trabajo, condicionEntrega: entrega, estadoEntrega: estado,
            observaciones, funcionarioNombre: funcNombre, funcionarioId: funcId, idTienda: e?.idTienda || ''
        });
        await updateDoc(doc(db,'equipos',eid),{estado: estado}); toast('✅ Servicio D1 guardado'); await cargarDatos();
    } catch (err) { toast('⚠️ Error guardando: ' + err.message); }
    // Firma canvas funcionario D1
    const firmaCanvas = document.getElementById('d1FirmaCanvas');
    if (firmaCanvas) d1FirmaDataUrl = firmaCanvas.toDataURL('image/png');
    // Sello D1
    let selloUrl = '';
    try { selloUrl = await generarSelloD1(tienda?.tienda || e?.ubicacion || 'D1'); } catch(err) { console.warn(err); }
    // Fecha
    const hoy = new Date();
    const dd = String(hoy.getDate()).padStart(2,'0');
    const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const mes = MESES_ES[hoy.getMonth()];
    const aa = String(hoy.getFullYear());
    // Firma técnico — canvas con fuente Meddon (igual que Acta_D1_Kryotec_v3.html)
    let firmaTecBase64 = '';
    try {
        firmaTecBase64 = await new Promise(resolve => {
            const font = new FontFace('Meddon', 'url(https://raw.githubusercontent.com/capacitADA/JDARQ/main/Meddon-Regular.ttf)');
            font.load().then(loaded => {
                document.fonts.add(loaded);
                const c = document.createElement('canvas'); c.width = 280; c.height = 54;
                const ctx = c.getContext('2d');
                ctx.font = '28px Meddon'; ctx.fillStyle = '#111';
                ctx.fillText(sesionActual?.nombre || '', 6, 40);
                resolve(c.toDataURL('image/png'));
            }).catch(() => {
                const c = document.createElement('canvas'); c.width = 280; c.height = 54;
                const ctx = c.getContext('2d');
                ctx.font = 'italic 22px Georgia'; ctx.fillStyle = '#111';
                ctx.fillText(sesionActual?.nombre || '', 6, 38);
                resolve(c.toDataURL('image/png'));
            });
        });
    } catch(err) { console.warn(err); }
    // Firma garabato funcionario D1 (si no hay canvas)
    let firmaFunBase64 = d1FirmaDataUrl || '';
    if (!firmaFunBase64) {
        const gc = document.createElement('canvas'); gc.width = 180; gc.height = 44;
        const gctx = gc.getContext('2d');
        gctx.strokeStyle = '#111'; gctx.lineWidth = 1.8; gctx.lineCap = 'round';
        gctx.beginPath();
        gctx.moveTo(10,32); gctx.bezierCurveTo(35,8,55,36,80,22);
        gctx.bezierCurveTo(100,10,115,34,140,28);
        gctx.bezierCurveTo(150,24,160,30,170,26);
        gctx.stroke();
        firmaFunBase64 = gc.toDataURL('image/png');
    }
    const html = generarHtmlActaD1PDF({ consecutivo, idServicio, tienda, e, tipoMant,
        especialidadesSel, equiposSel, falla, trabajo, entrega, estado, observaciones,
        funcNombre, funcId, selloUrl, dd, mes, aa, fotosBase64, firmaTecBase64, firmaFunBase64 });
    const nombreArch = `Acta_D1_${consecutivo}_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}`;
    driveUploadPDF(html, nombreArch + '.pdf').catch(err => console.warn('Drive:', err));
    toast('⏳ Generando PDF...');
    try {
        // Cargar librerías si no están
        await Promise.all([
            window.html2canvas ? Promise.resolve() : new Promise((res,rej) => {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
                s.onload = res; s.onerror = rej; document.head.appendChild(s);
            }),
            window.jspdf ? Promise.resolve() : new Promise((res,rej) => {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                s.onload = res; s.onerror = rej; document.head.appendChild(s);
            })
        ]);
        await new Promise(r => setTimeout(r, 300));
        // Renderizar el HTML completo en iframe oculto para preservar los estilos del <head>
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;height:1200px;border:none;z-index:-1;';
        document.body.appendChild(iframe);
        iframe.contentDocument.open();
        iframe.contentDocument.write(html);
        iframe.contentDocument.close();
        await document.fonts.ready;
        await new Promise(r => setTimeout(r, 1200));
        const canvas = await window.html2canvas(iframe.contentDocument.body, {
            scale: 2.5, backgroundColor: '#ffffff', useCORS: true,
            allowTaint: true, logging: false, windowWidth: 794
        });
        document.body.removeChild(iframe);
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        const imgW = 210;
        const imgH = (canvas.height * imgW) / canvas.width;
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgW, imgH);
        pdf.save(nombreArch + '.pdf');
        toast('✅ PDF descargado');
    } catch(pdfErr) {
        console.error('PDF error:', pdfErr);
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = nombreArch + '.html'; a.click();
        URL.revokeObjectURL(url);
        toast('⚠️ PDF falló — descargado como HTML');
    }
    closeModal();
}

// ============================================
// GENERAR HTML DEL PDF DEL ACTA D1 - SECCIONES 1 A 8
// ============================================
function generarHtmlActaD1PDF(data) {
    const { consecutivo, idServicio, tienda, e, tipoMant, especialidadesSel, equiposSel,
            falla, trabajo, entrega, estado, observaciones, funcNombre, funcId,
            selloUrl, dd, mes, aa, fotosBase64, firmaTecBase64, firmaFunBase64 } = data;
    const tecNombre = sesionActual?.nombre || '';
    const tecCedula = sesionActual?.cedula  || '';
    const nombreTienda = tienda?.tienda || e?.ubicacion || '';
    function fmtCed(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
    function chk(val, lista) {
        return lista.includes(val)
            ? '<span style="font-size:12pt;">&#9632;</span>'
            : '<span style="font-size:10pt;">&#9744;</span>';
    }
    const descLines = [
        ...(falla.split('\n').concat(['','','','','']).slice(0,5)),
        ...(trabajo.split('\n').concat(['','','','','']).slice(0,5)),
        ...(entrega.split('\n').concat(['','']).slice(0,2)),
        `Estado final del equipo: ${estado}`, ''
    ];
    const lineRows = descLines.map((t,i) => {
        const isLast = i === descLines.length - 1;
        return `<tr class="${isLast ? 'rl-last' : 'rl'}"><td>${t}&nbsp;</td></tr>`;
    }).join('');
    const obsLines = observaciones.split('\n').concat(['','','','','']).slice(0,5);
    const obsRows = obsLines.map((t,i,a) =>
        `<tr class="${i===a.length-1 ? 'rl-last' : 'rl'}"><td>${t}&nbsp;</td></tr>`
    ).join('');
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Acta_D1_${consecutivo}</title>
<style>
@font-face { font-family:'Meddon'; src:url('https://raw.githubusercontent.com/capacitADA/JDARQ/main/Meddon-Regular.ttf') format('truetype'); }
body { font-family:Arial,sans-serif; background:#fff; padding:14px 16px; font-size:7.5pt; line-height:1.2; box-sizing:border-box; width:794px; margin:0; }
.bloque { border:2px solid #000; border-collapse:collapse; width:100%; margin-top:-2px; }
.bloque td,.bloque th { border:1px solid #000; padding:2px 5px; vertical-align:bottom; font-size:7.5pt; white-space:nowrap; }
.hd { font-weight:700; text-align:center; font-size:9pt; padding:3px; background:transparent; }
.lbl { white-space:nowrap; font-weight:700; width:1px; }
.rl td { border-left:2px solid #000; border-right:2px solid #000; border-top:none; border-bottom:1px solid #aaa; height:9px; padding:0 4px 0px 4px; font-size:8.5pt; vertical-align:bottom; white-space:normal; overflow:hidden; }
.rl-last td { border-left:2px solid #000; border-right:2px solid #000; border-top:none; border-bottom:2px solid #000; height:9px; padding:0 4px 0px 4px; font-size:8.5pt; vertical-align:bottom; white-space:normal; overflow:hidden; }
.nota { color:#e4002b; font-size:5.5pt; text-align:center; margin-top:4px; font-style:italic; }
</style>
</head>
<body>

<!-- CABECERA -->
<table class="bloque" style="border:none;margin-bottom:3px;">
  <tr>
    <td style="border:none;padding:0 6px 0 0;vertical-align:middle;width:55px;">
      <img src="https://raw.githubusercontent.com/capacitADA/JDARQ/main/Logo_D1.png" style="height:38px;">
    </td>
    <td style="border:none;text-align:center;vertical-align:middle;">
      <strong style="font-size:9.5pt;">ACTA DE ENTREGA SERVICIOS DE MANTENIMIENTO REGIONAL SANTANDER</strong>
    </td>
    <td style="border:none;text-align:right;vertical-align:middle;white-space:nowrap;">
      FECHA &nbsp;<span style="border:1px solid #000;padding:1px 5px;margin-right:-1px;">${dd}</span><span style="border:1px solid #000;padding:1px 5px;margin-right:-1px;">${mes}</span><span style="border:1px solid #000;padding:1px 5px;">${aa}</span>
    </td>
  </tr>
</table>

<!-- DATOS DEL PROVEEDOR -->
<table class="bloque">
  <tr><td colspan="4" class="hd" style="font-size:10pt;">DATOS DEL PROVEEDOR</td></tr>
  <tr>
    <td class="lbl">NOMBRE:</td><td style="font-weight:700;width:auto;">JD Arquisoluciones S.A.S</td>
    <td class="lbl">NIT:</td><td style="width:auto;">901.223.583-8</td>
  </tr>
  <tr>
    <td class="lbl">CONSECUTIVO:</td><td style="font-weight:700;color:#e4002b;">${consecutivo}</td>
    <td class="lbl"># COTIZACION:</td><td></td>
  </tr>
  <tr>
    <td class="lbl">TIENDA (CEDI):</td><td>${nombreTienda}</td>
    <td class="lbl">ID DEL SERVICIO:</td><td>${idServicio}</td>
  </tr>
</table>

<!-- TIPO DE SERVICIO -->
<table class="bloque" style="margin-top:-2px;">
  <tr><td class="hd" style="font-size:10pt;">TIPO DE SERVICIO SOLICITADO</td></tr>
</table>
<table class="bloque" style="margin-top:-2px;">
  <tr>
    <td class="lbl">TIPO DE MANTENIMIENTO: <em>MARQUE X</em></td>
    <td>Preventivo ${chk('Preventivo',[tipoMant])}</td>
    <td>Correctivo ${chk('Correctivo',[tipoMant])}</td>
    <td>Emergencia ${chk('Emergencia',[tipoMant])}</td>
  </tr>
</table>
<table class="bloque" style="margin-top:-2px;">
  <tr>
    <td class="lbl">ESPECIALIDAD: <em>MARQUE X</em></td>
    <td>Civil ${chk('Civil',especialidadesSel)}</td>
    <td>El&eacute;ctrico ${chk('El\u00e9ctrico',especialidadesSel)}</td>
    <td>Metalmec&aacute;nico ${chk('Metalmec\u00e1nico',especialidadesSel)}</td>
    <td>Refrigeraci&oacute;n ${chk('Refrigeraci\u00f3n',especialidadesSel)}</td>
    <td>Plomer&iacute;a ${chk('Plomer\u00eda',especialidadesSel)}</td>
    <td>Cerrajer&iacute;a ${chk('Cerrajer\u00eda',especialidadesSel)}</td>
    <td>Otro ${chk('Otro',especialidadesSel)}</td>
  </tr>
</table>
<table class="bloque" style="margin-top:-2px;">
  <tr>
    <td class="lbl">INFORMACION DEL EQUIPO: <em>MARQUE X</em></td>
    <td>Nevera ${chk('Nevera',equiposSel)}</td>
    <td>Aire acondicionado ${chk('Aire acondicionado',equiposSel)}</td>
    <td>Congelador ${chk('Congelador',equiposSel)}</td>
    <td>Cortina de aire ${chk('Cortina de aire',equiposSel)}</td>
    <td>Otro ${chk('Otro',equiposSel)}</td>
  </tr>
</table>

<!-- DESCRIPCION -->
<table class="bloque" style="margin-top:-2px;">
  <tr><td class="hd" style="font-size:10pt;">DESCRIPCION DEL SERVICIO EJECUTADO</td></tr>
</table>
<table style="width:100%;border-collapse:collapse;">${lineRows}</table>

<!-- EVIDENCIAS -->
<table class="bloque" style="margin-top:-2px;">
  <tr><td colspan="2" class="hd" style="font-size:10pt;">EVIDENCIAS (FOTOGRAFIAS)</td></tr>
  <tr>
    <td style="width:50%;text-align:center;font-weight:700;padding:2px;">ANTES</td>
    <td style="width:50%;text-align:center;font-weight:700;padding:2px;">DESPUES</td>
  </tr>
  <tr>
    <td style="height:200px;text-align:center;vertical-align:middle;">${fotosBase64[0] ? `<img src="${fotosBase64[0]}" style="max-width:100%;max-height:195px;">` : '&nbsp;'}</td>
    <td style="height:200px;text-align:center;vertical-align:middle;">${fotosBase64[1] ? `<img src="${fotosBase64[1]}" style="max-width:100%;max-height:195px;">` : '&nbsp;'}</td>
  </tr>
</table>

<!-- OBSERVACIONES -->
<table class="bloque" style="margin-top:-2px;">
  <tr><td class="hd" style="font-size:10pt;">OBSERVACIONES O RECOMENDACIONES</td></tr>
</table>
<table style="width:100%;border-collapse:collapse;">${obsRows}</table>

<!-- ENTREGA A SATISFACCION -->
<table class="bloque" style="margin-top:-2px;">
  <tr><td colspan="4" class="hd" style="font-size:10pt;">ENTREGA A SATISFACCION D1 SAS</td></tr>
  <tr>
    <td colspan="2" style="width:50%;text-align:center;height:65px;vertical-align:middle;">SELLO</td>
    <td colspan="2" style="width:50%;text-align:center;vertical-align:middle;">
      ${selloUrl ? `<img src="${selloUrl}" style="max-height:62px;">` : '&nbsp;'}
    </td>
  </tr>
  <tr>
    <td class="lbl">FIRMA (PROVEEDOR)</td>
    <td>${firmaTecBase64 ? `<img src="${firmaTecBase64}" style="height:30px;">` : '&nbsp;'}</td>
    <td class="lbl">FIRMA (D1 SAS)</td>
    <td>${firmaFunBase64 ? `<img src="${firmaFunBase64}" style="max-height:28px;max-width:130px;">` : '&nbsp;'}</td>
  </tr>
  <tr>
    <td class="lbl">NOMBRE COMPLETO</td><td>${tecNombre}</td>
    <td class="lbl">NOMBRE COMPLETO</td><td>${funcNombre}</td>
  </tr>
  <tr>
    <td class="lbl">IDENTIFICACION</td><td>${fmtCed(tecCedula)}</td>
    <td class="lbl">IDENTIFICACION</td><td>${fmtCed(funcId)}</td>
  </tr>
</table>
<div class="nota">Nota: Se debe diligenciar los campos de firma clara y legible, sin tachones y enmendados; este documento debe entregarse diligenciado en su totalidad de lo contrario no ser&aacute; v&aacute;lido</div>

</body>
</html>`;
}

// ============================================
// MODAL QR Y MANEJO DE RUTA QR (SIMPLIFICADOS)
// ============================================
function modalQR(eid) {
    const e = getEq(eid); const c = getCl(e?.clienteId);
    const esD1c = esClienteD1(e?.clienteId);
    const tienda = esD1c ? getTiendaD1(e?.idTienda) : null;
    const nombreTienda = tienda?.tienda || c?.nombre || '';
    const url = `${window.location.origin}${window.location.pathname}#/equipo/${eid}`;
    const LOGO = 'https://raw.githubusercontent.com/capacitADA/JDARQ/main/JDARQ-logo.png';
    const linea1 = `${e?.tipo||''} ${e?.marca||''} ${e?.modelo||''}`.trim();
    const qrDiv = document.createElement('div');
    qrDiv.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:260px;height:260px;';
    document.body.appendChild(qrDiv);
    new window.QRCode(qrDiv, { text: url, width: 260, height: 260 });
    setTimeout(async () => {
        const qrDataUrl = qrDiv.querySelector('canvas').toDataURL('image/png');
        document.body.removeChild(qrDiv);
        const logoImg = new Image(); logoImg.crossOrigin='Anonymous'; logoImg.src=LOGO;
        const qrImg = new Image(); qrImg.src=qrDataUrl;
        await Promise.all([
            new Promise(r=>{ logoImg.onload=r; logoImg.onerror=r; }),
            new Promise(r=>{ qrImg.onload=r; })
        ]);
        const W=300, pad=14, R=16, logoH=40, strip1=52, qrS=240, strip2=48;
        const H = pad+logoH+pad+strip1+qrS+strip2+pad;
        const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
        const ctx=cv.getContext('2d');
        ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H);
        ctx.strokeStyle='#0c214a'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.roundRect(1.5,1.5,W-3,H-3,R); ctx.stroke();
        if(logoImg.naturalWidth){
            const lw=logoImg.naturalWidth*(logoH/logoImg.naturalHeight);
            ctx.drawImage(logoImg,(W-lw)/2,pad,lw,logoH);
        }
        const s1y=pad+logoH+pad;
        ctx.fillStyle='#0c214a'; ctx.fillRect(0,s1y,W,strip1);
        ctx.fillStyle='#ffffff'; ctx.textAlign='center';
        ctx.font='bold 14px Arial'; ctx.fillText(linea1,W/2,s1y+20);
        ctx.font='12px Arial'; ctx.fillText(nombreTienda,W/2,s1y+38);
        ctx.drawImage(qrImg,(W-qrS)/2,s1y+strip1,qrS,qrS);
        const s2y=s1y+strip1+qrS;
        ctx.fillStyle='#0c214a';
        ctx.beginPath(); ctx.roundRect(0,s2y,W,strip2+pad,[0,0,R,R]); ctx.fill();
        ctx.fillStyle='#ffffff'; ctx.font='bold 17px Arial'; ctx.textAlign='center';
        ctx.fillText('☎  3105533937',W/2,s2y+strip2/2+6);
        const finalUrl=cv.toDataURL('image/png');
        showModal(`<div class="modal" style="max-width:340px;"><div class="modal-h"><h3>📱 Código QR</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b" style="text-align:center;"><img src="${finalUrl}" style="width:100%;border-radius:12px;"><div style="margin-top:10px;"><a href="${finalUrl}" download="QR_${e?.marca||''}_${e?.modelo||''}.png" class="btn btn-blue btn-full">⬇️ Descargar QR</a></div></div></div>`);
    }, 250);
}



// ============================================
// CRUD CLIENTES, EQUIPOS, TECNICOS
// ============================================
function modalNuevoCliente(){ showModal(`<div class="modal"><div class="modal-h"><h3>Nuevo cliente</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><label class="fl">Nombre *</label><input class="fi" id="cNombre"><label class="fl">Telefono *</label><input class="fi" id="cTel"><label class="fl">Email</label><input class="fi" id="cEmail"><label class="fl">Ciudad *</label><select class="fi" id="cCiudad">${CIUDADES.map(c=>`<option>${c}</option>`).join('')}</select><label class="fl">Direccion *</label><input class="fi" id="cDir"><button class="btn btn-blue btn-full" onclick="obtenerGPS()">📍 Compartir ubicacion</button><input type="hidden" id="cLat"><input type="hidden" id="cLng"><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="guardarCliente()">Guardar</button></div></div></div>`); }
function obtenerGPS(){ if(!navigator.geolocation){ toast('⚠️ GPS no disponible'); return; } navigator.geolocation.getCurrentPosition(pos=>{ document.getElementById('cLat').value=pos.coords.latitude.toFixed(6); document.getElementById('cLng').value=pos.coords.longitude.toFixed(6); toast('✅ Ubicacion capturada'); },()=>toast('⚠️ No se pudo obtener GPS')); }
async function guardarCliente(){ const n=document.getElementById('cNombre')?.value?.trim(); const t=document.getElementById('cTel')?.value?.trim(); const ci=document.getElementById('cCiudad')?.value; const d=document.getElementById('cDir')?.value?.trim(); if(!n||!t||!ci||!d){ toast('⚠️ Complete campos obligatorios'); return; } try{ await addDoc(collection(db,'clientes'),{ nombre:n, telefono:t, ciudad:ci, direccion:d, email:document.getElementById('cEmail')?.value||'', latitud:document.getElementById('cLat')?.value||null, longitud:document.getElementById('cLng')?.value||null, fechaCreacion:new Date().toISOString().split('T')[0] }); closeModal(); await cargarDatos(); toast('✅ Cliente guardado'); }catch(err){ toast('❌ Error: '+err.message); } }
function modalEditarCliente(cid){ const c=getCl(cid); showModal(`<div class="modal"><div class="modal-h"><h3>Editar cliente</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><label class="fl">Nombre</label><input class="fi" id="eNombre" value="${c.nombre}"><label class="fl">Telefono</label><input class="fi" id="eTel" value="${c.telefono}"><label class="fl">Email</label><input class="fi" id="eEmail" value="${c.email||''}"><label class="fl">Ciudad</label><select class="fi" id="eCiudad">${CIUDADES.map(ci=>`<option ${ci===c.ciudad?'selected':''}>${ci}</option>`).join('')}</select><label class="fl">Direccion</label><input class="fi" id="eDir" value="${c.direccion}"><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="actualizarCliente('${cid}')">Guardar</button></div></div></div>`); }
async function actualizarCliente(cid){ try{ await updateDoc(doc(db,'empresas',cid),{ nombre:document.getElementById('eNombre').value, telefono:document.getElementById('eTel').value, email:document.getElementById('eEmail').value, ciudad:document.getElementById('eCiudad').value, direccion:document.getElementById('eDir').value }); closeModal(); await cargarDatos(); toast('✅ Cliente actualizado'); }catch(err){ toast('❌ Error: '+err.message); } }
function modalEliminarCliente(cid){ if(!confirm('¿Eliminar este cliente y todos sus activos/servicios?')) return; eliminarCliente(cid); }
async function eliminarCliente(cid){ const eids=getEquiposCliente(cid).map(e=>e.id); try{ for(const eid of eids){ const ss=getServiciosEquipo(eid); for(const s of ss) await deleteDoc(doc(db,'servicios',s.id)); await deleteDoc(doc(db,'equipos',eid)); } await deleteDoc(doc(db,'empresas',cid)); await cargarDatos(); goTo('clientes'); toast('🗑️ Cliente eliminado'); }catch(err){ toast('❌ Error: '+err.message); } }
function modalNuevoEquipo(cid){ showModal(`<div class="modal"><div class="modal-h"><h3>Nuevo activo</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><div class="fr"><div><label class="fl">Marca *</label><input class="fi" id="qMarca"></div><div><label class="fl">Modelo *</label><input class="fi" id="qModelo"></div></div><label class="fl">Serie</label><input class="fi" id="qSerie"><label class="fl">Ubicacion *</label><input class="fi" id="qUbic"><label class="fl">Tipo</label><input class="fi" id="qTipo"><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="guardarEquipo('${cid}')">Guardar</button></div></div></div>`); }
async function guardarEquipo(cid){ const m=document.getElementById('qMarca')?.value?.trim(); const mo=document.getElementById('qModelo')?.value?.trim(); const u=document.getElementById('qUbic')?.value?.trim(); if(!m||!mo||!u){ toast('⚠️ Complete marca, modelo y ubicacion'); return; } try{ await addDoc(collection(db,'equipos'),{ clienteId:cid, marca:m, modelo:mo, serie:document.getElementById('qSerie')?.value||'', ubicacion:u, tipo:document.getElementById('qTipo')?.value||'' }); closeModal(); await cargarDatos(); toast('✅ Activo guardado'); }catch(err){ toast('❌ Error: '+err.message); } }
function modalEditarEquipo(eid){ const eq=getEq(eid); if(!eq) return; showModal(`<div class="modal"><div class="modal-h"><h3>Editar activo</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><div class="fr"><div><label class="fl">Marca</label><input class="fi" id="eMarca" value="${eq.marca}"></div><div><label class="fl">Modelo</label><input class="fi" id="eModelo" value="${eq.modelo}"></div></div><label class="fl">Serie</label><input class="fi" id="eSerie" value="${eq.serie||''}"><label class="fl">Ubicacion</label><input class="fi" id="eUbic" value="${eq.ubicacion}"><label class="fl">Tipo</label><input class="fi" id="eTipoEq" value="${eq.tipo||''}"><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="actualizarEquipo('${eid}')">Guardar</button></div></div></div>`); }
async function actualizarEquipo(eid){ try{ await updateDoc(doc(db,'equipos',eid),{ marca:document.getElementById('eMarca').value, modelo:document.getElementById('eModelo').value, serie:document.getElementById('eSerie').value, ubicacion:document.getElementById('eUbic').value, tipo:document.getElementById('eTipoEq').value }); closeModal(); await cargarDatos(); toast('✅ Activo actualizado'); }catch(err){ toast('❌ Error: '+err.message); } }
function modalEliminarEquipo(eid){ if(!confirm('¿Eliminar este activo y sus servicios?')) return; eliminarEquipo(eid); }
async function eliminarEquipo(eid){ const ss=getServiciosEquipo(eid); try{ for(const s of ss) await deleteDoc(doc(db,'servicios',s.id)); await deleteDoc(doc(db,'equipos',eid)); await cargarDatos(); toast('🗑️ Activo eliminado'); }catch(err){ toast('❌ Error: '+err.message); } }
function modalNuevoTecnico(){ showModal(`<div class="modal"><div class="modal-h"><h3>Nuevo tecnico</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><label class="fl">Nombre *</label><input class="fi" id="tNombre"><div class="fr"><div><label class="fl">Tipo Doc</label><select class="fi" id="tTipoDoc">${TIPOS_DOC.map(d=>`<option>${d}</option>`).join('')}</select></div><div><label class="fl">Cedula *</label><input class="fi" id="tCedula" type="number"></div></div><label class="fl">Telefono</label><input class="fi" id="tTel"><label class="fl">Cargo</label><input class="fi" id="tCargo"><label class="fl">Rol</label><select class="fi" id="tRol"><option value="tecnico">Tecnico</option><option value="admin">Admin</option></select><label class="fl">Clave (4 digitos) *</label><input class="fi" id="tClave" type="password" maxlength="4"><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="guardarTecnico()">Guardar</button></div></div></div>`); }
async function guardarTecnico(){ const n=document.getElementById('tNombre')?.value?.trim(); const cc=document.getElementById('tCedula')?.value?.trim(); const cl=document.getElementById('tClave')?.value?.trim(); if(!n||!cc||!cl){ toast('⚠️ Nombre, cedula y clave requeridos'); return; } if(cl.length!==4){ toast('⚠️ Clave de 4 digitos'); return; } try{ await addDoc(collection(db,'tecnicos'),{ nombre:n, cedula:cc, tipoDoc:document.getElementById('tTipoDoc')?.value||'CC', telefono:document.getElementById('tTel')?.value||'', cargo:document.getElementById('tCargo')?.value||'', rol:document.getElementById('tRol')?.value||'tecnico', especialidades:[], region:'', clave:cl }); closeModal(); await cargarDatos(); toast('✅ Tecnico guardado'); }catch(err){ toast('❌ Error: '+err.message); } }
function modalEditarTecnico(tid){ const t=getTec(tid); showModal(`<div class="modal"><div class="modal-h"><h3>Editar tecnico</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><label class="fl">Nombre</label><input class="fi" id="etNombre" value="${t.nombre}"><label class="fl">Cedula</label><input class="fi" id="etCedula" value="${t.cedula}"><label class="fl">Telefono</label><input class="fi" id="etTel" value="${t.telefono}"><label class="fl">Cargo</label><input class="fi" id="etCargo" value="${t.cargo||''}"><label class="fl">Rol</label><select class="fi" id="etRol"><option value="tecnico" ${t.rol==='tecnico'?'selected':''}>Tecnico</option><option value="admin" ${t.rol==='admin'?'selected':''}>Admin</option></select><label class="fl">Nueva clave (opcional)</label><input class="fi" id="etClave" type="password" maxlength="4"><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="actualizarTecnico('${tid}')">Guardar</button></div></div></div>`); }
async function actualizarTecnico(tid){ const data={ nombre:document.getElementById('etNombre').value, cedula:document.getElementById('etCedula').value, telefono:document.getElementById('etTel').value, cargo:document.getElementById('etCargo').value, rol:document.getElementById('etRol').value }; const newClave=document.getElementById('etClave')?.value?.trim(); if(newClave&&newClave.length===4) data.clave=newClave; try{ await updateDoc(doc(db,'tecnicos',tid),data); closeModal(); await cargarDatos(); toast('✅ Tecnico actualizado'); }catch(err){ toast('❌ Error: '+err.message); } }
async function eliminarTecnico(tid){ if(!confirm('¿Eliminar este tecnico?')) return; try{ await deleteDoc(doc(db,'tecnicos',tid)); await cargarDatos(); toast('🗑️ Tecnico eliminado'); }catch(err){ toast('❌ Error: '+err.message); } }

// ============================================
// MODALES JMC Y RO (STUBS PARA NO ROMPER REFERENCIAS)
// ============================================
function modalInformeJMC(eid) {
    const e = getEq(eid);
    const hoy = new Date().toISOString().split('T')[0];
    const sapActual = e?.ubicacion;
    const tienda = getTiendaJMC(sapActual);
    const dd = hoy.split('-')[2], mm = hoy.split('-')[1], aa = hoy.split('-')[0].slice(2);

    showModal(`<div class="modal modal-wide"><div class="modal-h" style="background:#1e3a6e;"><h3>📋 Informe Jeronimo Martins — FF-JMC-DT-06</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
        <div class="modal-b">
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin-bottom:6px;border-radius:4px;">CONTRATISTA</div>
            <div class="fr"><div><label class="fl">Razon social</label><input class="fi" value="CONSTRUCIONES ARQUITECTONICAS RO S.A.S" readonly></div><div><label class="fl">NIT</label><input class="fi" value="900.796.928-1" readonly></div></div>
            <div class="fr"><div><label class="fl">Contacto</label><input class="fi" value="Harrison Rincon" readonly></div><div><label class="fl">Telefono</label><input class="fi" value="314 3740477" readonly></div></div>
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;">SOLICITANTE Y TIENDA</div>
            <div class="fr"><div><label class="fl">Nombre solicitante</label><input class="fi" id="jNombreSol" value="${tienda?.coordinador||''}" readonly></div><div><label class="fl">Cargo</label><input class="fi" id="jCargo" value="${tienda?.cargo||''}" readonly></div></div>
            <div class="fr"><div><label class="fl">Nombre tienda</label><input class="fi" id="jTienda" value="${tienda?.tienda||''}" readonly></div><div><label class="fl">N° Tienda (SAP)</label><input class="fi" id="jSAP" value="${sapActual||''}" readonly></div></div>
            
<div class="fr"><div><label class="fl">N° Ticket</label>
<input class="fi" id="jTicket" placeholder="TK-..." style="background-color: #f0d759;"></div>
<div><label class="fl">Fecha</label><div style="display:flex;gap:4px;"><input class="fi" id="jDD" placeholder="DD" value="${dd}" style="width:33%;"><input class="fi" id="jMM" placeholder="MM" value="${mm}" style="width:33%;"><input class="fi" id="jAA" placeholder="AA" value="${aa}" style="width:33%;"></div></div></div>
            <div class="fr"><div><label class="fl">Municipio</label><input class="fi" id="jMunicipio" value="${tienda?.ciudad||''}" readonly></div><div><label class="fl">Departamento</label><input class="fi" id="jDepartamento" value="${tienda?.departamento||''}" readonly></div></div>
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;">INFORMACION TECNICA</div>
            
<div class="fr"><div><label class="fl">Nombre del equipo</label><input class="fi" id="jEquipo" value="${e?.tipo ? e.tipo + ' ' : ''}${e?.modelo||''}" readonly></div>

<div><label class="fl">Marca</label><input class="fi" id="jMarca" value="${e?.marca||''}" readonly></div></div>
            <div><label class="fl">Serial</label><input class="fi" id="jSerial" value="${e?.serie||''}" readonly></div>
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;">TIPO DE ASISTENCIA</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${['Reparacion','Garantia','Ajuste','Modificacion','Servicio','Mejora','Combinacion'].map(t=>`<label><input type="radio" name="jTipoAsi" value="${t}" ${t==='Reparacion'?'checked':''}> ${t}</label>`).join('')}</div>
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;">TIPO DE FALLA</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${['Mecanicas','Material','Instrumentos','Electricas','Influencia Externa'].map(t=>`<label><input type="radio" name="jTipoFalla" value="${t}"> ${t}</label>`).join('')}</div>
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;">CAUSA DE FALLAS</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${['Diseno','Fabricacion/Instalacion','Operacion/Mantenimiento','Administracion','Desconocida'].map(t=>`<label><input type="radio" name="jCausa" value="${t}"> ${t}</label>`).join('')}</div>
            <label class="fl">Descripcion de la falla</label><textarea class="fi" id="jDescFalla" rows="2"></textarea>
            <label class="fl">Diagnostico del tecnico</label><textarea class="fi" id="jDiag" rows="3"></textarea>
            <label class="fl">Repuestos cambiados</label><textarea class="fi" id="jRepuestos" rows="2"></textarea>
            <label class="fl">Observaciones</label><textarea class="fi" id="jObs" rows="2"></textarea>
            <div style="background:#0c214a;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;">CONSTANCIA</div>
            <div class="fr"><div><label class="fl">Tecnico encargado</label><input class="fi" value="${sesionActual?.nombre||''}" readonly></div><div><label class="fl">Cedula</label><input class="fi" value="${sesionActual?.cedula||''}" readonly></div></div>
            <div class="fr"><div><label class="fl">Hora entrada</label><input class="fi" type="time" id="jHEntrada"></div><div><label class="fl">Hora salida</label><input class="fi" type="time" id="jHSalida"></div></div>
            <div class="fr"><div><label class="fl">Nombre funcionario</label><input class="fi" id="jFuncNombre"></div><div><label class="fl">Cedula</label><input class="fi" id="jFuncCedula"></div></div>
            <div class="fr"><div><label class="fl">Cargo</label><input class="fi" id="jFuncCargo"></div><div><label class="fl">SAP</label><input class="fi" id="jFuncSAP"></div></div>
            <label class="fl">Firma</label>
            <canvas id="jFirmaCanvas" width="300" height="80" style="width:100%;height:80px;border:1.5px dashed var(--green);border-radius:8px;background:#f0faf5;"></canvas>
            <button class="btn btn-gray btn-sm" onclick="limpiarFirmaJMC()">🗑 Limpiar firma</button>
            <div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="exportarInformeJMC('${eid}')">📄 Exportar PDF</button></div>
        </div>
    </div>`);
    setTimeout(() => iniciarFirmaCanvas('jFirmaCanvas'), 100);
}
function modalInformeRO(eid) {
    const e = getEq(eid);
    const hoy = new Date().toISOString().split('T')[0];
    const dd = hoy.split('-')[2], mm = hoy.split('-')[1], aa = hoy.split('-')[0].slice(2);

    showModal(`<div class="modal modal-wide"><div class="modal-h" style="background:#1565c0;"><h3>📋 Informe Tecnico — Construciones RO</h3><button class="xbtn" onclick="closeModal()">✕</button></div>
        <div class="modal-b">
            <div style="background:#1976d2;color:white;text-align:center;padding:4px;margin-bottom:6px;border-radius:4px;">CONTRATISTA</div>
            <div class="fr"><div><label class="fl">Razon social</label><input class="fi" value="CONSTRUCIONES ARQUITECTONICAS RO S.A.S" readonly></div><div><label class="fl">NIT</label><input class="fi" value="900.796.928-1" readonly></div></div>
            <div class="fr"><div><label class="fl">Contacto</label><input class="fi" value="Harrison Rincon" readonly></div><div><label class="fl">Telefono</label><input class="fi" value="314 3740477" readonly></div></div>
            <div style="background:#1976d2;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;">CLIENTE</div>
            <div class="fr"><div><label class="fl">Empresa</label><input class="fi" value="Construciones Arquitectonicas RO" readonly></div><div><label class="fl">NIT</label><input class="fi" value="900.796.928-1" readonly></div></div>
            <div class="fr"><div><label class="fl">Contacto</label><input class="fi" value="Harrison Rincon" readonly></div><div><label class="fl">Celular</label><input class="fi" value="314 3740477" readonly></div></div>
            <div class="fr"><div><label class="fl">Direccion</label><input class="fi" value="Cl. 68 Sur #81-29, Bosa, Bogota" readonly></div><div><label class="fl">Fecha</label><div style="display:flex;gap:4px;"><input class="fi" id="rDD" placeholder="DD" value="${dd}" style="width:33%;"><input class="fi" id="rMM" placeholder="MM" value="${mm}" style="width:33%;"><input class="fi" id="rAA" placeholder="AA" value="${aa}" style="width:33%;"></div></div></div>
            <div style="background:#1976d2;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;">INFORMACION TECNICA</div>
            <div class="fr"><div><label class="fl">Equipo</label><input class="fi" id="rEquipo" value="${e?.tipo ? e.tipo+' ' : ''}${e?.marca||''} ${e?.modelo||''}" readonly></div><div><label class="fl">Serial</label><input class="fi" id="rSerial" value="${e?.serie||''}" readonly></div></div>
            <div><label class="fl">Ubicacion</label><input class="fi" id="rUbicacion" value="${e?.ubicacion||''}" readonly></div>
            <div style="background:#1976d2;color:white;text-align:center;padding:4px;margin:10px 0 6px;border-radius:4px;">TIPO DE SERVICIO</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${['Mantenimiento Preventivo','Mantenimiento Correctivo','Instalacion','Garantia','Revision'].map(t=>`<label><input type="radio" name="rTipoSrv" value="${t}" ${t==='Mantenimiento Preventivo'?'checked':''}> ${t}</label>`).join('')}</div>
            <label class="fl">Descripcion del trabajo realizado *</label>
            <textarea class="fi" id="rDesc" rows="3" placeholder="Trabajo realizado..."></textarea>
            <label class="fl">Repuestos cambiados</label>
            <textarea class="fi" id="rRepuestos" rows="2" placeholder="NA si no aplica..."></textarea>
            <div class="fr"><div><label class="fl">Hora entrada</label><input class="fi" type="time" id="rHEntrada"></div><div><label class="fl">Hora salida</label><input class="fi" type="time" id="rHSalida"></div></div>
            <label class="fl">Nombre quien recibe</label>
            <input class="fi" id="rRecibe" placeholder="Nombre y cargo...">
            <label class="fl">Firma</label>
            <canvas id="rFirmaCanvas" width="300" height="80" style="width:100%;height:80px;border:1.5px dashed #1976d2;border-radius:8px;background:#e8f4fd;"></canvas>
            <button class="btn btn-gray btn-sm" onclick="limpiarFirmaRO()">🗑 Limpiar firma</button>
            <div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-sm" style="background:#1976d2;color:white;" onclick="exportarInformeRO('${eid}')">📄 Exportar PDF</button></div>
        </div>
    </div>`);
    setTimeout(() => iniciarFirmaCanvas('rFirmaCanvas'), 100);
}
function generarYGuardarExcelSemanal(srv, fotos, html) { console.log('Excel semanal - pendiente'); }

// ============================================
// INICIALIZACIÓN
// ============================================
document.querySelectorAll('.bni').forEach(btn=>{ btn.addEventListener('click',()=>{ const page=btn.dataset.page; if(!sesionActual&&page!=='panel'&&page!=='tecnicos'){ toast('🔒 Inicia sesion desde Tecnicos'); return; } selectedClienteId=null; selectedEquipoId=null; goTo(page); }); });

function descargarHistorialCliente(cid) {
    const c = getCl(cid);
    const eqs = equipos.filter(e => e.clienteId === cid);
    const esD1c = esClienteD1(cid);
    const esJMCc = esClienteJMC ? esClienteJMC(cid) : false;
    const filas = [['Cliente','Ciudad','Tipo Equipo','Marca','Modelo','Serie','Ubicacion','Estado Equipo','Fecha Servicio','Tipo Servicio','Tecnico','Descripcion']];
    eqs.forEach(e => {
        // Ciudad: usar tienda si es D1 o JMC, sino ciudad del cliente
        let ciudad = c?.ciudad || '';
        if (esD1c && e.idTienda) {
            const t = getTiendaD1(e.idTienda);
            if (t?.ciudad) ciudad = t.ciudad;
        } else if (esJMCc && e.idTienda) {
            const t = jmcTiendas?.find(x => String(x.idTienda) === String(e.idTienda));
            if (t?.ciudad) ciudad = t.ciudad;
        }
        const ss = getServiciosEquipo(e.id).sort((a,b) => new Date(b.fecha)-new Date(a.fecha));
        if (!ss.length) {
            filas.push([c?.nombre||'', ciudad, e.tipo||'', e.marca||'', e.modelo||'', e.serie||'', e.ubicacion||'', e.estado||'Sin info', '', '', '', '']);
        } else {
            ss.forEach(s => {
                filas.push([
                    c?.nombre||'', ciudad,
                    e.tipo||'', e.marca||'', e.modelo||'', e.serie||'', e.ubicacion||'',
                    e.estado||'Sin info',
                    s.fecha||'', s.tipo||'', s.tecnico||'',
                    s.falla ? `${s.falla} | ${s.trabajoRealizado||''} | ${s.condicionEntrega||''}` : s.descripcion||''
                ]);
            });
        }
    });
    const bom = '\uFEFF';
    const csv = bom + filas.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download=`Historial_${c?.nombre||cid}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast('✅ Excel descargado');
}

function generarInformePDF(eid) {
    const e = getEq(eid); const c = getCl(e?.clienteId);
    const esD1c = esClienteD1(e?.clienteId);
    const tienda = esD1c ? getTiendaD1(e?.idTienda) : null;
    const nombreTienda = tienda?.tienda || '';
    const ss = getServiciosEquipo(eid).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
    const LOGO='https://raw.githubusercontent.com/capacitADA/JDARQ/main/JDARQ-logo.png';
    const fila=(lbl,val)=>val?`<tr><td style="color:#64748b;padding:3px 8px 3px 0;white-space:nowrap;font-size:8.5pt;">${lbl}</td><td style="font-weight:600;font-size:8.5pt;">${val}</td></tr>`:'';
    const COLOR_TIPO={'Mantenimiento':'#1e3d7a','Preventivo':'#1e3d7a','Correctivo':'#b45309','Emergencia':'#dc2626','Reparacion':'#dc2626','Instalacion':'#16a34a'};
    const serviciosHTML=ss.map(s=>`
        <div style="border:1px solid #dde3f0;border-radius:8px;padding:10px;margin-bottom:8px;break-inside:avoid;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="background:${COLOR_TIPO[s.tipo]||'#1e3d7a'};color:white;padding:2px 8px;border-radius:10px;font-size:7.5pt;">${s.tipo}</span>
                <span style="font-size:7.5pt;color:#64748b;">${fmtFecha(s.fecha)}</span>
            </div>
            <div style="font-size:8pt;">🔧 ${s.tecnico}</div>
            <div style="font-size:8pt;margin-top:2px;">${s.descripcion}</div>
            ${(s.fotos||[]).length?`<div style="margin-top:4px;">${(s.fotos||[]).map(f=>`<img src="${f}" style="height:46px;border-radius:4px;margin-right:4px;">`).join('')}</div>`:''}
        </div>`).join('');
    const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Informe</title>
<style>@page{size:letter;margin:10mm;}body{font-family:Arial,sans-serif;font-size:9pt;margin:0;color:#1a202c;}.cols{column-count:2;column-gap:12px;}</style>
</head><body>
<div style="display:flex;align-items:center;background:#0c214a;color:white;padding:12px 18px;border-radius:10px;margin-bottom:10px;">
  <img src="${LOGO}" style="height:42px;margin-right:14px;" onerror="this.style.display='none'">
  <div>
    <div style="font-size:14pt;font-weight:700;">INFORME TÉCNICO</div>
    <div style="font-size:9pt;opacity:0.85;margin-top:2px;">JD Arquisoluciones S.A.S &nbsp;|&nbsp; 📞 313 329 2510</div>
  </div>
</div>
<div style="background:#f1f5f9;border-radius:8px;padding:12px 16px;margin-bottom:10px;">
  <div style="font-weight:700;font-size:9pt;color:#0c214a;margin-bottom:6px;">DATOS DEL EQUIPO</div>
  <div style="display:flex;gap:20px;">
    <table style="flex:1;border-collapse:collapse;">
      ${fila('Cliente:', c?.nombre||'N/A')}
      ${nombreTienda ? fila('Tienda:', nombreTienda) : ''}
      ${fila('Activo:', ((e?.tipo||'')+' '+(e?.marca||'')+' '+(e?.modelo||'')).trim())}
      ${fila('Serial:', e?.serie||'N/A')}
    </table>
    <table style="flex:1;border-collapse:collapse;">
      ${fila('Refrigerante:', e?.refrigerante||'')}
      ${fila('Capacidad:', e?.capacidad||'')}
      ${fila('Voltaje:', e?.voltaje||'')}
      ${fila('Año instalación:', e?.añoInstalacion||'')}
      ${fila('Especialidad:', e?.especialidad||'')}
    </table>
  </div>
</div>
<div style="background:#0c214a;color:white;padding:5px 12px;border-radius:6px;font-weight:700;font-size:9pt;margin-bottom:8px;">HISTORIAL DE SERVICIOS (${ss.length})</div>
<div class="cols">${serviciosHTML}</div>
<p style="font-size:7pt;color:#aaa;margin-top:10px;border-top:1px solid #eee;padding-top:6px;">Generado: ${new Date().toLocaleString()} · JD Arquisoluciones S.A.S</p>
</body></html>`;
    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const v=window.open(url,'_blank');
    if(v) setTimeout(()=>v.print(),600);
}





window.imprimirQRTienda = (url, nombre) => {
    const w = window.open('', '_blank');
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
    const hash = window.location.hash;
    if (!hash.startsWith('#/tienda/')) return false;
    const tid = hash.replace('#/tienda/', '');
    const t   = getTienda(tid);
    if (!t) return false;
    const main   = document.getElementById('mainContent');
    const topbar = document.querySelector('.topbar');
    const botnav = document.querySelector('.botnav');
    if (topbar) topbar.style.display = 'none';
    if (botnav) botnav.style.display = 'none';
    const eqs = getEquiposTienda(tid);
    const totalInc = eqs.reduce((n, e) => n + getServiciosEquipo(e.id).length, 0);
    main.innerHTML = `
    <div style="max-width:600px;margin:0 auto;padding:1rem;">
      <div style="background:var(--negro,#1a1a1a);color:white;border-radius:12px;padding:16px;margin-bottom:12px;display:flex;align-items:center;gap:12px;">
        <img src="https://raw.githubusercontent.com/capacitADA/JDARQ/main/JDARQ-logo.png" style="height:40px;" onerror="this.style.display='none'">
        <div>
          <div style="font-size:.72rem;opacity:.6;">JD Arquisoluciones S.A.S</div>
          <div style="font-weight:700;font-size:1rem;">${t.nombre}</div>
          <div style="font-size:.78rem;opacity:.8;">📍 ${t.municipio||''}, ${t.departamento||''} · Cód: ${t.codigo}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <div style="background:white;border-radius:10px;padding:12px;text-align:center;border:1px solid #e0e0e0;">
          <div style="font-size:1.8rem;font-weight:800;color:#C9A84C;">${eqs.length}</div>
          <div style="font-size:.72rem;color:#666;">Activos registrados</div>
        </div>
        <div style="background:white;border-radius:10px;padding:12px;text-align:center;border:1px solid #e0e0e0;">
          <div style="font-size:1.8rem;font-weight:800;color:#1a1a1a;">${totalInc}</div>
          <div style="font-size:.72rem;color:#666;">Incidencias históricas</div>
        </div>
      </div>
      ${t.latitud ? `<div style="margin-bottom:12px;"><a href="https://maps.google.com/?q=${t.latitud},${t.longitud}" target="_blank" style="background:#4285f4;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:.82rem;">🗺️ Ver en Google Maps</a></div>` : ''}
      <div style="font-weight:700;font-size:.85rem;margin-bottom:8px;">Activos (${eqs.length})</div>
      ${eqs.map(e => {
        const inc = getServiciosEquipo(e.id);
        const ultima = inc[0];
        return `<div style="background:white;border-radius:10px;padding:12px;margin-bottom:8px;border:1px solid #e0e0e0;">
          <div style="font-weight:700;">${e.nombre||e.tipo||'Activo'}</div>
          <div style="font-size:.76rem;color:#555;">${e.area||''} ${e.ubicacion?'· '+e.ubicacion:''}</div>
          <div style="font-size:.76rem;color:${e.estado==='Operativo'?'#16a34a':'#dc2626'};font-weight:700;">● ${e.estado||'Sin estado'}</div>
          <div style="font-size:.72rem;color:#888;margin-top:4px;">${inc.length} incidencia(s) ${ultima?'· Última: '+fmtFecha(ultima.fecha):''}</div>
        </div>`;
      }).join('')}
      ${eqs.length === 0 ? '<div style="color:#aaa;font-size:.82rem;text-align:center;padding:1rem;">Sin activos registrados</div>' : ''}
    </div>`;
    return true;
}

function manejarRutaQR() { const hash = window.location.hash; if (!hash.startsWith('#/equipo/')) return false; const eid = hash.replace('#/equipo/', ''); const e = getEq(eid); if (!e) return false; const c = getCl(e.clienteId); const esD1 = esClienteD1(e.clienteId); const tienda = esD1 ? getTiendaD1(e?.idTienda) : null; const main = document.getElementById('mainContent'); const topbar = document.querySelector('.topbar'); const botnav = document.querySelector('.botnav'); if (topbar) topbar.style.display = 'none'; if (botnav) botnav.style.display = 'none'; main.style.background = 'white'; const ss = getServiciosEquipo(eid).sort((a,b) => new Date(b.fecha)-new Date(a.fecha)); const waMsg = encodeURIComponent('Hola KRYOTEC, necesito ayuda con el ' + (e?.tipo||'') + ' ' + (e?.marca||'') + ' ' + (e?.modelo||'') + ' ubicado en ' + (e?.ubicacion||'') + ', pueden contactarme por favor'); const waUrl = 'https://wa.me/573105533937?text=' + waMsg; let html = ''; if (esD1 && tienda) { html = `<div style="max-width:600px;margin:0 auto;padding:1rem;"><div style="background:#0c214a;color:white;border-radius:12px;padding:16px;margin-bottom:12px;"><div style="font-weight:700;">JD Arquisoluciones S.A.S</div><div style="font-size:1.2rem;font-weight:700;">${e?.tipo || 'Equipo'} ${e?.marca || ''} ${e?.modelo || ''}</div><div>${tienda.tienda || e?.ubicacion || ''}</div></div><div style="background:white;border:1px solid #ccc;border-radius:12px;padding:12px;"><div style="font-weight:700;">🔧 DATOS TÉCNICOS</div><table style="width:100%;"><tr><td>Marca/Modelo</td><td>${e?.marca || ''} ${e?.modelo || ''}</td></tr><tr><td>Serie</td><td>${e?.serie || 'N/A'}</td></tr></table></div><div style="background:#25D366;border-radius:12px;padding:12px;text-align:center;margin-top:12px;"><a href="${waUrl}" target="_blank" style="color:white;text-decoration:none;font-weight:700;">📱 Contactar por WhatsApp</a></div>${sesionActual ? `<button onclick="modalActaD1('${eid}')" class="btn-d1-nuevo" style="background:#e4002b;color:white;width:100%;padding:12px;margin-top:12px;border-radius:12px;">📋 Nuevo servicio D1</button>` : `<div style="background:#fef2f2;padding:12px;margin-top:12px;text-align:center;"><button onclick="mostrarLoginQR('${eid}')" class="btn btn-blue">Iniciar sesión</button></div>`}<h3>Historial (${ss.length})</h3>${ss.map(s => `<div style="border:1px solid #ccc;padding:8px;margin-top:8px;"><div>${fmtFecha(s.fecha)} - ${s.tipo}</div><div>${s.descripcion}</div></div>`).join('')}</div>`; } else { html = `<div style="max-width:600px;margin:0 auto;padding:1rem;"><div style="background:#0c214a;color:white;border-radius:12px;padding:16px;"><div>JD Arquisoluciones S.A.S</div><div>${e?.tipo || ''} ${e?.marca || ''} ${e?.modelo || ''}</div><div>${e?.ubicacion || ''}</div></div><div style="background:#25D366;border-radius:12px;padding:12px;text-align:center;margin-top:12px;"><a href="${waUrl}" target="_blank" style="color:white;text-decoration:none;">📱 Contactar por WhatsApp</a></div><h3>Historial (${ss.length})</h3>${ss.map(s => `<div style="border:1px solid #ccc;padding:8px;margin-top:8px;"><div>${fmtFecha(s.fecha)} - ${s.tipo}</div><div>${s.descripcion}</div></div>`).join('')}</div>`; } main.innerHTML = html; return true; }
window.mostrarLoginQR = async (eid) => { const tecnicosList = tecnicos.filter(t => t.rol === 'tecnico' || t.rol === 'admin'); if (tecnicosList.length === 0) { toast('⚠️ No hay técnicos registrados'); return; } let options = '<option value="">Seleccionar técnico</option>'; tecnicosList.forEach(t => { options += `<option value="${t.id}">${t.nombre}</option>`; }); showModal(`<div class="modal" style="max-width:320px;"><div class="modal-h"><h3>🔐 Iniciar sesión</h3><button class="xbtn" onclick="closeModal()">✕</button></div><div class="modal-b"><label class="fl">Técnico</label><select class="fi" id="qrLoginTecnico">${options}</select><label class="fl">Clave (4 dígitos)</label><input class="fi" type="password" id="qrLoginClave" maxlength="4"><div class="modal-foot"><button class="btn btn-gray" onclick="closeModal()">Cancelar</button><button class="btn btn-blue" onclick="ejecutarLoginQR('${eid}')">Ingresar</button></div></div></div>`); };
window.ejecutarLoginQR = async (eid) => { const tecId = document.getElementById('qrLoginTecnico')?.value; const clave = document.getElementById('qrLoginClave')?.value; if (!tecId || !clave) { toast('⚠️ Selecciona técnico e ingresa clave'); return; } const tec = getTec(tecId); if (!tec || tec.clave !== clave) { toast('❌ Credenciales incorrectas'); return; } sesionActual = tec; actualizarTopbar(); closeModal(); toast(`✅ Bienvenido, ${tec.nombre.split(' ')[0]}`); manejarRutaQR(); setTimeout(() => modalActaD1(eid), 500); };


window.actualizarServicioD1 = async (sid) => {
    const tipo    = document.getElementById('esTipo')?.value;
    const fecha   = document.getElementById('esFecha')?.value;
    const falla   = document.getElementById('esFalla')?.value?.trim();
    const trabajo = document.getElementById('esTrabajo')?.value?.trim();
    const entrega = document.getElementById('esEntrega')?.value?.trim();
    const estado  = document.getElementById('esEstado')?.value;
    const obs     = document.getElementById('esObs')?.value?.trim();
    const s = servicios.find(x => x.id === sid); if (!s) return;
    try {
        await updateDoc(doc(db,'servicios',sid), {
            tipo, fecha, falla, trabajoRealizado: trabajo,
            condicionEntrega: entrega, estadoEntrega: estado, observaciones: obs,
            descripcion: `[D1] ${falla} | ${trabajo} | ${entrega} | Estado: ${estado}`
        });
        await updateDoc(doc(db,'equipos',s.equipoId), { estado });
        toast('✅ Servicio actualizado'); closeModal(); await cargarDatos();
    } catch(err) { toast('⚠️ Error: ' + err.message); }
};

window.goTo=goTo; window.closeModal=closeModal; window.filtrarClientes=filtrarClientes; window.filtrarEquipos=filtrarEquipos; window.aplicarFiltros=aplicarFiltros; window.limpiarFiltros=limpiarFiltros; window.modalNuevoCliente=modalNuevoCliente; window.modalEditarCliente=modalEditarCliente; window.modalEliminarCliente=modalEliminarCliente; window.guardarCliente=guardarCliente; window.actualizarCliente=actualizarCliente; window.modalNuevoEquipo=modalNuevoEquipo; window.modalEditarEquipo=modalEditarEquipo; window.modalEliminarEquipo=modalEliminarEquipo; window.guardarEquipo=guardarEquipo; window.actualizarEquipo=actualizarEquipo; window.modalNuevoServicio=modalNuevoServicio; window.modalEditarServicio=modalEditarServicio; window.guardarServicio=guardarServicio; window.actualizarServicio=actualizarServicio; window.eliminarServicio=eliminarServicio; window.modalNuevoTecnico=modalNuevoTecnico; window.modalEditarTecnico=modalEditarTecnico; window.guardarTecnico=guardarTecnico; window.actualizarTecnico=actualizarTecnico; window.eliminarTecnico=eliminarTecnico; window.modalRecordar=modalRecordar; window.enviarWhatsApp=enviarWhatsApp; window.modalActaD1=modalActaD1; window.limpiarFirmaD1=limpiarFirmaD1; window.previewFoto=previewFoto; window.borrarFoto=borrarFoto; window.onTipoChange=onTipoChange; window.abrirLogin=abrirLogin; window.mlPin=mlPin; window.mlDel=mlDel; window.mlLogin=mlLogin; window.cerrarSesion=cerrarSesion; window.generarInformePDF=generarInformePDF; window.modalQR=modalQR;
window.descargarHistorialCliente=descargarHistorialCliente; window.obtenerGPS=obtenerGPS; window.modalInformeJMC=modalInformeJMC; window.modalInformeRO=modalInformeRO; window.actualizarServicioD1=actualizarServicioD1; window.exportarActaD1=exportarActaD1;

// ============================================
// QR TIENDA — FICHA PÚBLICA
// ============================================
function modalQRTienda(tid) {
    const t = getTienda(tid);
    if (!t) { toast('⚠️ Tienda no encontrada'); return; }
    const url = `${window.location.origin}${window.location.pathname}#/tienda/${tid}`;
    const qrDiv = document.createElement('div');
    qrDiv.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:260px;height:260px;';
    document.body.appendChild(qrDiv);
    new window.QRCode(qrDiv, { text: url, width: 260, height: 260 });
    setTimeout(() => {
        const qrDataUrl = qrDiv.querySelector('canvas')?.toDataURL('image/png') || '';
        document.body.removeChild(qrDiv);
        showModal(`<div class="modal"><div class="modal-h" style="background:var(--negro);"><h3 style="color:var(--dorado);">📱 QR Tienda</h3><button class="xbtn" style="color:white;" onclick="closeModal()">✕</button></div>
        <div class="modal-b" style="text-align:center;">
            <div style="font-weight:700;font-size:.95rem;margin-bottom:.25rem;">${t.nombre}</div>
            <div style="font-size:.78rem;color:#555;margin-bottom:.75rem;">${t.municipio} · ${t.departamento} · Cód: ${t.codigo}</div>
            <img src="${qrDataUrl}" style="width:200px;height:200px;border:1px solid #eee;border-radius:8px;">
            <div style="font-size:.72rem;color:#94a3b8;margin-top:.5rem;">Escanear para ver ficha de la tienda</div>
            <div class="modal-foot" style="justify-content:center;">
                <a href="${url}" target="_blank" class="btn btn-gold btn-sm">🔗 Abrir ficha</a>
                <button class="btn btn-gray btn-sm" onclick="closeModal()">Cerrar</button>
            </div>
        </div></div>`);
    }, 300);
}

function manejarRutaTienda() {
    const hash = window.location.hash;
    if (!hash.startsWith('#/tienda/')) return false;
    const tid = hash.replace('#/tienda/', '');
    const t   = getTienda(tid);
    if (!t) return false;
    const c   = getCl(t.clienteId);
    const eqs = getEquiposTienda(tid);
    const incs = servicios.filter(s => eqs.some(e => e.id === s.equipoId));
    const topbar = document.querySelector('.topbar');
    const botnav = document.querySelector('.botnav');
    if (topbar) topbar.style.display = 'none';
    if (botnav) botnav.style.display = 'none';
    document.getElementById('mainContent').innerHTML = `
        <div style="max-width:600px;margin:0 auto;padding:1rem;">
            <div style="background:var(--negro);color:white;border-radius:12px;padding:16px;margin-bottom:12px;border-bottom:3px solid var(--dorado);">
                <img src="https://raw.githubusercontent.com/capacitADA/JDARQ/main/JDARQ-logo.png" style="height:32px;margin-bottom:8px;" onerror="this.style.display='none'">
                <div style="font-size:1.1rem;font-weight:700;color:var(--dorado);">${t.nombre}</div>
                <div style="font-size:.78rem;opacity:.7;">${t.municipio}, ${t.departamento}</div>
                <div style="font-size:.78rem;opacity:.7;">Código: ${t.codigo}</div>
                ${t.latitud ? `<a href="https://maps.google.com/?q=${t.latitud},${t.longitud}" target="_blank" style="color:var(--dorado);font-size:.76rem;">🗺️ Ver en mapa</a>` : ''}
            </div>

            <div style="background:white;border-radius:10px;padding:12px;margin-bottom:12px;border:1px solid #e0e0e0;">
                <div style="font-weight:700;font-size:.82rem;margin-bottom:8px;border-bottom:2px solid var(--dorado);padding-bottom:4px;">🔧 ACTIVOS (${eqs.length})</div>
                ${eqs.length === 0 ? '<div style="color:#94a3b8;font-size:.78rem;">Sin activos registrados</div>' :
                eqs.map(e => `
                    <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f5f5f5;font-size:.78rem;">
                        <span><strong>${e.nombre||e.tipo||'—'}</strong> · ${e.area||''}</span>
                        <span style="color:${e.estado==='Operativo'?'#16a34a':'#dc2626'};">● ${e.estado||'—'}</span>
                    </div>`).join('')}
            </div>

            <div style="background:white;border-radius:10px;padding:12px;border:1px solid #e0e0e0;">
                <div style="font-weight:700;font-size:.82rem;margin-bottom:8px;border-bottom:2px solid var(--dorado);padding-bottom:4px;">📋 INCIDENCIAS (${incs.length})</div>
                ${incs.length === 0 ? '<div style="color:#94a3b8;font-size:.78rem;">Sin incidencias registradas</div>' :
                incs.slice(0,10).map(s => `
                    <div style="padding:6px 0;border-bottom:1px solid #f5f5f5;font-size:.78rem;">
                        <div style="display:flex;justify-content:space-between;">
                            <strong style="color:var(--dorado);">#${s.nroIncidencia||s.id.slice(0,6)}</strong>
                            <span style="color:#555;">${fmtFecha(s.fecha)}</span>
                        </div>
                        <div style="color:#555;">${s.descripcion?.slice(0,80)||''}${s.descripcion?.length>80?'...':''}</div>
                        <div style="color:${s.aprobado?'#16a34a':'#f59e0b'};">${s.aprobado?'✅ Aprobada':'⏳ Pendiente'}</div>
                    </div>`).join('')}
            </div>
        </div>`;
    return true;
}

(async()=>{ await conectarDriveAuto(); await cargarDatos(); if(!manejarRutaQR() && !manejarRutaTienda()) renderView(); })();