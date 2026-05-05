// =========================================
// REPORTES Y PROMEDIOS
// =========================================

async function cargarConfiguracionGrupo() {
    try {
        const { data } = await clienteSupabase
            .from('configuraciones')
            .select('*')
            .eq('grupo_id', state.grupoSeleccionadoId)
            .single();
        if (data) {
            state.categoriasDefecto[0].valor = data.asistencia;
            state.categoriasDefecto[1].valor = data.trabajo;
            state.categoriasDefecto[2].valor = data.examen;
        }
    } catch (err) {
        console.log('Usando configuración por defecto');
    }
}

async function generarReporte() {
    mostrarSpinner('Generando reporte...');
    await cargarConfiguracionGrupo();

    const cabezal = document.getElementById('cabezal-reporte');
    const cuerpo = document.getElementById('cuerpo-reporte');

    cabezal.innerHTML = "";
    cuerpo.innerHTML = '<tr><td colspan="10">Filtrando datos del grupo...</td></tr>';

    if (!state.alumnosActuales || state.alumnosActuales.length === 0) {
        cuerpo.innerHTML = '<tr><td colspan="10">Este grupo no tiene alumnos registrados.</td></tr>';
        ocultarSpinner();
        return;
    }

    try {
        const idsAlumnos = state.alumnosActuales.map(al => al.id);

        const { data: actividades, error: errAct } = await clienteSupabase
            .from('actividades').select('*').eq('grupo_id', state.grupoSeleccionadoId).order('fecha_actividad', { ascending: true });

        if (errAct) {
            mostrarToast('Error al cargar actividades: ' + errAct.message, 'error');
            ocultarSpinner();
            return;
        }

        const { data: asistencias, error: errAsis } = await clienteSupabase
            .from('asistencia').select('*').in('estudiante_id', idsAlumnos);

        if (errAsis) {
            mostrarToast('Error al cargar asistencias: ' + errAsis.message, 'error');
            ocultarSpinner();
            return;
        }

        let notas = [];
        const idsActividades = actividades ? actividades.map(a => a.id) : [];

        if (idsActividades.length > 0) {
            const { data: notasData, error: errNotas } = await clienteSupabase
                .from('calificaciones').select('*').in('actividad_id', idsActividades);
            if (errNotas) {
                mostrarToast('Error al cargar notas: ' + errNotas.message, 'error');
            } else if (notasData) {
                notas = notasData;
            }
        }

        const fechasAsist = [...new Set(asistencias?.map(a => a.fecha) || [])].sort();

        state.reporteData = {
            alumnos: state.alumnosActuales,
            actividades: actividades || [],
            asistencias: asistencias || [],
            notas: notas,
            fechasAsist: fechasAsist
        };

        cabezal.innerHTML = `<tr>
            <th style="width:30px;">#</th>
            <th style="position: sticky; left: 0; background: #34495e; z-index: 5; min-width: 150px;">Alumno</th>
            ${fechasAsist.map(f => {
                const fechaLegible = f.split('-').slice(1).reverse().join('/');
                return `<th class="th-girado" title="Asistencia: ${fechaLegible}"><span class="contenedor-texto-girado">Asist. ${fechaLegible}</span></th>`;
            }).join('')}
            ${(actividades || []).map(act => `<th class="th-girado" title="${escapeHtml(act.nombre_actividad)}"><span class="contenedor-texto-girado">${escapeHtml(act.nombre_actividad)}</span></th>`).join('')}
            <th style="background: #2980b9; width: 60px;">FINAL</th>
        </tr>`;

        let htmlCuerpo = '';
        state.alumnosActuales.forEach(al => {
            const misNotas = notas.filter(n => n.estudiante_id == al.id);
            const misAsist = asistencias ? asistencias.filter(a => a.estudiante_id == al.id) : [];

            let cAsist = fechasAsist.map(f => {
                const reg = misAsist.find(a => a.fecha === f);
                const estado = reg ? reg.estado : 'Asistencia';
                const justKey = `${al.id}_${f}`;
                const justificada = state.justificacionesCache[justKey];
                const displayEstado = justificada ? 'FJ' : (estado === 'Asistencia' ? 'A' : 'F');
                const color = justificada ? '#9b59b6' : (estado === 'Asistencia' ? '#2ecc71' : '#e74c3c');

                return `<td>
                    <select onchange="editarAsistencia(${al.id}, '${f}', this.value)" 
                        style="border:none; background:transparent; font-weight:bold; color:${color}">
                        <option value="Asistencia" ${estado==='Asistencia'?'selected':''}>A</option>
                        <option value="Falta" ${estado==='Falta'?'selected':''}>F</option>
                    </select>
                    ${justificada ? '<span title="' + escapeHtml(justificada) + '" style="font-size:0.7rem;color:#9b59b6;">✓</span>' : ''}
                </td>`;
            }).join('');

            let cNotas = (actividades || []).map(act => {
                const notaReg = misNotas.find(n => n.actividad_id == act.id);
                const valorNota = notaReg ? notaReg.nota : ""; 
                return `<td><input type="number" value="${valorNota}" step="0.1" min="0" max="10"
                    onchange="editarNota(${al.id}, ${act.id}, this.value)" 
                    style="width:45px; text-align:center; border:none; background:#f9f9f9; border-radius:4px;"></td>`;
            }).join('');

            const final = calcularPromedioIndividual(misNotas, misAsist, fechasAsist.length, actividades || []);

            htmlCuerpo += `<tr>
                <td>${al.asiento || 0}</td>
                <td style="text-align:left; position: sticky; left: 0; background: white; border-right: 2px solid #ddd;">${escapeHtml(al.nombre_completo)}</td>
                ${cAsist} ${cNotas}
                <td class="col-final">${final}</td>
            </tr>`;
        });

        cuerpo.innerHTML = htmlCuerpo;
        mostrarToast('Reporte generado correctamente', 'success');
    } catch (err) {
        mostrarToast('Error al generar reporte', 'error');
    } finally {
        ocultarSpinner();
    }
}

