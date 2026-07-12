import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';

// Pré-lembretes: cada item é { type:'offset', seconds } ("X antes") ou
// { type:'day', days, hour, minute } ("N dias antes, às HH:MM").
const PRESETS = [
  { label: '30 min', s: 1800 },
  { label: '1 h', s: 3600 },
  { label: '3 h', s: 10800 },
  { label: '1 dia', s: 86400 },
  { label: '1 sem', s: 604800 },
];
const UNITS = [
  { key: 'min', label: 'min', mult: 60 },
  { key: 'h', label: 'h', mult: 3600 },
  { key: 'd', label: 'dias', mult: 86400 },
];

const sameOffset = (a, s) => a.type === 'offset' && a.seconds === s;

function labelFor(pr) {
  if (pr.type === 'offset') {
    const s = pr.seconds;
    if (s % 604800 === 0) { const w = s / 604800; return `${w} sem antes`; }
    if (s % 86400 === 0) { const d = s / 86400; return `${d} dia${d > 1 ? 's' : ''} antes`; }
    if (s % 3600 === 0) return `${s / 3600} h antes`;
    return `${Math.round(s / 60)} min antes`;
  }
  const hh = String(pr.hour).padStart(2, '0');
  const mm = String(pr.minute).padStart(2, '0');
  return `${pr.days} dia${pr.days > 1 ? 's' : ''} antes · ${hh}:${mm}`;
}

export default function PreReminderPicker({ value = [], onChange, theme }) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [customVal, setCustomVal] = useState('');
  const [customUnit, setCustomUnit] = useState('min');
  const [dayDays, setDayDays] = useState('1');
  const [dayHour, setDayHour] = useState('22');
  const [dayMin, setDayMin] = useState('00');

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
    const unit = UNITS.find(u => u.key === customUnit);
    add({ type: 'offset', seconds: n * unit.mult });
    setCustomVal('');
  };
  const addDay = () => {
    const d = Math.max(1, parseInt(dayDays, 10) || 1);
    const h = Math.min(23, Math.max(0, parseInt(dayHour, 10) || 0));
    const m = Math.min(59, Math.max(0, parseInt(dayMin, 10) || 0));
    add({ type: 'day', days: d, hour: h, minute: m });
  };

  return (
    <View>
      {value.length > 0 && (
        <View style={styles.selectedWrap}>
          {value.map((pr, i) => (
            <Pressable key={i} onPress={() => removeAt(i)} style={styles.selectedChip}>
              <Text style={styles.selectedText}>{labelFor(pr)}</Text>
              <Text style={styles.selectedX}>×</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.presetWrap}>
        {PRESETS.map(p => {
          const active = value.some(v => sameOffset(v, p.s));
          return (
            <Pressable key={p.s} onPress={() => togglePreset(p.s)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label} antes</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.row}>
        <TextInput
          style={styles.numInput}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={theme.textPlaceholder}
          value={customVal}
          onChangeText={t => setCustomVal(t.replace(/[^0-9]/g, ''))}
        />
        {UNITS.map(u => (
          <Pressable key={u.key} onPress={() => setCustomUnit(u.key)} style={[styles.unit, customUnit === u.key && styles.unitActive]}>
            <Text style={[styles.unitText, customUnit === u.key && styles.unitTextActive]}>{u.label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={addCustom} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ antes</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        <TextInput style={styles.numInputSm} keyboardType="number-pad" value={dayDays} onChangeText={t => setDayDays(t.replace(/[^0-9]/g, ''))} />
        <Text style={styles.rowLabel}>dia(s) antes, às</Text>
        <TextInput style={styles.numInputSm} keyboardType="number-pad" value={dayHour} onChangeText={t => setDayHour(t.replace(/[^0-9]/g, ''))} />
        <Text style={styles.colon}>:</Text>
        <TextInput style={styles.numInputSm} keyboardType="number-pad" value={dayMin} onChangeText={t => setDayMin(t.replace(/[^0-9]/g, ''))} />
        <Pressable onPress={addDay} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    selectedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    selectedChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingVertical: 7, paddingHorizontal: 12, borderRadius: 18,
      backgroundColor: theme.primary,
    },
    selectedText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', fontFamily: 'System' },
    selectedX: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
    presetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    chip: {
      paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18,
      borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2,
    },
    chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, fontFamily: 'System' },
    chipTextActive: { color: '#FFFFFF' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    rowLabel: { color: theme.textSecondary, fontSize: 13, fontFamily: 'System' },
    numInput: {
      width: 52, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10,
      borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2,
      color: theme.textPrimary, fontSize: 15, textAlign: 'center', fontFamily: 'System',
    },
    numInputSm: {
      width: 44, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10,
      borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2,
      color: theme.textPrimary, fontSize: 15, textAlign: 'center', fontFamily: 'System',
    },
    colon: { color: theme.textPrimary, fontSize: 16, fontWeight: '700' },
    unit: {
      paddingVertical: 7, paddingHorizontal: 10, borderRadius: 14,
      borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2,
    },
    unitActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    unitText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, fontFamily: 'System' },
    unitTextActive: { color: '#FFFFFF' },
    addBtn: {
      marginLeft: 'auto', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14,
      borderWidth: 1, borderColor: theme.primary,
    },
    addBtnText: { color: theme.primary, fontSize: 13, fontWeight: '700', fontFamily: 'System' },
  });
}
