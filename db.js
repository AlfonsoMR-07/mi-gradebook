// =========================================
// BASE DE DATOS LOCAL (IndexedDB)
// =========================================

const DB_NAME = 'EduHubDB';
const DB_VERSION = 1;
let db = null;

// =========================================
// INICIALIZAR BASE DE DATOS
// =========================================

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            console.log('[DB] Base de datos local inicializada');
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            // Store para alumnos
            if (!database.objectStoreNames.contains('estudiantes')) {
                const storeEstudiantes = database.createObjectStore('estudiantes', { keyPath: 'id' });
                storeEstudiantes.createIndex('grupo_id', 'grupo_id', { unique: false });
                storeEstudiantes.createIndex('asiento', 'asiento', { unique: false });
            }

            // Store para grupos
            if (!database.objectStoreNames.contains('grupos')) {
                database.createObjectStore('grupos', { keyPath: 'id' });
            }

            // Store para asistencia
            if (!database.objectStoreNames.contains('asistencia')) {
                const storeAsist = database.createObjectStore('asistencia', { keyPath: 'local_id', autoIncrement: true });
                storeAsist.createIndex('estudiante_id', 'estudiante_id', { unique: false });
                storeAsist.createIndex('fecha', 'fecha', { unique: false });
                storeAsist.createIndex('synced', 'synced', { unique: false });
            }

            // Store para calificaciones
            if (!database.objectStoreNames.contains('calificaciones')) {
                const storeCalif = database.createObjectStore('calificaciones', { keyPath: 'local_id', autoIncrement: true });
                storeCalif.createIndex('estudiante_id', 'estudiante_id', { unique: false });
                storeCalif.createIndex('actividad_id', 'actividad_id', { unique: false });
                storeCalif.createIndex('synced', 'synced', { unique: false });
            }

            // Store para actividades
            if (!database.objectStoreNames.contains('actividades')) {
                const storeAct = database.createObjectStore('actividades', { keyPath: 'local_id', autoIncrement: true });
                storeAct.createIndex('grupo_id', 'grupo_id', { unique: false });
                storeAct.createIndex('synced', 'synced', { unique: false });
            }

            // Store para observaciones
            if (!database.objectStoreNames.contains('observaciones')) {
                const storeObs = database.createObjectStore('observaciones', { keyPath: 'local_id', autoIncrement: true });
                storeObs.createIndex('estudiante_id', 'estudiante_id', { unique: false });
                storeObs.createIndex('synced', 'synced', { unique: false });
            }

            // Store para categorías
            if (!database.objectStoreNames.contains('categorias')) {
                const storeCat = database.createObjectStore('categorias', { keyPath: 'id' });
                storeCat.createIndex('grupo_id', 'grupo_id', { unique: false });
            }

            // Store para cambios pendientes
            if (!database.objectStoreNames.contains('cambios_pendientes')) {
                const storePend = database.createObjectStore('cambios_pendientes', { keyPath: 'local_id', autoIncrement: true });
                storePend.createIndex('tipo', 'tipo', { unique: false });
                storePend.createIndex('timestamp', 'timestamp', { unique: false });
            }

            // Store para configuración
            if (!database.objectStoreNames.contains('configuracion')) {
                database.createObjectStore('configuracion', { keyPath: 'clave' });
            }
        };
    });
}

// =========================================
// OPERACIONES CRUD GENÉRICAS
// =========================================

