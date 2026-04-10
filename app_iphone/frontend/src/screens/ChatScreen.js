/**
 * Tela principal do app — chat com IA para gerenciamento de lembretes.
 *
 * Fluxo completo:
 * - Mount: solicita permissão notificação + sync inicial + onboarding
 * - Enviar: user bubble → typing indicator → AI response → ação (sync/modal)
 * - Ambiguidade: modal com candidatos → deletar selecionado → confirmação no chat
 * - Erros de rede: mensagem de erro inline no chat
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { sendMessage } from '../api/messages.api';
import { deleteReminder, syncReminders } from '../api/reminders.api';
import { requestPermission, scheduleFromSync } from '../services/notifications';
import { useAuth, storage } from '../context/AuthContext';
import MessageBubble from '../components/MessageBubble';
import TypingIndicator from '../components/TypingIndicator';
import ReminderAmbiguousModal from '../components/ReminderAmbiguousModal';
import NotificationPermissionBanner from '../components/NotificationPermissionBanner';

const COLORS = {
  background: '#0A0A0F',
  surface: '#1A1A2E',
  primary: '#7C3AED',
  textPrimary: '#F1F5F9',
  textPlaceholder: '#475569',
  border: '#334155',
};

const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Oi! Sou o assistente do Quase Nada Lembretes 👋\nPosso criar lembretes, listar os que você tem e deletar quando quiser. Tente me mandar algo como:\n\n*Me lembra de tomar remédio amanhã às 8h*\n\nO que você precisa?',
  timestamp: new Date().toISOString(),
};

function generateId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function ChatScreen({ navigation }) {
  const { logout } = useAuth();
  const flatListRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [showAmbiguousModal, setShowAmbiguousModal] = useState(false);
  const [ambiguousCandidates, setAmbiguousCandidates] = useState([]);
  const [hasNotifPermission, setHasNotifPermission] = useState(true);

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
      // Solicita permissão de notificação (exibe diálogo nativo iOS se ainda não solicitado)
      const hasPermission = await requestPermission();
      if (isMounted) setHasNotifPermission(hasPermission);
      if (hasPermission) {
        await handleSync();
      }

      // Onboarding — exibe boas-vindas apenas uma vez
      if (isMounted) {
        const onboardingDone = storage.getBoolean('onboarding_done');
        if (!onboardingDone) {
          setMessages([WELCOME_MESSAGE]);
          storage.set('onboarding_done', true);
        }
      }
    };

    init();
    return () => {
      isMounted = false;
    };
  }, [handleSync]);

  const handleSend = async () => {
    const content = inputText.trim();
    if (!content || isLoading) return;

    setInputText('');
    setIsLoading(true);

    const userMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
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
      };
      addMessage(aiMessage);

      const actionType = result.action?.type;

      if (actionType === 'reminder_created') {
        await handleSync();
      } else if (actionType === 'reminder_deleted') {
        await handleSync();
      } else if (actionType === 'ambiguous') {
        setAmbiguousCandidates(result.action.candidates || []);
        setShowAmbiguousModal(true);
      }
    } catch (error) {
      setShowTyping(false);

      const errorMessage = {
        id: generateId(),
        role: 'assistant',
        content: 'Ops! Não consegui me conectar. Verifique sua internet e tente novamente.',
        timestamp: new Date().toISOString(),
      };
      addMessage(errorMessage);

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

      const confirmMessage = {
        id: generateId(),
        role: 'assistant',
        content: 'Lembrete deletado com sucesso! ✓',
        timestamp: new Date().toISOString(),
      };
      addMessage(confirmMessage);

      await handleSync();
    } catch (error) {
      const errorMessage = {
        id: generateId(),
        role: 'assistant',
        content: 'Não consegui deletar o lembrete. Tente novamente.',
        timestamp: new Date().toISOString(),
      };
      addMessage(errorMessage);
      console.warn('[ChatScreen] Erro ao deletar lembrete:', error);
    }
  };

  const handleAmbiguousCancel = () => {
    setShowAmbiguousModal(false);
    setAmbiguousCandidates([]);
  };

  const renderItem = useCallback(
    ({ item }) => <MessageBubble message={item} />,
    [],
  );

  const keyExtractor = useCallback(item => item.id, []);

  const canSend = inputText.trim().length > 0 && !isLoading;

  return (
    <SafeAreaView style={styles.safe}>
      {!hasNotifPermission && <NotificationPermissionBanner />}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
            style={styles.textInput}
            placeholder="Digite uma mensagem..."
            placeholderTextColor={COLORS.textPlaceholder}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  messageList: { flex: 1 },
  messageListContent: { paddingTop: 16, paddingBottom: 8 },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: { color: COLORS.textPlaceholder, fontSize: 15, fontFamily: 'System' },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
    fontFamily: 'System',
    maxHeight: 120,
    minHeight: 44,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
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
