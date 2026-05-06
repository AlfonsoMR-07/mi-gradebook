// =========================================
// TAREAS Y NOTAS - CON SOPORTE OFFLINE
// =========================================

async function crearActividad() {
    const nombre = document.getElementById('nombre-tarea').value.trim();
    const fecha = document.getElementById('fecha-tarea').value;
    const cat = document.getElementById('categoria-tarea').value;

    if (!nombre || !fecha) {
        mostrarToast('Por favor rellena el nombre y la fecha', 'warning');
        return;
    }

    const fechaSeleccionada = new Date(fecha);
    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);
    if (fechaSeleccionada > hoy) {
        mostrarToast('La fecha no puede ser futura', 'warning');
        return;
    }

    mostrarSpinner('Creando actividad...');

    try {
        let actividadId = null;
        let actividadData = null;

        // Intentar crear en Supabase si hay conexión
        if (navigator.onLine) {
            try {
                const { data, error } = await clienteSupabase
                    .from('actividades')
                    .insert([{ 
                        grupo_id: state.grupoSeleccionadoId, 
                        nombre_actividad: nombre, 
                        fecha_actividad: fecha, 
                        tipo: cat,
                        ponderacion: 100 
                    }])
                    .select();

                if (error) {
                    console.warn('[Actividad] Error Supabase:', error);
                } else if (data && data.length > 0) {
                    actividadId = data[0].id;
                    actividadData = data[0];
                    // Guardar en local
                    await guardarEnStore('actividades', { ...data[0], synced: true, last_sync: new Date().toISOString() });
                }
            } catch (err) {
                console.warn('[Actividad] Fallo conexión Supabase:', err);
            }
        }

        // Si no se pudo crear en Supabase, crear localmente
        if (!actividadId) {
            actividadId = `local_act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            actividadData = {
                id: actividadId,
                local_id: actividadId,
                grupo_id: state.grupoSeleccionadoId,
                nombre_actividad: nombre,
                fecha_actividad: fecha,
                tipo: cat,
                ponderacion: 100,
                synced: false,
                timestamp: new Date().toISOString()
            };
            await guardarEnStore('actividades', actividadData);
            await agregarCambioPendiente('actividades', actividadData);
            mostrarToast('Actividad creada localmente (se sincronizará)', 'warning');
        } else {
            mostrarToast('Actividad creada con éxito', 'success');
        }

        state.actividadActualId = actividadId;
        document.getElementById('tabla-calificaciones').classList.remove('hidden');
        generarCamposNotas();

        document.getElementById('nombre-tarea').value = '';
        document.getElementById('fecha-tarea').value = '';

        actualizarContadorOffline();
    } catch (err) {
        mostrarToast('Error al crear actividad', 'error');
        console.error(err);
    } finally {
        ocultarSpinner();
    }
}

function generarCamposNotas() {
    const contenedor = document.getElementById('lista-alumnos-notas');
    contenedor.innerHTML = '';

    if (state.alumnosActuales.length === 0) {
        contenedor.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-light);">No hay alumnos para calificar</div>`;
        return;
    }

    state.alumnosActuales.forEach(al => {
        const div = document.createElement('div');
        div.className = 'fila-asistencia';
        div.dataset.nombre = al.nombre_completo.toLowerCase();
        div.innerHTML = `
            <input type="number" class="input-nota" id="nota-${al.id}" value="10" 
                min="0" max="10" step="0.1" 
                onchange="validarNota(this)"
                title="Nota para ${escapeHtml(al.nombre_completo)}">
            <span>${escapeHtml(al.nombre_completo)}</span>
        `;
        contenedor.appendChild(div);
    });
}

function validarNota(input) {
    let valor = parseFloat(input.value);
    if (isNaN(valor) || valor < 0) valor = 0;
    if (valor > 10) valor = 10;
    input.value = valor;
}

function filtrarAlumnosNotas() {
    const filtro = document.getElementById('buscar-alumno-notas').value.toLowerCase().trim();
    const filas = document.querySelectorAll('#lista-alumnos-notas .fila-asistencia');
    filas.forEach(fila => {
        const nombre = fila.dataset.nombre || '';
        fila.classList.toggle('hidden-row', !nombre.includes(filtro));
    });
}

