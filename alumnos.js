// =========================================
// ALUMNOS - GESTIÓN COMPLETA
// =========================================

async function cargarAlumnos() {
    mostrarSpinner('Cargando alumnos...');
    try {
        const { data: alumnosReal, error } = await clienteSupabase.from('estudiantes')
            .select('*').eq('grupo_id', state.grupoSeleccionadoId).order('asiento', { ascending: true });

        if (error) {
            mostrarToast('Error al cargar alumnos: ' + error.message, 'error');
            return;
        }
        if (alumnosReal) {
            state.alumnosActuales = alumnosReal;
            // Precargar observaciones y justificaciones
            await precargarObservaciones();
            await precargarJustificaciones();
            prepararPaseLista(alumnosReal);
        }
    } catch (err) {
        mostrarToast('Error al cargar alumnos', 'error');
    } finally {
        ocultarSpinner();
    }
}

async function importarAlumnos() {
    const texto = document.getElementById('nombres-masivos').value;
    const lineas = texto.split('\n').filter(l => l.includes('-'));

    if (lineas.length === 0) {
        mostrarToast('Formato inválido. Usa: 1 - Nombre Apellido', 'warning');
        return;
    }

    const datos = lineas.map(l => {
        const partes = l.split('-');
        const num = partes[0].trim();
        const nom = partes.slice(1).join('-').trim();
        return { nombre_completo: nom, asiento: parseInt(num), grupo_id: state.grupoSeleccionadoId };
    }).filter(d => d.nombre_completo && !isNaN(d.asiento));

    if (datos.length === 0) {
        mostrarToast('No se encontraron datos válidos', 'warning');
        return;
    }

    mostrarSpinner('Guardando alumnos...');
    try {
        const { error } = await clienteSupabase.from('estudiantes').insert(datos);
        if (error) {
            mostrarToast('Error: ' + error.message, 'error');
        } else {
            mostrarToast(`${datos.length} alumnos cargados correctamente`, 'success');
            document.getElementById('nombres-masivos').value = '';
            await cargarAlumnos();
        }
    } catch (err) {
        mostrarToast('Error al guardar alumnos', 'error');
    } finally {
        ocultarSpinner();
    }
}

// =========================================
// GESTIÓN DE ALUMNOS (NUEVA SECCIÓN)
// =========================================

