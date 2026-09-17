// =========================================
// CONFIGURACIÓN Y UTILIDADES
// =========================================

const URL_PROYECTO = "https://gdxpwvltqzpgtedhawti.supabase.co";
const LLAVE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkeHB3dmx0cXpwZ3RlZGhhd3RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTU4NTQsImV4cCI6MjA5MTU3MTg1NH0.jakqg7FAXBKseM2GtZLlK3DxGYfnYgY-Y6R78_cWhug";
const clienteSupabase = supabase.createClient(URL_PROYECTO, LLAVE_ANON);

// CORREGIDO: helper para obtener la fecha de HOY en la zona horaria local
// del usuario, en formato YYYY-MM-DD (el que usan los <input type="date">).
//
// ANTES: se usaba new Date().toISOString().split('T')[0], pero
// toISOString() siempre convierte a UTC. En México (UTC-6), a partir de
// que oscurece (~6pm en horario estándar) el reloj en UTC ya marca el
// día siguiente, así que el campo de fecha se autocompletaba con
// "mañana" en vez de "hoy".
//
// AHORA: se arma la fecha a mano con los componentes LOCALES
// (getFullYear/getMonth/getDate), que sí respetan la zona horaria
// del dispositivo del usuario.
function obtenerFechaLocalISO() {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
}

// =========================================
// CICLOS ESCOLARES Y TRIMESTRES
// =========================================

// Recuerda qué ciclo escolar estás viendo en "Mis Grupos" (ej. "2025-2026").
// Se guarda en localStorage para que no se te olvide entre sesiones.
function obtenerCicloSeleccionado() {
    return localStorage.getItem('eduhub_ciclo_seleccionado') || null;
}

function guardarCicloSeleccionado(ciclo) {
    localStorage.setItem('eduhub_ciclo_seleccionado', ciclo);
}

// Dado "2025-2026" devuelve "2026-2027"
function calcularSiguienteCiclo(cicloActual) {
    const partes = (cicloActual || '').split('-').map(n => parseInt(n, 10));
    if (partes.length !== 2 || isNaN(partes[0]) || isNaN(partes[1])) {
        // Si el formato no es el esperado, no adivinamos: dejamos que el usuario lo escriba
        return null;
    }
    return `${partes[0] + 1}-${partes[1] + 1}`;
}

// Dado "1º A" devuelve "2º A" (incrementa el número, conserva el resto del texto)
function calcularSiguienteGrado(nombreGrupo) {
    const match = (nombreGrupo || '').match(/(\d+)/);
    if (!match) return null;
    const numeroActual = parseInt(match[1], 10);
    const numeroNuevo = numeroActual + 1;
    return { nombreNuevo: nombreGrupo.replace(match[1], String(numeroNuevo)), numeroActual, numeroNuevo };
}

// Estado centralizado
const state = {
    grupoSeleccionadoId: null,
    operacionActualId: null,       // Controla concurrencia al abrir grupos
    actividadActualId: null,
    asistenciasHoy: {},
    alumnosActuales: [],
    trimestreActual: 3,            // NUEVO: 1, 2 o 3 — trimestre que se está viendo/editando
    cicloGrupoActual: '2025-2026', // NUEVO: ciclo escolar del grupo abierto actualmente
    categoriasDefecto: [
        { nombre: 'Asistencia', valor: 10 },
        { nombre: 'Trabajo en Clase', valor: 50 },
        { nombre: 'Examen', valor: 40 }
    ],
    historialActivo: 'actividades',
    reporteData: null,
    charts: {},
    observacionesCache: {},
    justificacionesCache: {}
};

// =========================================
// ESTADO DE CONEXIÓN — ÚNICO PUNTO DE VERDAD
// =========================================
// ANTES: había dos variables desincronizadas:
//   let estaOnline = navigator.onLine     ← en utils.js
//   navigator.onLine                      ← usado directamente en asistencia.js
//
// AHORA: una sola función que siempre consulta el estado real del navegador.
// Todos los archivos deben usar estaConectado() en lugar de estaOnline.
//
// La variable estaOnline se mantiene por compatibilidad con código existente
// pero siempre se sincroniza con navigator.onLine en initOffline().

let estaOnline = navigator.onLine;

function estaConectado() {
    return navigator.onLine;
}

// Modo offline — cola de cambios pendientes en memoria
let cambiosPendientes = [];

// =========================================
// UTILIDADES
// =========================================

function mostrarToast(mensaje, tipo = 'success', duracion = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    const iconos = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle' };
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.success}"></i><span>${mensaje}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, duracion);
}

function mostrarSpinner(texto = 'Cargando...') {
    const spinnerText = document.getElementById('spinner-text');
    const spinnerOverlay = document.getElementById('spinner-overlay');
    if (spinnerText) spinnerText.textContent = texto;
    if (spinnerOverlay) spinnerOverlay.classList.remove('hidden');
}

function ocultarSpinner() {
    const spinnerOverlay = document.getElementById('spinner-overlay');
    if (spinnerOverlay) spinnerOverlay.classList.add('hidden');
}

function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

// =========================================
// FETCH CON RETRY (para Safari y conexiones inestables)
// =========================================

async function fetchConRetry(fn, maxRetries = 3, delay = 1000) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const result = await fn();
            return result;
        } catch (err) {
            lastError = err;
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
            }
        }
    }
    throw lastError;
}

// =========================================
// MODO OFFLINE
// =========================================

