import { Platform } from 'react-native';
import { Audio } from 'expo-av';

const SEND_SOUND = require('../../assets/sound-send.wav');
const RECEIVE_SOUND = require('../../assets/sound-receive.wav');

let audioModeReady = false;
let webAudioContext = null;
let sendSound = null;
let receiveSound = null;
let preloadPromise = null;

function getWebAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!webAudioContext) webAudioContext = new AudioContext();
  if (webAudioContext.state === 'suspended') {
    webAudioContext.resume().catch(() => {});
  }
  return webAudioContext;
}

function playWebTone(kind) {
  const context = getWebAudioContext();
  if (!context) return;

  const now = context.currentTime;
  const gain = context.createGain();
  gain.connect(context.destination);

  if (kind === 'send') {
    const osc = context.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.2);
    return;
  }

  const first = context.createOscillator();
  const second = context.createOscillator();
  first.type = 'sine';
  second.type = 'sine';
  first.frequency.setValueAtTime(880, now);
  second.frequency.setValueAtTime(1175, now + 0.09);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.09);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

  first.connect(gain);
  second.connect(gain);
  first.start(now);
  first.stop(now + 0.13);
  second.start(now + 0.09);
  second.stop(now + 0.27);
}

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
  } catch (error) {
    console.warn('[sounds] Nao foi possivel configurar audio:', error);
  }
}

async function loadNativeSounds() {
  if (Platform.OS === 'web') return;
  await ensureAudioMode();

  if (!sendSound) {
    const result = await Audio.Sound.createAsync(SEND_SOUND, {
      shouldPlay: false,
      volume: 0.9,
    });
    sendSound = result.sound;
  }

  if (!receiveSound) {
    const result = await Audio.Sound.createAsync(RECEIVE_SOUND, {
      shouldPlay: false,
      volume: 0.78,
    });
    receiveSound = result.sound;
  }
}

export function preloadSounds() {
  if (Platform.OS === 'web') return Promise.resolve();
  if (!preloadPromise) {
    preloadPromise = loadNativeSounds().catch(error => {
      preloadPromise = null;
      console.warn('[sounds] Nao foi possivel carregar sons:', error);
    });
  }
  return preloadPromise;
}

async function playNativeSound(kind) {
  try {
    await preloadSounds();
    const sound = kind === 'send' ? sendSound : receiveSound;
    if (!sound) return;
    await sound.stopAsync().catch(() => {});
    await sound.setPositionAsync(0);
    await sound.replayAsync();
  } catch (error) {
    console.warn('[sounds] Nao foi possivel tocar som:', error);
  }
}

export function playSendSound() {
  if (Platform.OS === 'web') {
    playWebTone('send');
    return;
  }
  return playNativeSound('send');
}

export function playReceiveSound() {
  if (Platform.OS === 'web') {
    playWebTone('receive');
    return;
  }
  return playNativeSound('receive');
}
