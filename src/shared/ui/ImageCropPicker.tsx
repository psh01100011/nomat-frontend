import { CSSProperties, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { CropSettings, cropImageToBlob } from '@/features/assets/crop-image';
import { Button } from './Button';
import { Modal } from './Modal';
import styles from './image-crop-picker.module.css';

export function ImageCropPicker({
  file,
  imageUrl: existingImageUrl,
  settings,
  aspectRatio,
  label,
  defaultFit = 'cover',
  allowExistingImageClear = true,
  disabled = false,
  previewClassName = '',
  onFileChange,
  onExistingImageClear,
  onSettingsChange,
}: {
  file: File | null;
  imageUrl?: string | null;
  settings: CropSettings;
  aspectRatio: number;
  label: string;
  defaultFit?: NonNullable<CropSettings['fit']>;
  allowExistingImageClear?: boolean;
  disabled?: boolean;
  previewClassName?: string;
  onFileChange: (file: File | null) => void;
  onExistingImageClear?: () => void;
  onSettingsChange: (settings: CropSettings) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftSettings, setDraftSettings] = useState<CropSettings>({ x: 50, y: 50, zoom: 1, fit: defaultFit });
  const [dragStart, setDragStart] = useState<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [draftPreviewUrl, setDraftPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const draftImageUrl = useMemo(() => (draftFile ? URL.createObjectURL(draftFile) : null), [draftFile]);
  const displayUrl = previewUrl ?? imageUrl ?? existingImageUrl ?? null;
  const draftContainUrl = draftPreviewUrl ?? draftImageUrl;
  const aspectCss = `${aspectRatio} / 1`;
  const fit = settings.fit ?? defaultFit;
  const draftFit = draftSettings.fit ?? defaultFit;
  const effectiveSettings = useMemo(() => ({ ...settings, fit }), [fit, settings]);
  const visiblePercent = Math.round(100 / Math.max(draftSettings.zoom, 1));
  const rangeProgress = Math.max(0, Math.min(100, ((visiblePercent - 33) / 67) * 100));
  const canRemoveImage = Boolean(file) || (Boolean(existingImageUrl) && allowExistingImageClear);
  const cropRect = imageSize ? getCropRect(imageSize.width, imageSize.height, aspectRatio, draftSettings) : null;
  const selectionStyle = cropRect
    ? {
        width: `${(cropRect.width / imageSize!.width) * 100}%`,
        height: `${(cropRect.height / imageSize!.height) * 100}%`,
        left: `${(cropRect.x / imageSize!.width) * 100}%`,
        top: `${(cropRect.y / imageSize!.height) * 100}%`,
      }
    : undefined;

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  useEffect(() => {
    return () => {
      if (draftImageUrl) URL.revokeObjectURL(draftImageUrl);
    };
  }, [draftImageUrl]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setImageSize(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void cropImageToBlob(file, aspectRatio, effectiveSettings).then((blob) => {
        if (cancelled) return;
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return URL.createObjectURL(blob);
        });
      });
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [aspectRatio, effectiveSettings, file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!draftFile || draftFit !== 'contain') {
      setDraftPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void cropImageToBlob(draftFile, aspectRatio, { x: 50, y: 50, zoom: 1, fit: 'contain' }).then((blob) => {
        if (cancelled) return;
        setDraftPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return URL.createObjectURL(blob);
        });
      });
    }, 60);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [aspectRatio, draftFile, draftFit]);

  useEffect(() => {
    return () => {
      if (draftPreviewUrl) URL.revokeObjectURL(draftPreviewUrl);
    };
  }, [draftPreviewUrl]);

  const openFilePicker = () => {
    if (!disabled) fileInputRef.current?.click();
  };
  const closeDraft = () => {
    setOpen(false);
    setDraftFile(null);
    setDraftSettings({ x: 50, y: 50, zoom: 1, fit: defaultFit });
    setDraftPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setImageSize(null);
    setDragStart(null);
  };
  const confirmDraft = () => {
    if (!draftFile) {
      closeDraft();
      return;
    }
    onFileChange(draftFile);
    onSettingsChange(draftSettings);
    setOpen(false);
    setDraftFile(null);
    setDraftPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setImageSize(null);
    setDragStart(null);
  };

  return (
    <div className={styles.picker}>
      <div
        className={[
          styles.preview,
          disabled ? styles.previewDisabled : '',
          fit === 'contain' ? styles.previewContain : '',
          previewClassName,
        ].filter(Boolean).join(' ')}
        style={{ '--crop-aspect': aspectCss } as CSSProperties}
      >
        <input
          accept="image/jpeg,image/png,image/webp"
          className={styles.fileInput}
          disabled={disabled}
          ref={fileInputRef}
          type="file"
          onChange={(event) => {
            const nextFile = event.target.files?.[0] ?? null;
            if (nextFile) {
              setDraftFile(nextFile);
              setDraftSettings({ x: 50, y: 50, zoom: 1, fit: defaultFit });
              setOpen(true);
            }
            event.target.value = '';
          }}
        />
        {displayUrl ? (
          <>
            <img alt={label} src={displayUrl} />
            {!disabled && (
              <div className={styles.overlay}>
                <div className={styles.overlayActions}>
                  <Button tabIndex={-1} variant="secondary" onClick={openFilePicker}>
                    이미지 교체
                  </Button>
                  {canRemoveImage && (
                    <Button
                      tabIndex={-1}
                      variant="secondary"
                      onClick={(event) => {
                        event.stopPropagation();
                        onFileChange(null);
                        if (!file) onExistingImageClear?.();
                        onSettingsChange({ x: 50, y: 50, zoom: 1, fit: defaultFit });
                      }}
                    >
                      이미지 제거
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <button className={styles.uploadTarget} disabled={disabled} type="button" onClick={openFilePicker}>
            <ImagePlus size={34} />
            <span>이미지 추가</span>
          </button>
        )}
      </div>

      <Modal
        open={open && Boolean(draftImageUrl)}
        title={`${label} 영역 선택`}
        width={720}
        onClose={closeDraft}
        footer={<Button onClick={confirmDraft}>영역 확정</Button>}
      >
        {draftImageUrl && (
          <div className="stack">
            <div className={styles.fitTabs}>
              <button
                className={draftFit === 'contain' ? styles.fitTabActive : ''}
                type="button"
                onClick={() => setDraftSettings((current) => ({ ...current, fit: 'contain' }))}
              >
                전체 맞춤
              </button>
              <button
                className={draftFit === 'cover' ? styles.fitTabActive : ''}
                type="button"
                onClick={() => setDraftSettings((current) => ({ ...current, fit: 'cover' }))}
              >
                영역 선택
              </button>
            </div>
            {draftFit === 'contain' ? (
              <div
                className={styles.containStage}
                style={
                  {
                    '--crop-aspect': aspectCss,
                    '--crop-ratio': aspectRatio,
                  } as CSSProperties
                }
              >
                {draftPreviewUrl ? <img alt={label} src={draftContainUrl ?? draftImageUrl} /> : <span>미리보기 준비 중</span>}
              </div>
            ) : (
              <>
                <div className={styles.cropStage}>
                  <div
                    className={styles.cropImageBox}
                    style={
                      {
                        '--source-aspect': imageSize ? `${imageSize.width} / ${imageSize.height}` : aspectCss,
                      } as CSSProperties
                    }
                    onMouseMove={(event) => {
                      if (!dragStart || !imageSize || !cropRect) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const startRect = getCropRect(imageSize.width, imageSize.height, aspectRatio, {
                        ...draftSettings,
                        x: dragStart.startX,
                        y: dragStart.startY,
                      });
                      const maxX = Math.max(0, imageSize.width - cropRect.width);
                      const maxY = Math.max(0, imageSize.height - cropRect.height);
                      const nextSourceX = startRect.x + ((event.clientX - dragStart.x) / rect.width) * imageSize.width;
                      const nextSourceY = startRect.y + ((event.clientY - dragStart.y) / rect.height) * imageSize.height;
                      setDraftSettings({
                        ...draftSettings,
                        x: maxX ? Math.max(0, Math.min(100, (nextSourceX / maxX) * 100)) : 50,
                        y: maxY ? Math.max(0, Math.min(100, (nextSourceY / maxY) * 100)) : 50,
                      });
                    }}
                    onMouseUp={() => setDragStart(null)}
                    onMouseLeave={() => setDragStart(null)}
                  >
                    <img
                      className={styles.cropImage}
                      alt={label}
                      src={draftImageUrl}
                      onLoad={(event) => {
                        setImageSize({
                          width: event.currentTarget.naturalWidth,
                          height: event.currentTarget.naturalHeight,
                        });
                      }}
                    />
                    <div className={styles.cropDim} />
                    {selectionStyle && (
                      <div
                        className={styles.selection}
                        style={selectionStyle}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setDragStart({ x: event.clientX, y: event.clientY, startX: draftSettings.x, startY: draftSettings.y });
                        }}
                      />
                    )}
                  </div>
                </div>
                <div className={styles.control} onClick={(event: ReactMouseEvent) => event.stopPropagation()}>
                  <span>영역 크기</span>
                  <input
                    type="range"
                    min="33"
                    max="100"
                    step="1"
                    value={visiblePercent}
                    style={{ '--range-progress': `${rangeProgress}%` } as CSSProperties}
                    onChange={(event) => setDraftSettings((current) => ({ ...current, zoom: 100 / Number(event.target.value), fit: 'cover' }))}
                  />
                  <span>{visiblePercent}%</span>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function getCropRect(width: number, height: number, aspectRatio: number, settings: CropSettings) {
  const sourceRatio = width / height;
  let cropWidth = width;
  let cropHeight = height;

  if (sourceRatio > aspectRatio) {
    cropWidth = height * aspectRatio;
  } else {
    cropHeight = width / aspectRatio;
  }

  cropWidth /= settings.zoom;
  cropHeight /= settings.zoom;

  const maxX = Math.max(0, width - cropWidth);
  const maxY = Math.max(0, height - cropHeight);

  return {
    x: maxX * (settings.x / 100),
    y: maxY * (settings.y / 100),
    width: cropWidth,
    height: cropHeight,
  };
}