function initOffline() {
    window.addEventListener('online', async () => {
        // Sincronizar ambas fuentes de verdad
        estaOnline = true;
        document.getElementById('offline-indicator').classList.add('hidden');
        mostrarToast('Conexión restaurada. Sincronizando...', 'success');

        if (typeof sincronizarTodo === 'function') {
            await sincronizarTodo();
        }

        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            const registration = await navigator.serviceWorker.ready;
            registration.sync.register('sync-eduhub-data');
        }
    });

    window.addEventListener('offline', () => {
        // Sincronizar ambas fuentes de verdad
        estaOnline = false;
        document.getElementById('offline-indicator').classList.remove('hidden');
        mostrarToast('Sin conexión. Los cambios se guardarán localmente.', 'warning');
    });

    if (!estaConectado()) {
        document.getElementById('offline-indicator').classList.remove('hidden');
    }

    if (typeof obtenerCambiosPendientes === 'function') {
        obtenerCambiosPendientes().then(pendientes => {
            if (pendientes.length > 0) {
                const el = document.getElementById('offline-count');
                if (el) el.textContent = `${pendientes.length} cambios pendientes`;
            }
        }).catch(() => {});
    }
}

function guardarCambioPendiente(tipo, datos) {
    if (typeof agregarCambioPendiente === 'function') {
        agregarCambioPendiente(tipo, datos).then(() => {
            actualizarContadorOffline();
        }).catch(err => {
            console.log('[Offline] No se pudo guardar en IndexedDB:', err);
        });
    }
    cambiosPendientes.push({ tipo, datos, timestamp: new Date().toISOString() });
    actualizarContadorOffline();
}

function actualizarContadorOffline() {
    const el = document.getElementById('offline-count');
    if (el) {
        const count = cambiosPendientes.length;
        el.textContent = `${count} cambio${count !== 1 ? 's' : ''} pendiente${count !== 1 ? 's' : ''}`;
    }
}

async function sincronizarCambiosPendientes() {
    if (typeof sincronizarTodo === 'function') {
        await sincronizarTodo();
    }
}

// =========================================
// TEMA OSCURO
// =========================================

function initTemaOscuro() {
    const temaGuardado = localStorage.getItem('tema_oscuro');
    if (temaGuardado === 'true') {
        document.body.classList.add('dark-mode');
        actualizarIconoTema(true);
    }
}

function toggleTemaOscuro() {
    const esOscuro = document.body.classList.toggle('dark-mode');
    localStorage.setItem('tema_oscuro', esOscuro);
    actualizarIconoTema(esOscuro);

    if (state.charts.promedios) state.charts.promedios.destroy();
    if (state.charts.asistencia) state.charts.asistencia.destroy();
    if (state.charts.distribucion) state.charts.distribucion.destroy();
    state.charts = {};
}

function actualizarIconoTema(esOscuro) {
    const icono = document.getElementById('icono-tema');
    if (icono) {
        icono.className = esOscuro ? 'fas fa-sun' : 'fas fa-moon';
    }
}

// =========================================
// NAVEGACIÓN
// =========================================

async function mostrarSeccion(s) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn[data-section="${s}"]`)?.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(x => x.classList.add('hidden'));
    const seccionActiva = document.getElementById(`seccion-${s}`);
    if (seccionActiva) seccionActiva.classList.remove('hidden');

    if (s === 'reporte') {
        await cargarAlumnos();
        generarReporte();
    }
    if (s === 'config') cargarInterfazCategorias();
    if (s === 'historial') cargarHistorial('actividades');
    if (s === 'estadisticas') {
        await cargarAlumnos();
        generarEstadisticas();
    }
    if (s === 'tareas') {
        await cargarCategoriasGrupo();
        actualizarSelectoresCategorias();
    }
    if (s === 'asistencia') {
        await cargarAlumnos();
    }
    if (s === 'alumnos') {
        await cargarAlumnos();
        renderizarGestionAlumnos();
    }
}

// NUEVO: cambia el trimestre activo y recarga lo que se esté viendo en ese momento
async function cambiarTrimestre(t) {
    if (state.trimestreActual === t) return;
    state.trimestreActual = t;
    renderizarSelectorTrimestre();

    const btnActivo = document.querySelector('.tab-btn.active');
    const seccionActual = btnActivo ? btnActivo.dataset.section : 'asistencia';
    await mostrarSeccion(seccionActual);
    mostrarToast(`Viendo Trimestre ${t}`, 'success');
}

// Dibuja los 3 botones (T1/T2/T3) dentro del header del grupo
function renderizarSelectorTrimestre() {
    const cont = document.getElementById('selector-trimestre-container');
    if (!cont) return;
    cont.innerHTML = [1, 2, 3].map(t => {
        const activo = t === state.trimestreActual;
        return `<button onclick="cambiarTrimestre(${t})"
            style="padding:4px 12px; margin-right:6px; border-radius:6px; border:1px solid var(--accent-color);
                   cursor:pointer; font-weight:600;
                   background:${activo ? 'var(--accent-color)' : 'transparent'};
                   color:${activo ? '#fff' : 'var(--accent-color)'};">
            Trimestre ${t}
        </button>`;
    }).join('');
}

function regresarADashboard() {
    document.getElementById('vista-grupo').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    state.grupoSeleccionadoId = null;
    state.operacionActualId = null;
    state.asistenciasHoy = {};
    state.actividadActualId = null;
    state.alumnosActuales = [];
    Object.values(state.charts).forEach(c => c?.destroy?.());
    state.charts = {};
}

// =========================================
// INICIALIZACIÓN
// =========================================

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') e.preventDefault();
});
