const URL_PROYECTO = "https://gdxpwvltqzpgtedhawti.supabase.co";
const LLAVE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkeHB3dmx0cXpwZ3RlZGhhd3RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTU4NTQsImV4cCI6MjA5MTU3MTg1NH0.jakqg7FAXBKseM2GtZLlK3DxGYfnYgY-Y6R78_cWhug";
const clienteSupabase = supabase.createClient(URL_PROYECTO, LLAVE_ANON);

let grupoSeleccionadoId = null;
let actividadActualId = null;
let asistenciasHoy = {};
let categoriasDefecto = [
    { nombre: 'Asistencia', valor: 10 },
    { nombre: 'Trabajo en Clase', valor: 50 },
    { nombre: 'Examen', valor: 40 }
];

// 1. AUTENTICACIÓN
document.getElementById('btn-ingresar').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await clienteSupabase.auth.signInWithPassword({ email, password });
    if (error) alert("Error: " + error.message);
    else verificarSesion();
});

async function verificarSesion() {
    const { data: { session } } = await clienteSupabase.auth.getSession();
    if (session) {
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        cargarGrupos();
    }
}

async function cerrarSesion() {
    await clienteSupabase.auth.signOut();
    location.reload();
}

// 2. GRUPOS (CORREGIDO PARA EVITAR UNDEFINED)
async function cargarGrupos() {
    const { data: grupos } = await clienteSupabase.from('grupos').select('*');
    const lista = document.getElementById('lista-grupos');
    if (!lista) return;
    lista.innerHTML = '';
    
    grupos?.forEach(g => {
        // CORRECCIÓN: Aseguramos que el nombre no sea undefined buscando g.nombre o g.nombre_grupo
        const nombreAMostrar = g.nombre || g.nombre_grupo || "Grupo sin nombre";
        const div = document.createElement('div');
        div.className = 'card-grupo';
        div.onclick = () => abrirGrupo(g.id, nombreAMostrar);
        div.innerHTML = `<h3>${nombreAMostrar}</h3>`;
        lista.appendChild(div);
    });
}

async function abrirGrupo(id, nombre) {
    grupoSeleccionadoId = id;
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('vista-grupo').classList.remove('hidden');
    document.getElementById('titulo-grupo-actual').innerText = "Grupo: " + nombre;
    cargarAlumnos();
}

// 3. ALUMNOS E IMPORTACIÓN
async function cargarAlumnos() {
    const { data: alumnosReal } = await clienteSupabase.from('estudiantes')
        .select('*').eq('grupo_id', grupoSeleccionadoId).order('asiento', { ascending: true });
    if (alumnosReal) {
        window.alumnosActuales = alumnosReal;
        prepararPaseLista(alumnosReal);
    }
}

async function importarAlumnos() {
    const texto = document.getElementById('nombres-masivos').value;
    const lineas = texto.split('\n').filter(l => l.includes('-'));
    const datos = lineas.map(l => {
        const [num, nom] = l.split('-');
        return { nombre_completo: nom.trim(), asiento: parseInt(num), grupo_id: grupoSeleccionadoId };
    });
    await clienteSupabase.from('estudiantes').insert(datos);
    alert("Alumnos cargados");
    cargarAlumnos();
}

// 4. ASISTENCIA
function prepararPaseLista(alumnos) {
    const cont = document.getElementById('lista-asistencia-tabla');
    cont.innerHTML = '';
    alumnos.forEach(al => {
        asistenciasHoy[al.id] = 'Asistencia';
        const div = document.createElement('div');
        div.className = 'fila-asistencia';
        div.innerHTML = `
            <div class="botones-asistencia">
                <button class="btn-asist" onclick="cambiarEstado(${al.id}, 'Asistencia')" id="a-${al.id}">A</button>
                <button class="btn-falta" onclick="cambiarEstado(${al.id}, 'Falta')" id="f-${al.id}">F</button>
            </div>
            <span class="num-asiento">${al.asiento}</span>
            <span>${al.nombre_completo}</span>`;
        cont.appendChild(div);
        cambiarEstado(al.id, 'Asistencia');
    });
}

