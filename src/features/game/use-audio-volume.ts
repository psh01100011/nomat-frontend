import { useCallback, useEffect, useState } from 'react';

const AUDIO_VOLUME_KEY = 'nomat.audioVolume';

export function useAudioVolume() {
  const [volume, setVolumeState] = useState(() => readAudioVolume());

  useEffect(() => {
    localStorage.setItem(AUDIO_VOLUME_KEY, String(volume));
  }, [volume]);

  const setVolume = useCallback((nextVolume: number) => {
    setVolumeState(Math.max(0, Math.min(1, nextVolume)));
  }, []);

  return { volume, setVolume };
}

function readAudioVolume() {
  const stored = Number(localStorage.getItem(AUDIO_VOLUME_KEY));
  return Number.isFinite(stored) ? Math.max(0, Math.min(1, stored)) : 0.8;
}
