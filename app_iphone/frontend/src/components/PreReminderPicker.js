import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import PressableScale from './PressableScale';
import TimePickerNative from './TimePickerNative';
import { t, useI18n } from '../i18n';

// Pré-lembretes: { type:'offset', seconds } ("X antes") ou
// { type:'day', days, hour, minute } ("N dias antes, às HH:MM").
//
// Os rótulos guardam a CHAVE, não o texto: a lista é avaliada no import e um
// texto ficaria congelado no idioma que estava valendo naquela hora.
const PRESETS = [
  { labelKey: 'reminders.pre.preset.30min', s: 1800 },
  { labelKey: 'reminders.pre.preset.1h', s: 3600 },
  { labelKey: 'reminders.pre.preset.3h', s: 10800 },
  { labelKey: 'reminders.pre.preset.1day', s: 86400 },
  { labelKey: 'reminders.pre.preset.1week', s: 604800 },
];
const UNITS = [
  { key: 'min', labelKey: 'reminders.pre.unit.min', mult: 60 },
  { key: 'h', labelKey: 'reminders.pre.unit.h', mult: 3600 },
  { key: 'd', labelKey: 'reminders.pre.unit.d', mult: 86400 },
];
const PRESET_SET = new Set(PRESETS.map(p => p.s));
const isPreset = pr => pr.type === 'offset' && PRESET_SET.has(pr.seconds);
const sameOffset = (a, s) => a.type === 'offset' && a.seconds === s;

function labelFor(pr) {
  if (pr.type === 'offset') {
    const s = pr.seconds;
    if (s % 604800 === 0) return t('reminders.pre.label.weeks', { n: s / 604800 });
    if (s % 86400 === 0) {
      const d = s / 86400;
      return d === 1 ? t('reminders.pre.label.dayOne') : t('reminders.pre.label.days', { n: d });
    }
    if (s % 3600 === 0) return t('reminders.pre.label.hours', { n: s / 3600 });
    return t('reminders.pre.label.minutes', { n: Math.round(s / 60) });
  }
  const hh = String(pr.hour).padStart(2, '0');
  const mm = String(pr.minute).padStart(2, '0');
  const time = `${hh}:${mm}`;
  return pr.days === 1
    ? t('reminders.pre.label.dayAtOne', { time })
    : t('reminders.pre.label.dayAt', { n: pr.days, time });
}

// Converte o valor do rolete ({hours,minutes,period}) pra 24h.
function toH24(pt, is12h) {
  let h = pt.hours;
  if (is12h) {
    if (pt.period === 'PM' && h !== 12) h += 12;
    if (pt.period === 'AM' && h === 12) h = 0;
  }
  return { hour: h % 24, minute: pt.minutes };
}

