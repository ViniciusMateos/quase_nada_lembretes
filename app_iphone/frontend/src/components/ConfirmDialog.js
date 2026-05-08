import { useEffect } from 'react';
import { Alert } from 'react-native';

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  destructive = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!visible) return;
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: 'cancel', onPress: onCancel },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
      ],
      { cancelable: false },
    );
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
