import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  getPriorityEnabled,
  setPriorityEnabled,
} from '../services/notificationSettings';

const NotificationSettingsContext = createContext(null);

export function NotificationSettingsProvider({ children }) {
  const [priority, setPriorityState] = useState(() => getPriorityEnabled());

  const togglePriority = useCallback(value => {
    setPriorityState(prev => {
      const next = value === undefined ? !prev : !!value;
      setPriorityEnabled(next);
      return next;
    });
  }, []);

  return (
    <NotificationSettingsContext.Provider
      value={{ priority, togglePriority }}
    >
      {children}
    </NotificationSettingsContext.Provider>
  );
}

export function useNotificationSettings() {
  const ctx = useContext(NotificationSettingsContext);
  if (!ctx) throw new Error('useNotificationSettings deve ser usado dentro de NotificationSettingsProvider');
  return ctx;
}