async function guardarNotasBD() {
    if (!state.actividadActualId) {
        mostrarToast('Primero debes crear una actividad', 'warning');
        return;
    }

    const notas = Array.from(document.querySelectorAll('.input-nota')).map(i => ({
        estudiante_id: i.id.replace('nota-', ''),
        actividad_id: state.actividadActualId,
        nota: parseFloat(i.value) || 0,
        grupo_id: state.grupoSeleccionadoId
    }));

    if (notas.length === 0) {
        mostrarToast('No hay notas para guardar', 'warning');
        return;
    }

    mostrarSpinner('Guardando calificaciones...');

    try {
        // SIEMPRE guardar en IndexedDB primero
        for (const nota of notas) {
            await guardarCalificacionLocal(nota);
        }

        mostrarToast('Calificaciones guardadas localmente', 'success');

        // Si hay internet, sincronizar con Supabase
        if (navigator.onLine) {
            try {
                const { error } = await clienteSupabase.from('calificaciones').insert(notas);
                if (error) {
                    console.error('Error sync Supabase:', error);
                    mostrarToast('Guardado local. Se sincronizará cuando haya internet.', 'warning');
                } else {
                    mostrarToast('Calificaciones sincronizadas con la nube', 'success');
                }
            } catch (syncErr) {
                console.error('Error sync:', syncErr);
                mostrarToast('Guardado local. Se sincronizará cuando haya internet.', 'warning');
            }
        } else {
            mostrarToast('Sin conexión. Se sincronizará automáticamente.', 'warning');
        }

        actualizarContadorOffline();
        document.getElementById('tabla-calificaciones').classList.add('hidden');
        state.actividadActualId = null;
    } catch (err) {
        mostrarToast('Error al guardar calificaciones', 'error');
        console.error(err);
    } finally {
        ocultarSpinner();
    }
}

// =========================================
// PLANTILLAS - CON SOPORTE OFFLINE
// =========================================

async function cargarPlantillasSelector() {
    try {
        let plantillas = [];

        // Intentar cargar desde Supabase
        if (navigator.onLine) {
            const { data } = await clienteSupabase.from('plantillas')
                .select('*').eq('grupo_id', state.grupoSeleccionadoId);

            if (data) {
                plantillas = data;
                // Guardar en local
                await guardarPlantillasLocal(data);
            }
        } else {
            // Cargar desde local
            plantillas = await obtenerPlantillasPorGrupoLocal(state.grupoSeleccionadoId);
        }

        const sel = document.getElementById('selector-plantilla');
        if (!sel) return;

        sel.innerHTML = '<option value="">-- Seleccionar plantilla --</option>';
        if (plantillas && plantillas.length > 0) {
            plantillas.forEach(p => {
                sel.innerHTML += `<option value="${p.id}" data-nombre="${escapeHtml(p.nombre)}" data-categoria="${escapeHtml(p.categoria)}">${escapeHtml(p.nombre)} (${escapeHtml(p.categoria)})</option>`;
            });
        }
    } catch (e) {
        console.log('[Plantillas] Error cargando:', e);
    }
}

function aplicarPlantilla() {
    const sel = document.getElementById('selector-plantilla');
    const opcion = sel.options[sel.selectedIndex];
    if (!opcion.value) {
        mostrarToast('Selecciona una plantilla', 'warning');
        return;
    }

    document.getElementById('nombre-tarea').value = opcion.dataset.nombre;
    document.getElementById('categoria-tarea').value = opcion.dataset.categoria;
    mostrarToast('Plantilla aplicada', 'success');
}

// =========================================
// MODAL PLANTILLAS
// =========================================

function abrirModalPlantilla() {
    document.getElementById('plantilla-nombre').value = '';
    document.getElementById('plantilla-categoria').value = 'Trabajo en Clase';
    document.getElementById('modal-plantilla').classList.remove('hidden');
    document.getElementById('plantilla-nombre').focus();
}

function cerrarModalPlantilla() {
    document.getElementById('modal-plantilla').classList.add('hidden');
}

