import { Vibration } from 'react-native';
import { Audio } from 'expo-av';

const ASSETS = {
  send: require('../../assets/sound-send.wav'),
  receive: require('../../assets/sound-receive.wav'),
  reminder: require('../../assets/sound-reminder.wav'),
};

let audioModeReady = false;

async function ensureAudioMode() {
  if (audioModeReady) return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      staysActiveInBackground: false,
    });
    audioModeReady = true;
    console.log('[sounds] Audio mode configurado');
  } catch (error) {
    console.error('[sounds] Erro ao configurar audio mode:', error);
  }
}

async function playSound(kind) {
  try {
    await ensureAudioMode();
    console.log(`[sounds] Carregando som: ${kind}`);
    const { sound } = await Audio.Sound.createAsync(ASSETS[kind], {
      shouldPlay: true,
      volume: 1.0,
    });
    console.log(`[sounds] Tocando som: ${kind}`);
    sound.setOnPlaybackStatusUpdate(status => {
      if (status.didJustFinish || status.error) {
        if (status.error) console.error(`[sounds] Erro na reprodução: ${status.error}`);
        sound.unloadAsync().catch(() => {});
      }
    });
  } catch (error) {
    console.error(`[sounds] Erro ao tocar ${kind}:`, error);
  }
}

// Preload não é mais necessário com o novo approach — mantido por compatibilidade
export function preloadSounds() {
  ensureAudioMode();
}

export function playSendSound() {
  return playSound('send');
}

export function playReceiveSound() {
  Vibration.vibrate(50);
  return playSound('receive');
}

export function playReminderSound() {
  Vibration.vibrate([100, 200, 100, 200]);
  return playSound('reminder');
}
