import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const isReminderCreated = message.action?.type === 'reminder_created';

  if (isReminderCreated) {
    return (
      <View style={[styles.wrapper, styles.wrapperAssistant]}>
        <View style={styles.bubbleReminder}>
          <Text style={styles.contentReminder}>{message.content}</Text>
        </View>
        <Text style={[styles.timestamp, styles.timestampAssistant]}>
          {formatTimestamp(message.timestamp)}
        </Text>
      </View>
    );
  }

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
    backgroundColor: '#FF8234',
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: '#1A1A2E',
    borderBottomLeftRadius: 4,
  },
  bubbleReminder: {
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 130, 52, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 130, 52, 0.35)',
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
    color: '#F1F5F9',
  },
  contentReminder: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'System',
    color: '#FF8234',
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
  },
  timestampUser: {
    marginRight: 4,
  },
  timestampAssistant: {
    marginLeft: 4,
  },
});