function cambiarEstado(id, est) {
    asistenciasHoy[id] = est;
    const btnA = document.getElementById(`a-${id}`);
    const btnF = document.getElementById(`f-${id}`);
    if (btnA && btnF) {
        btnA.style.opacity = est === 'Asistencia' ? "1" : "0.3";
        btnF.style.opacity = est === 'Falta' ? "1" : "0.3";
    }
}

async function guardarAsistenciaBD() {
    const fecha = document.getElementById('fecha-asistencia').value;
    if (!fecha) return alert("Por favor selecciona una fecha");
    const registros = Object.keys(asistenciasHoy).map(id => ({
        estudiante_id: id, estado: asistenciasHoy[id], fecha: fecha
    }));
    await clienteSupabase.from('asistencia').insert(registros);
    alert("Asistencia guardada");
}

// 5. TAREAS Y NOTAS
async function crearActividad() {
    const nombre = document.getElementById('nombre-tarea').value;
    const fecha = document.getElementById('fecha-tarea').value;
    const cat = document.getElementById('categoria-tarea').value;

    if (!nombre || !fecha) {
        alert("Por favor rellena el nombre y la fecha");
        return;
    }

    const { data, error } = await clienteSupabase
        .from('actividades')
        .insert([
            { 
                grupo_id: grupoSeleccionadoId, 
                nombre_actividad: nombre, 
                fecha_actividad: fecha, 
                tipo: cat,
                ponderacion: 100 // <--- AGREGAMOS ESTA LÍNEA
            }
        ])
        .select();

    if (error) {
        console.error("Detalle del error:", error);
        alert("Error de base de datos: " + error.message);
        return;
    }

    if (data && data.length > 0) {
        actividadActualId = data[0].id;
        document.getElementById('tabla-calificaciones').classList.remove('hidden');
        generarCamposNotas();
        alert("Actividad creada con éxito"); // Confirmación visual
    }
}

function generarCamposNotas() {
    const contenedor = document.getElementById('lista-alumnos-notas');
    contenedor.innerHTML = '';
    window.alumnosActuales.forEach(al => {
        contenedor.innerHTML += `
            <div class="fila-asistencia">
                <input type="number" class="input-nota" id="nota-${al.id}" value="10">
                <span>${al.nombre_completo}</span>
            </div>`;
    });
}

async function guardarNotasBD() {
    const notas = Array.from(document.querySelectorAll('.input-nota')).map(i => ({
        estudiante_id: i.id.replace('nota-', ''), actividad_id: actividadActualId, nota: parseFloat(i.value)
    }));
    await clienteSupabase.from('calificaciones').insert(notas);
    alert("Notas guardadas");
}

