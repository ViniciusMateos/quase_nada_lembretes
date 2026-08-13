import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  Platform,
  SafeAreaView,
  Text,
  Animated,
  Easing,
  Image,
  PanResponder,
  Dimensions,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { sendMessage } from '../api/messages.api';
import { deleteReminder, syncReminders, listReminders } from '../api/reminders.api';
import { requestPermission, scheduleFromSync, notifyChatBanner, chatResponseText } from '../services/notifications';
import { enqueueMessage, drainQueue } from '../services/messageQueue';
import { showInAppBanner } from '../utils/inAppBanner';
import { navigationRef } from '../api/client';
import { registerPushToken } from '../services/push';
import { detectIs12h } from '../utils/timeFormat';
import { formatTodayLabel } from '../utils/dateUtils';
import { tabPos, animateTabTo } from '../utils/tabSwipe';
import { onCompose } from '../utils/composeIntent';
import { getColdStartTarget, markColdStartReady } from '../utils/coldStartGate';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import MessageBubble from '../components/MessageBubble';
import TypingIndicator from '../components/TypingIndicator';
import ReminderAmbiguousModal from '../components/ReminderAmbiguousModal';
import NotificationPermissionBanner from '../components/NotificationPermissionBanner';
import HamburgerMenu, { HamburgerIcon } from '../components/HamburgerMenu';
import LoadingDog from '../components/LoadingDog';
import PressableScale from '../components/PressableScale';
import useFocusEntrance from '../hooks/useFocusEntrance';
import { playReceiveSound, playSendSound, playMessageSound, playErrorSound, preloadSounds } from '../services/sounds';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

const INPUT_MIN_H = 44;
const INPUT_MAX_H = 120;

// Recebe `t` por parâmetro: se resolvesse as strings no import, a saudação ficaria
// congelada no idioma inicial.
function getGreeting(t, name) {
  const hour = new Date().getHours();
  let period;
  if (hour >= 0 && hour < 4) period = t('chat.greeting.dawn');
  else if (hour >= 4 && hour < 12) period = t('chat.greeting.morning');
  else if (hour >= 12 && hour < 18) period = t('chat.greeting.afternoon');
  else period = t('chat.greeting.evening');
  return t('chat.greeting', { period, name });
}

