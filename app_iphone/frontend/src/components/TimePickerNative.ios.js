import React, { useCallback } from 'react';
import { View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { detectIs12h } from '../utils/timeFormat';
import { getLocale } from '../i18n';

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
      // O UIDatePicker se mede sozinho: deixamos ele com a largura natural e
      // centralizamos aqui, em vez de esticar (esticar é o que jogava as rodas
      // pro canto, porque o iOS mantém o layout interno no tamanho intrínseco).
      alignItems: 'center',
    }}>
      <DateTimePicker
        value={pickerTimeToDate(value)}
        mode="time"
        display="spinner"
        onChange={handleChange}
        // NÃO passar locale: o UIDatePicker deriva o formato de hora do locale,
        // e mandar 'en-US' (app em inglês) forçava 12h com AM/PM mesmo com o
        // iPhone em 24h. Sem locale, ele usa o do sistema — que é justamente a
        // regra: formato de hora vem do APARELHO, não do idioma do app.
        locale={undefined}
        textColor={theme.textPrimary}
        // Altura próxima da natural do spinner (~200). Com 132 ele era espremido
        // e o iOS remontava as rodas fora de posição.
        style={{ height: 196, alignSelf: 'center' }}
      />
    </View>
  );
}
