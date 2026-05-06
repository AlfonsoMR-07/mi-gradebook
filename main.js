// =========================================
// INICIALIZACIÓN PRINCIPAL
// =========================================

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') e.preventDefault();
});

document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar IndexedDB primero (crítico para offline)
    try {
        await initDB();
        console.log('[Main] IndexedDB inicializada correctamente');
    } catch (err) {
        console.error('[Main] Error inicializando IndexedDB:', err);
        mostrarToast('Error al inicializar base de datos local', 'error');
    }

    initAuth();
    initTemaOscuro();
    initOffline();

    // Verificar sesión primero
    await verificarSesion();

    // Si hay sesión, iniciar sincronización masiva de todos los datos
    // Esto asegura que TODOS los grupos tengan sus datos disponibles offline
    if (navigator.onLine) {
        try {
            const { data: { session } } = await clienteSupabase.auth.getSession();
            if (session) {
                console.log('[Main] Iniciando sincronización masiva de todos los datos...');
                // Usar setTimeout para no bloquear la UI
                setTimeout(async () => {
                    await sincronizarTodoElSistema();
                }, 1000);
            }
        } catch (e) {
            console.log('[Main] No hay sesión activa para sincronizar');
        }
    }
});
