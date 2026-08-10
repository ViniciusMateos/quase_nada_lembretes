import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Animated, Easing, Linking, StyleSheet, View, useWindowDimensions } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import { requestCompose } from './src/utils/composeIntent';
import { openReminderEditFromNotification, requestEditReminder, coldStartTargetFromNotification } from './src/utils/editReminderIntent';
import { armColdStart, markColdStartReady, onColdStartReady } from './src/utils/coldStartGate';
import LoadingDog from './src/components/LoadingDog';
import InAppNotificationBanner from './src/components/InAppNotificationBanner';
import { AuthProvider } from './src/context/AuthContext';
import { LanguageProvider, useI18n } from './src/i18n';
import { ThemeProvider } from './src/context/ThemeContext';
import { NotificationSettingsProvider } from './src/context/NotificationSettingsContext';
import { navigationRef } from './src/api/client';
import AppNavigator from './src/navigation/AppNavigator';
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
  // Portão de cold-start: um overlay (splash azul + LoadingDog) que fica POR CIMA
  // de tudo até a tela-objetivo do widget/notificação estar montada. Sem ele, o
  // usuário via o app piscar pelas telas intermediárias antes de chegar no alvo.
  const gateFade = useRef(new Animated.Value(1)).current;
  const [gateAtivo, setGateAtivo] = useState(false);

  const ativarGate = alvo => {
    armColdStart(alvo);
    setGateAtivo(true);
    // Trava de segurança: se a tela-objetivo nunca sinalizar (erro, alvo sem
    // signal), libera sozinho pra nunca prender o app numa tela azul eterna.
    setTimeout(() => markColdStartReady(), 4000);
  };

  // Quando a tela-objetivo sinaliza pronto, desvanece o overlay e desmonta.
  useEffect(() => {
    return onColdStartReady(() => {
      Animated.timing(gateFade, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => setGateAtivo(false));
    });
  }, []);

  useEffect(() => {
    setupNotificationCategories();
    registerBackgroundQueueTask();
    // App aberto ao tocar numa notificação com o app fechado (cold start).
    notifee.getInitialNotification().then(initial => {
      if (initial?.notification) {
        // Segura o splash até a tela-objetivo montar: lembrete → modal de edição
        // ('edit'); resumo diário/semanal → lista carregada ('lembretes').
        const alvo = coldStartTargetFromNotification(initial.notification);
        if (alvo) ativarGate(alvo);
        openReminderEditFromNotification(initial.notification);
      }
    });
    return notifee.onForegroundEvent(async ({ type, detail }) => {
      // Nada de tocar som no DELIVERED: com o app aberto, a própria notificação já
      // toca o som dela (foregroundPresentationOptions.sound). Tocar aqui também
      // fazia o barulho DOBRADO quando um lembrete chegava com o app aberto.
      if (type === EventType.ACTION_PRESS) {
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
    const rotear = (url, coldStart = false) => {
      if (!url) return;

      // Tira o esquema e a barra: "quasenadalembretes://lembrete/abc" → "lembrete/abc"
      const caminho = String(url).replace(/^[a-z]+:\/\//i, '').replace(/^\/+/, '');
      const [rota, id] = caminho.split('/');

      // Só no cold start (app aberto PELO widget) a gente segura o splash até a
      // tela-objetivo montar. Link com o app já aberto navega na hora, sem gate.
      if (coldStart) {
        const alvo = rota === 'novo' ? 'compose'
          : (rota === 'lembrete' && id) ? 'edit'
          : rota === 'lembretes' ? 'lembretes'
          : 'chat';
        ativarGate(alvo);
      }

      const ir = () => {
        try {
          if (rota === 'lembrete' && id) {
            navigationRef.current?.navigate('Main', { screen: 'Lembretes' });
            requestEditReminder(id); // pegajoso: espera a tela se ainda não montou
            return;
          }
          if (rota === 'lembretes') {
            navigationRef.current?.navigate('Main', { screen: 'Lembretes' });
            return;
          }
          navigationRef.current?.navigate('Main', { screen: 'Chat' });
          // Só o "novo" abre o teclado. requestCompose é pegajoso: se a Chat
          // ainda não montou (cold start), consome assim que ela montar — sem
          // delay fixo, então o teclado abre no primeiro frame possível.
          if (rota === 'novo') requestCompose();
        } catch {}
      };

      // Em vez de um setTimeout fixo (que atrasava a abertura), roda assim que a
      // navegação fica pronta — checando a cada frame. Some a espera "no escuro".
      if (navigationRef.current?.isReady?.()) ir();
      else {
        let tentativas = 0;
        const esperar = () => {
          if (navigationRef.current?.isReady?.()) ir();
          else if (tentativas++ < 120) requestAnimationFrame(esperar); // ~2s de teto
        };
        requestAnimationFrame(esperar);
      }
    };
    Linking.getInitialURL().then(url => rotear(url, true)).catch(() => {});
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
                {/* Notificação simulada in-app: fica sobre a navegação, some sozinha
                    e sai com swipe pra cima. Disparada quando um lembrete é criado
                    com o app aberto fora da tela de Chat. */}
                <InAppNotificationBanner />
              </AuthProvider>
            </NotificationSettingsProvider>
          </ThemeProvider>
        </LanguageProvider>
        {gateAtivo && <ColdStartOverlay fade={gateFade} />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Overlay idêntico ao SplashScreen (azul + LoadingDog branco), posto por cima de
// toda a árvore no cold-start via widget/notificação. Fica visível enquanto a
// tela-objetivo carrega e some com um fade quando ela sinaliza pronto.
function ColdStartOverlay({ fade }) {
  const { width } = useWindowDimensions();
  const dogSize = Math.min(width * 0.6, 240);
  return (
    <Animated.View style={[styles.gate, { opacity: fade }]} pointerEvents="none">
      <View style={styles.gateInner}>
        <LoadingDog size={dogSize} color="#FFFFFF" />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  gate: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: '#0A84FF',
  },
  gateInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
