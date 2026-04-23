import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listReminders, deleteReminder } from '../api/reminders.api';
import { syncReminders } from '../api/reminders.api';
import { scheduleFromSync } from '../services/notifications';

const COLORS = {
  background: '#0A0A0F',
  surface: '#1A1A2E',
  primary: '#FF8234',
  error: '#EF4444',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textPlaceholder: '#475569',
  border: '#334155',
};

function formatDateTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function groupReminders(reminders) {
  const upcoming = reminders.filter(r => !r.recurrence || r.recurrence === 'once');
  const recurring = reminders.filter(r => r.recurrence && r.recurrence !== 'once');
  return { upcoming, recurring };
}

function ReminderItem({ reminder, onDelete }) {
  return (
    <View style={styles.item}>
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle}>{reminder.title}</Text>
        <Text style={styles.itemDate}>{formatDateTime(reminder.next_execution)}</Text>
        {reminder.recurrence_str ? (
          <Text style={styles.itemRecurrence}>{reminder.recurrence_str}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => onDelete(reminder)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Deletar lembrete ${reminder.title}`}
      >
        <Text style={styles.deleteButtonText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

function SectionHeader({ title }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

export default function RemindersScreen() {
  const [reminders, setReminders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchReminders = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setIsLoading(true);
    setError(null);
    try {
      const data = await listReminders();
      setReminders(data.reminders || []);
    } catch (err) {
      setError('Erro ao carregar lembretes. Puxe para atualizar.');
      console.warn('[RemindersScreen] Erro ao carregar:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchReminders();
    }, [fetchReminders]),
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchReminders(true);
  };

  const handleDelete = (reminder) => {
    Alert.alert(
      'Deletar lembrete',
      `Deseja deletar "${reminder.title}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deletar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReminder(reminder.id);
              setReminders(prev => prev.filter(r => r.id !== reminder.id));
              // Ressincroniza notificações após deletar
              const syncData = await syncReminders();
              await scheduleFromSync(syncData);
            } catch (err) {
              Alert.alert('Erro', 'Não foi possível deletar o lembrete.');
              console.warn('[RemindersScreen] Erro ao deletar:', err);
            }
          },
        },
      ],
      { userInterfaceStyle: 'dark' },
    );
  };

  const { upcoming, recurring } = groupReminders(reminders);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchReminders()}>
            <Text style={styles.retryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const sections = [];
  if (upcoming.length > 0) {
    sections.push({ type: 'header', id: 'header-upcoming', title: 'Próximos' });
    upcoming.forEach(r => sections.push({ type: 'item', id: r.id, reminder: r }));
  }
  if (recurring.length > 0) {
    sections.push({ type: 'header', id: 'header-recurring', title: 'Recorrentes' });
    recurring.forEach(r => sections.push({ type: 'item', id: r.id, reminder: r }));
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Meus Lembretes</Text>
      </View>
      <FlatList
        data={sections}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          if (item.type === 'header') return <SectionHeader title={item.title} />;
          return <ReminderItem reminder={item.reminder} onDelete={handleDelete} />;
        }}
        contentContainerStyle={sections.length === 0 ? styles.emptyContainer : styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Nenhum lembrete criado ainda.</Text>
            <Text style={styles.emptySubtext}>Peça ao chat para criar um!</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.textPrimary,
    fontFamily: 'System',
  },
  listContent: { paddingBottom: 24 },
  emptyContainer: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
    fontFamily: 'System',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
  },
  itemContent: { flex: 1 },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
    fontFamily: 'System',
  },
  itemDate: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontFamily: 'System',
  },
  itemRecurrence: {
    fontSize: 12,
    color: COLORS.primary,
    marginTop: 2,
    fontFamily: 'System',
  },
  deleteButton: {
    marginLeft: 12,
    padding: 4,
  },
  deleteButtonText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontFamily: 'System',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textPlaceholder,
    fontFamily: 'System',
    marginTop: 8,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 15,
    color: COLORS.error,
    fontFamily: 'System',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
  },
  retryButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'System',
  },
});
