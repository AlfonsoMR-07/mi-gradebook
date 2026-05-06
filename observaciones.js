// =========================================
// OBSERVACIONES - CON SOPORTE OFFLINE
// =========================================

async function precargarObservaciones() {
    if (state.alumnosActuales.length === 0) return;
    const ids = state.alumnosActuales.map(a => a.id);

    state.observacionesCache = {};

    try {
        // Intentar cargar desde Supabase
        if (navigator.onLine) {
            const { data } = await clienteSupabase.from('observaciones')
                .select('*').in('estudiante_id', ids).order('created_at', { ascending: false });

            if (data) {
                data.forEach(obs => {
                    if (!state.observacionesCache[obs.estudiante_id]) {
                        state.observacionesCache[obs.estudiante_id] = [];
                    }
                    state.observacionesCache[obs.estudiante_id].push(obs);
                });
                // Guardar en local para offline
                await guardarObservacionesLocal(data);
            }
        } else {
            // Cargar desde local
            const obsLocal = await obtenerObservacionesPorGrupoLocal(state.grupoSeleccionadoId);
            obsLocal.forEach(obs => {
                if (!state.observacionesCache[obs.estudiante_id]) {
                    state.observacionesCache[obs.estudiante_id] = [];
                }
                state.observacionesCache[obs.estudiante_id].push(obs);
            });
        }
    } catch (e) {
        console.log('[Observaciones] Error precargando:', e);
        // Intentar cargar desde local como fallback
        try {
            const obsLocal = await obtenerObservacionesPorGrupoLocal(state.grupoSeleccionadoId);
            obsLocal.forEach(obs => {
                if (!state.observacionesCache[obs.estudiante_id]) {
                    state.observacionesCache[obs.estudiante_id] = [];
                }
                state.observacionesCache[obs.estudiante_id].push(obs);
            });
        } catch (localErr) {
            console.log('[Observaciones] No hay datos locales:', localErr);
        }
    }
}

function abrirModalObservaciones(estudianteId, nombre) {
    document.getElementById('obs-estudiante-id').value = estudianteId;
    document.getElementById('nueva-observacion').value = '';

    const lista = document.getElementById('lista-observaciones');
    const obs = state.observacionesCache[estudianteId] || [];

    if (obs.length === 0) {
        lista.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 20px;">Sin observaciones</p>';
    } else {
        lista.innerHTML = obs.map(o => `
            <div class="obs-item">
                <div class="obs-fecha">${new Date(o.created_at || o.timestamp).toLocaleString('es-MX')}</div>
                <div>${escapeHtml(o.texto)}</div>
            </div>
        `).join('');
    }

    document.getElementById('modal-observaciones').classList.remove('hidden');
}

function cerrarModalObservaciones() {
    document.getElementById('modal-observaciones').classList.add('hidden');
}

async function guardarObservacion() {
    const estudianteId = document.getElementById('obs-estudiante-id').value;
    const texto = document.getElementById('nueva-observacion').value.trim();

    if (!texto) {
        mostrarToast('Escribe una observación', 'warning');
        return;
    }

    mostrarSpinner('Guardando...');
    try {
        const datos = {
            estudiante_id: estudianteId,
            grupo_id: state.grupoSeleccionadoId,
            texto: texto
        };

        // SIEMPRE guardar en IndexedDB primero
        await guardarObservacionLocal(datos);

        // Actualizar cache local
        if (!state.observacionesCache[estudianteId]) state.observacionesCache[estudianteId] = [];
        state.observacionesCache[estudianteId].unshift({ ...datos, created_at: new Date().toISOString() });

        // Actualizar indicador visual
        const btn = document.querySelector(`.fila-asistencia button[onclick*="abrirModalObservaciones(${estudianteId})"]`) ||
                    document.querySelector(`.fila-gestion-alumno button[onclick*="abrirModalObservaciones(${estudianteId})"]`);
        if (btn) btn.classList.add('tiene-obs');

        mostrarToast('Observación guardada localmente', 'success');

        // Si hay internet, sincronizar con Supabase
        if (navigator.onLine) {
            try {
                const { data, error } = await clienteSupabase.from('observaciones').insert(datos).select();
                if (error) {
                    console.error('Error sync Supabase:', error);
                    mostrarToast('Guardado local. Se sincronizará cuando haya internet.', 'warning');
                } else {
                    mostrarToast('Observación sincronizada con la nube', 'success');
                }
            } catch (syncErr) {
                console.error('Error sync:', syncErr);
                mostrarToast('Guardado local. Se sincronizará cuando haya internet.', 'warning');
            }
        } else {
            mostrarToast('Sin conexión. Se sincronizará automáticamente.', 'warning');
        }

        // Actualizar contador offline
        actualizarContadorOffline();
        cerrarModalObservaciones();
    } catch (err) {
        mostrarToast('Error al guardar observación', 'error');
        console.error(err);
    } finally {
        ocultarSpinner();
    }
}

