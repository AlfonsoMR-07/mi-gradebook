// =========================================
// CATEGORÍAS DINÁMICAS
// =========================================

// Categorías por defecto (fallback si no hay en BD)
const categoriasDefault = [
    { id: 'asistencia', nombre: 'Asistencia', porcentaje: 10, orden: 1, es_asistencia: true },
    { id: 'trabajo', nombre: 'Trabajo en Clase', porcentaje: 50, orden: 2, es_asistencia: false },
    { id: 'examen', nombre: 'Examen', porcentaje: 40, orden: 3, es_asistencia: false }
];

// Cache de categorías del grupo actual
let categoriasCache = [];

// =========================================
// CARGAR CATEGORÍAS DESDE SUPABASE
// =========================================

async function cargarCategoriasGrupo() {
    try {
        const { data, error } = await clienteSupabase
            .from('categorias')
            .select('*')
            .eq('grupo_id', state.grupoSeleccionadoId)
            .order('orden', { ascending: true });

        if (error) {
            console.log('Error cargando categorías:', error);
            categoriasCache = [...categoriasDefault];
            return categoriasCache;
        }

        if (data && data.length > 0) {
            categoriasCache = data;
        } else {
            // Si no hay categorías, crear las default
            await crearCategoriasDefault();
            categoriasCache = [...categoriasDefault.map(c => ({ ...c, grupo_id: state.grupoSeleccionadoId }))];
        }

        return categoriasCache;
    } catch (err) {
        console.error('Error:', err);
        categoriasCache = [...categoriasDefault];
        return categoriasCache;
    }
}

async function crearCategoriasDefault() {
    const categoriasParaInsertar = categoriasDefault.map(c => ({
        grupo_id: state.grupoSeleccionadoId,
        nombre: c.nombre,
        porcentaje: c.porcentaje,
        orden: c.orden,
        es_asistencia: c.es_asistencia
    }));

    try {
        await clienteSupabase.from('categorias').insert(categoriasParaInsertar);
    } catch (e) {
        console.log('No se pudieron crear categorías default');
    }
}

// =========================================
// OBTENER CATEGORÍAS PARA SELECTORES
// =========================================

function getCategoriasParaActividades() {
    // Excluir la categoría de asistencia (no se usa en actividades/plantillas)
    return categoriasCache.filter(c => !c.es_asistencia);
}

function getCategoriasParaCalificacion() {
    // Solo las que tienen porcentaje > 0 y no son asistencia
    return categoriasCache.filter(c => !c.es_asistencia && c.porcentaje > 0);
}

function getCategoriaAsistencia() {
    return categoriasCache.find(c => c.es_asistencia);
}

// =========================================
// ACTUALIZAR SELECTORES EN EL DOM
// =========================================

function actualizarSelectoresCategorias() {
    const selectores = [
        document.getElementById('categoria-tarea'),
        document.getElementById('plantilla-categoria')
    ];

    const categorias = getCategoriasParaActividades();

    selectores.forEach(selector => {
        if (!selector) return;
        selector.innerHTML = '';
        categorias.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.nombre;
            option.textContent = cat.nombre;
            selector.appendChild(option);
        });
    });
}

// =========================================
// GESTIÓN DE CATEGORÍAS (CRUD)
// =========================================

async function guardarCategoria(id, nombre, porcentaje, esAsistencia, orden) {
    const datos = {
        grupo_id: state.grupoSeleccionadoId,
        nombre: nombre.trim(),
        porcentaje: parseInt(porcentaje) || 0,
        es_asistencia: esAsistencia,
        orden: parseInt(orden) || 99
    };

    try {
        if (id) {
            // Actualizar
            const { error } = await clienteSupabase
                .from('categorias')
                .update(datos)
                .eq('id', id);
            if (error) throw error;
        } else {
            // Crear nueva
            const { error } = await clienteSupabase
                .from('categorias')
                .insert(datos);
            if (error) throw error;
        }

        await cargarCategoriasGrupo();
        actualizarSelectoresCategorias();
        return true;
    } catch (err) {
        mostrarToast('Error: ' + err.message, 'error');
        return false;
    }
}

async function eliminarCategoria(id) {
    if (!confirm('¿Eliminar esta categoría? Las actividades y calificaciones asociadas no se verán afectadas, pero ya no podrás crear nuevas actividades de esta categoría.')) return;

    try {
        const { error } = await clienteSupabase
            .from('categorias')
            .delete()
            .eq('id', id);

        if (error) throw error;

        await cargarCategoriasGrupo();
        actualizarSelectoresCategorias();
        mostrarToast('Categoría eliminada', 'success');
        return true;
    } catch (err) {
        mostrarToast('Error al eliminar: ' + err.message, 'error');
        return false;
    }
}

// =========================================
// VALIDAR SUMA DE PORCENTAJES
// =========================================

function validarSumaPorcentajes() {
    const inputs = document.querySelectorAll('.cat-porcentaje-input');
    let suma = 0;
    inputs.forEach(input => {
        suma += parseInt(input.value) || 0;
    });

    const el = document.getElementById('suma-porcentajes');
    if (el) {
        el.textContent = `Suma actual: ${suma}%`;
        el.style.color = suma === 100 ? 'var(--success-color)' : (suma > 100 ? 'var(--warning-color)' : 'var(--text-light)');
    }

    const btnGuardar = document.getElementById('btn-guardar-categorias');
    if (btnGuardar) {
        btnGuardar.disabled = suma !== 100;
        btnGuardar.style.opacity = suma === 100 ? '1' : '0.5';
    }

    return suma === 100;
}
