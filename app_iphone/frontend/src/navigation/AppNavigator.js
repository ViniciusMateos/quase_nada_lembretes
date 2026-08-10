import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Image, Animated, Easing, useWindowDimensions } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import AccountHubScreen from '../screens/AccountHubScreen';
import RegisterScreen from '../screens/RegisterScreen';
import LoginScreen from '../screens/LoginScreen';
import ChatScreen from '../screens/ChatScreen';
import RemindersScreen from '../screens/RemindersScreen';
import TasksScreen from '../screens/TasksScreen';
import AccountScreen from '../screens/AccountScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import LoadingDog from '../components/LoadingDog';
import LiquidTabBar from '../components/LiquidTabBar';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function SplashScreen() {
  const { width } = useWindowDimensions();
  const dogSize = Math.min(width * 0.6, 240);
  return (
    <View style={styles.splash}>
      <LoadingDog size={dogSize} color="#FFFFFF" />
    </View>
  );
}

function AuthStack() {
  const { theme } = useTheme();
  return (
    <Stack.Navigator
      initialRouteName="AccountHub"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="AccountHub" component={AccountHubScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

function AppTabs() {
  const { theme } = useTheme();
  // Os NOMES das rotas continuam em português (navigation.navigate depende deles);
  // só o rótulo exibido é traduzido.
  const { t } = useI18n();

  return (
    <Tab.Navigator
      initialRouteName="Chat"
      tabBar={props => <LiquidTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: false,
        freezeOnBlur: false,
        sceneStyle: { backgroundColor: theme.background },
      }}
    >
      <Tab.Screen
        name="Tarefas"
        component={TasksScreen}
        options={{
          tabBarLabel: t('chat.tab.tasks'),
          tabBarIcon: ({ color }) => (
            <Image
              source={require('../../assets/task.png')}
              style={{ width: 22, height: 22, tintColor: color }}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          tabBarLabel: t('chat.tab.chat'),
          tabBarIcon: ({ color }) => (
            <Image
              source={require('../../assets/icon-chat.png')}
              style={{ width: 22, height: 22, tintColor: color }}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Lembretes"
        component={RemindersScreen}
        options={{
          tabBarLabel: t('chat.tab.reminders'),
          tabBarIcon: ({ color }) => (
            <Image
              source={require('../../assets/icon-lembretes.png')}
              style={{ width: 22, height: 22, tintColor: color }}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="Main" component={AppTabs} />
      <Stack.Screen name="Account" component={AccountScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
    </Stack.Navigator>
  );
}

// Tempo mínimo que o splash fica na tela, mesmo se o auth resolver antes. Sem
// isso o app carrega tão rápido que o splash só "pisca". Um tempinho girando +
// fade de saída deixa a entrada suave em vez de um corte seco.
const SPLASH_MIN_MS = 600;

export default function AppNavigator() {
  const { isLoading, isAuthenticated } = useAuth();
  const [tempoMinimo, setTempoMinimo] = useState(false);
  const [splashMontado, setSplashMontado] = useState(true);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const t = setTimeout(() => setTempoMinimo(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  // Pronto quando o auth resolveu E o tempo mínimo passou. Aí desvanece e desmonta.
  const pronto = !isLoading && tempoMinimo;
  useEffect(() => {
    if (!pronto) return;
    Animated.timing(fade, {
      toValue: 0,
      duration: 300,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => setSplashMontado(false));
  }, [pronto, fade]);

  return (
    <View style={styles.fill}>
      {/* Conteúdo já monta assim que o auth resolve — o splash fica POR CIMA
          (opaco) e some com fade, revelando a tela já pronta sem piscar. */}
      {!isLoading && (isAuthenticated ? <AppStack /> : <AuthStack />)}
      {splashMontado && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: fade }]}
          pointerEvents={pronto ? 'none' : 'auto'}
        >
          <SplashScreen />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  splash: {
    flex: 1,
    backgroundColor: '#0A84FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