async function editarNota(estudianteId, actividadId, nuevaNota) {
    const valor = parseFloat(nuevaNota);
    if (isNaN(valor) || valor < 0 || valor > 10) {
        mostrarToast('La nota debe estar entre 0 y 10', 'warning');
        return;
    }
    try {
        const { error } = await clienteSupabase.from('calificaciones').upsert({
            estudiante_id: estudianteId,
            actividad_id: actividadId,
            nota: valor
        }, { onConflict: 'estudiante_id, actividad_id' });

        if (error) mostrarToast('Error al actualizar nota', 'error');
        else mostrarToast('Nota actualizada', 'success');
    } catch (err) {
        mostrarToast('Error al actualizar nota', 'error');
    }
}

async function editarAsistencia(estudianteId, fecha, nuevoEstado) {
    try {
        const { error } = await clienteSupabase.from('asistencia').upsert({
            estudiante_id: estudianteId,
            fecha: fecha,
            estado: nuevoEstado
        }, { onConflict: 'estudiante_id, fecha' });

        if (error) {
            mostrarToast('Error al actualizar asistencia', 'error');
        } else {
            mostrarToast('Asistencia actualizada', 'success');
            generarReporte();
        }
    } catch (err) {
        mostrarToast('Error al actualizar asistencia', 'error');
    }
}

function calcularPromedioIndividual(misNotas, misAsist, totalDias, actividades) {
    // Asistencia: faltas justificadas cuentan como 0.5
    let puntosAsist = 0;
    misAsist.forEach(a => {
        const key = `${a.estudiante_id}_${a.fecha}`;
        if (a.estado === 'Asistencia') puntosAsist += 1;
        else if (state.justificacionesCache[key]) puntosAsist += 0.5;
    });
    const pAsist = (puntosAsist / (totalDias || 1)) * 10;

    const nTareas = misNotas.filter(n => {
        const act = actividades.find(a => a.id == n.actividad_id);
        return act && act.tipo !== 'Examen';
    });
    const pTareas = nTareas.length ? (nTareas.reduce((a,b) => a + b.nota, 0) / nTareas.length) : 0;

    const nExm = misNotas.find(n => {
        const act = actividades.find(a => a.id == n.actividad_id);
        return act && act.tipo === 'Examen';
    });
    const pExm = nExm ? nExm.nota : 0;

    return ((pAsist * (state.categoriasDefecto[0].valor/100)) + 
            (pTareas * (state.categoriasDefecto[1].valor/100)) + 
            (pExm * (state.categoriasDefecto[2].valor/100))).toFixed(1);
}

