// =========================================
// SINCRONIZACIÓN MASIVA - DESCARGA COMPLETA OFFLINE
// =========================================

async function sincronizarTodoElSistema() {
    if (!navigator.onLine) {
        mostrarToast('Sin conexión. No se puede sincronizar.', 'warning');
        return { exitosos: 0, fallidos: 0, total: 0 };
    }

    mostrarSpinner('Sincronizando todos los datos...');
    let resultados = { exitosos: 0, fallidos: 0, total: 0 };

    try {
        // 1. Sincronizar grupos
        const gruposResult = await sincronizarGrupos();
        resultados.exitosos += gruposResult.exitosos;
        resultados.fallidos += gruposResult.fallidos;
        resultados.total += gruposResult.total;

        // 2. Sincronizar alumnos de todos los grupos
        const alumnosResult = await sincronizarTodosLosAlumnos();
        resultados.exitosos += alumnosResult.exitosos;
        resultados.fallidos += alumnosResult.fallidos;
        resultados.total += alumnosResult.total;

        // 3. Sincronizar actividades de todos los grupos
        const actividadesResult = await sincronizarTodasLasActividades();
        resultados.exitosos += actividadesResult.exitosos;
        resultados.fallidos += actividadesResult.fallidos;
        resultados.total += actividadesResult.total;

        // 4. Sincronizar calificaciones de todos los grupos
        const calificacionesResult = await sincronizarTodasLasCalificaciones();
        resultados.exitosos += calificacionesResult.exitosos;
        resultados.fallidos += calificacionesResult.fallidos;
        resultados.total += calificacionesResult.total;

        // 5. Sincronizar asistencia de todos los grupos
        const asistenciaResult = await sincronizarTodaLaAsistencia();
        resultados.exitosos += asistenciaResult.exitosos;
        resultados.fallidos += asistenciaResult.fallidos;
        resultados.total += asistenciaResult.total;

        // 6. Sincronizar observaciones de todos los grupos
        const observacionesResult = await sincronizarTodasLasObservaciones();
        resultados.exitosos += observacionesResult.exitosos;
        resultados.fallidos += observacionesResult.fallidos;
        resultados.total += observacionesResult.total;

        // 7. Sincronizar plantillas de todos los grupos
        const plantillasResult = await sincronizarTodasLasPlantillas();
        resultados.exitosos += plantillasResult.exitosos;
        resultados.fallidos += plantillasResult.fallidos;
        resultados.total += plantillasResult.total;

        // 8. Sincronizar categorías de todos los grupos
        const categoriasResult = await sincronizarTodasLasCategorias();
        resultados.exitosos += categoriasResult.exitosos;
        resultados.fallidos += categoriasResult.fallidos;
        resultados.total += categoriasResult.total;

        // 9. Sincronizar cambios pendientes (subida)
        const uploadResult = await sincronizarTodo();
        resultados.exitosos += uploadResult.exitosos;
        resultados.fallidos += uploadResult.fallidos;

        mostrarToast(
            `Sincronización completa: ${resultados.exitosos} exitosos, ${resultados.fallidos} fallidos`,
            resultados.fallidos === 0 ? 'success' : 'warning'
        );

        actualizarContadorOffline();
        return resultados;

    } catch (err) {
        console.error('[Sync] Error general:', err);
        mostrarToast('Error en sincronización masiva', 'error');
        return resultados;
    } finally {
        ocultarSpinner();
    }
}

// =========================================
// SINCRONIZAR GRUPOS
// =========================================

async function sincronizarGrupos() {
    try {
        const { data, error } = await fetchConRetry(() =>
            clienteSupabase.from('grupos').select('*')
        );

        if (error) throw error;
        if (data && data.length > 0) {
            await limpiarStore('grupos');
            await guardarGruposLocal(data);
            return { exitosos: data.length, fallidos: 0, total: data.length };
        }
        return { exitosos: 0, fallidos: 0, total: 0 };
    } catch (err) {
        console.error('[Sync] Error sincronizando grupos:', err);
        return { exitosos: 0, fallidos: 1, total: 1 };
    }
}

// =========================================
// SINCRONIZAR ALUMNOS DE TODOS LOS GRUPOS
// =========================================

async function sincronizarTodosLosAlumnos() {
    try {
        const { data, error } = await fetchConRetry(() =>
            clienteSupabase.from('estudiantes').select('*').order('asiento', { ascending: true })
        );

        if (error) throw error;
        if (data && data.length > 0) {
            await limpiarStore('estudiantes');
            await guardarAlumnosLocal(data);
            return { exitosos: data.length, fallidos: 0, total: data.length };
        }
        return { exitosos: 0, fallidos: 0, total: 0 };
    } catch (err) {
        console.error('[Sync] Error sincronizando alumnos:', err);
        return { exitosos: 0, fallidos: 1, total: 1 };
    }
}

// =========================================
// SINCRONIZAR ACTIVIDADES DE TODOS LOS GRUPOS
// =========================================

