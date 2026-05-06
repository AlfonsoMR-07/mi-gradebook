// =========================================
// CONFIGURACIÓN Y UTILIDADES
// =========================================

const URL_PROYECTO = "https://gdxpwvltqzpgtedhawti.supabase.co";
const LLAVE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkeHB3dmx0cXpwZ3RlZGhhd3RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTU4NTQsImV4cCI6MjA5MTU3MTg1NH0.jakqg7FAXBKseM2GtZLlK3DxGYfnYgY-Y6R78_cWhug";
const clienteSupabase = supabase.createClient(URL_PROYECTO, LLAVE_ANON);

// Estado centralizado
const state = {
    grupoSeleccionadoId: null,
    actividadActualId: null,
    asistenciasHoy: {},
    alumnosActuales: [],
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

// Modo offline
let cambiosPendientes = [];
let estaOnline = navigator.onLine;

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
// MODO OFFLINE - MEJORADO
// =========================================

function initOffline() {
    // Estado inicial
    estaOnline = navigator.onLine;

    window.addEventListener('online', async () => {
        estaOnline = true;
        document.getElementById('offline-indicator').classList.add('hidden');
        mostrarToast('Conexión restaurada. Sincronizando...', 'success');

        // Intentar sincronizar con Supabase
        try {
            await sincronizarTodo();
        } catch (e) {
            console.error('[Offline] Error sincronizando:', e);
        }

        // También intentar registrar sync en background
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            try {
                const registration = await navigator.serviceWorker.ready;
                registration.sync.register('sync-eduhub-data');
            } catch (err) {
                console.log('[SW] Sync no soportado:', err);
            }
        }

        // Recargar datos actuales si estamos en un grupo
        if (state.grupoSeleccionadoId) {
            await cargarAlumnos();
        }
    });

    window.addEventListener('offline', () => {
        estaOnline = false;
        document.getElementById('offline-indicator').classList.remove('hidden');
        mostrarToast('Sin conexión. Los cambios se guardarán localmente.', 'warning');
    });

    if (!estaOnline) {
        document.getElementById('offline-indicator').classList.remove('hidden');
    }

    // Verificar cambios pendientes al iniciar
    setTimeout(async () => {
        try {
            const pendientes = await obtenerCambiosPendientes();
            if (pendientes.length > 0) {
                const el = document.getElementById('offline-count');
                if (el) el.textContent = `${pendientes.length} cambios pendientes`;

                // Si hay conexión, intentar sincronizar automáticamente
                if (navigator.onLine) {
                    mostrarToast(`${pendientes.length} cambios pendientes. Sincronizando...`, 'warning');
                    await sincronizarTodo();
                }
            }
        } catch (e) {
            console.error('[Offline] Error verificando pendientes:', e);
        }
    }, 2000);
}

function guardarCambioPendiente(tipo, datos) {
    // Guardar en IndexedDB para persistencia real
    agregarCambioPendiente(tipo, datos).then(() => {
        actualizarContadorOffline();
    }).catch(err => {
        console.error('[Offline] Error guardando pendiente:', err);
    });

    // También mantener en memoria para compatibilidad
    cambiosPendientes.push({ tipo, datos, timestamp: new Date().toISOString() });
}

function actualizarContadorOffline() {
    obtenerCambiosPendientes().then(pendientes => {
        const el = document.getElementById('offline-count');
        if (el) el.textContent = `${pendientes.length} cambios pendientes`;
        cambiosPendientes = pendientes; // Sincronizar memoria
    }).catch(err => {
        console.error('[Offline] Error actualizando contador:', err);
    });
}

async function sincronizarCambiosPendientes() {
    // Usar la nueva función de db.js
    await sincronizarTodo();
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

    // Actualizar gráficas si existen
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

function regresarADashboard() {
    document.getElementById('vista-grupo').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    state.grupoSeleccionadoId = null;
    state.asistenciasHoy = {};
    state.actividadActualId = null;
    state.alumnosActuales = [];
    // Limpiar charts
    Object.values(state.charts).forEach(c => c?.destroy?.());
    state.charts = {};
}

// =========================================
// INICIALIZACIÓN
// =========================================

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') e.preventDefault();
});
