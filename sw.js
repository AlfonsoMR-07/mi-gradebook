// =========================================
// SERVICE WORKER - EDUHUB CONNECT v2
// =========================================

const CACHE_NAME = 'eduhub-v2';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/db.js',
    '/utils.js',
    '/auth.js',
    '/grupos.js',
    '/alumnos.js',
    '/asistencia.js',
    '/observaciones.js',
    '/actividades.js',
    '/categorias.js',
    '/reportes.js',
    '/recordatorios.js',
    '/historial.js',
    '/main.js',
    '/manifest.json',
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
                console.log('[SW] Cacheando archivos estáticos...');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[SW] Archivos cacheados correctamente');
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
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => {
            console.log('[SW] Service Worker activado v2');
            return self.clients.claim();
        })
    );
});

// =========================================
// FETCH - Estrategia mejorada
// =========================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // No interceptar requests de Supabase (API) - dejar que pasen directo
    if (url.hostname.includes('supabase.co')) {
        return;
    }

    // No interceptar requests de Google Fonts API
    if (url.hostname.includes('fonts.googleapis.com') && request.mode === 'cors') {
        return;
    }

    // Estrategia: Cache First para archivos estáticos
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Devolver del cache y actualizar en background
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
                        // Guardar en cache para futuro
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseToCache);
                        });
                        return networkResponse;
                    })
                    .catch((err) => {
                        console.error('[SW] Fetch failed:', err);
                        // Si es una página HTML, devolver la página offline
                        if (request.mode === 'navigate') {
                            return caches.match('/index.html');
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
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag: 'eduhub-sync',
        requireInteraction: true,
        actions: [
            {
                action: 'sync',
                title: 'Sincronizar ahora'
            },
            {
                action: 'dismiss',
                title: 'Más tarde'
            }
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