async function sincronizarTodasLasActividades() {
    try {
        const { data, error } = await fetchConRetry(() =>
            clienteSupabase.from('actividades').select('*').order('fecha_actividad', { ascending: true })
        );

        if (error) throw error;
        if (data && data.length > 0) {
            await limpiarStore('actividades');
            await guardarActividadesLocal(data);
            return { exitosos: data.length, fallidos: 0, total: data.length };
        }
        return { exitosos: 0, fallidos: 0, total: 0 };
    } catch (err) {
        console.error('[Sync] Error sincronizando actividades:', err);
        return { exitosos: 0, fallidos: 1, total: 1 };
    }
}

// =========================================
// SINCRONIZAR CALIFICACIONES DE TODOS LOS GRUPOS
// =========================================

async function sincronizarTodasLasCalificaciones() {
    try {
        const { data, error } = await fetchConRetry(() =>
            clienteSupabase.from('calificaciones').select('*')
        );

        if (error) throw error;
        if (data && data.length > 0) {
            await limpiarStore('calificaciones');
            for (const calif of data) {
                await guardarEnStore('calificaciones', {
                    ...calif,
                    synced: true,
                    last_sync: new Date().toISOString()
                });
            }
            return { exitosos: data.length, fallidos: 0, total: data.length };
        }
        return { exitosos: 0, fallidos: 0, total: 0 };
    } catch (err) {
        console.error('[Sync] Error sincronizando calificaciones:', err);
        return { exitosos: 0, fallidos: 1, total: 1 };
    }
}

// =========================================
// SINCRONIZAR ASISTENCIA DE TODOS LOS GRUPOS
// =========================================

async function sincronizarTodaLaAsistencia() {
    try {
        const { data, error } = await fetchConRetry(() =>
            clienteSupabase.from('asistencia').select('*')
        );

        if (error) throw error;
        if (data && data.length > 0) {
            await limpiarStore('asistencia');
            for (const asist of data) {
                await guardarEnStore('asistencia', {
                    ...asist,
                    local_id: asist.id || `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    synced: true,
                    last_sync: new Date().toISOString()
                });
            }
            return { exitosos: data.length, fallidos: 0, total: data.length };
        }
        return { exitosos: 0, fallidos: 0, total: 0 };
    } catch (err) {
        console.error('[Sync] Error sincronizando asistencia:', err);
        return { exitosos: 0, fallidos: 1, total: 1 };
    }
}

// =========================================
// SINCRONIZAR OBSERVACIONES DE TODOS LOS GRUPOS
// =========================================

async function sincronizarTodasLasObservaciones() {
    try {
        const { data, error } = await fetchConRetry(() =>
            clienteSupabase.from('observaciones').select('*')
        );

        if (error) throw error;
        if (data && data.length > 0) {
            await limpiarStore('observaciones');
            for (const obs of data) {
                await guardarEnStore('observaciones', {
                    ...obs,
                    local_id: obs.id || `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    synced: true,
                    last_sync: new Date().toISOString()
                });
            }
            return { exitosos: data.length, fallidos: 0, total: data.length };
        }
        return { exitosos: 0, fallidos: 0, total: 0 };
    } catch (err) {
        console.error('[Sync] Error sincronizando observaciones:', err);
        return { exitosos: 0, fallidos: 1, total: 1 };
    }
}

// =========================================
// SINCRONIZAR PLANTILLAS DE TODOS LOS GRUPOS
// =========================================

async function sincronizarTodasLasPlantillas() {
    try {
        const { data, error } = await fetchConRetry(() =>
            clienteSupabase.from('plantillas').select('*')
        );

        if (error) throw error;
        if (data && data.length > 0) {
            await limpiarStore('plantillas');
            await guardarPlantillasLocal(data);
            return { exitosos: data.length, fallidos: 0, total: data.length };
        }
        return { exitosos: 0, fallidos: 0, total: 0 };
    } catch (err) {
        console.error('[Sync] Error sincronizando plantillas:', err);
        return { exitosos: 0, fallidos: 1, total: 1 };
    }
}

// =========================================
// SINCRONIZAR CATEGORÍAS DE TODOS LOS GRUPOS
// =========================================

async function sincronizarTodasLasCategorias() {
    try {
        const { data, error } = await fetchConRetry(() =>
            clienteSupabase.from('categorias').select('*')
        );

        if (error) throw error;
        if (data && data.length > 0) {
            await limpiarStore('categorias');
            await guardarCategoriasLocal(data);
            return { exitosos: data.length, fallidos: 0, total: data.length };
        }
        return { exitosos: 0, fallidos: 0, total: 0 };
    } catch (err) {
        console.error('[Sync] Error sincronizando categorías:', err);
        return { exitosos: 0, fallidos: 1, total: 1 };
    }
}

// =========================================
// SINCRONIZAR CONFIGURACIONES
// =========================================

async function sincronizarConfiguraciones() {
    try {
        const { data, error } = await fetchConRetry(() =>
            clienteSupabase.from('configuraciones').select('*')
        );

        if (error) throw error;
        if (data && data.length > 0) {
            for (const config of data) {
                await guardarEnStore('configuracion', {
                    clave: `config_${config.grupo_id}`,
                    datos: JSON.stringify(config),
                    timestamp: new Date().toISOString()
                });
            }
            return { exitosos: data.length, fallidos: 0, total: data.length };
        }
        return { exitosos: 0, fallidos: 0, total: 0 };
    } catch (err) {
        console.error('[Sync] Error sincronizando configuraciones:', err);
        return { exitosos: 0, fallidos: 1, total: 1 };
    }
}
