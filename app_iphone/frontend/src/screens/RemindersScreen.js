import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  SafeAreaView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  LayoutAnimation,
  Platform,
  PanResponder,
  Animated,
  Easing,
  Dimensions,
  Pressable,
  ScrollView,
} from 'react-native';
import CalendarPicker from '../components/CalendarPicker';
import TimePickerNative from '../components/TimePickerNative';
import { detectIs12h } from '../utils/timeFormat';
import { formatTodayLabel, getWeekKey } from '../utils/dateUtils';
import { tabPos, animateTabTo } from '../utils/tabSwipe';
import { useTabBarClearance } from '../components/LiquidTabBar';
import { useFocusEffect } from '@react-navigation/native';
import useFocusEntrance from '../hooks/useFocusEntrance';
import { listReminders, deleteReminder, syncReminders, updateReminder } from '../api/reminders.api';
import { scheduleFromSync } from '../services/notifications';
import { useTheme } from '../context/ThemeContext';
import LoadingDog from '../components/LoadingDog';
import ConfirmDialog from '../components/ConfirmDialog';
import HamburgerMenu, { HamburgerIcon } from '../components/HamburgerMenu';
import TaskModal from '../components/TaskModal';
import { createTask } from '../api/tasks.api';
import PressableScale from '../components/PressableScale';

const IS_12H = detectIs12h();

function AnimatedExpand({ visible, children, expandedHeight = 400 }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      mountedRef.current = true;
      setMounted(true);
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else if (mountedRef.current) {
      Animated.timing(progress, {
        toValue: 0,
        duration: 300,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          mountedRef.current = false;
          setMounted(false);
        }
      });
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;

  return (
    <Animated.View
      style={{
        maxHeight: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, expandedHeight],
        }),
        opacity: progress,
        overflow: 'hidden',
      }}
    >
      {children}
    </Animated.View>
  );
}

function formatDateTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: IS_12H,
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function formatDateLabel(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function isoToPickerTime(isoString) {
  if (!isoString) return { hours: 0, minutes: 0, period: 'AM' };
  const d = new Date(isoString);
  const rawHours = d.getHours();
  const minutes = d.getMinutes();
  if (!IS_12H) return { hours: rawHours, minutes, period: 'AM' };
  const period = rawHours >= 12 ? 'PM' : 'AM';
  const hours = rawHours % 12 || 12;
  return { hours, minutes, period };
}

function pickerTimeToDate(baseDate, pickerTime) {
  const d = new Date(baseDate);
  let hours = pickerTime.hours;
  if (IS_12H) {
    if (pickerTime.period === 'PM' && hours !== 12) hours += 12;
    if (pickerTime.period === 'AM' && hours === 12) hours = 0;
  }
  d.setHours(hours, pickerTime.minutes, 0, 0);
  return d;
}

function groupReminders(reminders) {
  const upcoming = reminders.filter(r => !r.recurrence || r.recurrence === 'once');
  const recurring = reminders.filter(r => r.recurrence && r.recurrence !== 'once');
  return { upcoming, recurring };
}

// Convenção weekday(): Seg=0 .. Dom=6
const DAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const DAY_PRESETS = [
  { label: 'Dias úteis', days: [0, 1, 2, 3, 4] },
  { label: 'Fim de semana', days: [5, 6] },
  { label: 'Todo dia', days: [0, 1, 2, 3, 4, 5, 6] },
];

// Tipos de recorrência expostos na edição. `key` casa com o backend.
const RECURRENCE_TYPES = [
  { key: 'once', label: 'Único' },
  { key: 'daily', label: 'Todo dia' },
  { key: 'weekly_days', label: 'Dias da semana' },
  { key: 'weekly', label: 'Toda semana' },
  { key: 'monthly', label: 'Todo mês' },
  { key: 'interval_seconds', label: 'Intervalo' },
];

// Tipos que precisam de uma data de referência (calendário).
const TYPES_WITH_DATE = new Set(['once', 'weekly', 'monthly']);

// Tons levemente distintos do azul de marca (#0A84FF) por grupo de
// controles — cada setor do form ganha identidade em vez de tudo chapado na
// mesma cor. Convenção: animação + variação de tom dão acabamento.
const SECTOR_TINTS = {
  type: '#0A84FF',   // tipo de recorrência — azul principal
  preset: '#3D6FF5', // presets (dias úteis/fim de semana) — azul mais índigo
  day: '#2AA9E0',    // dias individuais — azul mais ciano
};

function sameDays(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

function intervalFromSeconds(seconds) {
  if (!seconds || seconds <= 0) return { value: '1', unit: 'days' };
  if (seconds % 86400 === 0) return { value: String(seconds / 86400), unit: 'days' };
  if (seconds % 3600 === 0) return { value: String(seconds / 3600), unit: 'hours' };
  return { value: String(Math.max(1, Math.round(seconds / 3600))), unit: 'hours' };
}

function EditReminderModal({ visible, reminder, onSave, onClose, theme }) {
  const [title, setTitle] = useState('');
  const [recurrence, setRecurrence] = useState('once');
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDays, setSelectedDays] = useState([]);
  const [pickerTime, setPickerTime] = useState({ hours: 9, minutes: 0, period: 'AM' });
  const [intervalValue, setIntervalValue] = useState('1');
  const [intervalUnit, setIntervalUnit] = useState('days');
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [kbHeight, setKbHeight] = useState(0);
  const styles = useMemo(() => makeModalStyles(theme), [theme]);
  const needsDate = TYPES_WITH_DATE.has(recurrence);

  const sheetTranslateY = useRef(new Animated.Value(400)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      // Sensível: qualquer arrasto pra baixo na barrinha já agarra o sheet.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 3,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) sheetTranslateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        // Fecha com arrasto curto (60px) OU com flick pra baixo (velocidade).
        if (g.dy > 60 || g.vy > 0.5) {
          Keyboard.dismiss();
          keyboardOffset.setValue(0);
          Animated.timing(sheetTranslateY, { toValue: 500, duration: 220, useNativeDriver: true }).start(onClose);
          Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }).start();
        } else {
          Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
    }),
  ).current;

  useEffect(() => {
    if (visible && reminder) {
      setTitle(reminder.title);
      setRecurrence(reminder.recurrence || 'once');
      const d = reminder.next_execution ? new Date(reminder.next_execution) : new Date();
      setSelectedDate(d);
      setSelectedDays(Array.isArray(reminder.days_of_week) ? reminder.days_of_week : []);
      setPickerTime(isoToPickerTime(reminder.next_execution));
      const iv = intervalFromSeconds(reminder.interval_seconds);
      setIntervalValue(iv.value);
      setIntervalUnit(iv.unit);
      setErrors({});
      setCalendarVisible(false);
      setTimePickerVisible(false);
      sheetTranslateY.setValue(400);
      overlayOpacity.setValue(0);
      keyboardOffset.setValue(0);
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, tension: 68, friction: 11 }),
      ]).start();
    }
  }, [visible, reminder, sheetTranslateY, overlayOpacity, keyboardOffset]);

  useEffect(() => {
    if (!visible) return;
    const show = Keyboard.addListener('keyboardWillShow', e => {
      setKbHeight(e.endCoordinates.height);
      Animated.timing(keyboardOffset, { toValue: -e.endCoordinates.height, duration: e.duration || 250, useNativeDriver: true }).start();
    });
    const hide = Keyboard.addListener('keyboardWillHide', e => {
      setKbHeight(0);
      Animated.timing(keyboardOffset, { toValue: 0, duration: e.duration || 250, useNativeDriver: true }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, [visible, keyboardOffset]);

  const handleClose = () => {
    Keyboard.dismiss();
    keyboardOffset.setValue(0);
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sheetTranslateY, { toValue: 400, duration: 220, useNativeDriver: true }),
    ]).start(onClose);
  };

  const toggleCalendar = () => {
    setCalendarVisible(v => !v);
    if (timePickerVisible) setTimePickerVisible(false);
  };

  const toggleTimePicker = () => {
    setTimePickerVisible(v => !v);
    if (calendarVisible) setCalendarVisible(false);
  };

  const handleDaySelect = day => {
    setSelectedDate(day);
    setCalendarVisible(false);
    if (errors.datetime) setErrors(e => ({ ...e, datetime: null }));
  };

  const toggleDay = day => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day],
    );
    if (errors.days) setErrors(e => ({ ...e, days: null }));
  };

  const handleSave = async () => {
    const newErrors = {};
    if (!title.trim()) newErrors.title = 'Título é obrigatório';
    if (recurrence === 'weekly_days' && selectedDays.length === 0) {
      newErrors.days = 'Selecione ao menos um dia';
    }
    if (needsDate && !selectedDate) {
      newErrors.datetime = 'Selecione uma data';
    }
    let intervalSeconds = null;
    if (recurrence === 'interval_seconds') {
      const n = parseInt(intervalValue, 10);
      if (!n || n <= 0) newErrors.interval = 'Informe um intervalo válido';
      else intervalSeconds = n * (intervalUnit === 'days' ? 86400 : 3600);
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setIsSaving(true);
    try {
      const baseDate = (needsDate ? selectedDate : new Date()) || new Date();
      const finalDate = pickerTimeToDate(baseDate, pickerTime);
      const payload = {
        title: title.trim(),
        scheduled_time: finalDate.toISOString(),
        recurrence,
      };
      if (recurrence === 'weekly_days') {
        payload.days_of_week = [...selectedDays].sort((a, b) => a - b);
      }
      if (recurrence === 'interval_seconds') {
        payload.interval_seconds = intervalSeconds;
      }
      await onSave(reminder.id, payload);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <Animated.View style={[styles.sheet, kbHeight > 0 && { maxHeight: Dimensions.get('window').height - kbHeight - 70 }, { transform: [{ translateY: Animated.add(sheetTranslateY, keyboardOffset) }] }]}>
          <View style={styles.handleArea} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sheetTitle}>Editar lembrete</Text>

            <Text style={styles.label}>Título</Text>
            <TextInput
              style={[styles.input, errors.title && styles.inputError]}
              value={title}
              onChangeText={text => { setTitle(text); if (errors.title) setErrors(e => ({ ...e, title: null })); }}
              placeholder="Nome do lembrete"
              placeholderTextColor={theme.textPlaceholder}
              autoCapitalize="sentences"
              editable={!isSaving}
            />
            {errors.title ? <Text style={styles.fieldError}>{errors.title}</Text> : null}

            <Text style={styles.label}>Recorrência</Text>
            <View style={styles.typeScrollWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.typeRow}
                keyboardShouldPersistTaps="handled"
              >
                {RECURRENCE_TYPES.map(t => {
                  const active = recurrence === t.key;
                  return (
                    <PressableScale
                      key={t.key}
                      style={[styles.typeChip, active && { backgroundColor: SECTOR_TINTS.type, borderColor: SECTOR_TINTS.type }]}
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setRecurrence(t.key);
                        setCalendarVisible(false);
                        setErrors(e => ({ ...e, days: null, datetime: null, interval: null }));
                      }}
                      disabled={isSaving}
                    >
                      <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>{t.label}</Text>
                    </PressableScale>
                  );
                })}
              </ScrollView>
              <View pointerEvents="none" style={styles.typeScrollFade}>
                <View style={[styles.typeFadeBand, { backgroundColor: theme.surface + '00', width: 6 }]} />
                <View style={[styles.typeFadeBand, { backgroundColor: theme.surface + '33', width: 6 }]} />
                <View style={[styles.typeFadeBand, { backgroundColor: theme.surface + '80', width: 8 }]} />
                <View style={[styles.typeFadeBand, { backgroundColor: theme.surface + 'CC', width: 8 }]} />
                <View style={[styles.typeFadeBand, { backgroundColor: theme.surface, width: 6 }]} />
              </View>
            </View>

            {recurrence === 'weekly_days' && (
              <>
                <Text style={[styles.label, { marginTop: 14 }]}>Dias da semana</Text>
                <View style={styles.presetRow}>
                  {DAY_PRESETS.map(p => {
                    const active = sameDays(selectedDays, p.days);
                    return (
                      <PressableScale
                        key={p.label}
                        style={[styles.preset, active && { backgroundColor: SECTOR_TINTS.preset, borderColor: SECTOR_TINTS.preset }]}
                        onPress={() => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setSelectedDays(p.days);
                          if (errors.days) setErrors(e => ({ ...e, days: null }));
                        }}
                        disabled={isSaving}
                      >
                        <Text style={[styles.presetText, active && styles.presetTextActive]}>{p.label}</Text>
                      </PressableScale>
                    );
                  })}
                </View>
                <View style={styles.pillRow}>
                  {DAY_LABELS.map((lbl, idx) => {
                    const on = selectedDays.includes(idx);
                    return (
                      <PressableScale
                        key={idx}
                        style={[styles.pill, on && { backgroundColor: SECTOR_TINTS.day, borderColor: SECTOR_TINTS.day }]}
                        onPress={() => toggleDay(idx)}
                        disabled={isSaving}
                      >
                        <Text style={[styles.pillText, on && styles.pillTextActive]}>{lbl}</Text>
                      </PressableScale>
                    );
                  })}
                </View>
                {errors.days ? <Text style={styles.fieldError}>{errors.days}</Text> : null}
              </>
            )}

            {recurrence === 'interval_seconds' && (
              <>
                <Text style={[styles.label, { marginTop: 14 }]}>A cada</Text>
                <View style={styles.intervalRow}>
                  <TextInput
                    style={[styles.intervalInput, errors.interval && styles.inputError]}
                    value={intervalValue}
                    onChangeText={text => {
                      setIntervalValue(text.replace(/[^0-9]/g, ''));
                      if (errors.interval) setErrors(e => ({ ...e, interval: null }));
                    }}
                    keyboardType="number-pad"
                    maxLength={4}
                    editable={!isSaving}
                  />
                  {[
                    { key: 'hours', label: 'horas' },
                    { key: 'days', label: 'dias' },
                  ].map(u => {
                    const active = intervalUnit === u.key;
                    return (
                      <PressableScale
                        key={u.key}
                        style={[styles.unitChip, active && { backgroundColor: SECTOR_TINTS.type, borderColor: SECTOR_TINTS.type }]}
                        onPress={() => setIntervalUnit(u.key)}
                        disabled={isSaving}
                      >
                        <Text style={[styles.unitChipText, active && styles.unitChipTextActive]}>{u.label}</Text>
                      </PressableScale>
                    );
                  })}
                </View>
                {errors.interval ? <Text style={styles.fieldError}>{errors.interval}</Text> : null}
              </>
            )}

            {needsDate && (
              <>
                <Text style={[styles.label, { marginTop: 14 }]}>{recurrence === 'once' ? 'Data' : 'A partir de'}</Text>
                <Pressable
                  style={[styles.dateButton, errors.datetime && styles.inputError, calendarVisible && styles.dateButtonActive]}
                  onPress={toggleCalendar}
                  disabled={isSaving}
                >
                  <Text style={selectedDate ? styles.dateButtonText : styles.dateButtonPlaceholder}>
                    {selectedDate ? formatDateLabel(selectedDate) : 'Selecionar data'}
                  </Text>
                  <Text style={[styles.dateChevron, calendarVisible && styles.dateChevronOpen]}>›</Text>
                </Pressable>
                <AnimatedExpand visible={calendarVisible} expandedHeight={340}>
                  <CalendarPicker
                    selectedDate={selectedDate}
                    onSelect={handleDaySelect}
                    theme={theme}
                  />
                </AnimatedExpand>
              </>
            )}

            <Text style={[styles.label, { marginTop: 14 }]}>Horário</Text>
            <Pressable
              style={[styles.dateButton, timePickerVisible && styles.dateButtonActive]}
              onPress={toggleTimePicker}
              disabled={isSaving}
            >
              <Text style={styles.dateButtonText}>
                {IS_12H
                  ? `${String(pickerTime.hours).padStart(2, '0')}:${String(pickerTime.minutes).padStart(2, '0')} ${pickerTime.period}`
                  : `${String(pickerTime.hours).padStart(2, '0')}:${String(pickerTime.minutes).padStart(2, '0')}`}
              </Text>
              <Text style={[styles.dateChevron, timePickerVisible && styles.dateChevronOpen]}>›</Text>
            </Pressable>
            <AnimatedExpand visible={timePickerVisible} expandedHeight={175}>
              <TimePickerNative
                value={pickerTime}
                onChange={setPickerTime}
                is12h={IS_12H}
                theme={theme}
              />
            </AnimatedExpand>
            {errors.datetime ? <Text style={styles.fieldError}>{errors.datetime}</Text> : null}

            <View style={styles.buttons}>
              <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={handleClose} disabled={isSaving}>
                <Text style={[styles.btnText, styles.btnCancelText]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnSave]} onPress={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <LoadingDog size={28} color="#FFFFFF" />
                ) : (
                  <Text style={[styles.btnText, styles.btnSaveText]}>Salvar</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function ReminderItem({ reminder, onEdit, onDelete, onCreateTask, theme }) {
  const styles = useMemo(() => makeItemStyles(theme), [theme]);
  const pressAnim = useRef(new Animated.Value(1)).current;
  const hintAnim = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);
  const armedRef = useRef(false);

  const animatePress = toValue => {
    Animated.spring(pressAnim, { toValue, useNativeDriver: true, tension: 120, friction: 7 }).start();
  };

  useEffect(() => {
    if (holding) {
      hintAnim.setValue(0);
      Animated.spring(hintAnim, { toValue: 1, useNativeDriver: true, tension: 200, friction: 11 }).start();
    }
  }, [holding, hintAnim]);

  return (
    <Animated.View style={{ transform: [{ scale: pressAnim }] }}>
    {holding && (
      <Animated.View
        style={[styles.hintBalloon, { opacity: hintAnim, transform: [{ scale: hintAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }, { translateY: hintAnim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}
        pointerEvents="none"
      >
        <Text style={styles.hintBalloonText}>Soltar para criar tarefa</Text>
      </Animated.View>
    )}
    <Pressable
      style={[styles.item, holding && styles.itemHolding]}
      onPress={() => onEdit(reminder)}
      onPressIn={() => { armedRef.current = false; animatePress(0.985); }}
      onPressOut={() => {
        animatePress(1);
        if (armedRef.current) {
          armedRef.current = false;
          setHolding(false);
          onCreateTask(reminder);
        } else {
          setHolding(false);
        }
      }}
      onLongPress={() => { armedRef.current = true; setHolding(true); animatePress(1.03); }}
      delayLongPress={300}
    >
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
    </Pressable>
    </Animated.View>
  );
}

export default function RemindersScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const tabClear = useTabBarClearance();
  const entrance = useFocusEntrance(2);

  const [reminders, setReminders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [editingReminder, setEditingReminder] = useState(null);
  const [deletingReminder, setDeletingReminder] = useState(null);
  const [taskDraftName, setTaskDraftName] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const swipeTranslateX = useRef(new Animated.Value(0)).current;
  const hasLoadedRemindersRef = useRef(false);
  // Bloqueia o swipe de navegação (→ Chat) enquanto há modal/sheet aberto —
  // senão arrastar as pílulas/chips dentro do modal vaza pro PanResponder da
  // página e troca de tela sem querer.
  const overlayOpenRef = useRef(false);
  const screenWidth = Dimensions.get('window').width;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        !overlayOpenRef.current &&
        Math.abs(g.dx) > Math.abs(g.dy) * 2 && Math.abs(g.dx) > 20,
      onPanResponderMove: (_, g) => {
        if (g.dx > 0) {
          swipeTranslateX.setValue(Math.min(g.dx, screenWidth));
          tabPos.setValue(2 + Math.max(-g.dx / screenWidth, -1)); // Lembretes(2) → Chat(1)
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > 80) {
          Animated.timing(swipeTranslateX, {
            toValue: screenWidth,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            swipeTranslateX.setValue(0);
            navigation.navigate('Chat');
          });
          animateTabTo(1);
          return;
        }

        Animated.spring(swipeTranslateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
        animateTabTo(2);
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeTranslateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
        animateTabTo(2);
      },
    }),
  ).current;

  const fetchReminders = useCallback(async (isRefresh = false) => {
    if (!isRefresh && !hasLoadedRemindersRef.current) setIsLoading(true);
    setError(null);
    try {
      const data = await listReminders();
      setReminders(data.reminders || []);
      hasLoadedRemindersRef.current = true;
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

  // Mantém a guarda do swipe sincronizada: qualquer overlay aberto trava a
  // navegação por gesto horizontal da página.
  useEffect(() => {
    overlayOpenRef.current = !!(editingReminder || deletingReminder || taskDraftName || menuVisible);
  }, [editingReminder, deletingReminder, taskDraftName, menuVisible]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchReminders(true);
  };

  const handleDelete = reminder => {
    setDeletingReminder(reminder);
  };

  const handleCreateTask = reminder => {
    setTaskDraftName(reminder.title);
  };

  const handleCreateTaskFromReminder = async ({ name, priority, notes }) => {
    try {
      await createTask({ name, priority, notes, week_key: getWeekKey(new Date()) });
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível criar a tarefa.');
      console.warn('[RemindersScreen] criar tarefa:', err);
      return;
    }
    setTaskDraftName(null);
    Alert.alert('Pronto', 'Tarefa criada a partir do lembrete!');
  };

  const confirmDelete = async () => {
    const reminder = deletingReminder;
    if (!reminder) return;

    setDeletingReminder(null);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setReminders(prev => prev.filter(r => r.id !== reminder.id));
    try {
      await deleteReminder(reminder.id);
      const syncData = await syncReminders();
      await scheduleFromSync(syncData);
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível deletar o lembrete.');
      fetchReminders(true); // restaura caso a exclusão tenha falhado
      console.warn('[RemindersScreen] Erro ao deletar:', err);
    }
  };

  const handleEdit = reminder => {
    setEditingReminder(reminder);
  };

  const handleSaveEdit = async (id, data) => {
    try {
      const updated = await updateReminder(id, data);
      setReminders(prev => prev.map(r => (r.id === id ? updated : r)));
      setEditingReminder(null);
      const syncData = await syncReminders();
      await scheduleFromSync(syncData);
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível atualizar o lembrete.');
      console.warn('[RemindersScreen] Erro ao atualizar:', err);
    }
  };

  const { upcoming, recurring } = groupReminders(reminders);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <LoadingDog size={76} color={theme.primary} />
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
    <View style={styles.safe}>
    <Animated.View
      style={[styles.swipePage, { opacity: entrance.opacity, transform: [...entrance.transform, { translateX: swipeTranslateX }] }]}
      {...panResponder.panHandlers}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Meus Lembretes</Text>
          <PressableScale
            onPress={() => setMenuVisible(true)}
            hitSlop={{ top: 8, bottom: 8, left: 16, right: 8 }}
            accessibilityLabel="Menu"
            accessibilityRole="button"
          >
            <HamburgerIcon />
          </PressableScale>
        </View>
        <View style={styles.dateBlock}>
          <Text style={styles.todayDate}>{formatTodayLabel()}</Text>
          {reminders.length > 0 && (
            <Text style={styles.editHint}>Clique para editar · segure para criar tarefa</Text>
          )}
        </View>
        <View style={styles.listWrap}>
          {isRefreshing && (
            <View style={styles.refreshOverlay} pointerEvents="none">
              <LoadingDog size={42} color={theme.primary} />
            </View>
          )}
          <FlatList
            data={sections}
            keyExtractor={item => item.id}
            renderItem={({ item }) => {
              if (item.type === 'header') {
                return <Text style={styles.sectionHeader}>{item.title}</Text>;
              }
              return (
                <ReminderItem
                  reminder={item.reminder}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onCreateTask={handleCreateTask}
                  theme={theme}
                />
              );
            }}
            contentContainerStyle={[sections.length === 0 ? styles.emptyContainer : styles.listContent, { paddingBottom: tabClear }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor="transparent"
                colors={['transparent']}
                progressBackgroundColor="transparent"
              />
            }
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.emptyText}>Nenhum lembrete criado ainda.</Text>
                <Text style={styles.emptySubtext}>Peça ao chat para criar um!</Text>
              </View>
            }
          />
        </View>

        <EditReminderModal
          visible={!!editingReminder}
          reminder={editingReminder}
          onSave={handleSaveEdit}
          onClose={() => setEditingReminder(null)}
          theme={theme}
        />
        <ConfirmDialog
          visible={!!deletingReminder}
          title="Deletar lembrete"
          message={deletingReminder ? `Deseja deletar "${deletingReminder.title}"?` : ''}
          confirmText="Deletar"
          destructive
          onCancel={() => setDeletingReminder(null)}
          onConfirm={confirmDelete}
        />
        <TaskModal
          visible={!!taskDraftName}
          task={null}
          initialName={taskDraftName}
          onSave={handleCreateTaskFromReminder}
          onClose={() => setTaskDraftName(null)}
          theme={theme}
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
    safe: { flex: 1, backgroundColor: theme.background },
    swipePage: { flex: 1, backgroundColor: theme.background },
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
    dateBlock: {
      alignItems: 'center',
      paddingTop: 10,
    },
    todayDate: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.textSecondary,
      fontFamily: 'System',
      textAlign: 'center',
    },
    editHint: {
      fontSize: 12,
      color: theme.textSecondary,
      fontFamily: 'System',
      textAlign: 'center',
      paddingVertical: 8,
      fontStyle: 'italic',
    },
    listContent: { paddingBottom: 24 },
    emptyContainer: { flex: 1 },
    listWrap: { flex: 1, position: 'relative' },
    refreshOverlay: {
      position: 'absolute',
      top: 12,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 10,
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    sectionHeader: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      paddingHorizontal: 16,
      paddingTop: 24,
      paddingBottom: 8,
      fontFamily: 'System',
    },
    emptyText: {
      fontSize: 16,
      color: theme.textSecondary,
      fontFamily: 'System',
      textAlign: 'center',
    },
    emptySubtext: {
      fontSize: 14,
      color: theme.textPlaceholder,
      fontFamily: 'System',
      marginTop: 8,
      textAlign: 'center',
    },
    errorText: {
      fontSize: 15,
      color: theme.error,
      fontFamily: 'System',
      textAlign: 'center',
      paddingHorizontal: 24,
    },
    retryButton: {
      marginTop: 16,
      paddingHorizontal: 20,
      paddingVertical: 10,
      backgroundColor: theme.surface,
      borderRadius: 8,
    },
    retryButtonText: {
      color: theme.primary,
      fontSize: 14,
      fontWeight: '600',
      fontFamily: 'System',
    },
  });
}

function makeItemStyles(theme) {
  return StyleSheet.create({
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      marginHorizontal: 16,
      marginBottom: 8,
      borderRadius: 12,
      padding: 16,
    },
    itemHolding: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: theme.isDark ? 0.35 : 0.14,
      shadowRadius: 12,
      elevation: 5,
    },
    itemContent: { flex: 1 },
    itemTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.textPrimary,
      marginBottom: 4,
      fontFamily: 'System',
    },
    itemDate: {
      fontSize: 13,
      color: theme.textSecondary,
      fontFamily: 'System',
    },
    itemRecurrence: {
      fontSize: 12,
      color: theme.primary,
      marginTop: 2,
      fontFamily: 'System',
    },
    deleteButton: { marginLeft: 12, padding: 4 },
    deleteButtonText: { fontSize: 16, color: theme.textSecondary },
    hintBalloon: {
      position: 'absolute',
      top: -12,
      alignSelf: 'center',
      backgroundColor: theme.primary,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 14,
      zIndex: 30,
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.5,
      shadowRadius: 8,
      elevation: 8,
    },
    hintBalloonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', fontFamily: 'System' },
  });
}

