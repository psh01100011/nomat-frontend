import { Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import styles from './sound-settings.module.css';

type SoundSettingsButtonProps = {
  soundVolume: number;
  audioVolume: number;
  showAudioVolume: boolean;
  onSoundVolumeChange: (volume: number) => void;
  onAudioVolumeChange: (volume: number) => void;
};

export function SoundSettingsButton({
  soundVolume,
  audioVolume,
  showAudioVolume,
  onSoundVolumeChange,
  onAudioVolumeChange,
}: SoundSettingsButtonProps) {
  const [open, setOpen] = useState(false);
  const [localSoundVolume, setLocalSoundVolume] = useState(soundVolume);
  const [localAudioVolume, setLocalAudioVolume] = useState(audioVolume);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', closeOnPointerDown);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnPointerDown);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const updateSoundVolume = (nextVolume: number) => {
    setLocalSoundVolume(nextVolume);
    onSoundVolumeChange(nextVolume);
  };
  const updateAudioVolume = (nextVolume: number) => {
    setLocalAudioVolume(nextVolume);
    onAudioVolumeChange(nextVolume);
  };

  return (
    <div className={styles.wrapper} data-sound-settings-open={open ? 'true' : undefined} ref={wrapperRef}>
      <Button
        aria-expanded={open}
        aria-label="사운드 설정"
        icon={localSoundVolume === 0 && (!showAudioVolume || localAudioVolume === 0) ? <VolumeX size={18} /> : <Volume2 size={18} />}
        iconOnly
        title="사운드 설정"
        variant="ghost"
        onClick={() => setOpen((current) => !current)}
      />
      {open && (
        <div className={styles.popover} role="dialog" aria-label="사운드 설정">
          <h2>사운드 설정</h2>
          <VolumeControl label="효과음" value={localSoundVolume} onChange={updateSoundVolume} />
          {showAudioVolume && <VolumeControl label="문제 오디오" value={localAudioVolume} onChange={updateAudioVolume} />}
        </div>
      )}
    </div>
  );
}

function VolumeControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className={styles.control}>
      <span>
        <strong>{label}</strong>
        <output>{Math.round(value * 100)}%</output>
      </span>
      <input
        aria-label={`${label} 음량`}
        max={100}
        min={0}
        type="range"
        value={Math.round(value * 100)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
      />
    </label>
  );
}
