// =========================================
// GRUPOS
// =========================================

async function cargarGrupos() {
    mostrarSpinner('Cargando grupos...');
    try {
        const { data: grupos, error } = await clienteSupabase.from('grupos').select('*');
        if (error) {
            mostrarToast('Error al cargar grupos: ' + error.message, 'error');
            return;
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
    } finally {
        ocultarSpinner();
    }
}

async function abrirGrupo(id, nombre) {
    state.grupoSeleccionadoId = id;
    state.asistenciasHoy = {};
    state.actividadActualId = null;

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

    await cargarAlumnos();
    await cargarPlantillasSelector();
    await mostrarRecordatoriosGrupo();
}
