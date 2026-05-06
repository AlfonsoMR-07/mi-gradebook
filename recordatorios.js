// =========================================
// RECORDATORIOS
// =========================================

let recordatorios = [];

async function cargarRecordatorios() {
    try {
        const { data: { session } } = await clienteSupabase.auth.getSession();
        if (!session) return;

        const { data } = await clienteSupabase.from('recordatorios')
            .select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });

        if (data) recordatorios = data;
    } catch (e) {
        console.log('No hay tabla de recordatorios');
    }
}

async function mostrarRecordatoriosGrupo() {
    const container = document.getElementById('recordatorios-grupo');
    if (!container) return;

    const pendientes = recordatorios.filter(r => !r.completado);
    if (pendientes.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = `
        <i class="fas fa-bell"></i>
        <strong>${pendientes.length} recordatorio${pendientes.length > 1 ? 's' : ''} pendiente${pendientes.length > 1 ? 's' : ''}:</strong>
        ${pendientes.slice(0, 3).map(r => escapeHtml(r.texto)).join(' • ')}
        ${pendientes.length > 3 ? `... y ${pendientes.length - 3} más` : ''}
    `;
}

function abrirModalRecordatorios() {
    renderizarRecordatorios();
    document.getElementById('modal-recordatorios').classList.remove('hidden');
}

function cerrarModalRecordatorios() {
    document.getElementById('modal-recordatorios').classList.add('hidden');
}

function renderizarRecordatorios() {
    const lista = document.getElementById('lista-recordatorios');
    if (recordatorios.length === 0) {
        lista.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 20px;">No hay recordatorios</p>';
        return;
    }

    lista.innerHTML = recordatorios.map(r => `
        <div class="rec-item ${r.completado ? 'completado' : ''}">
            <button onclick="toggleRecordatorio(${r.id}, ${!r.completado})" title="${r.completado ? 'Desmarcar' : 'Completar'}">
                <i class="fas ${r.completado ? 'fa-undo' : 'fa-check-circle'}"></i>
            </button>
            <span class="rec-texto">${escapeHtml(r.texto)}</span>
            <span class="rec-fecha">${new Date(r.created_at).toLocaleDateString('es-MX')}</span>
            <button onclick="eliminarRecordatorio(${r.id})" title="Eliminar">
                <i class="fas fa-trash" style="color: var(--warning-color);"></i>
            </button>
        </div>
    `).join('');
}

async function crearRecordatorio() {
    const texto = document.getElementById('nuevo-recordatorio').value.trim();
    if (!texto) {
        mostrarToast('Escribe un recordatorio', 'warning');
        return;
    }

    try {
        const { data: { session } } = await clienteSupabase.auth.getSession();
        if (!session) return;

        const { data, error } = await clienteSupabase.from('recordatorios').insert({
            user_id: session.user.id,
            texto: texto
        }).select();

        if (error) {
            mostrarToast('Error: ' + error.message, 'error');
        } else {
            mostrarToast('Recordatorio creado', 'success');
            document.getElementById('nuevo-recordatorio').value = '';
            if (data) recordatorios.unshift(data[0]);
            renderizarRecordatorios();
            await mostrarRecordatoriosGrupo();
        }
    } catch (err) {
        mostrarToast('Error al crear recordatorio', 'error');
    }
}

async function toggleRecordatorio(id, completado) {
    try {
        const { error } = await clienteSupabase.from('recordatorios')
            .update({ completado }).eq('id', id);

        if (error) {
            mostrarToast('Error al actualizar', 'error');
        } else {
            const rec = recordatorios.find(r => r.id === id);
            if (rec) rec.completado = completado;
            renderizarRecordatorios();
            await mostrarRecordatoriosGrupo();
        }
    } catch (err) {
        mostrarToast('Error', 'error');
    }
}

async function eliminarRecordatorio(id) {
    if (!confirm('¿Eliminar este recordatorio?')) return;
    try {
        const { error } = await clienteSupabase.from('recordatorios').delete().eq('id', id);
        if (error) {
            mostrarToast('Error al eliminar', 'error');
        } else {
            recordatorios = recordatorios.filter(r => r.id !== id);
            renderizarRecordatorios();
            await mostrarRecordatoriosGrupo();
        }
    } catch (err) {
        mostrarToast('Error', 'error');
    }
}
