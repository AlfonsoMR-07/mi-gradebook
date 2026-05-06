// =========================================
// INICIALIZACIÓN PRINCIPAL
// =========================================

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') e.preventDefault();
});

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initTemaOscuro();
    initOffline();
    verificarSesion();
});
