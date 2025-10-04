/**
 * Push Notification Service for Mobile App
 * Integrates with the backend notification system
 */

import BackendApiService from './BackendApiService';

class PushNotificationService {
  static instance = null;
  
  constructor() {
    this.subscription = null;
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
    this.vapidPublicKey = null;
    this.preferences = {
      gameStart: true,
      scoreUpdate: true,
      gameEnd: true,
      news: false
    };
  }

  static getInstance() {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  /**
   * Initialize push notification service
   */
  async initialize() {
    if (!this.isSupported) {
      console.warn('Push notifications are not supported in this environment');
      return false;
    }

    try {
      // Get VAPID public key from backend
      this.vapidPublicKey = await BackendApiService.getVapidPublicKey();
      
      // Register service worker if not already registered
      await this.registerServiceWorker();
      
      return true;
    } catch (error) {
      console.error('Error initializing push notifications:', error);
      return false;
    }
  }

  /**
   * Register service worker for push notifications
   */
  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service workers not supported');
    }

    // Register the service worker
    const registration = await navigator.serviceWorker.register('/sw.js');
    
    // Wait for service worker to be ready
    await navigator.serviceWorker.ready;
    
    console.log('Service worker registered successfully');
    return registration;
  }

  /**
   * Request notification permission and subscribe
   */
  async requestPermissionAndSubscribe(userId, preferences = null) {
    if (!this.isSupported || !this.vapidPublicKey) {
      throw new Error('Push notifications not supported or not initialized');
    }

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      
      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;
      
      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
      });

      // Store subscription locally
      this.subscription = subscription;

      // Update preferences if provided
      if (preferences) {
        this.preferences = { ...this.preferences, ...preferences };
      }

      // Send subscription to backend
      await BackendApiService.subscribeToNotifications(
        userId,
        subscription.toJSON(),
        this.preferences
      );

      console.log('Successfully subscribed to push notifications');
      return subscription;
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
      throw error;
    }
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(userId, preferences) {
    try {
      this.preferences = { ...this.preferences, ...preferences };
      
      await BackendApiService.updateNotificationPreferences(userId, this.preferences);
      
      console.log('Notification preferences updated');
      return this.preferences;
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      throw error;
    }
  }

  /**
   * Check if user is subscribed to notifications
   */
  async isSubscribed() {
    if (!this.isSupported) {
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      this.subscription = subscription;
      return !!subscription;
    } catch (error) {
      console.error('Error checking subscription status:', error);
      return false;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe(userId) {
    try {
      if (this.subscription) {
        await this.subscription.unsubscribe();
      }

      // Notify backend
      await BackendApiService.unsubscribeFromNotifications(userId);
      
      this.subscription = null;
      console.log('Successfully unsubscribed from push notifications');
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error);
      throw error;
    }
  }

  /**
   * Get current notification preferences
   */
  getPreferences() {
    return { ...this.preferences };
  }

  /**
   * Check if notifications are supported
   */
  isNotificationSupported() {
    return this.isSupported;
  }

  /**
   * Get current subscription
   */
  getCurrentSubscription() {
    return this.subscription;
  }

  /**
   * Convert VAPID key from URL-safe base64 to Uint8Array
   */
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Test notification (for debugging)
   */
  async sendTestNotification() {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Sports Tracker', {
        body: 'Test notification from Sports Tracker',
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png'
      });
    }
  }
}

export default PushNotificationService.getInstance();