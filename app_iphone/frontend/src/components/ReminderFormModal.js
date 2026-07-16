import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import CalendarPicker from './CalendarPicker';
import TimePickerNative from './TimePickerNative';
import LoadingDog from './LoadingDog';
import PreReminderPicker from './PreReminderPicker';
import AnimatedExpand from './AnimatedExpand';
import PressableScale from './PressableScale';
import { detectIs12h } from '../utils/timeFormat';
import { anim, getLocale, t, useI18n } from '../i18n';

const IS_12H = detectIs12h();

function formatDateLabel(date) {
  if (!date) return '';
  return anim(new Intl.DateTimeFormat(getLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(date));
}

function isoToPickerTime(isoString) {
  if (!isoString) return { hours: 9, minutes: 0, period: 'AM' };
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

// Listas de rótulos são FUNÇÕES: como constante, seriam avaliadas no import e
// ficariam presas ao idioma que estava valendo naquele momento.
// Convenção weekday(): Seg=0 .. Dom=6
const dayLabels = () => [
  t('day.mon'), t('day.tue'), t('day.wed'), t('day.thu'), t('day.fri'), t('day.sat'), t('day.sun'),
];
const dayPresets = () => [
  { key: 'weekdays', label: t('reminders.dayPreset.weekdays'), days: [0, 1, 2, 3, 4] },
  { key: 'weekend', label: t('reminders.dayPreset.weekend'), days: [5, 6] },
  { key: 'everyday', label: t('reminders.dayPreset.everyDay'), days: [0, 1, 2, 3, 4, 5, 6] },
];

// Tipos de recorrência expostos na edição. `key` casa com o backend.
const recurrenceTypes = () => [
  { key: 'once', label: t('reminders.recurrence.once') },
  { key: 'daily', label: t('reminders.recurrence.daily') },
  { key: 'weekly_days', label: t('reminders.recurrence.weeklyDays') },
  { key: 'weekly', label: t('reminders.recurrence.weekly') },
  { key: 'monthly', label: t('reminders.recurrence.monthly') },
  { key: 'interval_seconds', label: t('reminders.recurrence.interval') },
];

const intervalUnits = () => [
  { key: 'hours', label: t('reminders.unit.hours') },
  { key: 'days', label: t('reminders.unit.days') },
];

const TYPES_WITH_DATE = new Set(['once', 'weekly', 'monthly']);

const SECTOR_TINTS = { type: '#0A84FF', preset: '#3D6FF5', day: '#2AA9E0' };

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

// "Nenhum" / "1 aviso antes" / "N avisos antes".
function preCountLabel(n) {
  if (!n) return t('common.none');
  return n === 1 ? t('reminders.form.preCountOne') : t('reminders.form.preCountMany', { n });
}

/**
 * Modal de formulário de lembrete (criar/editar). Constrói o payload e chama
 * `onSave(payload)` — quem cria/atualiza é o pai (que conhece o id, se houver).
 * `reminder` é o objeto inicial (para criar, passe { title, recurrence, next_execution }).
 */
export default function ReminderFormModal({ visible, reminder, onSave, onClose, theme, isNew = false }) {
  // `lang` só está aqui pra assinar o contexto: sem consumir o contexto, trocar
  // de idioma não re-renderizaria este componente.
  const { lang, progresso } = useI18n();
  const [title, setTitle] = useState('');
  const [recurrence, setRecurrence] = useState('once');
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDays, setSelectedDays] = useState([]);
  const [pickerTime, setPickerTime] = useState({ hours: 9, minutes: 0, period: 'AM' });
  const [intervalValue, setIntervalValue] = useState('1');
  const [intervalUnit, setIntervalUnit] = useState('days');
  const [preReminders, setPreReminders] = useState([]);
  const [preOpen, setPreOpen] = useState(false);
  const [preTimeOpen, setPreTimeOpen] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const styles = useMemo(() => makeModalStyles(theme), [theme]);
  const needsDate = TYPES_WITH_DATE.has(recurrence);

  const tipos = useMemo(() => recurrenceTypes(), [lang, progresso]);
  const presetsDias = useMemo(() => dayPresets(), [lang, progresso]);
  const rotulosDias = useMemo(() => dayLabels(), [lang, progresso]);
  const unidades = useMemo(() => intervalUnits(), [lang, progresso]);

  // O sheet fica ancorado no rodapé e o teclado sobe POR CIMA dele — quem
  // empurra o conteúdo é o automaticallyAdjustKeyboardInsets do ScrollView.
  // Traduzir o sheet junto causava dupla compensação (espaço enorme) e
  // descolava ele do rodapé, deixando aparecer a tela preta atrás.
  const sheetTranslateY = useRef(new Animated.Value(400)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const scrollYRef = useRef(0);

  // Y de cada seção expansível (medido no onLayout do botão que a abre).
  const sectionY = useRef({});

  // O scroll tem que esperar a expansão TERMINAR: enquanto ela roda, o conteúdo
  // ainda está crescendo, o destino seria clampado pelo scroll máximo do momento
  // e re-scrollar a cada frame brigaria com a própria animação.
  const REVEAL_DELAY = 440; // ~duração do AnimatedExpand ao abrir

  const revealSection = key => {
    setTimeout(() => {
      const y = sectionY.current[key];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    }, REVEAL_DELAY);
  };

  // O rolete abre no fim do conteúdo — rola até embaixo.
  const revealEnd = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), REVEAL_DELAY);
  };

  const toggleSection = (key, isOpen, setOpen) => {
    const opening = !isOpen;
    setOpen(opening);
    if (opening) revealSection(key);
  };

  // O teclado nativo cola o campo focado na sua borda — dá um respiro. O delay
  // é curto de propósito: o empurrão anda junto com a animação do teclado, em
  // vez de acontecer depois que ela já terminou.
  const nudgeAboveKeyboard = () => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: scrollYRef.current + 28, animated: true }), 120);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 3,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) sheetTranslateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 60 || g.vy > 0.5) {
          Keyboard.dismiss();
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
      setTitle(reminder.title || '');
      setRecurrence(reminder.recurrence || 'once');
      const d = reminder.next_execution ? new Date(reminder.next_execution) : new Date();
      setSelectedDate(d);
      setSelectedDays(Array.isArray(reminder.days_of_week) ? reminder.days_of_week : []);
      setPickerTime(isoToPickerTime(reminder.next_execution));
      const iv = intervalFromSeconds(reminder.interval_seconds);
      setIntervalValue(iv.value);
      setIntervalUnit(iv.unit);
      setPreReminders(Array.isArray(reminder.pre_reminders) ? reminder.pre_reminders : []);
      setErrors({});
      setCalendarVisible(false);
      setTimePickerVisible(false);
      sheetTranslateY.setValue(400);
      overlayOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, tension: 68, friction: 11 }),
      ]).start();
    }
  }, [visible, reminder, sheetTranslateY, overlayOpacity]);

  const handleClose = () => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sheetTranslateY, { toValue: 400, duration: 220, useNativeDriver: true }),
    ]).start(onClose);
  };

  const toggleCalendar = () => {
    toggleSection('date', calendarVisible, setCalendarVisible);
    if (timePickerVisible) setTimePickerVisible(false);
  };

  const toggleTimePicker = () => {
    toggleSection('time', timePickerVisible, setTimePickerVisible);
    if (calendarVisible) setCalendarVisible(false);
  };

  const togglePre = () => toggleSection('pre', preOpen, setPreOpen);

  const handleDaySelect = day => {
    setSelectedDate(day);
    setCalendarVisible(false);
    if (errors.datetime) setErrors(e => ({ ...e, datetime: null }));
  };

  const toggleDay = day => {
    setSelectedDays(prev => (prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]));
    if (errors.days) setErrors(e => ({ ...e, days: null }));
  };

  const handleSave = async () => {
    const newErrors = {};
    if (!title.trim()) newErrors.title = t('reminders.error.titleRequired');
    if (recurrence === 'weekly_days' && selectedDays.length === 0) newErrors.days = t('reminders.error.pickDay');
    if (needsDate && !selectedDate) newErrors.datetime = t('reminders.error.pickDate');
    let intervalSeconds = null;
    if (recurrence === 'interval_seconds') {
      const n = parseInt(intervalValue, 10);
      if (!n || n <= 0) newErrors.interval = t('reminders.error.interval');
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
      const payload = { title: title.trim(), scheduled_time: finalDate.toISOString(), recurrence };
      if (recurrence === 'weekly_days') payload.days_of_week = [...selectedDays].sort((a, b) => a - b);
      if (recurrence === 'interval_seconds') payload.interval_seconds = intervalSeconds;
      payload.pre_reminders = preReminders;
      await onSave(payload);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
          <View style={styles.handleArea} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets
            scrollEventThrottle={16}
            onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
          >

            <Text style={styles.sheetTitle}>{isNew ? t('reminders.form.newTitle') : t('reminders.form.editTitle')}</Text>

            <Text style={styles.label}>{t('reminders.form.titleLabel')}</Text>
            <TextInput
              style={[styles.input, errors.title && styles.inputError]}
              value={title}
              onChangeText={text => { setTitle(text); if (errors.title) setErrors(e => ({ ...e, title: null })); }}
              placeholder={t('reminders.form.titlePlaceholder')}
              placeholderTextColor={theme.textPlaceholder}
              onFocus={nudgeAboveKeyboard}
              autoCapitalize="sentences"
              editable={!isSaving}
            />
            {errors.title ? <Text style={styles.fieldError}>{errors.title}</Text> : null}

            <Text style={styles.label}>{t('reminders.form.recurrenceLabel')}</Text>
            <View style={styles.typeScrollWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow} keyboardShouldPersistTaps="handled">
                {tipos.map(tipo => {
                  const active = recurrence === tipo.key;
                  return (
                    <PressableScale
                      key={tipo.key}
                      style={[styles.typeChip, active && { backgroundColor: SECTOR_TINTS.type, borderColor: SECTOR_TINTS.type }]}
                      onPress={() => {
                        setRecurrence(tipo.key);
                        setCalendarVisible(false);
                        setErrors(e => ({ ...e, days: null, datetime: null, interval: null }));
                      }}
                      disabled={isSaving}
                    >
                      <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>{tipo.label}</Text>
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

            <AnimatedExpand visible={recurrence === 'weekly_days'}>
              <>
                <Text style={[styles.label, { marginTop: 14 }]}>{t('reminders.form.weekdaysLabel')}</Text>
                <View style={styles.presetRow}>
                  {presetsDias.map(p => {
                    const active = sameDays(selectedDays, p.days);
                    return (
                      <PressableScale
                        key={p.key}
                        style={[styles.preset, active && { backgroundColor: SECTOR_TINTS.preset, borderColor: SECTOR_TINTS.preset }]}
                        onPress={() => {
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
                  {rotulosDias.map((lbl, idx) => {
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
            </AnimatedExpand>

            <AnimatedExpand visible={recurrence === 'interval_seconds'}>
              <>
                <Text style={[styles.label, { marginTop: 14 }]}>{t('reminders.form.everyLabel')}</Text>
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
                    onFocus={nudgeAboveKeyboard}
                    editable={!isSaving}
                  />
                  {unidades.map(u => {
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
            </AnimatedExpand>

            <AnimatedExpand visible={needsDate}>
              <>
                <Text style={[styles.label, { marginTop: 14 }]}>
                  {recurrence === 'once' ? t('reminders.form.dateLabel') : t('reminders.form.startingLabel')}
                </Text>
                <Pressable
                  style={[styles.dateButton, errors.datetime && styles.inputError, calendarVisible && styles.dateButtonActive]}
                  onPress={toggleCalendar}
                  onLayout={e => { sectionY.current.date = e.nativeEvent.layout.y; }}
                  disabled={isSaving}
                >
                  <Text style={selectedDate ? styles.dateButtonText : styles.dateButtonPlaceholder}>
                    {selectedDate ? formatDateLabel(selectedDate) : t('reminders.form.selectDate')}
                  </Text>
                  <Text style={[styles.dateChevron, calendarVisible && styles.dateChevronOpen]}>›</Text>
                </Pressable>
                <AnimatedExpand visible={calendarVisible}>
                  <CalendarPicker selectedDate={selectedDate} onSelect={handleDaySelect} theme={theme} />
                </AnimatedExpand>
              </>
            </AnimatedExpand>

            <Text style={[styles.label, { marginTop: 14 }]}>{t('reminders.form.timeLabel')}</Text>
            <Pressable
              style={[styles.dateButton, timePickerVisible && styles.dateButtonActive]}
              onPress={toggleTimePicker}
              onLayout={e => { sectionY.current.time = e.nativeEvent.layout.y; }}
              disabled={isSaving}
            >
              <Text style={styles.dateButtonText}>
                {IS_12H
                  ? `${String(pickerTime.hours).padStart(2, '0')}:${String(pickerTime.minutes).padStart(2, '0')} ${pickerTime.period}`
                  : `${String(pickerTime.hours).padStart(2, '0')}:${String(pickerTime.minutes).padStart(2, '0')}`}
              </Text>
              <Text style={[styles.dateChevron, timePickerVisible && styles.dateChevronOpen]}>›</Text>
            </Pressable>
            <AnimatedExpand visible={timePickerVisible}>
              <TimePickerNative value={pickerTime} onChange={setPickerTime} is12h={IS_12H} theme={theme} />
            </AnimatedExpand>
            {errors.datetime ? <Text style={styles.fieldError}>{errors.datetime}</Text> : null}

            <Text style={[styles.label, { marginTop: 14 }]}>{t('reminders.form.preLabel')}</Text>
            <Pressable
              style={[styles.dateButton, preOpen && styles.dateButtonActive]}
              onPress={togglePre}
              onLayout={e => { sectionY.current.pre = e.nativeEvent.layout.y; }}
            >
              <Text style={styles.dateButtonText}>{preCountLabel(preReminders.length)}</Text>
              <Text style={[styles.dateChevron, preOpen && styles.dateChevronOpen]}>›</Text>
            </Pressable>
            <AnimatedExpand visible={preOpen}>
              <View style={{ paddingTop: 10 }}>
                <PreReminderPicker
                  value={preReminders}
                  onChange={setPreReminders}
                  theme={theme}
                  defaultTime={pickerTime}
                  is12h={IS_12H}
                  timeOpen={preTimeOpen}
                  onToggleTime={open => { setPreTimeOpen(open); if (open) revealEnd(); }}
                  onInputFocus={nudgeAboveKeyboard}
                />
              </View>
            </AnimatedExpand>

            <View style={styles.buttons}>
              <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={handleClose} disabled={isSaving}>
                <Text style={[styles.btnText, styles.btnCancelText]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnSave]} onPress={handleSave} disabled={isSaving}>
                {isSaving ? <LoadingDog size={28} color="#FFFFFF" /> : <Text style={[styles.btnText, styles.btnSaveText]}>{t('common.save')}</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function makeModalStyles(theme) {
  return StyleSheet.create({
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: theme.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: Dimensions.get('window').height * 0.88 },
    handleArea: { paddingTop: 14, paddingBottom: 16, alignItems: 'center' },
    handle: { width: 48, height: 5, backgroundColor: theme.border, borderRadius: 3 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
    sheetTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary, fontFamily: 'System', marginBottom: 20, marginTop: 8 },
    label: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, fontFamily: 'System', marginBottom: 6 },
    input: { backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.textPrimary, fontFamily: 'System', marginBottom: 14 },
    inputError: { borderColor: theme.error },
    dateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 2 },
    dateButtonActive: { borderColor: theme.primary },
    dateButtonText: { fontSize: 15, color: theme.textPrimary, fontFamily: 'System' },
    dateButtonPlaceholder: { fontSize: 15, color: theme.textPlaceholder, fontFamily: 'System' },
    dateChevron: { fontSize: 20, color: theme.textSecondary, fontWeight: '600', transform: [{ rotate: '90deg' }] },
    dateChevronOpen: { transform: [{ rotate: '-90deg' }], color: theme.primary },
    fieldError: { color: theme.error, fontSize: 12, marginTop: 4, marginBottom: 8, marginLeft: 4, fontFamily: 'System' },
    presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    preset: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2 },
    presetText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, fontFamily: 'System' },
    presetTextActive: { color: '#FFFFFF' },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    pill: { minWidth: 46, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2, alignItems: 'center' },
    pillText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, fontFamily: 'System' },
    pillTextActive: { color: '#FFFFFF' },
    typeScrollWrap: { position: 'relative' },
    typeScrollFade: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'stretch' },
    typeFadeBand: { height: '100%' },
    typeRow: { flexDirection: 'row', gap: 8, paddingVertical: 2, paddingRight: 8 },
    typeChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2 },
    typeChipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, fontFamily: 'System' },
    typeChipTextActive: { color: '#FFFFFF' },
    intervalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    intervalInput: { width: 72, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: theme.textPrimary, fontFamily: 'System', textAlign: 'center' },
    unitChip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2 },
    unitChipText: { fontSize: 14, fontWeight: '600', color: theme.textSecondary, fontFamily: 'System' },
    unitChipTextActive: { color: '#FFFFFF' },
    buttons: { flexDirection: 'row', gap: 12, marginTop: 20 },
    btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
    btnCancel: { borderWidth: 1, borderColor: theme.border },
    btnSave: { backgroundColor: theme.primary },
    btnText: { fontSize: 15, fontWeight: '600', fontFamily: 'System' },
    btnCancelText: { color: theme.textSecondary },
    btnSaveText: { color: '#FFFFFF' },
  });
}
