import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
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
    return notifee.onForegroundEvent(async ({ type, detail }) => {
      if (type === EventType.DELIVERED) {
        playReminderSound();
      } else if (type === EventType.ACTION_PRESS) {
        await handleNotificationEvent({ type, detail });
      }
    });
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