// =========================================
// EXPORTAR CSV
// =========================================

function exportarCSV() {
    if (!state.reporteData) {
        mostrarToast('Primero genera el reporte', 'warning');
        return;
    }

    const { alumnos, actividades, asistencias, notas, fechasAsist } = state.reporteData;
    let csv = '\uFEFF';

    const headers = ['#', 'Alumno'];
    fechasAsist.forEach(f => headers.push('Asist. ' + f.split('-').slice(1).reverse().join('/')));
    actividades.forEach(a => headers.push(a.nombre_actividad));
    headers.push('FINAL');
    csv += headers.join(',') + '\n';

    alumnos.forEach(al => {
        const row = [al.asiento || 0, `"${al.nombre_completo}"`];
        const misAsist = asistencias.filter(a => a.estudiante_id == al.id);
        fechasAsist.forEach(f => {
            const reg = misAsist.find(a => a.fecha === f);
            const key = `${al.id}_${f}`;
            const just = state.justificacionesCache[key];
            row.push(reg ? (just ? 'FJ' : reg.estado) : 'Asistencia');
        });

        const misNotas = notas.filter(n => n.estudiante_id == al.id);
        actividades.forEach(act => {
            const notaReg = misNotas.find(n => n.actividad_id == act.id);
            row.push(notaReg ? notaReg.nota : '');
        });

        const final = calcularPromedioIndividual(misNotas, misAsist, fechasAsist.length, actividades);
        row.push(final);
        csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_${state.grupoSeleccionadoId}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    mostrarToast('Reporte descargado como CSV', 'success');
}

// =========================================
// ESTADÍSTICAS (Chart.js)
// =========================================

async function generarEstadisticas() {
    mostrarSpinner('Generando estadísticas...');
    await cargarConfiguracionGrupo();

    try {
        const idsAlumnos = state.alumnosActuales.map(al => al.id);
        const { data: actividades } = await clienteSupabase
            .from('actividades').select('*').eq('grupo_id', state.grupoSeleccionadoId);
        const { data: asistencias } = await clienteSupabase
            .from('asistencia').select('*').in('estudiante_id', idsAlumnos);

        let notas = [];
        const idsAct = actividades ? actividades.map(a => a.id) : [];
        if (idsAct.length > 0) {
            const { data: notasData } = await clienteSupabase
                .from('calificaciones').select('*').in('actividad_id', idsAct);
            if (notasData) notas = notasData;
        }

        const fechasAsist = [...new Set(asistencias?.map(a => a.fecha) || [])].sort();
        const totalAlumnos = state.alumnosActuales.length;

        // Calcular promedios por alumno
        const promediosAlumnos = state.alumnosActuales.map(al => {
            const misNotas = notas.filter(n => n.estudiante_id == al.id);
            const misAsist = asistencias ? asistencias.filter(a => a.estudiante_id == al.id) : [];
            const promedio = parseFloat(calcularPromedioIndividual(misNotas, misAsist, fechasAsist.length, actividades || []));
            return { ...al, promedio, misAsist, misNotas };
        });

        // Tarjetas de resumen
        document.getElementById('stat-total-alumnos').textContent = totalAlumnos;

        const totalAsist = asistencias ? asistencias.filter(a => a.estado === 'Asistencia').length : 0;
        const totalRegistros = asistencias ? asistencias.length : 1;
        const promAsist = ((totalAsist / totalRegistros) * 100).toFixed(1);
        document.getElementById('stat-prom-asistencia').textContent = promAsist + '%';

        const promGeneral = promediosAlumnos.length > 0 
            ? (promediosAlumnos.reduce((a, b) => a + b.promedio, 0) / promediosAlumnos.length).toFixed(1)
            : 0;
        document.getElementById('stat-prom-general').textContent = promGeneral;

        const enRiesgo = promediosAlumnos.filter(a => a.promedio < 6).length;
        document.getElementById('stat-alumnos-riesgo').textContent = enRiesgo;

        // Gráfica de barras - Promedios por alumno
        const ctxProm = document.getElementById('chart-promedios');
        if (state.charts.promedios) state.charts.promedios.destroy();

        const esOscuro = document.body.classList.contains('dark-mode');
        const colorTexto = esOscuro ? '#e0e0e0' : '#333';

        state.charts.promedios = new Chart(ctxProm, {
            type: 'bar',
            data: {
                labels: promediosAlumnos.map(a => a.nombre_completo.split(' ')[0]),
                datasets: [{
                    label: 'Promedio',
                    data: promediosAlumnos.map(a => a.promedio),
                    backgroundColor: promediosAlumnos.map(a => a.promedio >= 6 ? '#2ecc71' : '#e74c3c'),
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { max: 10, ticks: { color: colorTexto } },
                    y: { ticks: { color: colorTexto } }
                }
            }
        });

        // Gráfica de línea - Evolución de asistencia
        const ctxAsist = document.getElementById('chart-asistencia');
        if (state.charts.asistencia) state.charts.asistencia.destroy();

        const asistPorFecha = fechasAsist.map(f => {
            const regs = asistencias ? asistencias.filter(a => a.fecha === f && a.estado === 'Asistencia').length : 0;
            return { fecha: f.split('-').slice(1).reverse().join('/'), presentes: regs };
        });

        state.charts.asistencia = new Chart(ctxAsist, {
            type: 'line',
            data: {
                labels: asistPorFecha.map(a => a.fecha),
                datasets: [{
                    label: 'Presentes',
                    data: asistPorFecha.map(a => a.presentes),
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: { ticks: { color: colorTexto } },
                    y: { ticks: { color: colorTexto } }
                },
                plugins: { legend: { labels: { color: colorTexto } } }
            }
        });

        // Gráfica doughnut - Distribución de calificaciones
        const ctxDist = document.getElementById('chart-distribucion');
        if (state.charts.distribucion) state.charts.distribucion.destroy();

        const excelente = promediosAlumnos.filter(a => a.promedio >= 9).length;
        const bueno = promediosAlumnos.filter(a => a.promedio >= 7 && a.promedio < 9).length;
        const regular = promediosAlumnos.filter(a => a.promedio >= 6 && a.promedio < 7).length;
        const riesgo = promediosAlumnos.filter(a => a.promedio < 6).length;

        state.charts.distribucion = new Chart(ctxDist, {
            type: 'doughnut',
            data: {
                labels: ['Excelente (9-10)', 'Bueno (7-8.9)', 'Regular (6-6.9)', 'Riesgo (<6)'],
                datasets: [{
                    data: [excelente, bueno, regular, riesgo],
                    backgroundColor: ['#2ecc71', '#3498db', '#f39c12', '#e74c3c'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom', labels: { color: colorTexto } }
                }
            }
        });

        // Top 5 mejores promedios
        const top5 = [...promediosAlumnos].sort((a, b) => b.promedio - a.promedio).slice(0, 5);
        const topContainer = document.getElementById('top-alumnos');
        topContainer.innerHTML = top5.map((al, i) => {
            const presentes = al.misAsist.filter(a => a.estado === 'Asistencia').length;
            const faltas = al.misAsist.length - presentes;
            return `
                <div class="top-alumno-item">
                    <div class="top-rank">${i + 1}</div>
                    <div class="top-info">
                        <div class="top-nombre">${escapeHtml(al.nombre_completo)}</div>
                        <div class="top-detalles">Asist: ${presentes}/${al.misAsist.length} | Faltas: ${faltas}</div>
                    </div>
                    <div class="top-promedio">${al.promedio}</div>
                </div>
            `;
        }).join('');

        mostrarToast('Estadísticas generadas', 'success');
    } catch (err) {
        console.error(err);
        mostrarToast('Error al generar estadísticas', 'error');
    } finally {
        ocultarSpinner();
    }
}

// =========================================
// CONFIGURACIÓN
// =========================================

async function cargarInterfazCategorias() {
    await cargarCategoriasGrupo();
    const categorias = categoriasCache;

    const contenedor = document.getElementById('lista-categorias-config');
    if (!contenedor) return;

    let html = `
        <div style="margin-top: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3><i class="fas fa-sliders-h"></i> Categorías de Evaluación</h3>
                <button onclick="abrirModalNuevaCategoria()" class="btn-success btn-sm">
                    <i class="fas fa-plus"></i> Nueva Categoría
                </button>
            </div>
            <p class="help-text">
                <i class="fas fa-info-circle"></i> 
                La categoría <strong>Asistencia</strong> es automática y no se incluye en actividades. 
                La suma de porcentajes debe ser exactamente 100%.
            </p>

            <div class="categorias-config-list" style="margin-top: 15px;">
                <div class="cat-config-header" style="display: grid; grid-template-columns: 40px 1fr 100px 100px 50px; gap: 10px; padding: 10px 15px; background: var(--primary-color); color: white; border-radius: var(--radius-sm) var(--radius-sm) 0 0; font-weight: 500; font-size: 0.85rem;">
                    <div>#</div>
                    <div>Nombre</div>
                    <div style="text-align: center;">%</div>
                    <div style="text-align: center;">Tipo</div>
                    <div></div>
                </div>
    `;

    categorias.forEach((cat, index) => {
        const esAsistencia = cat.es_asistencia;
        html += `
            <div class="cat-config-row" style="display: grid; grid-template-columns: 40px 1fr 100px 100px 50px; gap: 10px; padding: 12px 15px; border-bottom: 1px solid var(--border-color); align-items: center; ${esAsistencia ? 'background: rgba(46, 204, 113, 0.05);' : ''}">
                <div style="font-weight: 600; color: var(--text-light);">${index + 1}</div>
                <div>
                    <input type="text" 
                        class="cat-nombre-input" 
                        data-id="${cat.id}" 
                        value="${escapeHtml(cat.nombre)}" 
                        ${esAsistencia ? 'readonly style="background: transparent; border: none; font-weight: 500;"' : 'style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-color); color: var(--text-main);"'}
                        onchange="actualizarNombreCategoria(${cat.id}, this.value)">
                </div>
                <div style="text-align: center;">
                    <input type="number" 
                        class="cat-porcentaje-input" 
                        data-id="${cat.id}" 
                        value="${cat.porcentaje}" 
                        min="0" max="100" 
                        style="width: 70px; padding: 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); text-align: center; font-weight: 600; background: var(--bg-color); color: var(--text-main);"
                        onchange="actualizarPorcentajeCategoria(${cat.id}, this.value)">
                </div>
                <div style="text-align: center;">
                    <span style="padding: 3px 10px; border-radius: 10px; font-size: 0.75rem; font-weight: 500; ${esAsistencia ? 'background: #d4edda; color: #155724;' : 'background: #cce5ff; color: #004085;'}">
                        ${esAsistencia ? 'Asistencia' : 'Calificación'}
                    </span>
                </div>
                <div style="text-align: center;">
                    ${!esAsistencia ? `<button onclick="eliminarCategoria(${cat.id})" class="btn-eliminar-cat" title="Eliminar" style="background: none; border: none; color: var(--warning-color); cursor: pointer; padding: 5px;"><i class="fas fa-trash"></i></button>` : '<span style="color: var(--text-light); font-size: 0.8rem;"><i class="fas fa-lock"></i></span>'}
                </div>
            </div>
        `;
    });

    html += `
            </div>
            <div id="suma-porcentajes" style="font-weight: 600; margin: 15px 0; padding: 10px 15px; background: #f8f9fa; border-radius: var(--radius-sm); text-align: center; font-size: 1.1rem;">
                Suma actual: ${categorias.reduce((a, b) => a + (parseInt(b.porcentaje) || 0), 0)}%
            </div>
            <button onclick="guardarTodasCategorias()" id="btn-guardar-categorias" class="btn-finalizar" style="width: auto; padding: 12px 40px;">
                <i class="fas fa-save"></i> Guardar Cambios
            </button>
        </div>

        <!-- SECCIÓN DE BACKUP LOCAL -->
        <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid var(--border-color);">
            <h3><i class="fas fa-hdd"></i> Respaldo Local</h3>
            <p class="help-text">
                Exporta todos los datos locales para respaldarlos o transferirlos a otro dispositivo.
                También puedes importar un backup anterior.
            </p>
            <div style="display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap;">
                <button onclick="exportarDBLocal()" class="btn-secondary">
                    <i class="fas fa-download"></i> Exportar Backup
                </button>
                <label class="btn-secondary" style="cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
                    <i class="fas fa-upload"></i> Importar Backup
                    <input type="file" accept=".json" onchange="importarDBLocal(this.files[0])" style="display: none;">
                </label>
            </div>
        </div>
    `;

    contenedor.innerHTML = html;
    validarSumaPorcentajes();
}

async function actualizarNombreCategoria(id, nombre) {
    const cat = categoriasCache.find(c => c.id === id);
    if (!cat) return;
    cat.nombre = nombre.trim();
}

async function actualizarPorcentajeCategoria(id, porcentaje) {
    const cat = categoriasCache.find(c => c.id === id);
    if (!cat) return;
    cat.porcentaje = parseInt(porcentaje) || 0;
    validarSumaPorcentajes();
}

async function guardarTodasCategorias() {
    if (!validarSumaPorcentajes()) {
        mostrarToast('La suma de porcentajes debe ser exactamente 100%', 'warning');
        return;
    }

    mostrarSpinner('Guardando categorías...');
    try {
        // Actualizar cada categoría
        for (const cat of categoriasCache) {
            await clienteSupabase.from('categorias').update({
                nombre: cat.nombre,
                porcentaje: cat.porcentaje,
                orden: cat.orden
            }).eq('id', cat.id);
        }

        // Actualizar configuración legacy (para compatibilidad con reportes)
        const asistencia = categoriasCache.find(c => c.es_asistencia)?.porcentaje || 10;
        const trabajo = categoriasCache.find(c => c.nombre === 'Trabajo en Clase')?.porcentaje || 50;
        const examen = categoriasCache.find(c => c.nombre === 'Examen')?.porcentaje || 40;

        await clienteSupabase.from('configuraciones').upsert({
            grupo_id: state.grupoSeleccionadoId,
            asistencia: asistencia,
            trabajo: trabajo,
            examen: examen
        }, { onConflict: 'grupo_id' });

        // Actualizar state
        state.categoriasDefecto = categoriasCache.map(c => ({
            nombre: c.nombre,
            valor: c.porcentaje
        }));

        actualizarSelectoresCategorias();
        mostrarToast('Categorías guardadas correctamente', 'success');
    } catch (err) {
        mostrarToast('Error al guardar: ' + err.message, 'error');
    } finally {
        ocultarSpinner();
    }
}

// =========================================
// MODAL NUEVA CATEGORÍA
// =========================================

function abrirModalNuevaCategoria() {
    document.getElementById('nueva-cat-nombre').value = '';
    document.getElementById('nueva-cat-porcentaje').value = '0';
    document.getElementById('modal-nueva-categoria').classList.remove('hidden');
    document.getElementById('nueva-cat-nombre').focus();
}

function cerrarModalNuevaCategoria() {
    document.getElementById('modal-nueva-categoria').classList.add('hidden');
}

async function crearNuevaCategoria() {
    const nombre = document.getElementById('nueva-cat-nombre').value.trim();
    const porcentaje = parseInt(document.getElementById('nueva-cat-porcentaje').value) || 0;

    if (!nombre) {
        mostrarToast('Escribe un nombre para la categoría', 'warning');
        return;
    }

    const maxOrden = Math.max(...categoriasCache.map(c => c.orden || 0), 0);

    const exito = await guardarCategoria(null, nombre, porcentaje, false, maxOrden + 1);
    if (exito) {
        cerrarModalNuevaCategoria();
        await cargarInterfazCategorias();
        mostrarToast('Categoría creada', 'success');
    }
}