// 6. REPORTES Y PROMEDIOS
async function generarReporte() {
    const cabezal = document.getElementById('cabezal-reporte');
    const cuerpo = document.getElementById('cuerpo-reporte');
    
    cabezal.innerHTML = "";
    cuerpo.innerHTML = '<tr><td colspan="10">Filtrando datos del grupo...</td></tr>';

    if (!window.alumnosActuales || window.alumnosActuales.length === 0) {
        cuerpo.innerHTML = '<tr><td colspan="10">Este grupo no tiene alumnos registrados.</td></tr>';
        return;
    }

    const idsAlumnos = window.alumnosActuales.map(al => al.id);

    const { data: actividades, error: errAct } = await clienteSupabase
        .from('actividades')
        .select('*')
        .eq('grupo_id', grupoSeleccionadoId)
        .order('fecha_actividad', { ascending: true });

    const { data: asistencias, error: errAsist } = await clienteSupabase
        .from('asistencia')
        .select('*')
        .in('estudiante_id', idsAlumnos);

    let notas = [];
    const idsActividades = actividades ? actividades.map(a => a.id) : [];

    if (idsActividades.length > 0) {
        const { data: notasData } = await clienteSupabase
            .from('calificaciones')
            .select('*')
            .in('actividad_id', idsActividades);
        if (notasData) notas = notasData;
    }

    const fechasAsist = [...new Set(asistencias?.map(a => a.fecha) || [])].sort();
    
    cabezal.innerHTML = `<tr>
        <th>#</th>
        <th style="position: sticky; left: 0; background: #34495e; z-index: 5;">Alumno</th>
        ${fechasAsist.map(f => `<th class="col-asist">Asist.<br>${f.split('-').slice(1).reverse().join('/')}</th>`).join('')}
        ${actividades.map(act => `<th class="col-tarea">${act.nombre_actividad}</th>`).join('')}
        <th style="background: #2980b9;">FINAL</th>
    </tr>`;

    let htmlCuerpo = '';
    window.alumnosActuales.forEach(al => {
        const misNotas = notas.filter(n => n.estudiante_id == al.id);
        const misAsist = asistencias ? asistencias.filter(a => a.estudiante_id == al.id) : [];

        let cAsist = fechasAsist.map(f => {
            const reg = misAsist.find(a => a.fecha === f);
            const estado = reg ? reg.estado : 'Asistencia';
            return `<td>
                <select onchange="editarAsistencia(${al.id}, '${f}', this.value)" 
                    style="border:none; background:transparent; font-weight:bold; color:${estado==='Asistencia'?'#2ecc71':'#e74c3c'}">
                    <option value="Asistencia" ${estado==='Asistencia'?'selected':''}>A</option>
                    <option value="Falta" ${estado==='Falta'?'selected':''}>F</option>
                </select>
            </td>`;
        }).join('');

        let cNotas = actividades.map(act => {
            const notaReg = misNotas.find(n => n.actividad_id == act.id);
            const valorNota = notaReg ? notaReg.nota : ""; 
            return `<td>
                <input type="number" value="${valorNota}" step="0.1" 
                    onchange="editarNota(${al.id}, ${act.id}, this.value)" 
                    style="width:45px; text-align:center; border:none; background:#f9f9f9; border-radius:4px;">
            </td>`;
        }).join('');

        const final = calcularPromedioIndividual(misNotas, misAsist, fechasAsist.length, actividades);

        htmlCuerpo += `<tr>
            <td>${al.asiento || 0}</td>
            <td style="text-align:left; position: sticky; left: 0; background: white; border-right: 2px solid #ddd;">${al.nombre_completo}</td>
            ${cAsist} 
            ${cNotas}
            <td class="col-final">${final}</td>
        </tr>`;
    });

    cuerpo.innerHTML = htmlCuerpo;
}

// FUNCIONES DE EDICIÓN EN TIEMPO REAL
async function editarNota(estudianteId, actividadId, nuevaNota) {
    const { error } = await clienteSupabase.from('calificaciones').upsert({
        estudiante_id: estudianteId,
        actividad_id: actividadId,
        nota: parseFloat(nuevaNota) || 0
    }, { onConflict: 'estudiante_id, actividad_id' });
}

async function editarAsistencia(estudianteId, fecha, nuevoEstado) {
    const { error } = await clienteSupabase.from('asistencia').upsert({
        estudiante_id: estudianteId,
        fecha: fecha,
        estado: nuevoEstado
    }, { onConflict: 'estudiante_id, fecha' });
}

function calcularPromedioIndividual(misNotas, misAsist, totalDias, actividades) {
    const presentes = misAsist.filter(a => a.estado === 'Asistencia').length;
    const pAsist = (presentes / (totalDias || 1)) * 10;
    
    const nTareas = misNotas.filter(n => actividades.find(a => a.id == n.actividad_id)?.tipo !== 'Examen');
    const pTareas = nTareas.length ? (nTareas.reduce((a,b) => a + b.nota, 0) / nTareas.length) : 0;
    
    const nExm = misNotas.find(n => actividades.find(a => a.id == n.actividad_id)?.tipo === 'Examen');
    const pExm = nExm ? nExm.nota : 0;

    return ((pAsist * (categoriasDefecto[0].valor/100)) + 
            (pTareas * (categoriasDefecto[1].valor/100)) + 
            (pExm * (categoriasDefecto[2].valor/100))).toFixed(1);
}

