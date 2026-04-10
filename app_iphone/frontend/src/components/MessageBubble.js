/**
 * Bolha de mensagem individual.
 * Usuário: direita, fundo violeta.
 * IA (assistant): esquerda, fundo surface.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const COLORS = {
  background: '#0A0A0F',
  surface: '#1A1A2E',
  primary: '#7C3AED',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
};

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.wrapper, isUser ? styles.wrapperUser : styles.wrapperAssistant]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.content, isUser ? styles.contentUser : styles.contentAssistant]}>
          {message.content}
        </Text>
      </View>
      <Text style={[styles.timestamp, isUser ? styles.timestampUser : styles.timestampAssistant]}>
        {formatTimestamp(message.timestamp)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 4,
    marginHorizontal: 16,
    maxWidth: '80%',
  },
  wrapperUser: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  wrapperAssistant: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.surface,
    borderBottomLeftRadius: 4,
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'System',
  },
  contentUser: {
    color: '#FFFFFF',
  },
  contentAssistant: {
    color: COLORS.textPrimary,
  },
  timestamp: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  timestampUser: {
    marginRight: 4,
  },
  timestampAssistant: {
    marginLeft: 4,
  },
});
