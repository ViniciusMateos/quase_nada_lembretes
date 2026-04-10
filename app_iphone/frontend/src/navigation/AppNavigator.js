/**
 * Navegador principal do app.
 * - isLoading: splash enquanto verifica token salvo
 * - isAuthenticated: Stack protegido (Chat)
 * - !isAuthenticated: Stack de auth (Register como inicial, Login)
 */

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import RegisterScreen from '../screens/RegisterScreen';
import LoginScreen from '../screens/LoginScreen';
import ChatScreen from '../screens/ChatScreen';

const Stack = createNativeStackNavigator();

const COLORS = {
  background: '#0A0A0F',
  primary: '#7C3AED',
};

function SplashScreen() {
  return (
    <View style={styles.splash}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator
      initialRouteName="Register"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen name="Chat" component={ChatScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <SplashScreen />;
  }

  return isAuthenticated ? <AppStack /> : <AuthStack />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
