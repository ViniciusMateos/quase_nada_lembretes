import React, { useCallback } from 'react';
import { View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { detectIs12h } from '../utils/timeFormat';

const IS_12H = detectIs12h();

function pickerTimeToDate(pt) {
  const d = new Date();
  let h = pt.hours;
  if (IS_12H) {
    if (pt.period === 'PM' && h !== 12) h += 12;
    if (pt.period === 'AM' && h === 12) h = 0;
  }
  d.setHours(h, pt.minutes, 0, 0);
  return d;
}

function dateToPickerTime(date) {
  const rawH = date.getHours();
  const min = date.getMinutes();
  if (!IS_12H) return { hours: rawH, minutes: min, period: 'AM' };
  const period = rawH >= 12 ? 'PM' : 'AM';
  return { hours: rawH % 12 || 12, minutes: min, period };
}

export default function TimePickerNative({ value, onChange, theme }) {
  const handleChange = useCallback((_, date) => {
    if (date) onChange(dateToPickerTime(date));
  }, [onChange]);

  return (
    <View style={{
      marginTop: 8,
      backgroundColor: theme.surface2,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
    }}>
      <DateTimePicker
        value={pickerTimeToDate(value)}
        mode="time"
        display="spinner"
        onChange={handleChange}
        locale={IS_12H ? undefined : 'pt-BR'}
        textColor={theme.textPrimary}
        style={{ height: 132 }}
      />
    </View>
  );
}
