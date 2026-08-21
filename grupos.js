// =========================================
// GRUPOS
// =========================================

async function cargarGrupos() {
    mostrarSpinner('Cargando grupos...');
    try {
        let grupos = null;

        if (navigator.onLine) {
            try {
                const { data, error } = await clienteSupabase.from('grupos').select('*');
                if (error) throw error;
                grupos = data || [];

                // Refrescar caché local para tenerlos disponibles sin conexión
                for (const g of grupos) {
                    await guardarEnStore('grupos', g);
                }
            } catch (err) {
                console.warn('[Grupos] No se pudo consultar Supabase, se usará el caché local:', err);
                grupos = null;
            }
        }

        if (!grupos) {
            grupos = await obtenerTodosDeStore('grupos');
            if (grupos.length > 0) {
                mostrarToast('Sin conexión: mostrando grupos guardados localmente', 'warning');
            } else {
                mostrarToast('Sin conexión y sin grupos guardados localmente todavía', 'error');
            }
        }

        const lista = document.getElementById('lista-grupos');
        if (!lista) return;
        lista.innerHTML = '';
        const contador = document.getElementById('contador-grupos');
        if (contador) contador.textContent = grupos?.length || 0;

        if (!grupos || grupos.length === 0) {
            lista.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-light);"><i class="fas fa-folder-open" style="font-size: 3rem; margin-bottom: 15px; display: block;"></i>No hay grupos registrados</div>`;
            return;
        }

        grupos.forEach(g => {
            const nombreAMostrar = escapeHtml(g.nombre || g.nombre_grupo || "Grupo sin nombre");
            const div = document.createElement('div');
            div.className = 'card-grupo';
            div.onclick = () => abrirGrupo(g.id, nombreAMostrar);
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

async function abrirGrupo(id, nombre) {
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

    // Limpiar UI inmediatamente para evitar mostrar datos del grupo anterior
    const listaAsistencia = document.getElementById('lista-asistencia-tabla');
    if (listaAsistencia) listaAsistencia.innerHTML = '';

    const fechaAsistencia = document.getElementById('fecha-asistencia');
    if (fechaAsistencia) {
        fechaAsistencia.value = new Date().toISOString().split('T')[0];
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
