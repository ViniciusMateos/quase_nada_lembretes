import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  SafeAreaView,
  Text,
  Animated,
  Image,
  PanResponder,
  Dimensions,
  AppState,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { sendMessage } from '../api/messages.api';
import { deleteReminder, syncReminders, listReminders } from '../api/reminders.api';
import { requestPermission, scheduleFromSync, displayLocalNotification } from '../services/notifications';
import { enqueueMessage, drainQueue } from '../services/messageQueue';
import { detectIs12h } from '../utils/timeFormat';
import { formatTodayLabel } from '../utils/dateUtils';
import { tabPos, animateTabTo } from '../utils/tabSwipe';
import { onCompose } from '../utils/composeIntent';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
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

function getGreeting(name) {
  const hour = new Date().getHours();
  let period;
  if (hour >= 0 && hour < 4) period = 'Boa madrugada';
  else if (hour >= 4 && hour < 12) period = 'Bom dia';
  else if (hour >= 12 && hour < 18) period = 'Boa tarde';
  else period = 'Boa noite';
  return `${period}, ${name}! O que você deseja se lembrar?`;
}

function generateId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const BANNER_TITLES = {
  reminder_created: 'Lembrete criado',
  reminder_updated: 'Lembrete editado',
  reminder_deleted: 'Lembrete removido',
};

function showReminderActionBanner(actionType, action) {
  const title = BANNER_TITLES[actionType];
  if (!title) return;
  const body = action?.reminder?.title || action?.reminder_title || 'Lembrete';
  displayLocalNotification(title, body, { silent: true });
}

export default function ChatScreen({ navigation }) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [kbOpen, setKbOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const entranceStyle = useFocusEntrance(1);
  const flatListRef = useRef(null);
  const inputRef = useRef(null);
  const swipeTranslateX = useRef(new Animated.Value(0)).current;
  const sendFlyAnim = useRef(new Animated.Value(0)).current;
  const sendButtonAnim = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;

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

  // Deep link / widget "clique para ser lembrado" → foca o input (abre teclado).
  useEffect(() => onCompose(() => {
    setTimeout(() => inputRef.current?.focus(), 150);
  }), []);

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
            content: 'Não consegui confirmar esse lembrete na sua lista. Pode tentar de novo?',
            timestamp: new Date().toISOString(),
            action: null,
            isError: true,
          });
        }
      } catch (error) {
        console.warn('[ChatScreen] Erro ao confirmar criação do lembrete:', error);
      }
    },
    [addMessage],
  );

  useEffect(() => {
    setShowInitialTyping(true);
    const timer = setTimeout(() => {
      setMessages([
        {
          id: `greeting_${Date.now()}`,
          role: 'assistant',
          content: getGreeting(user?.name || 'você'),
          timestamp: new Date().toISOString(),
          action: null,
        },
      ]);
      setShowInitialTyping(false);
      playMessageSound();
      scrollToBottom();
    }, 650);

    return () => clearTimeout(timer);
  }, [scrollToBottom, user?.name]);

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
        content: `${result.response}\n\nenviado da fila (você estava sem conexão)`,
        timestamp: new Date().toISOString(),
        action: result.action || null,
      });
      const t = result.action?.type;
      if (t === 'reminder_created' || t === 'reminder_updated' || t === 'reminder_deleted') {
        await handleSync();
        showReminderActionBanner(t, result.action);
      }
    });
  }, [addMessage, handleSync]);

  // Reenvia a fila quando a conexão volta.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) drainOfflineQueue();
    });
    return () => unsubscribe();
  }, [drainOfflineQueue]);

  // Também tenta esvaziar a fila quando o app volta pro foreground: cobre o caso
  // em que o NetInfo não disparou (rede já estava ativa) mas a fila não rodou.
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

  // Com a tab bar flutuante, o input fica acima dela; ao abrir o teclado, some
  // o respiro pra não criar buraco entre input e teclado.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', () => setKbOpen(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKbOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

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
      playReceiveSound();

      const actionType = result.action?.type;
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
        showReminderActionBanner(actionType, result.action);
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
        // Sem conexão / queda no meio da requisição → enfileira para reenviar
        // automaticamente quando a internet voltar.
        enqueueMessage({
          content,
          client_timestamp: userMessage.timestamp,
          hour_format: detectIs12h() ? '12h' : '24h',
        });
        addMessage({
          id: generateId(),
          role: 'assistant',
          content: 'Sem conexão agora.\nVou enviar assim que a internet voltar.',
          timestamp: new Date().toISOString(),
          action: null,
          isError: true,
        });
      } else {
        const errCode = error?.code?.toUpperCase() || '';
        const errStatus = error?.response?.status;
        let errLine = '';
        if (errCode && errStatus) errLine = `${errCode} · ${errStatus}`;
        else if (errCode) errLine = errCode;
        else if (errStatus) errLine = `ERRO ${errStatus}`;
        else errLine = 'ERRO DESCONHECIDO';

        addMessage({
          id: generateId(),
          role: 'assistant',
          content: `Não consegui me conectar ao servidor.\n${errLine}\nTente novamente.`,
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
        content: 'Lembrete deletado com sucesso! ✓',
        timestamp: new Date().toISOString(),
        action: null,
      });
      await handleSync();
    } catch (error) {
      addMessage({
        id: generateId(),
        role: 'assistant',
        content: 'Não consegui deletar o lembrete. Tente novamente.',
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

  const renderItem = useCallback(({ item }) => <MessageBubble message={item} />, []);
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
          accessibilityLabel="Menu"
          accessibilityRole="button"
        >
          <HamburgerIcon />
        </PressableScale>
      </View>

      {!hasNotifPermission && <NotificationPermissionBanner />}

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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

        <View style={[styles.inputContainer, { marginBottom: kbOpen ? 0 : 68 }]}>
          <TextInput
            ref={inputRef}
            style={[styles.textInput, inputFocused && styles.textInputFocused]}
            placeholder="Digite uma mensagem..."
            placeholderTextColor={theme.textPlaceholder}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
            returnKeyType="send"
            enablesReturnKeyAutomatically
            onSubmitEditing={() => handleSend()}
            onFocus={() => { isInputFocusedRef.current = true; setInputFocused(true); }}
            onBlur={() => { isInputFocusedRef.current = false; setInputFocused(false); }}
            contextMenuHidden={false}
            accessibilityLabel="Campo de mensagem"
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
            accessibilityLabel="Enviar mensagem"
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
      </KeyboardAvoidingView>

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
