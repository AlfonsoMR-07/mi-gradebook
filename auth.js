// =========================================
// AUTENTICACIÓN - CON SOPORTE OFFLINE
// =========================================

function initAuth() {
    const btnIngresar = document.getElementById('btn-ingresar');
    const passwordInput = document.getElementById('password');

    if (btnIngresar) {
        btnIngresar.addEventListener('click', async () => {
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;

            if (!email || !password) {
                mostrarToast('Por favor ingresa correo y contraseña', 'warning');
                return;
            }
            if (!validarEmail(email)) {
                mostrarToast('Correo electrónico inválido', 'warning');
                return;
            }

            if (!navigator.onLine) {
                mostrarToast('Sin conexión. No se puede iniciar sesión.', 'warning');
                return;
            }

            mostrarSpinner('Iniciando sesión...');
            try {
                const { data, error } = await fetchConRetry(() =>
                    clienteSupabase.auth.signInWithPassword({ email, password })
                );
                if (error) {
                    mostrarToast('Error: ' + error.message, 'error');
                } else {
                    mostrarToast('¡Bienvenido!', 'success');
                    // Guardar sesión en localStorage para uso offline
                    localStorage.setItem('eduhub_session', JSON.stringify({
                        email: data.user.email,
                        id: data.user.id,
                        timestamp: new Date().toISOString()
                    }));
                    await verificarSesion();
                }
            } catch (err) {
                mostrarToast('Error de conexión. Intenta de nuevo.', 'error');
            } finally {
                ocultarSpinner();
            }
        });
    }

    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('btn-ingresar').click();
        });
    }
}

async function verificarSesion() {
    mostrarSpinner('Verificando sesión...');
    try {
        // Intentar obtener sesión de Supabase
        const { data: { session } } = await fetchConRetry(() =>
                    clienteSupabase.auth.getSession()
                );

        if (session) {
            mostrarDashboard(session);
            return;
        }

        // Si no hay sesión online, verificar si hay sesión guardada localmente
        const sesionLocal = localStorage.getItem('eduhub_session');
        if (sesionLocal && !navigator.onLine) {
            const sesionData = JSON.parse(sesionLocal);
            // Verificar que la sesión no sea muy vieja (7 días)
            const diasTranscurridos = (new Date() - new Date(sesionData.timestamp)) / (1000 * 60 * 60 * 24);
            if (diasTranscurridos < 7) {
                mostrarDashboard({ user: { email: sesionData.email } });
                mostrarToast('Sesión offline activa', 'warning');
                return;
            }
        }

        // No hay sesión
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('dashboard').classList.add('hidden');
        document.getElementById('vista-grupo').classList.add('hidden');
    } catch (err) {
        console.error('Error al verificar sesión:', err);
        // Intentar sesión local como fallback
        const sesionLocal = localStorage.getItem('eduhub_session');
        if (sesionLocal && !navigator.onLine) {
            const sesionData = JSON.parse(sesionLocal);
            mostrarDashboard({ user: { email: sesionData.email } });
        } else {
            document.getElementById('auth-section').classList.remove('hidden');
            document.getElementById('dashboard').classList.add('hidden');
        }
    } finally {
        ocultarSpinner();
    }
}

function mostrarDashboard(session) {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    const userEmail = document.getElementById('user-email');
    if (userEmail) {
        userEmail.textContent = session.user.email;
        userEmail.classList.remove('hidden');
    }
    cargarGrupos();
    cargarRecordatorios();
}

async function cerrarSesion() {
    mostrarSpinner('Cerrando sesión...');
    localStorage.removeItem('eduhub_session');
    await clienteSupabase.auth.signOut();
    location.reload();
}