// 7. HISTORIAL (NUEVAS FUNCIONES INTEGRADAS)
async function cargarHistorial(tipo) {
    const contenedor = document.getElementById('lista-historial-items');
    contenedor.innerHTML = "Cargando registros...";

    if (tipo === 'actividades') {
        const { data } = await clienteSupabase
            .from('actividades')
            .select('*')
            .eq('grupo_id', grupoSeleccionadoId)
            .order('fecha_actividad', { ascending: false });

        contenedor.innerHTML = data.map(act => `
            <div class="card-historial" style="border: 1px solid #ddd; padding: 15px; margin-bottom: 10px; border-radius: 8px; background: #fff;">
                <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end;">
                    <div>
                        <label style="font-size: 11px; color: #666;">Nombre de Actividad:</label><br>
                        <input type="text" id="edit-nom-${act.id}" value="${act.nombre_actividad}" style="width: 100%;">
                    </div>
                    <div>
                        <label style="font-size: 11px; color: #666;">Fecha:</label><br>
                        <input type="date" id="edit-fec-${act.id}" value="${act.fecha_actividad}" style="width: 100%;">
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button onclick="actualizarActividad(${act.id})" style="background:#2ecc71; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer;">💾</button>
                        <button onclick="eliminarActividad(${act.id})" style="background:#e74c3c; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer;">🗑️</button>
                    </div>
                </div>
            </div>
        `).join('');
    } else {
        // Historial de Asistencias (por fecha)
        const { data } = await clienteSupabase
            .from('asistencia')
            .select('fecha')
            .in('estudiante_id', window.alumnosActuales.map(al => al.id));

        const fechasUnicas = [...new Set(data.map(d => d.fecha))].sort().reverse();

        contenedor.innerHTML = fechasUnicas.map(fecha => `
            <div class="card-historial" style="border: 1px solid #ddd; padding: 15px; margin-bottom: 10px; border-radius: 8px; background: #fdfdfd;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>Sesión de Asistencia</strong><br>
                        <input type="date" id="old-fecha-${fecha}" value="${fecha}" style="margin-top:5px;">
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button onclick="actualizarFechaAsistencia('${fecha}')" style="background:#3498db; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;">Cambiar Fecha</button>
                        <button onclick="eliminarAsistenciaDia('${fecha}')" style="background:#e74c3c; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;">🗑️</button>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

async function eliminarActividad(id) {
    if (!confirm("¿Seguro que quieres eliminar esta actividad?")) return;
    await clienteSupabase.from('actividades').delete().eq('id', id);
    cargarHistorial('actividades');
}

async function eliminarAsistenciaDia(fecha) {
    if (!confirm(`¿Borrar toda la asistencia del día ${fecha}?`)) return;
    const idsAlumnos = window.alumnosActuales.map(al => al.id);
    await clienteSupabase.from('asistencia').delete().eq('fecha', fecha).in('estudiante_id', idsAlumnos);
    cargarHistorial('asistencia');
}


// ACTUALIZAR NOMBRE O FECHA DE UNA TAREA
async function actualizarActividad(id) {
    const nuevoNombre = document.getElementById(`edit-nom-${id}`).value;
    const nuevaFecha = document.getElementById(`edit-fec-${id}`).value;

    const { error } = await clienteSupabase
        .from('actividades')
        .update({ nombre_actividad: nuevoNombre, fecha_actividad: nuevaFecha })
        .eq('id', id);

    if (error) alert("Error al actualizar: " + error.message);
    else {
        alert("✅ Actividad actualizada correctamente");
        cargarHistorial('actividades');
    }
}

// ACTUALIZAR FECHA DE UNA SESIÓN DE ASISTENCIA
async function actualizarFechaAsistencia(fechaOriginal) {
    const nuevaFecha = document.getElementById(`old-fecha-${fechaOriginal}`).value;
    
    if (fechaOriginal === nuevaFecha) return;

    const idsAlumnos = window.alumnosActuales.map(al => al.id);
    
    // Actualizamos todos los registros que tengan esa fecha antigua por la nueva
    const { error } = await clienteSupabase
        .from('asistencia')
        .update({ fecha: nuevaFecha })
        .eq('fecha', fechaOriginal)
        .in('estudiante_id', idsAlumnos);

    if (error) alert("Error al mover fecha: " + error.message);
    else {
        alert("✅ Fecha de asistencia cambiada");
        cargarHistorial('asistencia');
    }
}

// 8. NAVEGACIÓN
async function mostrarSeccion(s) {
    // 1. Ocultar todas las secciones
    document.querySelectorAll('.tab-content').forEach(x => x.classList.add('hidden'));
    
    // 2. Mostrar la sección seleccionada
    const seccionActiva = document.getElementById(`seccion-${s}`);
    if (seccionActiva) seccionActiva.classList.remove('hidden');

    // 3. Lógica de carga de datos frescos
    if (s === 'reporte') {
        // IMPORTANTE: Recargamos alumnos y generamos el reporte con datos nuevos
        await cargarAlumnos(); 
        generarReporte();
    }
    
    if (s === 'config') cargarInterfazCategorias();
    
    if (s === 'historial') {
        // Por defecto cargar actividades al abrir historial
        cargarHistorial('actividades');
    }
    
    if (s === 'tareas') {
        const sel = document.getElementById('categoria-tarea');
        if (sel) {
            sel.innerHTML = categoriasDefecto.map(c => 
                `<option value="${c.nombre}">${c.nombre}</option>`
            ).join('');
        }
    }
}

function regresarADashboard() {
    document.getElementById('vista-grupo').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
}

// 9. CONFIGURACIÓN
function cargarInterfazCategorias() {
    const contenedor = document.getElementById('lista-categorias-config');
    if (!contenedor) return;

    contenedor.innerHTML = `
        <div style="margin-top: 20px;">
            <h3>Porcentajes de Evaluación</h3>
            <div class="form-config" style="background: #f9f9f9; padding: 15px; border-radius: 8px;">
                <div style="margin-bottom: 10px;">
                    <label style="width: 140px; display:inline-block;">Asistencia:</label>
                    <input type="number" id="val-0" value="${categoriasDefecto[0].valor}"> %
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="width: 140px; display:inline-block;">Trabajo:</label>
                    <input type="number" id="val-1" value="${categoriasDefecto[1].valor}"> %
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="width: 140px; display:inline-block;">Examen:</label>
                    <input type="number" id="val-2" value="${categoriasDefecto[2].valor}"> %
                </div>
                <button onclick="guardarConfiguracion()" class="btn-finalizar">Guardar Cambios</button>
            </div>
        </div>
    `;
}

async function guardarConfiguracion() {
    const v0 = parseInt(document.getElementById('val-0').value) || 0;
    const v1 = parseInt(document.getElementById('val-1').value) || 0;
    const v2 = parseInt(document.getElementById('val-2').value) || 0;

    if (v0 + v1 + v2 !== 100) return alert("La suma debe ser 100%");

    categoriasDefecto[0].valor = v0;
    categoriasDefecto[1].valor = v1;
    categoriasDefecto[2].valor = v2;

    await clienteSupabase.from('configuraciones').upsert({
        grupo_id: grupoSeleccionadoId, asistencia: v0, trabajo: v1, examen: v2
    }, { onConflict: 'grupo_id' });
    alert("Configuración guardada");
}

verificarSesion();