function makeModalStyles(theme) {
  return StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      maxHeight: Dimensions.get('window').height * 0.88,
    },
    handleArea: {
      paddingTop: 14,
      paddingBottom: 16,
      alignItems: 'center',
    },
    handle: {
      width: 48,
      height: 5,
      backgroundColor: theme.border,
      borderRadius: 3,
    },
    scrollContent: {
      paddingHorizontal: 24,
      paddingBottom: 40,
    },
    sheetTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.textPrimary,
      fontFamily: 'System',
      marginBottom: 20,
      marginTop: 8,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSecondary,
      fontFamily: 'System',
      marginBottom: 6,
    },
    input: {
      backgroundColor: theme.surface2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.textPrimary,
      fontFamily: 'System',
      marginBottom: 14,
    },
    inputError: { borderColor: theme.error },
    dateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.surface2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 13,
      marginBottom: 2,
    },
    dateButtonActive: {
      borderColor: theme.primary,
    },
    dateButtonText: {
      fontSize: 15,
      color: theme.textPrimary,
      fontFamily: 'System',
    },
    dateButtonPlaceholder: {
      fontSize: 15,
      color: theme.textPlaceholder,
      fontFamily: 'System',
    },
    dateChevron: {
      fontSize: 20,
      color: theme.textSecondary,
      fontWeight: '600',
      transform: [{ rotate: '90deg' }],
    },
    dateChevronOpen: {
      transform: [{ rotate: '-90deg' }],
      color: theme.primary,
    },
    fieldError: {
      color: theme.error,
      fontSize: 12,
      marginTop: 4,
      marginBottom: 8,
      marginLeft: 4,
      fontFamily: 'System',
    },
    presetRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 10,
    },
    preset: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface2,
    },
    presetActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary,
    },
    presetText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSecondary,
      fontFamily: 'System',
    },
    presetTextActive: {
      color: '#FFFFFF',
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 4,
    },
    pill: {
      minWidth: 46,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface2,
      alignItems: 'center',
    },
    pillActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary,
    },
    pillText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSecondary,
      fontFamily: 'System',
    },
    pillTextActive: {
      color: '#FFFFFF',
    },
    typeScrollWrap: {
      position: 'relative',
    },
    typeScrollFade: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    typeFadeBand: {
      height: '100%',
    },
    typeRow: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 2,
      paddingRight: 8,
    },
    typeChip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface2,
    },
    typeChipActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary,
    },
    typeChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSecondary,
      fontFamily: 'System',
    },
    typeChipTextActive: { color: '#FFFFFF' },
    intervalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    intervalInput: {
      width: 72,
      backgroundColor: theme.surface2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.textPrimary,
      fontFamily: 'System',
      textAlign: 'center',
    },
    unitChip: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface2,
    },
    unitChipActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary,
    },
    unitChipText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.textSecondary,
      fontFamily: 'System',
    },
    unitChipTextActive: { color: '#FFFFFF' },
    buttons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 20,
    },
    btn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    btnCancel: {
      borderWidth: 1,
      borderColor: theme.border,
    },
    btnSave: {
      backgroundColor: theme.primary,
    },
    btnText: {
      fontSize: 15,
      fontWeight: '600',
      fontFamily: 'System',
    },
    btnCancelText: { color: theme.textSecondary },
    btnSaveText: { color: '#FFFFFF' },
  });
}
