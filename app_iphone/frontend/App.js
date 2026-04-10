/**
 * Ponto de entrada do app.
 * Hierarquia de providers:
 * SafeAreaProvider → AuthProvider → NavigationContainer → AppNavigator
 *
 * O navigationRef é passado para o NavigationContainer
 * para permitir redirecionamento global no interceptor de 401.
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { AuthProvider } from './src/context/AuthContext';
import { navigationRef } from './src/api/client';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer ref={navigationRef}>
            <AppNavigator />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
