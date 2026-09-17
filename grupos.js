// =========================================
// GRUPOS
// =========================================

async function cargarGrupos() {
    mostrarSpinner('Cargando grupos...');
    try {
        let todosLosGrupos = null;

        if (navigator.onLine) {
            try {
                const { data, error } = await clienteSupabase.from('grupos').select('*');
                if (error) throw error;
                todosLosGrupos = data || [];

                // Refrescar caché local para tenerlos disponibles sin conexión
                for (const g of todosLosGrupos) {
                    await guardarEnStore('grupos', g);
                }
            } catch (err) {
                console.warn('[Grupos] No se pudo consultar Supabase, se usará el caché local:', err);
                todosLosGrupos = null;
            }
        }

        if (!todosLosGrupos) {
            todosLosGrupos = await obtenerTodosDeStore('grupos');
            if (todosLosGrupos.length > 0) {
                mostrarToast('Sin conexión: mostrando grupos guardados localmente', 'warning');
            } else {
                mostrarToast('Sin conexión y sin grupos guardados localmente todavía', 'error');
            }
        }

        // NUEVO: determinar qué ciclo escolar mostrar.
        // Si el usuario ya eligió uno antes (localStorage), respetamos su elección
        // (mientras siga existiendo). Si no, mostramos el ciclo más reciente.
        const ciclosDisponibles = [...new Set(todosLosGrupos.map(g => g.ciclo_escolar || '2025-2026'))].sort();
        let cicloSeleccionado = obtenerCicloSeleccionado();
        if (!cicloSeleccionado || !ciclosDisponibles.includes(cicloSeleccionado)) {
            cicloSeleccionado = ciclosDisponibles[ciclosDisponibles.length - 1]; // el más reciente
            guardarCicloSeleccionado(cicloSeleccionado);
        }

        renderizarSelectorCiclo(ciclosDisponibles, cicloSeleccionado);

        const grupos = todosLosGrupos.filter(g => (g.ciclo_escolar || '2025-2026') === cicloSeleccionado);

        const lista = document.getElementById('lista-grupos');
        if (!lista) return;
        lista.innerHTML = '';
        const contador = document.getElementById('contador-grupos');
        if (contador) contador.textContent = grupos?.length || 0;

        if (!grupos || grupos.length === 0) {
            lista.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-light);"><i class="fas fa-folder-open" style="font-size: 3rem; margin-bottom: 15px; display: block;"></i>No hay grupos en el ciclo ${escapeHtml(cicloSeleccionado)}</div>`;
            return;
        }

        grupos.forEach(g => {
            const nombreAMostrar = escapeHtml(g.nombre || g.nombre_grupo || "Grupo sin nombre");
            const div = document.createElement('div');
            div.className = 'card-grupo';
            div.onclick = () => abrirGrupo(g.id, nombreAMostrar, g.ciclo_escolar || '2025-2026');
            div.innerHTML = `<i class="fas fa-users" style="font-size: 2rem; color: var(--accent-color); margin-bottom: 10px;"></i><h3>${nombreAMostrar}</h3>`;
            lista.appendChild(div);
        });
    } catch (err) {
        mostrarToast('Error al cargar grupos', 'error');
        console.error(err);
    } finally {
        ocultarSpinner();
    }
}

