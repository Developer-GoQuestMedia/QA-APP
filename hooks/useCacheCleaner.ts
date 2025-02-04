import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export const useCacheCleaner = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const clearCache = async () => {
      try {
        // Clear React Query cache
        queryClient.clear();
        
        // Clear localStorage
        localStorage.clear();
        
        // Clear sessionStorage
        sessionStorage.clear();
        
        // Clear browser cache for specific URLs
        if ('caches' in window) {
          const cacheKeys = await caches.keys();
          await Promise.all(
            cacheKeys.map(key => caches.delete(key))
          );
        }

        // Clear IndexedDB data
        if ('databases' in window.indexedDB) {
          const databases = await window.indexedDB.databases();
          databases.forEach(db => {
            if (db.name) {
              window.indexedDB.deleteDatabase(db.name);
            }
          });
        }

        // Clear service workers
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations.map(registration => registration.unregister())
          );
        }

        console.log('Cache cleared successfully');
      } catch (error) {
        console.error('Error clearing cache:', error);
      }
    };

    // Add event listener for tab/window close
    window.addEventListener('beforeunload', clearCache);
    
    // Cleanup function
    return () => {
      window.removeEventListener('beforeunload', clearCache);
    };
  }, [queryClient]);
}; 