function renderizarGestionAlumnos() {
    const contenedor = document.getElementById('lista-gestion-alumnos');
    if (!contenedor) return;

    contenedor.innerHTML = '';

    if (state.alumnosActuales.length === 0) {
        contenedor.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-light);"><i class="fas fa-user-slash" style="font-size: 2rem; margin-bottom: 10px;"></i><p>No hay alumnos en este grupo</p></div>`;
        return;
    }

    state.alumnosActuales.forEach(al => {
        const div = document.createElement('div');
        div.className = 'fila-gestion-alumno';
        div.dataset.alumnoId = al.id;

        const fotoUrl = al.foto_url || '';
        const tieneObs = state.observacionesCache[al.id] && state.observacionesCache[al.id].length > 0;

        div.innerHTML = `
            <div class="ga-numero">
                <input type="number" class="ga-input-asiento" value="${al.asiento || 0}" min="1" 
                    onchange="actualizarAsientoAlumno(${al.id}, this.value)"
                    title="Número de asiento">
            </div>
            <div class="ga-foto" onclick="subirFotoAlumno(${al.id})">
                ${fotoUrl ? `<img src="${fotoUrl}" class="foto-alumno-gestion" alt="${escapeHtml(al.nombre_completo)}">` : `<div class="foto-placeholder-gestion"><i class="fas fa-camera"></i></div>`}
            </div>
            <div class="ga-nombre">
                <input type="text" class="ga-input-nombre" value="${escapeHtml(al.nombre_completo)}" 
                    onchange="actualizarNombreAlumno(${al.id}, this.value)"
                    title="Nombre completo">
            </div>
            <div class="ga-acciones">
                <button class="btn-observacion ${tieneObs ? 'tiene-obs' : ''}" onclick="abrirModalObservaciones(${al.id}, '${escapeHtml(al.nombre_completo)}')" title="Observaciones">
                    <i class="fas fa-comment-dots"></i>
                </button>
                <button class="btn-eliminar-alumno" onclick="eliminarAlumno(${al.id})" title="Eliminar alumno">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        contenedor.appendChild(div);
    });
}

async function actualizarAsientoAlumno(alumnoId, nuevoAsiento) {
    const asiento = parseInt(nuevoAsiento);
    if (isNaN(asiento) || asiento < 1) {
        mostrarToast('El asiento debe ser un número válido', 'warning');
        return;
    }

    mostrarSpinner('Actualizando asiento...');
    try {
        const { error } = await clienteSupabase.from('estudiantes')
            .update({ asiento: asiento })
            .eq('id', alumnoId);

        if (error) {
            mostrarToast('Error al actualizar asiento: ' + error.message, 'error');
        } else {
            mostrarToast('Asiento actualizado', 'success');
            const alumno = state.alumnosActuales.find(a => a.id === alumnoId);
            if (alumno) alumno.asiento = asiento;
            state.alumnosActuales.sort((a, b) => (a.asiento || 0) - (b.asiento || 0));
            renderizarGestionAlumnos();
        }
    } catch (err) {
        mostrarToast('Error al actualizar asiento', 'error');
    } finally {
        ocultarSpinner();
    }
}

async function actualizarNombreAlumno(alumnoId, nuevoNombre) {
    const nombre = nuevoNombre.trim();
    if (!nombre) {
        mostrarToast('El nombre no puede estar vacío', 'warning');
        return;
    }

    mostrarSpinner('Actualizando nombre...');
    try {
        const { error } = await clienteSupabase.from('estudiantes')
            .update({ nombre_completo: nombre })
            .eq('id', alumnoId);

        if (error) {
            mostrarToast('Error al actualizar nombre: ' + error.message, 'error');
        } else {
            mostrarToast('Nombre actualizado', 'success');
            const alumno = state.alumnosActuales.find(a => a.id === alumnoId);
            if (alumno) alumno.nombre_completo = nombre;
            renderizarGestionAlumnos();
        }
    } catch (err) {
        mostrarToast('Error al actualizar nombre', 'error');
    } finally {
        ocultarSpinner();
    }
}

async function eliminarAlumno(alumnoId) {
    const alumno = state.alumnosActuales.find(a => a.id === alumnoId);
    const nombre = alumno ? alumno.nombre_completo : 'este alumno';

    if (!confirm(`¿Eliminar a ${nombre}?\n\nSe eliminarán también todas sus calificaciones, asistencias y observaciones. Esta acción no se puede deshacer.`)) return;

    mostrarSpinner('Eliminando alumno...');
    try {
        // Eliminar dependencias primero
        await clienteSupabase.from('calificaciones').delete().eq('estudiante_id', alumnoId);
        await clienteSupabase.from('asistencia').delete().eq('estudiante_id', alumnoId);
        await clienteSupabase.from('observaciones').delete().eq('estudiante_id', alumnoId);

        // Eliminar alumno
        const { error } = await clienteSupabase.from('estudiantes').delete().eq('id', alumnoId);

        if (error) {
            mostrarToast('Error al eliminar: ' + error.message, 'error');
        } else {
            mostrarToast('Alumno eliminado correctamente', 'success');
            state.alumnosActuales = state.alumnosActuales.filter(a => a.id !== alumnoId);
            delete state.observacionesCache[alumnoId];
            renderizarGestionAlumnos();
        }
    } catch (err) {
        mostrarToast('Error al eliminar alumno', 'error');
    } finally {
        ocultarSpinner();
    }
}

async function subirFotoAlumno(estudianteId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            mostrarToast('La imagen debe ser menor a 2MB', 'warning');
            return;
        }

        mostrarSpinner('Subiendo foto...');
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${estudianteId}_${Date.now()}.${fileExt}`;

            const { error: uploadError } = await clienteSupabase.storage
                .from('fotos-alumnos')
                .upload(fileName, file, { contentType: file.type });

            if (uploadError) {
                mostrarToast('Error al subir foto: ' + uploadError.message, 'error');
                ocultarSpinner();
                return;
            }

            const { data: { publicUrl } } = clienteSupabase.storage
                .from('fotos-alumnos')
                .getPublicUrl(fileName);

            const { error: updateError } = await clienteSupabase
                .from('estudiantes')
                .update({ foto_url: publicUrl })
                .eq('id', estudianteId);

            if (updateError) {
                mostrarToast('Error al guardar URL: ' + updateError.message, 'error');
            } else {
                mostrarToast('Foto subida correctamente', 'success');
                const alumno = state.alumnosActuales.find(a => a.id === estudianteId);
                if (alumno) alumno.foto_url = publicUrl;
                renderizarGestionAlumnos();
            }
        } catch (err) {
            mostrarToast('Error al subir foto', 'error');
        } finally {
            ocultarSpinner();
        }
    };
    input.click();
}

function filtrarAlumnosGestion() {
    const filtro = document.getElementById('buscar-alumno-gestion').value.toLowerCase().trim();
    const filas = document.querySelectorAll('.fila-gestion-alumno');
    filas.forEach(fila => {
        const nombre = fila.querySelector('.ga-input-nombre')?.value.toLowerCase() || '';
        const asiento = fila.querySelector('.ga-input-asiento')?.value || '';
        fila.classList.toggle('hidden-row', !(nombre.includes(filtro) || asiento.includes(filtro)));
    });
}
