import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Clipboard from 'react-native/Libraries/Components/Clipboard/Clipboard';
import { useTheme } from '../context/ThemeContext';
import ActionSheet from './ActionSheet';
import { detectIs12h } from '../utils/timeFormat';

const IS_12H = detectIs12h();

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: IS_12H });
  } catch {
    return '';
  }
}

function formatLocalDatetime(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: IS_12H,
    });
  } catch {
    return '';
  }
}

function copyText(text) {
  if (!text) return false;
  Clipboard.setString(text);
  return true;
}

function AnimatedBubble({ children, message, styles, bubbleStyle }) {
  const entrance = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const [isHolding, setIsHolding] = useState(false);
  const [copySheetVisible, setCopySheetVisible] = useState(false);
  const [anchorPos, setAnchorPos] = useState(null);

  useEffect(() => {
    Animated.spring(entrance, {
      toValue: 1,
      useNativeDriver: true,
      tension: 70,
      friction: 9,
    }).start();
  }, [entrance]);

  const handleCopy = async () => {
    setCopySheetVisible(false);
    await copyText(message.content);
  };

  const animatePress = toValue => {
    Animated.spring(press, {
      toValue,
      useNativeDriver: true,
      tension: 120,
      friction: 7,
    }).start();
  };

  return (
    <>
    <Animated.View
      style={{
        opacity: entrance,
        transform: [
          {
            translateY: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [10, 0],
            }),
          },
          { scale: press },
        ],
      }}
    >
      <Pressable
        onPressIn={() => animatePress(0.98)}
        onPressOut={() => {
          setIsHolding(false);
          animatePress(1);
        }}
        onLongPress={event => {
          setIsHolding(true);
          animatePress(1.02);
          setAnchorPos({ pageX: event.nativeEvent.pageX, pageY: event.nativeEvent.pageY });
          setCopySheetVisible(true);
        }}
        delayLongPress={350}
        style={[bubbleStyle, isHolding && styles.bubbleHolding]}
      >
        {children}
      </Pressable>
    </Animated.View>
    <ActionSheet
      visible={copySheetVisible}
      anchorPosition={anchorPos}
      options={[{ label: 'Copiar texto', onPress: handleCopy }]}
      onCancel={() => setCopySheetVisible(false)}
    />
    </>
  );
}

export default function MessageBubble({ message }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const isUser = message.role === 'user';
  const isReminderCreated = message.action?.type === 'reminder_created';
  const isError = message.isError === true;

  if (isReminderCreated) {
    const reminder = message.action?.reminder;
    const isRecurring = reminder?.recurrence && reminder.recurrence !== 'once';
    const title = reminder?.title?.toUpperCase() || '';
    const timeLabel = isRecurring ? 'a partir de' : 'data';
    const timeStr = formatLocalDatetime(reminder?.next_execution);
    const displayText = `${isRecurring ? 'Lembrete recorrente criado!' : 'Lembrete criado!'}\n${title}\n${timeLabel}: ${timeStr}`;

    return (
      <View style={[styles.wrapper, styles.wrapperAssistant]}>
        <AnimatedBubble message={{ ...message, content: displayText }} styles={styles} bubbleStyle={styles.bubbleReminder}>
          <Text style={styles.contentReminder}>{displayText}</Text>
        </AnimatedBubble>
        <Text style={[styles.timestamp, styles.timestampAssistant]}>
          {formatTimestamp(message.timestamp)}
        </Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.wrapper, styles.wrapperAssistant]}>
        <AnimatedBubble message={message} styles={styles} bubbleStyle={styles.bubbleError}>
          <Text style={styles.contentError}>{message.content}</Text>
        </AnimatedBubble>
        <Text style={[styles.timestamp, styles.timestampAssistant]}>
          {formatTimestamp(message.timestamp)}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, isUser ? styles.wrapperUser : styles.wrapperAssistant]}>
      <AnimatedBubble
        message={message}
        styles={styles}
        bubbleStyle={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}
      >
        <Text style={[styles.content, isUser ? styles.contentUser : styles.contentAssistant]}>
          {message.content}
        </Text>
      </AnimatedBubble>
      <Text style={[styles.timestamp, isUser ? styles.timestampUser : styles.timestampAssistant]}>
        {formatTimestamp(message.timestamp)}
      </Text>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
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
    bubbleHolding: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: theme.isDark ? 0.35 : 0.14,
      shadowRadius: 12,
      elevation: 5,
    },
    bubbleUser: {
      backgroundColor: theme.primary,
      borderBottomRightRadius: 4,
    },
    bubbleAssistant: {
      backgroundColor: theme.surface,
      borderBottomLeftRadius: 4,
      borderWidth: theme.isDark ? 0 : 1,
      borderColor: theme.border,
    },
    bubbleReminder: {
      borderRadius: 14,
      borderBottomLeftRadius: 4,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: theme.isDark ? 'rgba(255, 130, 52, 0.12)' : '#FFF3EA',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255, 130, 52, 0.35)' : '#FFD4B8',
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
      color: theme.textPrimary,
    },
    contentReminder: {
      fontSize: 15,
      lineHeight: 22,
      fontFamily: 'System',
      color: theme.primary,
      fontWeight: '600',
    },
    bubbleError: {
      borderRadius: 14,
      borderBottomLeftRadius: 4,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEECEC',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(239, 68, 68, 0.35)' : '#F8B4B4',
    },
    contentError: {
      fontSize: 15,
      lineHeight: 22,
      fontFamily: 'System',
      color: theme.error,
      fontWeight: '600',
    },
    timestamp: {
      fontSize: 11,
      color: theme.textSecondary,
      marginTop: 3,
    },
    timestampUser: {
      marginRight: 4,
    },
    timestampAssistant: {
      marginLeft: 4,
    },
  });
}
