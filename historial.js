// =========================================
// HISTORIAL - CON SOPORTE OFFLINE
// =========================================

async function cargarHistorial(tipo) {
    state.historialActivo = tipo;
    document.querySelectorAll('.btn-sub-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.btn-sub-tab[data-subtab="${tipo}"]`)?.classList.add('active');

    const contenedor = document.getElementById('lista-historial-items');
    contenedor.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-light);"><div class="spinner" style="width: 30px; height: 30px; margin: 0 auto 10px;"></div>Cargando registros...</div>`;

    try {
        if (tipo === 'actividades') {
            let data = [];

            if (navigator.onLine) {
                const result = await fetchConRetry(() =>
                    clienteSupabase
                        .from('actividades').select('*').eq('grupo_id', state.grupoSeleccionadoId).order('fecha_actividad', { ascending: false })
                );
                if (result.data) {
                    data = result.data;
                    await guardarActividadesLocal(data);
                }
            } else {
                data = await obtenerActividadesPorGrupoLocal(state.grupoSeleccionadoId);
            }

            if (!data || data.length === 0) {
                contenedor.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-light);"><i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 10px;"></i><p>No hay actividades registradas</p></div>`;
                return;
            }

            contenedor.innerHTML = data.map(act => `
                <div class="card-historial" style="border: 1px solid #ddd; padding: 15px; margin-bottom: 10px; border-radius: 8px; background: #fff;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 10px; align-items: end;">
                        <div>
                            <label style="font-size: 11px; color: #666;">Nombre:</label><br>
                            <input type="text" id="edit-nom-${act.id}" value="${escapeHtml(act.nombre_actividad)}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
                        </div>
                        <div>
                            <label style="font-size: 11px; color: #666;">Fecha:</label><br>
                            <input type="date" id="edit-fec-${act.id}" value="${act.fecha_actividad}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
                        </div>
                        <div style="display: flex; gap: 5px;">
                            <button onclick="duplicarActividad(${act.id})" style="background:#9b59b6; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;" title="Duplicar">
                                <i class="fas fa-copy"></i>
                            </button>
                            <button onclick="actualizarActividad(${act.id})" style="background:#2ecc71; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;" title="Guardar cambios">
                                <i class="fas fa-save"></i>
                            </button>
                            <button onclick="eliminarActividad(${act.id})" style="background:#e74c3c; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div style="margin-top: 8px; font-size: 0.8rem; color: var(--text-light);">
                        <span style="background: #eaf4f9; padding: 2px 8px; border-radius: 10px;">${escapeHtml(act.tipo || 'Sin categoría')}</span>
                        ${!act.synced && act.local_id ? '<span style="background: #fff3cd; padding: 2px 8px; border-radius: 10px; margin-left: 5px;"><i class="fas fa-wifi-slash"></i> Offline</span>' : ''}
                    </div>
                </div>
            `).join('');

        } else if (tipo === 'asistencia') {
            let data = [];

            if (navigator.onLine) {
                const result = await fetchConRetry(() =>
                    clienteSupabase.from('asistencia')
                        .select('fecha').in('estudiante_id', state.alumnosActuales.map(al => al.id))
                );
                if (result.data) data = result.data;
            } else {
                const asistLocal = await obtenerTodosDeStore('asistencia');
                data = asistLocal.filter(a => state.alumnosActuales.map(al => al.id).includes(a.estudiante_id));
            }

            if (!data || data.length === 0) {
                contenedor.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-light);"><i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 10px;"></i><p>No hay registros de asistencia</p></div>`;
                return;
            }

            const fechasUnicas = [...new Set(data.map(d => d.fecha))].sort().reverse();
            contenedor.innerHTML = fechasUnicas.map(fecha => `
                <div class="card-historial" style="border: 1px solid #ddd; padding: 15px; margin-bottom: 10px; border-radius: 8px; background: #fdfdfd;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div><strong>Sesión:</strong> <input type="date" id="old-fecha-${fecha}" value="${fecha}" style="padding: 6px; border: 1px solid var(--border-color); border-radius: var(--radius-sm);"></div>
                        <div style="display: flex; gap: 5px;">
                            <button onclick="actualizarFechaAsistencia('${fecha}')" style="background:#3498db; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;" title="Cambiar fecha">
                                <i class="fas fa-calendar-alt"></i>
                            </button>
                            <button onclick="eliminarAsistenciaDia('${fecha}')" style="background:#e74c3c; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;" title="Eliminar día">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');

        } else if (tipo === 'plantillas') {
            let data = [];

            if (navigator.onLine) {
                const result = await fetchConRetry(() =>
                    clienteSupabase.from('plantillas')
                        .select('*').eq('grupo_id', state.grupoSeleccionadoId).order('created_at', { ascending: false })
                );
                if (result.data) {
                    data = result.data;
                    await guardarPlantillasLocal(data);
                }
            } else {
                data = await obtenerPlantillasPorGrupoLocal(state.grupoSeleccionadoId);
            }

            if (!data || data.length === 0) {
                contenedor.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-light);"><i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 10px;"></i><p>No hay plantillas guardadas</p></div>`;
                return;
            }

            contenedor.innerHTML = data.map(p => `
                <div class="card-historial" style="border: 1px solid #ddd; padding: 15px; margin-bottom: 10px; border-radius: 8px; background: #fff;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>${escapeHtml(p.nombre)}</strong>
                            <span style="background: #eaf4f9; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem; margin-left: 10px;">${escapeHtml(p.categoria)}</span>
                        </div>
                        <div style="display: flex; gap: 5px;">
                            <button onclick="usarPlantillaDesdeHistorial('${escapeHtml(p.nombre)}', '${escapeHtml(p.categoria)}')" style="background:#3498db; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;" title="Usar">
                                <i class="fas fa-check"></i>
                            </button>
                            <button onclick="eliminarPlantilla(${p.id})" style="background:#e74c3c; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        mostrarToast('Error al cargar historial', 'error');
        console.error(err);
    }
}

function usarPlantillaDesdeHistorial(nombre, categoria) {
    document.getElementById('nombre-tarea').value = nombre;
    document.getElementById('categoria-tarea').value = categoria;
    mostrarToast('Plantilla aplicada', 'success');
}

async function eliminarPlantilla(id) {
    if (!confirm('¿Eliminar esta plantilla?')) return;
    try {
        if (navigator.onLine && !String(id).startsWith('local_')) {
            await fetchConRetry(() =>
                    clienteSupabase.from('plantillas').delete().eq('id', id)
                );
        }
        await eliminarDeStore('plantillas', id);
        mostrarToast('Plantilla eliminada', 'success');
        await cargarHistorial('plantillas');
        await cargarPlantillasSelector();
    } catch (err) {
        mostrarToast('Error al eliminar plantilla', 'error');
    }
}

async function eliminarActividad(id) {
    if (!confirm("¿Eliminar esta actividad? Las calificaciones asociadas también se eliminarán.")) return;
    mostrarSpinner('Eliminando...');
    try {
        if (navigator.onLine && !String(id).startsWith('local_')) {
            await fetchConRetry(() =>
                    clienteSupabase.from('calificaciones').delete().eq('actividad_id', id)
                );
            await fetchConRetry(() =>
                    clienteSupabase.from('actividades').delete().eq('id', id)
                );
        }
        await eliminarDeStore('actividades', id);
        mostrarToast('Actividad eliminada', 'success');
        await cargarHistorial('actividades');
    } catch (err) {
        mostrarToast('Error al eliminar actividad', 'error');
    } finally {
        ocultarSpinner();
    }
}

async function eliminarAsistenciaDia(fecha) {
    if (!confirm(`¿Borrar asistencia del ${fecha}?`)) return;
    mostrarSpinner('Eliminando...');
    try {
        const idsAlumnos = state.alumnosActuales.map(al => al.id);
        if (navigator.onLine) {
            await fetchConRetry(() =>
                    clienteSupabase.from('asistencia').delete().eq('fecha', fecha).in('estudiante_id', idsAlumnos)
                );
        }
        // Eliminar locales
        const asistLocal = await obtenerTodosDeStore('asistencia');
        for (const a of asistLocal) {
            if (a.fecha === fecha && idsAlumnos.includes(a.estudiante_id)) {
                await eliminarDeStore('asistencia', a.local_id);
            }
        }
        mostrarToast('Asistencia eliminada', 'success');
        await cargarHistorial('asistencia');
    } catch (err) {
        mostrarToast('Error al eliminar asistencia', 'error');
    } finally {
        ocultarSpinner();
    }
}

async function actualizarActividad(id) {
    const nombre = document.getElementById(`edit-nom-${id}`).value.trim();
    const fecha = document.getElementById(`edit-fec-${id}`).value;
    if (!nombre || !fecha) {
        mostrarToast('Nombre y fecha son obligatorios', 'warning');
        return;
    }
    mostrarSpinner('Actualizando...');
    try {
        if (navigator.onLine && !String(id).startsWith('local_')) {
            const { error } = await fetchConRetry(() =>
                    clienteSupabase.from('actividades').update({ 
                        nombre_actividad: nombre, fecha_actividad: fecha 
                    }).eq('id', id)
                );
            if (!error) mostrarToast('Actividad actualizada', 'success');
            else mostrarToast('Error al actualizar', 'error');
        } else {
            // Actualizar local
            const act = await obtenerDeStore('actividades', id);
            if (act) {
                act.nombre_actividad = nombre;
                act.fecha_actividad = fecha;
                act.synced = false;
                await guardarEnStore('actividades', act);
                await agregarCambioPendiente('actividades', act);
                mostrarToast('Actividad actualizada localmente', 'warning');
            }
        }
        actualizarContadorOffline();
    } catch (err) {
        mostrarToast('Error al actualizar', 'error');
    } finally {
        ocultarSpinner();
    }
}

async function actualizarFechaAsistencia(fechaOriginal) {
    const nuevaFecha = document.getElementById(`old-fecha-${fechaOriginal}`).value;
    if (!nuevaFecha) {
        mostrarToast('Selecciona una fecha válida', 'warning');
        return;
    }
    mostrarSpinner('Actualizando...');
    try {
        const idsAlumnos = state.alumnosActuales.map(al => al.id);
        if (navigator.onLine) {
            await fetchConRetry(() =>
                    clienteSupabase.from('asistencia').update({ fecha: nuevaFecha }).eq('fecha', fechaOriginal).in('estudiante_id', idsAlumnos)
                );
        }
        // Actualizar locales
        const asistLocal = await obtenerTodosDeStore('asistencia');
        for (const a of asistLocal) {
            if (a.fecha === fechaOriginal && idsAlumnos.includes(a.estudiante_id)) {
                a.fecha = nuevaFecha;
                a.synced = false;
                await guardarEnStore('asistencia', a);
            }
        }
        mostrarToast('Fecha actualizada', 'success');
        await cargarHistorial('asistencia');
        actualizarContadorOffline();
    } catch (err) {
        mostrarToast('Error al actualizar fecha', 'error');
    } finally {
        ocultarSpinner();
    }
}
