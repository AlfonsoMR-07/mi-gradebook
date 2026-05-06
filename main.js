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
    verificarSesion();
});
