import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  getPriorityEnabled,
  setPriorityEnabled,
  getCustomSoundEnabled,
  setCustomSoundEnabled,
} from '../services/notificationSettings';

const NotificationSettingsContext = createContext(null);

export function NotificationSettingsProvider({ children }) {
  const [priority, setPriorityState] = useState(() => getPriorityEnabled());
  const [customSound, setCustomSoundState] = useState(() => getCustomSoundEnabled());

  const togglePriority = useCallback(value => {
    setPriorityState(prev => {
      const next = value === undefined ? !prev : !!value;
      setPriorityEnabled(next);
      return next;
    });
  }, []);

  const toggleCustomSound = useCallback(value => {
    setCustomSoundState(prev => {
      const next = value === undefined ? !prev : !!value;
      setCustomSoundEnabled(next);
      return next;
    });
  }, []);

  return (
    <NotificationSettingsContext.Provider
      value={{ priority, customSound, togglePriority, toggleCustomSound }}
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