// Dibuja el selector "Ciclo escolar: [2025-2026 v]" arriba de Mis Grupos
function renderizarSelectorCiclo(ciclos, seleccionado) {
    const cont = document.getElementById('selector-ciclo-container');
    if (!cont) return;
    cont.innerHTML = `
        <label style="font-weight:600; color: var(--text-light);">Ciclo escolar:</label>
        <select id="select-ciclo-escolar" style="padding:6px 10px; border-radius:6px; border:1px solid #ccc;">
            ${ciclos.map(c => `<option value="${c}" ${c === seleccionado ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
    `;
    document.getElementById('select-ciclo-escolar').onchange = (e) => {
        guardarCicloSeleccionado(e.target.value);
        cargarGrupos();
    };
}

async function abrirGrupo(id, nombre, cicloEscolar = '2025-2026') {
    // ─── Control de concurrencia ───────────────────────────────────────────
    // Genera un ID único para esta apertura. Si el maestro hace clic en otro
    // grupo antes de que éste termine de cargar, el ID cambia y las
    // operaciones pendientes se cancelan antes de aplicar sus resultados.
    const operacionId = Date.now();
    state.operacionActualId = operacionId;
    // ──────────────────────────────────────────────────────────────────────

    state.grupoSeleccionadoId = id;
    state.asistenciasHoy = {};
    state.actividadActualId = null;
    state.alumnosActuales = [];
    state.cicloGrupoActual = cicloEscolar;

    // NUEVO: trimestre por defecto al abrir el grupo.
    // El ciclo 2025-2026 es el que ya tenías cargado en Trimestre 3;
    // cualquier ciclo nuevo (2026-2027 en adelante) arranca en Trimestre 1.
    state.trimestreActual = (cicloEscolar === '2025-2026') ? 3 : 1;
    renderizarSelectorTrimestre();

    // Limpiar UI inmediatamente para evitar mostrar datos del grupo anterior
    const listaAsistencia = document.getElementById('lista-asistencia-tabla');
    if (listaAsistencia) listaAsistencia.innerHTML = '';

    const fechaAsistencia = document.getElementById('fecha-asistencia');
    if (fechaAsistencia) {
        fechaAsistencia.value = obtenerFechaLocalISO();
    }

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const tabAsistencia = document.querySelector('.tab-btn[data-section="asistencia"]');
    if (tabAsistencia) tabAsistencia.classList.add('active');

    document.querySelectorAll('.btn-sub-tab').forEach(btn => btn.classList.remove('active'));
    const subTabAct = document.querySelector('.btn-sub-tab[data-subtab="actividades"]');
    if (subTabAct) subTabAct.classList.add('active');

    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('vista-grupo').classList.remove('hidden');
    document.getElementById('titulo-grupo-actual').innerText = "Grupo: " + nombre;

    document.querySelectorAll('.tab-content').forEach(x => x.classList.add('hidden'));
    document.getElementById('seccion-asistencia').classList.remove('hidden');

    document.getElementById('importar-area').classList.add('hidden');
    document.getElementById('tabla-calificaciones').classList.add('hidden');
    document.getElementById('resumen-asistencia').classList.add('hidden');

    // ── Carga de alumnos ──────────────────────────────────────────────────
    await cargarAlumnos();

    // Si el maestro ya abrió otro grupo mientras cargaba, cancelar aquí
    if (state.operacionActualId !== operacionId) {
        console.log('[Concurrencia] Apertura de grupo cancelada (alumnos) — el usuario cambió de grupo');
        return;
    }
    // ─────────────────────────────────────────────────────────────────────

    // ── Carga de plantillas ───────────────────────────────────────────────
    await cargarPlantillasSelector();

    if (state.operacionActualId !== operacionId) {
        console.log('[Concurrencia] Apertura de grupo cancelada (plantillas) — el usuario cambió de grupo');
        return;
    }
    // ─────────────────────────────────────────────────────────────────────

    // ── Recordatorios ─────────────────────────────────────────────────────
    await mostrarRecordatoriosGrupo();

    if (state.operacionActualId !== operacionId) {
        console.log('[Concurrencia] Apertura de grupo cancelada (recordatorios) — el usuario cambió de grupo');
        return;
    }
    // ─────────────────────────────────────────────────────────────────────

    console.log(`[Grupos] Grupo "${nombre}" cargado correctamente (op: ${operacionId})`);
}

// =========================================
// PROMOCIÓN DE GRUPO AL SIGUIENTE CICLO
// =========================================
// Crea un grupo NUEVO para el siguiente ciclo escolar (ej. "1º A" ciclo
// 2025-2026 → "2º A" ciclo 2026-2027), copiando los alumnos actuales.
// El grupo viejo NO se toca, se queda intacto para consulta.
async function promoverGrupo() {
    if (!state.grupoSeleccionadoId) return;

    const nombreActual = document.getElementById('titulo-grupo-actual').innerText.replace('Grupo: ', '').trim();
    const cicloActual = state.cicloGrupoActual || '2025-2026';

    const siguienteCiclo = calcularSiguienteCiclo(cicloActual);
    const gradoInfo = calcularSiguienteGrado(nombreActual);

    if (!siguienteCiclo || !gradoInfo) {
        mostrarToast('No se pudo calcular el siguiente grado/ciclo automáticamente. Revisa que el nombre del grupo tenga un número (ej. "1º A").', 'error');
        return;
    }

    if (gradoInfo.numeroActual >= 6) {
        if (!confirm(`Este grupo ya es de ${gradoInfo.numeroActual}º grado. ¿De verdad quieres promoverlo a "${gradoInfo.nombreNuevo}"? Revisa que tenga sentido para tu escuela (por ejemplo, si ${gradoInfo.numeroActual}º ya es el último año).`)) {
            return;
        }
    }

    const totalAlumnos = state.alumnosActuales?.length || 0;
    const confirmado = confirm(
        `Se creará un grupo nuevo:\n\n"${gradoInfo.nombreNuevo}" — Ciclo ${siguienteCiclo}\n\n` +
        `Se copiarán los ${totalAlumnos} alumnos actuales a ese grupo nuevo, empezando en Trimestre 1.\n\n` +
        `El grupo actual "${nombreActual}" (Ciclo ${cicloActual}) NO se borra ni se modifica, se queda igual para consultarlo cuando quieras.\n\n¿Continuar?`
    );
    if (!confirmado) return;

    if (!navigator.onLine) {
        mostrarToast('Necesitas conexión a internet para promover un grupo', 'error');
        return;
    }

    mostrarSpinner('Promoviendo grupo...');
    try {
        // 1. Traer datos del grupo actual (para copiar grado/maestro_id)
        const { data: grupoActual, error: errGrupo } = await clienteSupabase
            .from('grupos').select('*').eq('id', state.grupoSeleccionadoId).single();
        if (errGrupo) throw errGrupo;

        // 2. ¿Ya existe un grupo con ese nombre en el ciclo destino? (evita duplicar por doble clic)
        const { data: existente } = await clienteSupabase
            .from('grupos').select('id').eq('nombre', gradoInfo.nombreNuevo).eq('ciclo_escolar', siguienteCiclo).maybeSingle();
        if (existente) {
            mostrarToast(`Ya existe "${gradoInfo.nombreNuevo}" en el ciclo ${siguienteCiclo}. No se creó uno nuevo.`, 'warning');
            return;
        }

        // 3. Crear el grupo nuevo
        const { data: grupoNuevo, error: errInsert } = await clienteSupabase
            .from('grupos')
            .insert({
                nombre: gradoInfo.nombreNuevo,
                grado: grupoActual.grado || gradoInfo.nombreNuevo,
                maestro_id: grupoActual.maestro_id,
                ciclo_escolar: siguienteCiclo,
                grupo_anterior_id: state.grupoSeleccionadoId
            })
            .select().single();
        if (errInsert) throw errInsert;

        // 4. Copiar alumnos (como registros NUEVOS, para no mezclar su historial
        //    de asistencia/calificaciones del ciclo anterior con el nuevo)
        const { data: alumnosOrig, error: errAlumnos } = await clienteSupabase
            .from('estudiantes').select('*').eq('grupo_id', state.grupoSeleccionadoId);
        if (errAlumnos) throw errAlumnos;

        if (alumnosOrig && alumnosOrig.length > 0) {
            const nuevosAlumnos = alumnosOrig.map(a => ({
                nombre_completo: a.nombre_completo,
                asiento: a.asiento,
                foto_url: a.foto_url || null,
                grupo_id: grupoNuevo.id
            }));
            const { error: errInsertAlumnos } = await clienteSupabase.from('estudiantes').insert(nuevosAlumnos);
            if (errInsertAlumnos) throw errInsertAlumnos;
        }

        // 5. Categorías de evaluación por defecto para el Trimestre 1 del grupo nuevo
        //    (recuerda: en Ajustes puedes cambiar los porcentajes libremente)
        await clienteSupabase.from('categorias').insert([
            { grupo_id: grupoNuevo.id, nombre: 'Asistencia', porcentaje: 20, orden: 1, es_asistencia: true, trimestre: 1 },
            { grupo_id: grupoNuevo.id, nombre: 'Trabajo en Clase', porcentaje: 60, orden: 2, es_asistencia: false, trimestre: 1 },
            { grupo_id: grupoNuevo.id, nombre: 'Examen', porcentaje: 20, orden: 3, es_asistencia: false, trimestre: 1 }
        ]);

        // Refrescar caché local
        await guardarEnStore('grupos', grupoNuevo);

        mostrarToast(`"${gradoInfo.nombreNuevo}" creado en el ciclo ${siguienteCiclo} con ${alumnosOrig?.length || 0} alumnos`, 'success');

        guardarCicloSeleccionado(siguienteCiclo);
        regresarADashboard();
        await cargarGrupos();
    } catch (err) {
        console.error(err);
        mostrarToast('Error al promover el grupo: ' + (err.message || ''), 'error');
    } finally {
        ocultarSpinner();
    }
}