function guardarEnStore(storeName, datos) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB no inicializada')); return; }
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(datos);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function obtenerDeStore(storeName, id) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB no inicializada')); return; }
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function obtenerTodosDeStore(storeName, indexName = null, valor = null) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB no inicializada')); return; }
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);

        let request;
        if (indexName && valor !== null) {
            const index = store.index(indexName);
            request = index.getAll(valor);
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
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function limpiarStore(storeName) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB no inicializada')); return; }
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// =========================================
// FUNCIONES ESPECÍFICAS PARA EDUHUB
// =========================================

async function guardarGrupoLocal(grupo) {
    return guardarEnStore('grupos', { ...grupo, last_sync: new Date().toISOString() });
}

async function guardarAlumnoLocal(alumno) {
    return guardarEnStore('estudiantes', { ...alumno, last_sync: new Date().toISOString() });
}

async function guardarAsistenciaLocal(asistencia) {
    const datos = {
        ...asistencia,
        synced: false,
        timestamp: new Date().toISOString()
    };
    const id = await guardarEnStore('asistencia', datos);
    await agregarCambioPendiente('asistencia', datos);
    return id;
}

async function guardarCalificacionLocal(calificacion) {
    const datos = {
        ...calificacion,
        synced: false,
        timestamp: new Date().toISOString()
    };
    const id = await guardarEnStore('calificaciones', datos);
    await agregarCambioPendiente('calificaciones', datos);
    return id;
}

async function guardarObservacionLocal(observacion) {
    const datos = {
        ...observacion,
        synced: false,
        timestamp: new Date().toISOString()
    };
    const id = await guardarEnStore('observaciones', datos);
    await agregarCambioPendiente('observaciones', datos);
    return id;
}

async function agregarCambioPendiente(tipo, datos) {
    return guardarEnStore('cambios_pendientes', {
        tipo,
        datos: JSON.stringify(datos),
        timestamp: new Date().toISOString(),
        intentos: 0
    });
}

async function obtenerCambiosPendientes() {
    return obtenerTodosDeStore('cambios_pendientes');
}

async function marcarComoSync(storeName, local_id) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB no inicializada')); return; }
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.get(local_id);

        request.onsuccess = () => {
            const data = request.result;
            if (data) {
                data.synced = true;
                data.sync_date = new Date().toISOString();
                store.put(data);
            }
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

async function eliminarCambioPendiente(local_id) {
    return eliminarDeStore('cambios_pendientes', local_id);
}

// =========================================
// SINCRONIZACIÓN CON SUPABASE
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
                const { error } = await clienteSupabase.from('asistencia').insert(datos);
                if (!error) {
                    await eliminarCambioPendiente(cambio.local_id);
                    exitosos++;
                } else {
                    fallidos++;
                    console.error('Error sync asistencia:', error);
                }
            } else if (cambio.tipo === 'calificaciones') {
                const { error } = await clienteSupabase.from('calificaciones').insert(datos);
                if (!error) {
                    await eliminarCambioPendiente(cambio.local_id);
                    exitosos++;
                } else {
                    fallidos++;
                    console.error('Error sync calificaciones:', error);
                }
            } else if (cambio.tipo === 'observaciones') {
                const { error } = await clienteSupabase.from('observaciones').insert(datos);
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

// =========================================
// CACHE DE DATOS DE SUPABASE
// =========================================

async function cachearDatosGrupo(grupoId, datos) {
    await guardarEnStore('configuracion', {
        clave: `grupo_${grupoId}_cache`,
        datos: JSON.stringify(datos),
        timestamp: new Date().toISOString()
    });
}

async function obtenerDatosGrupoCache(grupoId) {
    const config = await obtenerDeStore('configuracion', `grupo_${grupoId}_cache`);
    if (config && config.datos) {
        return JSON.parse(config.datos);
    }
    return null;
}

// =========================================
// EXPORTAR/IMPORTAR BASE DE DATOS LOCAL
// =========================================

async function exportarDBLocal() {
    const datos = {
        estudiantes: await obtenerTodosDeStore('estudiantes'),
        grupos: await obtenerTodosDeStore('grupos'),
        asistencia: await obtenerTodosDeStore('asistencia'),
        calificaciones: await obtenerTodosDeStore('calificaciones'),
        actividades: await obtenerTodosDeStore('actividades'),
        observaciones: await obtenerTodosDeStore('observaciones'),
        categorias: await obtenerTodosDeStore('categorias'),
        cambios_pendientes: await obtenerTodosDeStore('cambios_pendientes'),
        export_date: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eduhub_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    mostrarToast('Backup local descargado', 'success');
}

async function importarDBLocal(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const datos = JSON.parse(e.target.result);

                // Limpiar stores
                await limpiarStore('estudiantes');
                await limpiarStore('grupos');
                await limpiarStore('asistencia');
                await limpiarStore('calificaciones');
                await limpiarStore('actividades');
                await limpiarStore('observaciones');
                await limpiarStore('categorias');
                await limpiarStore('cambios_pendientes');

                // Importar datos
                for (const item of (datos.estudiantes || [])) await guardarEnStore('estudiantes', item);
                for (const item of (datos.grupos || [])) await guardarEnStore('grupos', item);
                for (const item of (datos.asistencia || [])) await guardarEnStore('asistencia', item);
                for (const item of (datos.calificaciones || [])) await guardarEnStore('calificaciones', item);
                for (const item of (datos.actividades || [])) await guardarEnStore('actividades', item);
                for (const item of (datos.observaciones || [])) await guardarEnStore('observaciones', item);
                for (const item of (datos.categorias || [])) await guardarEnStore('categorias', item);
                for (const item of (datos.cambios_pendientes || [])) await guardarEnStore('cambios_pendientes', item);

                mostrarToast('Backup importado correctamente', 'success');
                resolve();
            } catch (err) {
                mostrarToast('Error al importar backup: ' + err.message, 'error');
                reject(err);
            }
        };
        reader.readAsText(file);
    });
}