// =========================================
// JUSTIFICACIÓN DE FALTAS
// =========================================

async function precargarJustificaciones() {
    if (state.alumnosActuales.length === 0) return;
    const ids = state.alumnosActuales.map(a => a.id);

    state.justificacionesCache = {};

    try {
        if (navigator.onLine) {
            const { data } = await clienteSupabase.from('asistencia')
                .select('*').in('estudiante_id', ids).not('justificacion', 'is', null);

            if (data) {
                data.forEach(j => {
                    const key = `${j.estudiante_id}_${j.fecha}`;
                    state.justificacionesCache[key] = j.justificacion;
                });
            }
        }
    } catch (e) {
        console.log('[Justificaciones] Error precargando:', e);
    }
}

function abrirModalJustificacion(estudianteId, fecha) {
    document.getElementById('just-estudiante-id').value = estudianteId;
    document.getElementById('just-fecha').value = fecha;

    const alumno = state.alumnosActuales.find(a => a.id == estudianteId);
    document.getElementById('just-alumno-nombre').textContent = alumno ? alumno.nombre_completo : '';

    const key = `${estudianteId}_${fecha}`;
    const justExistente = state.justificacionesCache[key] || '';
    document.getElementById('texto-justificacion').value = justExistente;

    document.getElementById('modal-justificacion').classList.remove('hidden');
}

function cerrarModalJustificacion() {
    document.getElementById('modal-justificacion').classList.add('hidden');
}

async function guardarJustificacion() {
    const estudianteId = document.getElementById('just-estudiante-id').value;
    const fecha = document.getElementById('just-fecha').value;
    const texto = document.getElementById('texto-justificacion').value.trim();

    if (!texto) {
        mostrarToast('Escribe el motivo de la justificación', 'warning');
        return;
    }

    mostrarSpinner('Guardando...');
    try {
        // Guardar local primero
        const datos = {
            estudiante_id: estudianteId,
            fecha: fecha,
            estado: 'Falta',
            justificacion: texto,
            grupo_id: state.grupoSeleccionadoId
        };

        await guardarAsistenciaLocal(datos);

        if (navigator.onLine) {
            const { error } = await clienteSupabase.from('asistencia').upsert({
                estudiante_id: estudianteId,
                fecha: fecha,
                estado: 'Falta',
                justificacion: texto
            }, { onConflict: 'estudiante_id, fecha' });

            if (error) {
                mostrarToast('Guardado local. Se sincronizará cuando haya internet.', 'warning');
            } else {
                mostrarToast('Justificación guardada', 'success');
                const key = `${estudianteId}_${fecha}`;
                state.justificacionesCache[key] = texto;
                cerrarModalJustificacion();
            }
        } else {
            mostrarToast('Sin conexión. Guardado localmente.', 'warning');
            const key = `${estudianteId}_${fecha}`;
            state.justificacionesCache[key] = texto;
            cerrarModalJustificacion();
        }

        actualizarContadorOffline();
    } catch (err) {
        mostrarToast('Error al guardar justificación', 'error');
    } finally {
        ocultarSpinner();
    }
}