function generateId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Roteia a notificação de QUALQUER resposta do chat (ação de lembrete OU mensagem
// comum, como a pergunta de horário). `txt` = { title, body } ou null.
function routeChatNotification(txt) {
  if (!txt || (!txt.title && !txt.body)) return;
  // App em background → notificação de verdade do iOS (com o som de criado/mensagem).
  if (AppState.currentState !== 'active') {
    notifyChatBanner(txt.title, txt.body);
    return;
  }
  // App em foreground: o iOS não mostra notificação. Se o usuário está na tela de
  // Chat, ele já vê a resposta ali (nada a fazer). Se saiu pra outra aba, mostra a
  // notificação SIMULADA in-app (mesma pegada da real).
  const rota = navigationRef.current?.getCurrentRoute?.()?.name;
  if (rota && rota !== 'Chat') showInAppBanner(txt);
}

export default function ChatScreen({ navigation }) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { t, progresso } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [kbOpen, setKbOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const entranceStyle = useFocusEntrance(1);
  const flatListRef = useRef(null);
  const inputRef = useRef(null);
  const swipeTranslateX = useRef(new Animated.Value(0)).current;
  const sendFlyAnim = useRef(new Animated.Value(0)).current;
  const sendButtonAnim = useRef(new Animated.Value(0)).current;
  const inputMargin = useRef(new Animated.Value(68)).current;
  // Altura do input do chat, animada a cada quebra de linha em vez de dar um
  // "pulo" seco quando o texto passa pra próxima linha.
  const inputHeight = useRef(new Animated.Value(INPUT_MIN_H)).current;
  const onInputContentSize = e => {
    // contentSize.height já inclui o padding vertical do input — não somar de novo.
    const alvo = Math.min(INPUT_MAX_H, Math.max(INPUT_MIN_H, e.nativeEvent.contentSize.height));
    Animated.timing(inputHeight, {
      toValue: alvo,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false, // height é layout
    }).start();
  };
  const screenWidth = Dimensions.get('window').width;
  const insets = useSafeAreaInsets();

  const swipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        !isInputFocusedRef.current &&
        Math.abs(g.dx) > Math.abs(g.dy) * 2 &&
        Math.abs(g.dx) > 20,
      onPanResponderMove: (_, g) => {
        // Permite arrastar nos dois sentidos: ← Lembretes (dir) e → Tarefas (esq).
        swipeTranslateX.setValue(Math.max(Math.min(g.dx, screenWidth), -screenWidth));
        // Pílula do footer acompanha o dedo (Chat = índice 1).
        tabPos.setValue(1 + Math.max(Math.min(-g.dx / screenWidth, 1), -1));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -80) {
          Animated.timing(swipeTranslateX, {
            toValue: -screenWidth,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            navigation.navigate('Lembretes');
            requestAnimationFrame(() => swipeTranslateX.setValue(0));
          });
          animateTabTo(2);
          return;
        }
        if (g.dx > 80) {
          Animated.timing(swipeTranslateX, {
            toValue: screenWidth,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            navigation.navigate('Tarefas');
            requestAnimationFrame(() => swipeTranslateX.setValue(0));
          });
          animateTabTo(0);
          return;
        }

        Animated.spring(swipeTranslateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
        animateTabTo(1);
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeTranslateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
        animateTabTo(1);
      },
    }),
  ).current;

  const isInputFocusedRef = useRef(false);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [showInitialTyping, setShowInitialTyping] = useState(true);
  const [flyingMessage, setFlyingMessage] = useState('');
  const [showAmbiguousModal, setShowAmbiguousModal] = useState(false);
  const [ambiguousCandidates, setAmbiguousCandidates] = useState([]);
  const [clarifyOptions, setClarifyOptions] = useState([]);
  const [hasNotifPermission, setHasNotifPermission] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const canSend = inputText.trim().length > 0 && !isLoading;

  // Widget "Criar lembrete" → foca o input (abre o teclado). Tenta focar já no
  // próximo frame; se o input ainda não montou (cold start), re-tenta por alguns
  // frames em vez de esperar um delay fixo. Abre o mais cedo que o iOS permitir.
  useEffect(() => onCompose(() => {
    let tentativas = 0;
    const focar = () => {
      if (inputRef.current) {
        inputRef.current.focus();
        // Objetivo do cold-start atingido (teclado abrindo) → libera o overlay.
        markColdStartReady('compose');
      } else if (tentativas++ < 30) requestAnimationFrame(focar);
    };
    requestAnimationFrame(focar);
  }), []);

  // Widget "Próximo lembrete" (://chat, sem teclado): o alvo é só ter a Chat
  // visível. Assim que ela monta, libera o overlay do cold-start.
  useEffect(() => {
    if (getColdStartTarget() === 'chat') {
      requestAnimationFrame(() => markColdStartReady('chat'));
    }
  }, []);

  // Registra o token de push (pro backend notificar de fora do app). No-op em
  // build sem a entitlement de push — só passa a valer a partir do próximo build.
  useEffect(() => { registerPushToken(); }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  const addMessage = useCallback(
    message => {
      setMessages(prev => [...prev, message]);
      if (message?.isError) playErrorSound();
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const handleSync = useCallback(async () => {
    try {
      const syncData = await syncReminders();
      await scheduleFromSync(syncData);
    } catch (error) {
      console.warn('[ChatScreen] Erro ao sincronizar:', error);
    }
  }, []);

  // Validação real: confere se o lembrete que a IA disse ter criado realmente
  // está na lista. Evita o falso "criado" quando a linha não persiste/lista.
  const confirmReminderCreated = useCallback(
    async reminder => {
      if (!reminder?.id) return;
      try {
        const data = await listReminders();
        const exists = (data?.reminders || []).some(r => r.id === reminder.id);
        if (!exists) {
          addMessage({
            id: generateId(),
            role: 'assistant',
            content: t('chat.error.notConfirmed'),
            timestamp: new Date().toISOString(),
            action: null,
            isError: true,
          });
        }
      } catch (error) {
        console.warn('[ChatScreen] Erro ao confirmar criação do lembrete:', error);
      }
    },
    [addMessage, t],
  );

  useEffect(() => {
    setShowInitialTyping(true);
    const timer = setTimeout(() => {
      setMessages([
        {
          id: `greeting_${Date.now()}`,
          role: 'assistant',
          // `saudacao: true` em vez do texto pronto: guardar a string no estado
          // a congelaria no idioma (e no quadro do embaralho) do momento em que
          // a mensagem nasceu. O texto é resolvido no render, abaixo.
          saudacao: true,
          content: '',
          timestamp: new Date().toISOString(),
          action: null,
        },
      ]);
      setShowInitialTyping(false);
      playMessageSound();
      scrollToBottom();
    }, 650);

    return () => clearTimeout(timer);
  }, [scrollToBottom, user?.name, t]);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      preloadSounds();
      const hasPermission = await requestPermission();
      if (isMounted) setHasNotifPermission(hasPermission);
      if (hasPermission) await handleSync();
    };
    init();
    return () => { isMounted = false; };
  }, [handleSync]);

  // Drena a fila offline: ao reenviar com sucesso, mostra o resultado no chat
  // com uma nota breve de que a mensagem estava na fila por falta de conexão.
  const drainOfflineQueue = useCallback(async () => {
    await drainQueue(async (item, result) => {
      addMessage({
        id: result.message_id || generateId(),
        role: 'assistant',
        content: `${result.response}\n\n${t('chat.queuedNote')}`,
        timestamp: new Date().toISOString(),
        action: result.action || null,
      });
      const tipo = result.action?.type;
      // Notifica antes do await de sync pra o banner não aparecer atrasado.
      routeChatNotification(chatResponseText(tipo, result.action, result.response));
      if (tipo === 'reminder_created' || tipo === 'reminder_updated' || tipo === 'reminder_deleted') {
        await handleSync();
      }
    });
  }, [addMessage, handleSync, t]);

  // Reenvia a fila quando a conexão volta.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) drainOfflineQueue();
    });
    return () => unsubscribe();
  }, [drainOfflineQueue]);

  // Esvazia a fila quando o app volta pro foreground (caso o NetInfo não tenha
  // disparado). O reenvio é deduplicado pelo client_message_id, então não recria
  // lembrete. Não drenamos ao IR pro background (evita reenvio na janela de graça
  // correndo com a requisição original) — a notificação de fora vem do push.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') drainOfflineQueue();
    });
    return () => sub.remove();
  }, [drainOfflineQueue]);

  useEffect(() => {
    Animated.timing(sendButtonAnim, {
      toValue: canSend ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [canSend, sendButtonAnim]);

  // Um único valor controla o espaço abaixo do input, sincronizado com o teclado.
  // Sem KeyboardAvoidingView de propósito: ele empurra por padding próprio E a
  // margem animava por conta — o input era empurrado por dois lados e o
  // movimento saía "vindo de cima". Aqui é UMA fonte: fechado = 68 (respiro da
  // tab bar flutuante); aberto = altura do teclado. Mesma curva e duração dele.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', e => {
      setKbOpen(true);
      Animated.timing(inputMargin, {
        toValue: Math.max(0, e.endCoordinates.height - insets.bottom),
        duration: e.duration || 250,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false, // paddingBottom é layout
      }).start();
    });
    const hide = Keyboard.addListener('keyboardWillHide', e => {
      setKbOpen(false);
      Animated.timing(inputMargin, {
        toValue: 68,
        duration: e.duration || 250,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, [inputMargin, insets.bottom]);

  const handleSend = async overrideContent => {
    const useOverride = typeof overrideContent === 'string';
    const content = (useOverride ? overrideContent : inputText).trim();
    if (!content || isLoading) return;

    setClarifyOptions([]);
    if (!useOverride) {
      setInputText('');
      inputRef.current?.clear();
    }

    const now = new Date();
    const offsetMin = -now.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const absH = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
    const absM = String(Math.abs(offsetMin) % 60).padStart(2, '0');
    const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .replace('Z', `${sign}${absH}:${absM}`);

    const userMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: localISO,
      action: null,
    };

    playSendSound();
    setFlyingMessage(content);
    sendFlyAnim.setValue(0);
    await new Promise(resolve => {
      Animated.timing(sendFlyAnim, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }).start(resolve);
    });
    setFlyingMessage('');

    addMessage(userMessage);
    setIsLoading(true);
    setShowTyping(true);
    scrollToBottom();

    try {
      const result = await sendMessage({
        content,
        client_timestamp: userMessage.timestamp,
        // Id idempotente estável da mensagem: se a resposta se perder (app foi pro
        // background) e a fila reenviar, o backend devolve o mesmo resultado em
        // vez de recriar o lembrete.
        client_message_id: userMessage.id,
      });

      setShowTyping(false);

      const aiMessage = {
        id: result.message_id || generateId(),
        role: 'assistant',
        content: result.response,
        timestamp: new Date().toISOString(),
        action: result.action || null,
      };
      addMessage(aiMessage);
      // Som só com o app ativo. Se a resposta chegou com o app em background (você
      // enviou e saiu na hora), o expo-av não toca em background e o som ficaria
      // "preso" pra estourar quando você voltasse — o delay chato. Nesse caso quem
      // avisa é a notificação (som próprio), então aqui a gente não toca.
      if (AppState.currentState === 'active') playReceiveSound();

      const actionType = result.action?.type;

      // Notifica JÁ, junto com o som — antes dos awaits de sync/confirm abaixo, que
      // são chamadas de rede e faziam o banner aparecer atrasado (som primeiro, só
      // depois a notificação). O texto vem do result, não depende do sync.
      routeChatNotification(chatResponseText(actionType, result.action, result.response));

      // Qualquer mudança no conjunto de lembretes precisa re-sincronizar as
      // notificações locais. 'reminder_updated' estava de fora → ao editar pelo
      // chat, as notificações antigas não eram canceladas e o horário antigo
      // continuava disparando junto com o novo.
      if (
        actionType === 'reminder_created' ||
        actionType === 'reminder_updated' ||
        actionType === 'reminder_deleted'
      ) {
        await handleSync();
        if (actionType === 'reminder_created') {
          await confirmReminderCreated(result.action.reminder);
        }
      } else if (actionType === 'needs_time_clarification') {
        setClarifyOptions(result.action.options || []);
      } else if (actionType === 'ambiguous') {
        setAmbiguousCandidates(result.action.candidates || []);
        setShowAmbiguousModal(true);
      }
    } catch (error) {
      setShowTyping(false);

      const isNetworkError = !error?.response;

      if (isNetworkError) {
        // Sem conexão / queda no meio da requisição → enfileira para reenviar.
        // O client_message_id garante que o reenvio NÃO recria o lembrete: se a
        // original já tinha chegado no servidor (caso clássico de enviar-e-sair,
        // em que a resposta se perde no background), o backend devolve o mesmo
        // resultado. O reenvio acontece ao voltar pro app ou no background-fetch.
        enqueueMessage({
          content,
          client_timestamp: userMessage.timestamp,
          hour_format: detectIs12h() ? '12h' : '24h',
          client_message_id: userMessage.id,
        });

        // Só mostramos o erro de offline se o usuário está OLHANDO o app. Se a
        // falha foi por ter saído (background), não polui o chat com um erro que
        // mentiria quando ele voltasse — a mensagem está na fila e será reenviada
        // (deduplicada). Nada de reenviar na janela de graça: era o que corria com
        // a requisição original e criava o DUPLICADO.
        if (AppState.currentState === 'active') {
          addMessage({
            id: generateId(),
            role: 'assistant',
            content: t('chat.error.offline'),
            timestamp: new Date().toISOString(),
            action: null,
            isError: true,
          });
        }
      } else {
        const errCode = error?.code?.toUpperCase() || '';
        const errStatus = error?.response?.status;
        let errLine = '';
        if (errCode && errStatus) errLine = `${errCode} · ${errStatus}`;
        else if (errCode) errLine = errCode;
        else if (errStatus) errLine = t('chat.error.status', { status: errStatus });
        else errLine = t('chat.error.unknown');

        addMessage({
          id: generateId(),
          role: 'assistant',
          content: t('chat.error.server', { err: errLine }),
          timestamp: new Date().toISOString(),
          action: null,
          isError: true,
        });
      }
      console.warn('[ChatScreen] Erro ao enviar mensagem:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAmbiguousSelect = async candidateId => {
    setShowAmbiguousModal(false);
    setAmbiguousCandidates([]);
    try {
      await deleteReminder(candidateId);
      addMessage({
        id: generateId(),
        role: 'assistant',
        content: t('chat.deleteOk'),
        timestamp: new Date().toISOString(),
        action: null,
      });
      await handleSync();
    } catch (error) {
      addMessage({
        id: generateId(),
        role: 'assistant',
        content: t('chat.deleteFail'),
        timestamp: new Date().toISOString(),
        action: null,
      });
      console.warn('[ChatScreen] Erro ao deletar lembrete:', error);
    }
  };

  const handleAmbiguousCancel = () => {
    setShowAmbiguousModal(false);
    setAmbiguousCandidates([]);
  };

  const renderItem = useCallback(
    ({ item }) => {
      const msg = item.saudacao
        ? { ...item, content: getGreeting(t, user?.name || t('chat.greeting.you')) }
        : item;
      return <MessageBubble message={msg} />;
    },
    // `progresso` nas dependências: é o que refaz a saudação a cada quadro do
    // embaralho (o `t` do módulo tem identidade estável e não avisaria nada).
    [t, progresso, user?.name],
  );
  const keyExtractor = useCallback(item => item.id, []);

  return (
    <View style={styles.safe}>
    <Animated.View
      style={[
        styles.swipePage,
        entranceStyle,
        { transform: [...entranceStyle.transform, { translateX: swipeTranslateX }] },
      ]}
      {...swipePan.panHandlers}
    >
    <SafeAreaView style={{ flex: 1 }}>
      <View style={styles.header}>
        <Image
          source={require('../../assets/logo.png')}
          style={[styles.headerLogo, { tintColor: theme.isDark ? '#FFFFFF' : '#1A1A2E' }]}
          resizeMode="contain"
        />
        <View pointerEvents="none" style={styles.headerCenter}>
          <Text style={styles.headerDate}>{formatTodayLabel()}</Text>
        </View>
        <PressableScale
          onPress={() => setMenuVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 16, right: 8 }}
          accessibilityLabel={t('chat.menuA11y')}
          accessibilityRole="button"
        >
          <HamburgerIcon />
        </PressableScale>
      </View>

      {!hasNotifPermission && <NotificationPermissionBanner />}

      <Animated.View style={[styles.flex, { paddingBottom: inputMargin }]}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
          ListFooterComponent={showInitialTyping || showTyping ? <TypingIndicator /> : null}
        />

        {clarifyOptions.length > 0 ? (
          <View style={styles.clarifyRow}>
            {clarifyOptions.map((opt, i) => (
              <PressableScale
                key={i}
                style={styles.clarifyChip}
                onPress={() => handleSend(opt.resend)}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
              >
                <Text style={styles.clarifyChipText}>{opt.label}</Text>
              </PressableScale>
            ))}
          </View>
        ) : null}

        <View style={styles.inputContainer}>
          <AnimatedTextInput
            ref={inputRef}
            style={[styles.textInput, inputFocused && styles.textInputFocused, { height: inputHeight }]}
            placeholder={t('chat.inputPlaceholder')}
            placeholderTextColor={theme.textPlaceholder}
            value={inputText}
            onChangeText={setInputText}
            onContentSizeChange={onInputContentSize}
            multiline
            maxLength={1000}
            // Enter quebra linha normal; envio só pelo botão ao lado. Antes o
            // returnKeyType="send" + onSubmitEditing mostrava "enviar" no teclado,
            // mas como o campo é multiline o Enter quebrava linha — confuso.
            returnKeyType="default"
            blurOnSubmit={false}
            onFocus={() => { isInputFocusedRef.current = true; setInputFocused(true); }}
            onBlur={() => { isInputFocusedRef.current = false; setInputFocused(false); }}
            contextMenuHidden={false}
            accessibilityLabel={t('chat.inputA11y')}
          />
          <AnimatedTouchableOpacity
            style={[
              styles.sendButton,
              {
                opacity: sendButtonAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.45, 1],
                }),
              },
            ]}
            onPress={() => handleSend()}
            disabled={!canSend}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={t('chat.sendA11y')}
            accessibilityState={{ disabled: !canSend }}
          >
            {isLoading ? (
              <LoadingDog size={28} color="#FFFFFF" />
            ) : (
              <Text style={styles.sendButtonText}>↑</Text>
            )}
          </AnimatedTouchableOpacity>
          {flyingMessage ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.flyingBubble,
                {
                  opacity: sendFlyAnim.interpolate({
                    inputRange: [0, 0.12, 0.86, 1],
                    outputRange: [0, 1, 1, 0],
                  }),
                  transform: [
                    {
                      translateX: sendFlyAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 0],
                      }),
                    },
                    {
                      translateY: sendFlyAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -92],
                      }),
                    },
                    {
                      scale: sendFlyAnim.interpolate({
                        inputRange: [0, 0.35, 1],
                        outputRange: [0.32, 0.86, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={styles.flyingBubbleText} numberOfLines={2}>
                {flyingMessage}
              </Text>
            </Animated.View>
          ) : null}
        </View>
      </Animated.View>

      <ReminderAmbiguousModal
        visible={showAmbiguousModal}
        candidates={ambiguousCandidates}
        onSelect={handleAmbiguousSelect}
        onCancel={handleAmbiguousCancel}
      />

      <HamburgerMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        navigation={navigation}
      />
    </SafeAreaView>
    </Animated.View>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background, overflow: 'hidden' },
    swipePage: { flex: 1, backgroundColor: theme.background },
    flex: { flex: 1 },
    messageList: { flex: 1 },
    messageListContent: { paddingTop: 16, paddingBottom: 8 },
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    emptyText: { color: theme.textPlaceholder, fontSize: 15, fontFamily: 'System' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: 20,
      paddingRight: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerLogo: {
      width: 30,
      height: 30,
    },
    headerCenter: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerDate: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSecondary,
      fontFamily: 'System',
    },
    clarifyRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    clarifyChip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.primary,
      backgroundColor: theme.surface,
    },
    clarifyChipText: {
      color: theme.primary,
      fontSize: 14,
      fontWeight: '600',
      fontFamily: 'System',
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.background,
      gap: 8,
      position: 'relative',
    },
    textInput: {
      flex: 1,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 12,
      fontSize: 15,
      color: theme.textPrimary,
      fontFamily: 'System',
      maxHeight: 120,
      minHeight: 44,
    },
    textInputFocused: {
      borderColor: theme.primary,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    sendButtonText: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: '700',
      lineHeight: 24,
      fontFamily: 'System',
    },
    flyingBubble: {
      position: 'absolute',
      right: 12,
      bottom: 10,
      maxWidth: 220,
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
      borderBottomRightRadius: 4,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: theme.isDark ? 0.35 : 0.18,
      shadowRadius: 14,
      elevation: 8,
    },
    flyingBubbleText: {
      color: '#FFFFFF',
      fontSize: 15,
      lineHeight: 20,
      fontFamily: 'System',
      fontWeight: '500',
    },
  });
}