function fmt(pt, is12h) {
  const { hour, minute } = toH24(pt, is12h);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// `timeOpen` é CONTROLADO pelo pai de propósito. O AnimatedExpand mede a altura
// numa cópia invisível do conteúdo; se o rolete abrisse por estado interno, a
// cópia continuaria com ele fechado, a altura medida não cresceria e o rolete
// ficaria clipado — foi exatamente o bug de "clico e não aparece nada".
export default function PreReminderPicker({
  value = [],
  onChange,
  theme,
  defaultTime,          // horário do lembrete — vira o default do "dia antes"
  is12h = false,
  timeOpen = false,
  onToggleTime,
  onInputFocus,         // pai dá um respiro entre o campo e o teclado
}) {
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [customVal, setCustomVal] = useState('');
  const [customUnit, setCustomUnit] = useState('min');
  const [dayDays, setDayDays] = useState('1');
  const [dayTime, setDayTime] = useState(defaultTime || { hours: 9, minutes: 0, period: 'AM' });

  // Default do horário = o horário do próprio lembrete (não um 22h fixo).
  useEffect(() => {
    if (defaultTime) setDayTime(defaultTime);
  }, [defaultTime]);

  const add = pr => onChange([...value, pr]);
  const removeAt = i => onChange(value.filter((_, idx) => idx !== i));
  const togglePreset = s => {
    const idx = value.findIndex(v => sameOffset(v, s));
    if (idx >= 0) removeAt(idx);
    else add({ type: 'offset', seconds: s });
  };
  const addCustom = () => {
    const n = parseInt(customVal, 10);
    if (!n || n <= 0) return;
    add({ type: 'offset', seconds: n * UNITS.find(u => u.key === customUnit).mult });
    setCustomVal('');
  };
  const addDay = () => {
    const d = Math.max(1, parseInt(dayDays, 10) || 1);
    const { hour, minute } = toH24(dayTime, is12h);
    add({ type: 'day', days: d, hour, minute });
    if (timeOpen) onToggleTime?.(false);
  };

  // Só os que NÃO são preset viram chip removível (evita mostrar duplicado).
  const extras = value.map((pr, i) => ({ pr, i })).filter(({ pr }) => !isPreset(pr));

  return (
    <View style={styles.wrap}>
      <Text style={styles.sub}>{t('reminders.pre.quick')}</Text>
      <View style={styles.chipsRow}>
        {PRESETS.map(p => {
          const active = value.some(v => sameOffset(v, p.s));
          return (
            <PressableScale key={p.s} onPress={() => togglePreset(p.s)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(p.labelKey)}</Text>
            </PressableScale>
          );
        })}
      </View>

      {extras.length > 0 && (
        <>
          <Text style={styles.sub}>{t('reminders.pre.added')}</Text>
          <View style={styles.chipsRow}>
            {extras.map(({ pr, i }) => (
              <PressableScale key={i} onPress={() => removeAt(i)} style={styles.selChip}>
                <Text style={styles.selText}>{labelFor(pr)}</Text>
                <Text style={styles.selX}>×</Text>
              </PressableScale>
            ))}
          </View>
        </>
      )}

      <Text style={styles.sub}>{t('reminders.pre.custom')}</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.num}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={theme.textPlaceholder}
          value={customVal}
          onChangeText={t => setCustomVal(t.replace(/[^0-9]/g, ''))}
          onFocus={onInputFocus}
        />
        <View style={styles.seg}>
          {UNITS.map(u => (
            <PressableScale key={u.key} onPress={() => setCustomUnit(u.key)} style={[styles.segItem, customUnit === u.key && styles.segItemActive]}>
              <Text style={[styles.segText, customUnit === u.key && styles.segTextActive]}>{t(u.labelKey)}</Text>
            </PressableScale>
          ))}
        </View>
        <PressableScale onPress={addCustom} applyStyleToRoot style={styles.add}>
          <Text style={styles.addText}>{t('reminders.pre.add')}</Text>
        </PressableScale>
      </View>

      <Text style={styles.sub}>{t('reminders.pre.fixedDay')}</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.numSm}
          keyboardType="number-pad"
          value={dayDays}
          onChangeText={t => setDayDays(t.replace(/[^0-9]/g, ''))}
          onFocus={onInputFocus}
        />
        <Text style={styles.rowLabel}>{t('reminders.pre.daysBeforeAt')}</Text>
        <PressableScale onPress={() => onToggleTime?.(!timeOpen)} style={[styles.timeBtn, timeOpen && styles.timeBtnActive]}>
          <Text style={styles.timeText}>{fmt(dayTime, is12h)}</Text>
        </PressableScale>
        <PressableScale onPress={addDay} applyStyleToRoot style={styles.add}>
          <Text style={styles.addText}>{t('reminders.pre.add')}</Text>
        </PressableScale>
      </View>

      {/* Sem AnimatedExpand aqui: quem anima o crescimento é a seção "Me avise
          antes" lá de fora. Dois expands aninhados brigariam pela mesma altura. */}
      {timeOpen ? (
        <TimePickerNative value={dayTime} onChange={setDayTime} is12h={is12h} theme={theme} />
      ) : null}
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    wrap: { gap: 4 },
    sub: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: 10,
      marginBottom: 6,
      fontFamily: 'System',
    },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18,
      borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2,
    },
    chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, fontFamily: 'System' },
    chipTextActive: { color: '#FFFFFF' },
    selChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18,
      backgroundColor: theme.primary,
    },
    selText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', fontFamily: 'System' },
    selX: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowLabel: { color: theme.textSecondary, fontSize: 13, flexShrink: 1, fontFamily: 'System' },
    num: {
      width: 56, paddingVertical: 9, borderRadius: 10,
      borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2,
      color: theme.textPrimary, fontSize: 15, textAlign: 'center', fontFamily: 'System',
    },
    numSm: {
      width: 44, paddingVertical: 9, borderRadius: 10,
      borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2,
      color: theme.textPrimary, fontSize: 15, textAlign: 'center', fontFamily: 'System',
    },
    seg: {
      flexDirection: 'row', borderRadius: 12, padding: 2, gap: 2,
      backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border,
    },
    segItem: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10 },
    segItemActive: { backgroundColor: theme.primary },
    segText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, fontFamily: 'System' },
    segTextActive: { color: '#FFFFFF' },
    timeBtn: {
      paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10,
      borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2,
    },
    timeBtnActive: { borderColor: theme.primary },
    timeText: { fontSize: 15, fontWeight: '600', color: theme.textPrimary, fontFamily: 'System' },
    add: {
      marginLeft: 'auto', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 12,
      borderWidth: 1, borderColor: theme.primary,
    },
    addText: { color: theme.primary, fontSize: 13, fontWeight: '700', fontFamily: 'System' },
  });
}