async function guardarPlantillaDesdeModal() {
    const nombre = document.getElementById('plantilla-nombre').value.trim();
    const cat = document.getElementById('plantilla-categoria').value;

    if (!nombre) {
        mostrarToast('Escribe un nombre para la plantilla', 'warning');
        document.getElementById('plantilla-nombre').focus();
        return;
    }

    mostrarSpinner('Guardando plantilla...');

    try {
        let guardado = false;

        // Intentar guardar en Supabase
        if (navigator.onLine) {
            try {
                const { data, error } = await clienteSupabase.from('plantillas').insert({
                    grupo_id: state.grupoSeleccionadoId,
                    nombre: nombre,
                    categoria: cat
                }).select();

                if (error) {
                    console.warn('[Plantilla] Error Supabase:', error);
                } else {
                    mostrarToast('Plantilla guardada correctamente', 'success');
                    cerrarModalPlantilla();
                    await cargarPlantillasSelector();
                    guardado = true;
                }
            } catch (err) {
                console.warn('[Plantilla] Fallo conexión:', err);
            }
        }

        // Si no se guardó en Supabase, guardar local
        if (!guardado) {
            const plantillaLocal = {
                id: `local_plant_${Date.now()}`,
                local_id: `local_plant_${Date.now()}`,
                grupo_id: state.grupoSeleccionadoId,
                nombre: nombre,
                categoria: cat,
                synced: false,
                timestamp: new Date().toISOString()
            };
            await guardarEnStore('plantillas', plantillaLocal);
            await agregarCambioPendiente('plantillas', plantillaLocal);
            mostrarToast('Plantilla guardada localmente (se sincronizará)', 'warning');
            cerrarModalPlantilla();
            await cargarPlantillasSelector();
            actualizarContadorOffline();
        }
    } catch (err) {
        console.error('Error catch:', err);
        mostrarToast('Error al guardar plantilla: ' + (err.message || 'Error desconocido'), 'error', 6000);
    } finally {
        ocultarSpinner();
    }
}

// Función antigua mantenida por compatibilidad
async function guardarComoPlantilla() {
    abrirModalPlantilla();
}

async function duplicarActividad(id) {
    mostrarSpinner('Duplicando actividad...');
    try {
        let actOriginal = null;

        // Intentar obtener de Supabase
        if (navigator.onLine) {
            const { data } = await clienteSupabase.from('actividades').select('*').eq('id', id).single();
            if (data) actOriginal = data;
        }

        // Si no está en Supabase, buscar en local
        if (!actOriginal) {
            const actLocal = await obtenerDeStore('actividades', id);
            if (actLocal) actOriginal = actLocal;
        }

        if (!actOriginal) {
            mostrarToast('Actividad no encontrada', 'error');
            return;
        }

        const nuevaAct = {
            grupo_id: actOriginal.grupo_id,
            nombre_actividad: actOriginal.nombre_actividad + ' (Copia)',
            fecha_actividad: new Date().toISOString().split('T')[0],
            tipo: actOriginal.tipo,
            ponderacion: actOriginal.ponderacion
        };

        if (navigator.onLine) {
            const { data: nuevaActData, error: errInsert } = await clienteSupabase.from('actividades').insert(nuevaAct).select();
            if (errInsert) {
                mostrarToast('Error al duplicar: ' + errInsert.message, 'error');
                return;
            }

            // Copiar calificaciones
            if (nuevaActData && nuevaActData.length > 0) {
                const { data: notasOrig } = await clienteSupabase.from('calificaciones').select('*').eq('actividad_id', id);
                if (notasOrig && notasOrig.length > 0) {
                    const nuevasNotas = notasOrig.map(n => ({
                        estudiante_id: n.estudiante_id,
                        actividad_id: nuevaActData[0].id,
                        nota: n.nota,
                        grupo_id: state.grupoSeleccionadoId
                    }));
                    await clienteSupabase.from('calificaciones').insert(nuevasNotas);
                }
            }
        } else {
            // Guardar localmente
            const actLocal = {
                ...nuevaAct,
                id: `local_act_${Date.now()}`,
                local_id: `local_act_${Date.now()}`,
                synced: false,
                timestamp: new Date().toISOString()
            };
            await guardarEnStore('actividades', actLocal);
            await agregarCambioPendiente('actividades', actLocal);
        }

        mostrarToast('Actividad duplicada con éxito', 'success');
        await cargarHistorial('actividades');
    } catch (err) {
        mostrarToast('Error al duplicar actividad', 'error');
    } finally {
        ocultarSpinner();
    }
}
