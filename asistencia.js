// =========================================
// ASISTENCIA - CON SOPORTE OFFLINE
// =========================================

function prepararPaseLista(alumnos) {
    const cont = document.getElementById('lista-asistencia-tabla');
    cont.innerHTML = '';
    state.asistenciasHoy = {};

    if (alumnos.length === 0) {
        cont.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-light);"><i class="fas fa-user-slash" style="font-size: 2rem; margin-bottom: 10px;"></i><p>No hay alumnos en este grupo</p></div>`;
        return;
    }

    alumnos.forEach(al => {
        state.asistenciasHoy[al.id] = 'Asistencia';
        const div = document.createElement('div');
        div.className = 'fila-asistencia';
        div.dataset.nombre = al.nombre_completo.toLowerCase();
        div.dataset.asiento = al.asiento;

        const tieneObs = state.observacionesCache[al.id] && state.observacionesCache[al.id].length > 0;

        div.innerHTML = `
            <div class="botones-asistencia">
                <button class="btn-asist" onclick="cambiarEstado(${al.id}, 'Asistencia')" id="a-${al.id}" title="Asistencia">A</button>
                <button class="btn-falta" onclick="cambiarEstado(${al.id}, 'Falta')" id="f-${al.id}" title="Falta">F</button>
            </div>
            <span class="num-asiento">${al.asiento}</span>
            <span class="student-name">${escapeHtml(al.nombre_completo)}</span>
            <div style="display: flex; gap: 8px; margin-left: auto;">
                <button class="btn-observacion ${tieneObs ? 'tiene-obs' : ''}" onclick="abrirModalObservaciones(${al.id}, '${escapeHtml(al.nombre_completo)}')" title="Observaciones">
                    <i class="fas fa-comment-dots"></i>
                </button>
            </div>
        `;
        cont.appendChild(div);
    });

    alumnos.forEach(al => cambiarEstado(al.id, 'Asistencia'));
    actualizarResumenAsistencia();
    document.getElementById('resumen-asistencia').classList.remove('hidden');
}

function cambiarEstado(id, est) {
    state.asistenciasHoy[id] = est;
    const btnA = document.getElementById(`a-${id}`);
    const btnF = document.getElementById(`f-${id}`);
    if (btnA && btnF) {
        btnA.style.opacity = est === 'Asistencia' ? "1" : "0.3";
        btnF.style.opacity = est === 'Falta' ? "1" : "0.3";
    }

    // Mostrar/ocultar botón de justificación
    const fila = btnA?.closest('.fila-asistencia');
    if (fila) {
        let btnJust = fila.querySelector('.btn-justificar');
        if (est === 'Falta') {
            if (!btnJust) {
                btnJust = document.createElement('button');
                btnJust.className = 'btn-justificar';
                btnJust.innerHTML = '<i class="fas fa-notes-medical"></i>';
                btnJust.title = 'Justificar falta';
                const fecha = document.getElementById('fecha-asistencia').value;
                btnJust.onclick = () => abrirModalJustificacion(id, fecha);
                fila.querySelector('.botones-asistencia').appendChild(btnJust);
            }
            btnJust.style.display = 'inline-block';
        } else if (btnJust) {
            btnJust.style.display = 'none';
        }
    }

    actualizarResumenAsistencia();
}

function actualizarResumenAsistencia() {
    const total = Object.keys(state.asistenciasHoy).length;
    const presentes = Object.values(state.asistenciasHoy).filter(v => v === 'Asistencia').length;
    const faltas = total - presentes;

    const elPresentes = document.getElementById('contador-presentes');
    const elFaltas = document.getElementById('contador-faltas');
    const elTotal = document.getElementById('contador-total');

    if (elPresentes) elPresentes.textContent = presentes;
    if (elFaltas) elFaltas.textContent = faltas;
    if (elTotal) elTotal.textContent = total;
}

function filtrarAlumnosAsistencia() {
    const filtro = document.getElementById('buscar-alumno-asistencia').value.toLowerCase().trim();
    const filas = document.querySelectorAll('.fila-asistencia');
    filas.forEach(fila => {
        const nombre = fila.dataset.nombre || '';
        const asiento = fila.dataset.asiento || '';
        fila.classList.toggle('hidden-row', !(nombre.includes(filtro) || asiento.includes(filtro)));
    });
}

async function guardarAsistenciaBD() {
    const fecha = document.getElementById('fecha-asistencia').value;
    if (!fecha) {
        mostrarToast('Por favor selecciona una fecha', 'warning');
        return;
    }
    const total = Object.keys(state.asistenciasHoy).length;
    if (total === 0) {
        mostrarToast('No hay alumnos para registrar asistencia', 'warning');
        return;
    }

    const presentes = Object.values(state.asistenciasHoy).filter(v => v === 'Asistencia').length;
    const faltas = total - presentes;

    if (!confirm(`¿Guardar asistencia del ${fecha}?\n\n✓ Presentes: ${presentes}\n✗ Faltas: ${faltas}\nTotal: ${total}`)) return;

    mostrarSpinner('Guardando asistencia...');

    try {
        const registros = Object.keys(state.asistenciasHoy).map(id => ({
            estudiante_id: id,
            estado: state.asistenciasHoy[id],
            fecha: fecha,
            grupo_id: state.grupoSeleccionadoId
        }));

        // SIEMPRE guardar en IndexedDB primero (para offline)
        for (const reg of registros) {
            await guardarAsistenciaLocal(reg);
        }

        mostrarToast('Asistencia guardada localmente', 'success');

        // Si hay internet, sincronizar con Supabase
        if (navigator.onLine) {
            try {
                const { error } = await fetchConRetry(() =>
                    clienteSupabase.from('asistencia').insert(registros)
                );
                if (error) {
                    console.error('Error sync Supabase:', error);
                    mostrarToast('Guardado local. Se sincronizará cuando haya internet.', 'warning');
                } else {
                    // Marcar como sincronizado en IndexedDB
                    const asistenciasLocales = await obtenerTodosDeStore('asistencia', 'fecha', fecha);
                    for (const a of asistenciasLocales) {
                        if (a.synced === false && a.grupo_id === state.grupoSeleccionadoId) {
                            await marcarComoSync('asistencia', a.local_id);
                        }
                    }
                    mostrarToast('Asistencia sincronizada con la nube', 'success');
                }
            } catch (syncErr) {
                console.error('Error en sync:', syncErr);
                mostrarToast('Guardado local. Se sincronizará cuando haya internet.', 'warning');
            }
        } else {
            mostrarToast('Sin conexión. Los datos se sincronizarán automáticamente.', 'warning');
        }

        // Actualizar contador offline
        actualizarContadorOffline();
    } catch (err) {
        mostrarToast('Error al guardar asistencia', 'error');
        console.error(err);
    } finally {
        ocultarSpinner();
    }
}
