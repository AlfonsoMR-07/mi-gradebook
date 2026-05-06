// =========================================
// AUTENTICACIÓN
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

            mostrarSpinner('Iniciando sesión...');
            try {
                const { data, error } = await clienteSupabase.auth.signInWithPassword({ email, password });
                if (error) {
                    mostrarToast('Error: ' + error.message, 'error');
                } else {
                    mostrarToast('¡Bienvenido!', 'success');
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
        const { data: { session } } = await clienteSupabase.auth.getSession();
        if (session) {
            document.getElementById('auth-section').classList.add('hidden');
            document.getElementById('dashboard').classList.remove('hidden');
            const userEmail = document.getElementById('user-email');
            if (userEmail) {
                userEmail.textContent = session.user.email;
                userEmail.classList.remove('hidden');
            }
            await cargarGrupos();
            await cargarRecordatorios();
        } else {
            document.getElementById('auth-section').classList.remove('hidden');
            document.getElementById('dashboard').classList.add('hidden');
            document.getElementById('vista-grupo').classList.add('hidden');
        }
    } catch (err) {
        console.error('Error al verificar sesión:', err);
    } finally {
        ocultarSpinner();
    }
}

async function cerrarSesion() {
    mostrarSpinner('Cerrando sesión...');
    await clienteSupabase.auth.signOut();
    location.reload();
}
