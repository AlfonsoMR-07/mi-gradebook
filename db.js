// =========================================
// INDEXEDDB - BASE DE DATOS LOCAL OFFLINE
// =========================================

const DB_NAME = 'EduHubDB';
const DB_VERSION = 3;  // Incrementado para forzar actualización
let db = null;

// =========================================
// INICIALIZAR BASE DE DATOS
// =========================================

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('[DB] Error abriendo:', event.target.error);
            // Si hay error de versión, intentar borrar y recrear
            if (event.target.error.name === 'VersionError') {
                console.log('[DB] Error de versión, borrando base antigua...');
                const deleteReq = indexedDB.deleteDatabase(DB_NAME);
                deleteReq.onsuccess = () => {
                    console.log('[DB] Base antigua borrada, reintentando...');
                    // Reintentar con versión 1
                    const retryReq = indexedDB.open(DB_NAME, 1);
                    retryReq.onerror = () => reject(retryReq.error);
                    retryReq.onsuccess = () => {
                        db = retryReq.result;
                        console.log('[DB] Base de datos local inicializada (nueva)');
                        resolve(db);
                    };
                    retryReq.onupgradeneeded = (event) => createSchema(event.target.result);
                };
                deleteReq.onerror = () => reject(deleteReq.error);
            } else {
                reject(event.target.error);
            }
        };

        request.onsuccess = () => {
            db = request.result;
            console.log('[DB] Base de datos local inicializada');
            resolve(db);
        };

        request.onupgradeneeded = (event) => createSchema(event.target.result);
    });
}

