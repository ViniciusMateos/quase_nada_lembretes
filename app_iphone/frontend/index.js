import { registerRootComponent } from 'expo';
import notifee from '@notifee/react-native';

import App from './App';
import { handleNotificationEvent } from './src/services/notifications';
// Importa para registrar a task de background (defineTask roda no nível do módulo).
import './src/services/backgroundTasks';

// Handler de eventos em segundo plano (ex.: toque nas ações de "adiar" com o app
// fechado/minimizado). Precisa ser registrado no nível do módulo, fora do React.
notifee.onBackgroundEvent(handleNotificationEvent);

registerRootComponent(App);
