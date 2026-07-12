import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Linking, StyleSheet } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import { requestCompose } from './src/utils/composeIntent';
import { openReminderEditFromNotification } from './src/utils/editReminderIntent';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { NotificationSettingsProvider } from './src/context/NotificationSettingsContext';
import { navigationRef } from './src/api/client';
import AppNavigator from './src/navigation/AppNavigator';
import { playReminderSound } from './src/services/sounds';
import { setupNotificationCategories, handleNotificationEvent } from './src/services/notifications';
import { registerBackgroundQueueTask } from './src/services/backgroundTasks';

export default function App() {
  useEffect(() => {
    setupNotificationCategories();
    registerBackgroundQueueTask();
    // App aberto ao tocar numa notificação com o app fechado (cold start).
    notifee.getInitialNotification().then(initial => {
      if (initial?.notification) openReminderEditFromNotification(initial.notification);
    });
    return notifee.onForegroundEvent(async ({ type, detail }) => {
      if (type === EventType.DELIVERED) {
        playReminderSound();
      } else if (type === EventType.ACTION_PRESS) {
        await handleNotificationEvent({ type, detail });
      } else if (type === EventType.PRESS) {
        openReminderEditFromNotification(detail.notification);
      }
    });
  }, []);

  // Deep link (ex.: widget "clique para ser lembrado" da tela de bloqueio) →
  // abre o Chat e foca o input pra escrever o lembrete na hora.
  useEffect(() => {
    const abrirCompose = url => {
      if (!url) return;
      // Qualquer deep link do app hoje significa "quero criar um lembrete".
      const irParaChat = () => {
        try {
          navigationRef.current?.navigate('Main', { screen: 'Chat' });
        } catch {}
        setTimeout(() => requestCompose(), 400);
      };
      if (navigationRef.current?.isReady?.()) irParaChat();
      else setTimeout(irParaChat, 600);
    };
    Linking.getInitialURL().then(abrirCompose).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => abrirCompose(url));
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <NotificationSettingsProvider>
            <AuthProvider>
              <NavigationContainer ref={navigationRef}>
                <AppNavigator />
              </NavigationContainer>
            </AuthProvider>
          </NotificationSettingsProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
