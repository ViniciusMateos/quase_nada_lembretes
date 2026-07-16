import React, { useMemo } from 'react';
import {
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useNotificationSettings } from '../context/NotificationSettingsContext';
import { useI18n } from '../i18n';
import ChevronIcon from '../components/ChevronIcon';
import PressableScale from '../components/PressableScale';

export default function NotificationSettingsScreen({ navigation }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { priority, togglePriority } = useNotificationSettings();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <PressableScale onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 18, right: 18 }}>
          <ChevronIcon color={theme.primary} size={38} style={styles.backButton} />
        </PressableScale>
        <Text style={styles.headerTitle}>{t('notifications.settings.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t('notifications.settings.priority.title')}</Text>
              <Text style={styles.rowDesc}>
                {t('notifications.settings.priority.desc')}
              </Text>
            </View>
            <Switch
              value={priority}
              onValueChange={togglePriority}
              trackColor={{ true: theme.primary, false: theme.border }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <PressableScale style={styles.linkRow} onPress={() => Linking.openSettings()}>
          <Text style={styles.linkText}>{t('notifications.settings.openSystemSettings')}</Text>
          <ChevronIcon direction="right" color={theme.textSecondary} size={24} />
        </PressableScale>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary, fontFamily: 'System' },
    backButton: { width: 44, textAlign: 'center' },
    content: { padding: 16 },
    section: { borderRadius: 12, backgroundColor: theme.surface, overflow: 'hidden' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 16,
      gap: 12,
    },
    rowText: { flex: 1 },
    rowTitle: { fontSize: 16, color: theme.textPrimary, fontFamily: 'System', marginBottom: 4 },
    rowDesc: { fontSize: 13, color: theme.textSecondary, fontFamily: 'System', lineHeight: 18 },
    divider: { height: 1, backgroundColor: theme.border, marginHorizontal: 16 },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
      marginTop: 16,
    },
    linkText: { fontSize: 16, color: theme.textPrimary, fontFamily: 'System' },
  });
}
