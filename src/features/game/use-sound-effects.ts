import { useCallback, useEffect, useRef, useState } from 'react';

const SOUND_VOLUME_KEY = 'nomat.soundVolume';

const SFX = {
  chat: '/sfx/chat.wav',
  correct: '/sfx/correct.wav',
  hint: '/sfx/hint-reveal.wav',
  skip: '/sfx/skip-vote.wav',
  questionEnd: '/sfx/quiz-end.wav',
} as const;

export function useSoundEffects() {
  const [volume, setVolumeState] = useState(() => readVolume());
  const volumeRef = useRef(volume);
  const audioCacheRef = useRef<Partial<Record<keyof typeof SFX, HTMLAudioElement>>>({});

  useEffect(() => {
    audioCacheRef.current = Object.fromEntries(
      Object.entries(SFX).map(([key, src]) => {
        const audio = new Audio(src);
        audio.preload = 'auto';
        audio.load();
        return [key, audio];
      }),
    ) as Partial<Record<keyof typeof SFX, HTMLAudioElement>>;

    return () => {
      Object.values(audioCacheRef.current).forEach((audio) => {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      });
      audioCacheRef.current = {};
    };
  }, []);

  useEffect(() => {
    volumeRef.current = volume;
    localStorage.setItem(SOUND_VOLUME_KEY, String(volume));
  }, [volume]);

  const play = useCallback((key: keyof typeof SFX) => {
    if (volumeRef.current <= 0) return;
    const audio = audioCacheRef.current[key] ?? new Audio(SFX[key]);
    audio.volume = volumeRef.current;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    setVolumeState(Math.max(0, Math.min(1, nextVolume)));
  }, []);

  return {
    volume,
    setVolume,
    playChat: useCallback(() => play('chat'), [play]),
    playCorrect: useCallback(() => play('correct'), [play]),
    playHint: useCallback(() => play('hint'), [play]),
    playSkip: useCallback(() => play('skip'), [play]),
    playQuestionEnd: useCallback(() => play('questionEnd'), [play]),
  };
}

function readVolume() {
  const stored = Number(localStorage.getItem(SOUND_VOLUME_KEY));
  return Number.isFinite(stored) ? Math.max(0, Math.min(1, stored)) : 0.5;
}
