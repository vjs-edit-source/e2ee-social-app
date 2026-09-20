import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';

// Array of registered back handlers: { id, fn, priority }
// Higher priority runs first. If a handler returns true, back press is consumed.
const handlers = [];
let lastTriggerTime = 0;

/**
 * Register a back press handler.
 * @param {Function} fn - Handler returning boolean (true = consumed)
 * @param {number} priority - Higher number = executed first
 * @returns {Function} Unregister function
 */
export function registerBackHandler(fn, priority = 50) {
  const handlerItem = {
    id: Math.random().toString(36).slice(2),
    fn,
    priority
  };
  handlers.push(handlerItem);
  handlers.sort((a, b) => b.priority - a.priority);

  return () => {
    const idx = handlers.findIndex(h => h.id === handlerItem.id);
    if (idx !== -1) {
      handlers.splice(idx, 1);
    }
  };
}

/**
 * React hook to register a back handler while component is mounted/enabled.
 */
export function useBackHandler(fn, priority = 50, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    const unregister = registerBackHandler(() => fnRef.current(), priority);
    return unregister;
  }, [priority, enabled]);
}

/**
 * Trigger back press through registered handlers.
 * @returns {boolean} true if any handler handled the event, false otherwise.
 */
export function triggerBack() {
  const now = Date.now();
  if (now - lastTriggerTime < 250) {
    // Debounce duplicate back presses within 250ms
    return true;
  }
  lastTriggerTime = now;

  // Make a shallow copy of current handlers in priority order
  const currentHandlers = [...handlers];
  for (const item of currentHandlers) {
    try {
      const handled = item.fn();
      if (handled) {
        return true;
      }
    } catch (e) {
      console.warn('Error executing back handler:', e);
    }
  }
  return false;
}

// Expose to Android WebView Javascript Interface
if (typeof window !== 'undefined') {
  window.handleAndroidDeviceBack = () => {
    return triggerBack();
  };
}

// Initialize Capacitor App backButton listener
if (typeof window !== 'undefined') {
  try {
    CapApp.addListener('backButton', () => {
      const handled = triggerBack();
      if (!handled) {
        // If no handler consumed the event, minimize/exit
        CapApp.exitApp().catch(() => {});
      }
    }).catch(() => {});
  } catch (e) {
    console.warn('Capacitor App plugin listener setup error:', e);
  }
}
