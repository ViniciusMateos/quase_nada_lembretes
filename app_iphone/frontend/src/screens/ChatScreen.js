import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Text,
  ActivityIndicator,
  Modal,
  Animated,
  Image,
} from 'react-native';
import { sendMessage } from '../api/messages.api';
import { deleteReminder, syncReminders } from '../api/reminders.api';
import { requestPermission, scheduleFromSync } from '../services/notifications';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import MessageBubble from '../components/MessageBubble';
import TypingIndicator from '../components/TypingIndicator';
import ReminderAmbiguousModal from '../components/ReminderAmbiguousModal';
import NotificationPermissionBanner from '../components/NotificationPermissionBanner';

function HamburgerIcon() {
  return (
    <View style={{ gap: 4, padding: 4 }}>
      {[0, 1, 2].map(i => (
        <View key={i} style={{ width: 18, height: 2, backgroundColor: '#94A3B8' }} />
      ))}
    </View>
  );
}

function HamburgerMenu({ visible, onClose, navigation }) {
  const { theme, isDark, toggleTheme } = useTheme();
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible, slideAnim]);

  const close = () => {
    Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }).start(() => onClose());
  };

  const goToAccount = () => {
    close();
    setTimeout(() => navigation.navigate('Account'), 220);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <TouchableOpacity style={menuStyles.overlay} onPress={close} activeOpacity={1}>
        <Animated.View
          style={[menuStyles.drawer, { backgroundColor: theme.surface, transform: [{ translateX: slideAnim }] }]}
        >
          <TouchableOpacity style={menuStyles.closeRow} onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 18 }}>✕</Text>
          </TouchableOpacity>

          <View style={[menuStyles.divider, { backgroundColor: theme.border }]} />

          <TouchableOpacity style={menuStyles.row} onPress={toggleTheme} activeOpacity={0.7}>
            <View style={menuStyles.rowLeft}>
              <Image
                source={
                  isDark
                    ? require('../../assets/icon-tema-claro.png')
                    : require('../../assets/icon-tema-escuro.png')
                }
                style={{ width: 22, height: 22, tintColor: theme.textPrimary, marginRight: 12 }}
              />
              <Text style={[menuStyles.rowText, { color: theme.textPrimary }]}>Alterar tema</Text>
            </View>
            <View style={[menuStyles.toggle, { backgroundColor: isDark ? theme.primary : theme.border }]}>
              <View style={[menuStyles.toggleDot, { marginLeft: isDark ? 18 : 2 }]} />
            </View>
          </TouchableOpacity>

          <View style={[menuStyles.divider, { backgroundColor: theme.border }]} />

          <TouchableOpacity style={menuStyles.row} onPress={goToAccount} activeOpacity={0.7}>
            <View style={menuStyles.rowLeft}>
              <Text style={{ fontSize: 20, marginRight: 12 }}>👤</Text>
              <Text style={[menuStyles.rowText, { color: theme.textPrimary }]}>Conta</Text>
            </View>
            <Text style={{ color: theme.textSecondary, fontSize: 22 }}>›</Text>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const menuStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    flexDirection: 'row',
  },
  drawer: {
    width: 280,
    height: '100%',
    paddingTop: 56,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  closeRow: {
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  divider: { height: 1, marginHorizontal: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center' },
  rowText: { fontSize: 16, fontFamily: 'System' },
  toggle: {
    width: 40,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
  },
  toggleDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
  },
});

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

export default function ChatScreen({ navigation }) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const flatListRef = useRef(null);
  const inputRef = useRef(null);

  const [messages, setMessages] = useState([
    {
      id: 'greeting',
      role: 'assistant',
      content: getGreeting(user?.name || 'você'),
      timestamp: new Date().toISOString(),
      action: null,
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [showAmbiguousModal, setShowAmbiguousModal] = useState(false);
  const [ambiguousCandidates, setAmbiguousCandidates] = useState([]);
  const [hasNotifPermission, setHasNotifPermission] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  const addMessage = useCallback(
    message => {
      setMessages(prev => [...prev, message]);
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

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      const hasPermission = await requestPermission();
      if (isMounted) setHasNotifPermission(hasPermission);
      if (hasPermission) await handleSync();
    };
    init();
    return () => { isMounted = false; };
  }, [handleSync]);

  const handleSend = async () => {
    const content = inputText.trim();
    if (!content || isLoading) return;

    setInputText('');
    inputRef.current?.clear();
    setIsLoading(true);

    const userMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      action: null,
    };
    addMessage(userMessage);
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

      const actionType = result.action?.type;
      if (actionType === 'reminder_created' || actionType === 'reminder_deleted') {
        await handleSync();
      } else if (actionType === 'ambiguous') {
        setAmbiguousCandidates(result.action.candidates || []);
        setShowAmbiguousModal(true);
      }
    } catch (error) {
      setShowTyping(false);

      const code = error?.code || '';
      const status = error?.response?.status || '';
      const url = error?.config ? `${error.config.baseURL || ''}${error.config.url || ''}` : '';
      const detail = [status && `HTTP ${status}`, code, url].filter(Boolean).join(' · ');

      addMessage({
        id: generateId(),
        role: 'assistant',
        content: `Ops! Não consegui me conectar. Verifique sua internet e tente novamente.\n\n[${detail || 'sem detalhes'}]`,
        timestamp: new Date().toISOString(),
        action: null,
      });
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
  const canSend = inputText.trim().length > 0 && !isLoading;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Lembretes</Text>
        <TouchableOpacity
          onPress={() => setMenuVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 16, right: 8 }}
          accessibilityLabel="Menu"
          accessibilityRole="button"
        >
          <HamburgerIcon />
        </TouchableOpacity>
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
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Envie uma mensagem para começar</Text>
            </View>
          }
          ListFooterComponent={showTyping ? <TypingIndicator /> : null}
        />

        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            placeholder="Digite uma mensagem..."
            placeholderTextColor={theme.textPlaceholder}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
            returnKeyType="send"
            enablesReturnKeyAutomatically
            onSubmitEditing={handleSend}
            editable={!isLoading}
            accessibilityLabel="Campo de mensagem"
          />
          <TouchableOpacity
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Enviar mensagem"
            accessibilityState={{ disabled: !canSend }}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.sendButtonText}>↑</Text>
            )}
          </TouchableOpacity>
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
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    flex: { flex: 1 },
    messageList: { flex: 1 },
    messageListContent: { paddingTop: 16, paddingBottom: 8 },
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    emptyText: { color: theme.textPlaceholder, fontSize: 15, fontFamily: 'System' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.textPrimary,
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
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    sendButtonDisabled: { opacity: 0.4 },
    sendButtonText: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: '700',
      lineHeight: 24,
      fontFamily: 'System',
    },
  });
}
