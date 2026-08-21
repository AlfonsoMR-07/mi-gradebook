// =========================================
// SERVICE WORKER - EDUHUB CONNECT
// =========================================

// ── CORREGIDO #9: versión dinámica basada en fecha ───────────────────────────
// ANTES: 'eduhub-v1' era fijo — los usuarios nunca recibían actualizaciones
// AHORA: cada deploy genera un nombre de cache nuevo automáticamente.
//
// INSTRUCCIÓN: cada vez que despliegues cambios, actualiza esta fecha.
// Formato: YYYY-MM-DD, o agrega un sufijo si despliegas varias veces al día.
// Ejemplo: '2026-05-28', '2026-05-28-b', '2026-05-28-hotfix'
//
// Al cambiar CACHE_VERSION, el SW instalará el nuevo cache y limpiará
// el anterior automáticamente en el evento 'activate'.
const CACHE_VERSION = '2026-08-21-sync-fix';
const CACHE_NAME = `eduhub-${CACHE_VERSION}`;
// ─────────────────────────────────────────────────────────────────────────────
// CORREGIDO: rutas relativas (sin "/" al inicio) para que funcionen tanto en
// GitHub Pages (que sirve el sitio en una subcarpeta, ej. /mi-gradebook/)
// como en cualquier otro hosting. Con "/" al inicio, el navegador buscaba
// estos archivos en la raíz del dominio (github.io/archivo.js) en vez de
// dentro de la subcarpeta real del proyecto.

const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './utils.js',
    './auth.js',
    './grupos.js',
    './alumnos.js',
    './asistencia.js',
    './observaciones.js',
    './actividades.js',
    './categorias.js',
    './reportes.js',
    './recordatorios.js',
    './historial.js',
    './sync.js',
    './db.js',
    './main.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdn.jsdelivr.net/npm/chart.js@4'
];

// =========================================
// INSTALACIÓN - Cachear archivos estáticos
// =========================================
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log(`[SW] Cacheando assets (${CACHE_NAME})...`);
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[SW] Assets cacheados correctamente');
                // Forzar activación inmediata sin esperar a que cierren las pestañas
                return self.skipWaiting();
            })
            .catch((err) => {
                console.error('[SW] Error cacheando:', err);
            })
    );
});

// =========================================
// ACTIVACIÓN - Limpiar caches antiguas
// =========================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    // Eliminar cualquier cache que no sea el actual
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log(`[SW] Eliminando cache antigua: ${name}`);
                        return caches.delete(name);
                    })
            );
        }).then(() => {
            console.log(`[SW] Service Worker activado (${CACHE_NAME})`);
            return self.clients.claim();
        })
    );
});

// =========================================
// FETCH - Estrategia: Cache First, luego Network
// =========================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // No interceptar requests de Supabase (API)
    if (url.hostname.includes('supabase.co')) {
        return;
    }

    // Estrategia: Cache First para archivos estáticos
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Devolver del cache y actualizar en background (stale-while-revalidate)
                    fetch(request)
                        .then((networkResponse) => {
                            if (networkResponse && networkResponse.status === 200) {
                                caches.open(CACHE_NAME).then((cache) => {
                                    cache.put(request, networkResponse);
                                });
                            }
                        })
                        .catch(() => {});
                    return cachedResponse;
                }

                // Si no está en cache, ir a la red
                return fetch(request)
                    .then((networkResponse) => {
                        if (!networkResponse || networkResponse.status !== 200) {
                            return networkResponse;
                        }
                        // Guardar en cache para uso futuro
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseToCache);
                        });
                        return networkResponse;
                    })
                    .catch((err) => {
                        console.error('[SW] Fetch failed:', err);
                        // Si es navegación, devolver index.html del cache (offline)
                        if (request.mode === 'navigate') {
                            return caches.match('./index.html');
                        }
                        throw err;
                    });
            })
    );
});

// =========================================
// BACKGROUND SYNC - Sincronizar cuando hay internet
// =========================================
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-eduhub-data') {
        event.waitUntil(
            self.clients.matchAll().then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({ type: 'SYNC_DATA' });
                });
            })
        );
    }
});

// =========================================
// PUSH NOTIFICATIONS (opcional)
// =========================================
self.addEventListener('push', (event) => {
    const data = event.data.json();
    const options = {
        body: data.body || 'Tienes cambios pendientes por sincronizar',
        icon: 'icons/icon-192x192.png',
        badge: 'icons/icon-72x72.png',
        tag: 'eduhub-sync',
        requireInteraction: true,
        actions: [
            { action: 'sync',    title: 'Sincronizar ahora' },
            { action: 'dismiss', title: 'Más tarde' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'EduHub Connect', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'sync') {
        event.waitUntil(
            self.clients.matchAll().then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({ type: 'SYNC_DATA' });
                });
            })
        );
    }
});
