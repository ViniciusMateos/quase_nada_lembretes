import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Linking, StyleSheet } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import { requestCompose } from './src/utils/composeIntent';
import { openReminderEditFromNotification, requestEditReminder } from './src/utils/editReminderIntent';
import { AuthProvider } from './src/context/AuthContext';
import { LanguageProvider, useI18n } from './src/i18n';
import { ThemeProvider } from './src/context/ThemeContext';
import { NotificationSettingsProvider } from './src/context/NotificationSettingsContext';
import { navigationRef } from './src/api/client';
import AppNavigator from './src/navigation/AppNavigator';
import { playReminderSound } from './src/services/sounds';
import { setupNotificationCategories, handleNotificationEvent, scheduleFromSync } from './src/services/notifications';
import { syncReminders } from './src/api/reminders.api';
import { registerBackgroundQueueTask } from './src/services/backgroundTasks';

/**
 * Reage à troca de idioma no que já foi entregue ao SISTEMA.
 *
 * Duas coisas vivem fora do React e não se traduzem sozinhas:
 *
 * 1. As AÇÕES da notificação ("Adiar 5 min") moram numa categoria que o iOS
 *    registra uma vez, no boot. Sem re-registrar, o botão fica no idioma antigo
 *    embaixo de uma notificação já em inglês.
 *
 * 2. As notificações JÁ AGENDADAS carregam o texto que tinham quando foram
 *    criadas — trocar o idioma não reescreve o que está na fila do sistema. Um
 *    novo sync as reagenda com o texto novo.
 *
 * Precisa ser um componente (e não um efeito no App) porque só aqui dentro do
 * LanguageProvider dá pra ouvir o idioma.
 */
function SincronizaIdiomaComSistema() {
  const { lang } = useI18n();
  const primeiro = useRef(true);

  useEffect(() => {
    setupNotificationCategories(); // idempotente: só reescreve os títulos

    if (primeiro.current) {
      primeiro.current = false; // no boot o resto do app já sincroniza
      return;
    }
    // Reagenda o que está na fila do sistema com o texto no idioma novo.
    syncReminders()
      .then(dados => scheduleFromSync(dados))
      .catch(() => {}); // deslogado ou offline: o próximo sync resolve
  }, [lang]);

  return null;
}

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

  // Deep links dos widgets. Cada widget abre numa tela diferente:
  //   ://novo            → Chat com o teclado aberto (widget "Criar lembrete")
  //   ://chat            → Chat sem teclado (widget "Próximo lembrete" do bloqueio)
  //   ://lembrete/<id>   → aba Lembretes com o modal de edição daquele lembrete
  //   ://lembretes       → aba Lembretes
  useEffect(() => {
    const rotear = url => {
      if (!url) return;

      // Tira o esquema e a barra: "quasenadalembretes://lembrete/abc" → "lembrete/abc"
      const caminho = String(url).replace(/^[a-z]+:\/\//i, '').replace(/^\/+/, '');
      const [rota, id] = caminho.split('/');

      const ir = () => {
        try {
          if (rota === 'lembrete' && id) {
            navigationRef.current?.navigate('Main', { screen: 'Lembretes' });
            requestEditReminder(id);
            return;
          }
          if (rota === 'lembretes') {
            navigationRef.current?.navigate('Main', { screen: 'Lembretes' });
            return;
          }
          navigationRef.current?.navigate('Main', { screen: 'Chat' });
          // Só o "novo" abre o teclado: quem vem do widget do próximo lembrete
          // quer olhar, não digitar.
          if (rota === 'novo') setTimeout(() => requestCompose(), 400);
        } catch {}
      };

      if (navigationRef.current?.isReady?.()) ir();
      else setTimeout(ir, 600);
    };
    Linking.getInitialURL().then(rotear).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => rotear(url));
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        {/* LanguageProvider por fora do resto: trocar de idioma re-renderiza a
            árvore inteira, inclusive os textos dos providers abaixo. */}
        <LanguageProvider>
          <SincronizaIdiomaComSistema />
          <ThemeProvider>
            <NotificationSettingsProvider>
              <AuthProvider>
                <NavigationContainer ref={navigationRef}>
                  <AppNavigator />
                </NavigationContainer>
              </AuthProvider>
            </NotificationSettingsProvider>
          </ThemeProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