function createSchema(database) {
    console.log('[DB] Creando/actualizando schema...');

    // Store para asistencia
    if (!database.objectStoreNames.contains('asistencia')) {
        const store = database.createObjectStore('asistencia', { keyPath: 'local_id', autoIncrement: true });
        store.createIndex('estudiante_id', 'estudiante_id', { unique: false });
        store.createIndex('fecha', 'fecha', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
    }

    // Store para calificaciones
    if (!database.objectStoreNames.contains('calificaciones')) {
        const store = database.createObjectStore('calificaciones', { keyPath: 'local_id', autoIncrement: true });
        store.createIndex('estudiante_id', 'estudiante_id', { unique: false });
        store.createIndex('actividad_id', 'actividad_id', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
    }

    // Store para observaciones
    if (!database.objectStoreNames.contains('observaciones')) {
        const store = database.createObjectStore('observaciones', { keyPath: 'local_id', autoIncrement: true });
        store.createIndex('estudiante_id', 'estudiante_id', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
    }

    // Store para cambios pendientes (cola de sync)
    if (!database.objectStoreNames.contains('cambios_pendientes')) {
        const store = database.createObjectStore('cambios_pendientes', { keyPath: 'local_id', autoIncrement: true });
        store.createIndex('tipo', 'tipo', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
    }

    // Store para grupos (cache offline)
    if (!database.objectStoreNames.contains('grupos')) {
        database.createObjectStore('grupos', { keyPath: 'id' });
    }

    // Store para estudiantes (cache offline)
    if (!database.objectStoreNames.contains('estudiantes')) {
        const store = database.createObjectStore('estudiantes', { keyPath: 'id' });
        store.createIndex('grupo_id', 'grupo_id', { unique: false });
    }

    // Store para actividades (cache offline)
    if (!database.objectStoreNames.contains('actividades')) {
        const store = database.createObjectStore('actividades', { keyPath: 'id' });
        store.createIndex('grupo_id', 'grupo_id', { unique: false });
    }

    // Store para plantillas (cache offline)
    if (!database.objectStoreNames.contains('plantillas')) {
        const store = database.createObjectStore('plantillas', { keyPath: 'id' });
        store.createIndex('grupo_id', 'grupo_id', { unique: false });
    }

    // Store para categorías (cache offline)
    if (!database.objectStoreNames.contains('categorias')) {
        const store = database.createObjectStore('categorias', { keyPath: 'id' });
        store.createIndex('grupo_id', 'grupo_id', { unique: false });
    }

    // Store para configuración
    if (!database.objectStoreNames.contains('configuracion')) {
        database.createObjectStore('configuracion', { keyPath: 'clave' });
    }
}

// =========================================
// OPERACIONES GENÉRICAS
// =========================================

function guardarEnStore(storeName, datos) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB no inicializada')); return; }
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(datos);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function obtenerDeStore(storeName, id) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB no inicializada')); return; }
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function obtenerTodosDeStore(storeName, indexName = null, indexValue = null) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB no inicializada')); return; }
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);

        let request;
        if (indexName && indexValue !== null) {
            const index = store.index(indexName);
            request = index.getAll(indexValue);
        } else {
            request = store.getAll();
        }

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

function eliminarDeStore(storeName, id) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB no inicializada')); return; }
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function limpiarStore(storeName) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB no inicializada')); return; }
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// =========================================
// ASISTENCIA LOCAL
// =========================================

async function guardarAsistenciaLocal(datos) {
    const registro = {
        ...datos,
        local_id: datos.local_id || `asist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        synced: false,
        timestamp: new Date().toISOString()
    };
    await guardarEnStore('asistencia', registro);
    return registro;
}

async function obtenerAsistenciaLocal(estudianteId, fecha) {
    const todos = await obtenerTodosDeStore('asistencia');
    return todos.find(a => a.estudiante_id == estudianteId && a.fecha === fecha);
}

// =========================================
// CALIFICACIONES LOCAL
// =========================================

async function guardarCalificacionLocal(datos) {
    const registro = {
        ...datos,
        local_id: datos.local_id || `calif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        synced: false,
        timestamp: new Date().toISOString()
    };
    await guardarEnStore('calificaciones', registro);
    return registro;
}

// =========================================
// OBSERVACIONES LOCAL
// =========================================

async function guardarObservacionLocal(datos) {
    const registro = {
        ...datos,
        local_id: datos.local_id || `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        synced: false,
        timestamp: new Date().toISOString()
    };
    await guardarEnStore('observaciones', registro);
    return registro;
}

// =========================================
// CAMBIOS PENDIENTES (COLA DE SYNC)
// =========================================

async function agregarCambioPendiente(tipo, datos) {
    const cambio = {
        tipo: tipo,
        datos: JSON.stringify(datos),
        timestamp: new Date().toISOString(),
        intentos: 0
    };
    await guardarEnStore('cambios_pendientes', cambio);
}

async function obtenerCambiosPendientes() {
    return await obtenerTodosDeStore('cambios_pendientes');
}

async function eliminarCambioPendiente(localId) {
    await eliminarDeStore('cambios_pendientes', localId);
}

// =========================================
// MARCAR COMO SINCRONIZADO
// =========================================

async function marcarComoSync(storeName, localId) {
    const registro = await obtenerDeStore(storeName, localId);
    if (registro) {
        registro.synced = true;
        registro.last_sync = new Date().toISOString();
        await guardarEnStore(storeName, registro);
    }
}

// =========================================
// CACHE DE DATOS (GRUPOS, ALUMNOS, ETC)
// =========================================

async function guardarGruposLocal(grupos) {
    for (const g of grupos) {
        await guardarEnStore('grupos', g);
    }
}

async function guardarAlumnosLocal(alumnos) {
    for (const a of alumnos) {
        await guardarEnStore('estudiantes', a);
    }
}

async function guardarActividadesLocal(actividades) {
    for (const a of actividades) {
        await guardarEnStore('actividades', a);
    }
}

async function guardarPlantillasLocal(plantillas) {
    for (const p of plantillas) {
        await guardarEnStore('plantillas', p);
    }
}

async function guardarCategoriasLocal(categorias) {
    for (const c of categorias) {
        await guardarEnStore('categorias', c);
    }
}

// =========================================
// BACKUP / RESTORE
// =========================================

async function exportarDBLocal() {
    const backup = {};
    const stores = ['grupos', 'estudiantes', 'actividades', 'calificaciones', 
                    'asistencia', 'observaciones', 'plantillas', 'categorias', 
                    'cambios_pendientes', 'configuracion'];

    for (const storeName of stores) {
        backup[storeName] = await obtenerTodosDeStore(storeName);
    }

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `eduhub_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    mostrarToast('Backup exportado correctamente', 'success');
}

async function importarDBLocal(file) {
    try {
        const texto = await file.text();
        const backup = JSON.parse(texto);

        for (const [storeName, registros] of Object.entries(backup)) {
            if (Array.isArray(registros)) {
                await limpiarStore(storeName);
                for (const reg of registros) {
                    await guardarEnStore(storeName, reg);
                }
            }
        }

        mostrarToast('Backup importado correctamente', 'success');
        location.reload();
    } catch (err) {
        mostrarToast('Error al importar backup: ' + err.message, 'error');
    }
}

// =========================================
// SINCRONIZACIÓN CON SUPABASE (UPLOAD)
// =========================================

async function sincronizarTodo() {
    if (!navigator.onLine) {
        mostrarToast('Sin conexión. No se puede sincronizar.', 'warning');
        return { exitosos: 0, fallidos: 0 };
    }

    const cambios = await obtenerCambiosPendientes();
    if (cambios.length === 0) {
        return { exitosos: 0, fallidos: 0 };
    }

    mostrarSpinner(`Sincronizando ${cambios.length} cambios...`);
    let exitosos = 0;
    let fallidos = 0;

    for (const cambio of cambios) {
        try {
            const datos = JSON.parse(cambio.datos);

            if (cambio.tipo === 'asistencia') {
                const { error } = await clienteSupabase
                    .from('asistencia')
                    .upsert(datos, { onConflict: 'estudiante_id,fecha' });
                if (!error) {
                    await eliminarCambioPendiente(cambio.local_id);
                    exitosos++;
                } else {
                    fallidos++;
                    console.error('Error sync asistencia:', error);
                }
            } else if (cambio.tipo === 'calificaciones') {
                const { error } = await clienteSupabase
                    .from('calificaciones')
                    .upsert(datos, { onConflict: 'estudiante_id,actividad_id' });
                if (!error) {
                    await eliminarCambioPendiente(cambio.local_id);
                    exitosos++;
                } else {
                    fallidos++;
                    console.error('Error sync calificaciones:', error);
                }
            } else if (cambio.tipo === 'observaciones') {
                const { error } = await clienteSupabase
                    .from('observaciones')
                    .upsert(datos, { onConflict: 'estudiante_id,created_at' });
                if (!error) {
                    await eliminarCambioPendiente(cambio.local_id);
                    exitosos++;
                } else {
                    fallidos++;
                    console.error('Error sync observaciones:', error);
                }
            }
        } catch (err) {
            fallidos++;
            console.error('Error en sync:', err);
        }
    }

    ocultarSpinner();

    if (exitosos > 0) {
        mostrarToast(`${exitosos} cambios sincronizados correctamente`, 'success');
    }
    if (fallidos > 0) {
        mostrarToast(`${fallidos} cambios fallaron. Se reintentarán más tarde.`, 'warning');
    }

    // Actualizar contador
    const pendientes = await obtenerCambiosPendientes();
    const el = document.getElementById('offline-count');
    if (el) el.textContent = `${pendientes.length} cambios pendientes`;

    return { exitosos, fallidos };
}
