/**
 * Service Worker for Push Notifications
 * Handles background push notifications when app is not active
 */

const CACHE_NAME = 'sports-tracker-v1';

// Install event
self.addEventListener('install', (event) => {
  console.log('Service Worker installed');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  event.waitUntil(self.clients.claim());
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('Push event received');
  
  if (!event.data) {
    console.log('Push event but no data');
    return;
  }

  let notificationData;
  try {
    notificationData = event.data.json();
  } catch (error) {
    console.error('Error parsing push data:', error);
    notificationData = {
      title: 'Sports Tracker',
      body: 'New update available',
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png'
    };
  }

  const { title, body, icon, badge, data } = notificationData;

  const notificationOptions = {
    body,
    icon: icon || '/icon-192x192.png',
    badge: badge || '/badge-72x72.png',
    data: data || {},
    requireInteraction: true,
    actions: [
      {
        action: 'view',
        title: 'View Details'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ],
    tag: data?.gameId ? `game-${data.gameId}` : 'sports-tracker',
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(title, notificationOptions)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked');
  
  const { action, notification } = event;
  const { data } = notification;

  event.notification.close();

  if (action === 'dismiss') {
    return;
  }

  // Handle notification click
  event.waitUntil(
    handleNotificationClick(data)
  );
});

/**
 * Handle notification click actions
 */
async function handleNotificationClick(data) {
  const { gameId, sport, type } = data || {};
  
  // Get all window clients
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  // If app is already open, focus it and navigate
  if (clients.length > 0) {
    const client = clients[0];
    client.focus();
    
    // Send message to app to navigate to specific content
    if (gameId && sport) {
      client.postMessage({
        type: 'NOTIFICATION_CLICKED',
        data: { gameId, sport, notificationType: type }
      });
    }
    
    return;
  }

  // If no window is open, open the app
  let url = '/';
  
  // Create URL based on notification data
  if (gameId && sport) {
    url = `/?game=${gameId}&sport=${sport}`;
  }

  await self.clients.openWindow(url);
}

// Background sync event (for future use)
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered');
  
  if (event.tag === 'favorites-sync') {
    event.waitUntil(syncFavorites());
  }
});

/**
 * Sync favorites data in background
 */
async function syncFavorites() {
  try {
    // This would sync favorites data when connection is restored
    console.log('Syncing favorites data...');
    
    // Implementation would go here
    // - Get cached favorites
    // - Send to backend
    // - Update local cache
    
  } catch (error) {
    console.error('Error syncing favorites:', error);
  }
}

// Message event - handle messages from the main app
self.addEventListener('message', (event) => {
  console.log('Service Worker received message:', event.data);
  
  const { type, data } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CACHE_FAVORITES':
      // Cache favorites data for offline use
      cacheFavorites(data);
      break;
      
    default:
      console.log('Unknown message type:', type);
  }
});

/**
 * Cache favorites data for offline access
 */
async function cacheFavorites(favoritesData) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = new Response(JSON.stringify(favoritesData));
    await cache.put('/api/favorites/cached', response);
    console.log('Favorites data cached successfully');
  } catch (error) {
    console.error('Error caching favorites data:', error);
  }
}

// Fetch event - handle network requests
self.addEventListener('fetch', (event) => {
  // Only handle API requests for caching
  if (event.request.url.includes('/api/')) {
    event.respondWith(handleApiRequest(event.request));
    return;
  }
  
  // Let other requests pass through normally
  event.respondWith(fetch(event.request));
});

/**
 * Handle API requests with caching strategy
 */
async function handleApiRequest(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // If successful, cache the response
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    console.log('Network failed, trying cache for:', request.url);
    
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('Returning cached response for:', request.url);
      return cachedResponse;
    }
    
    // No cache available, return error
    throw error;
  }
}