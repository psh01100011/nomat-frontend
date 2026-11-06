import { useEffect, useRef, useState } from 'react';
import { adConfig, type AdPlacement, getAdSlotId } from './ad-config';
import { loadAdsense } from './adsense-loader';
import styles from './ad-slot.module.css';

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

type AdSlotProps = {
  placement: AdPlacement;
  variant: 'horizontal' | 'vertical';
  minViewportWidth: number;
  maxViewportWidth?: number;
  className?: string;
};

export function AdSlot({ placement, variant, minViewportWidth, maxViewportWidth, className = '' }: AdSlotProps) {
  const isViewportEligible = useViewportRange(minViewportWidth, maxViewportWidth);
  const [unavailable, setUnavailable] = useState(false);
  const requestedRef = useRef(false);
  const adRef = useRef<HTMLModElement | null>(null);
  const slotId = getAdSlotId(placement);
  const isDevelopmentPlaceholder = import.meta.env.DEV;
  const canRequestAd = adConfig.enabled && Boolean(adConfig.clientId.trim()) && Boolean(slotId);

  useEffect(() => {
    if (!isViewportEligible || !canRequestAd || requestedRef.current) return;
    requestedRef.current = true;
    let active = true;

    void loadAdsense(adConfig.clientId.trim())
      .then(() => {
        if (!active || !adRef.current) return;
        window.adsbygoogle = window.adsbygoogle ?? [];
        window.adsbygoogle.push({});
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });

    return () => {
      active = false;
    };
  }, [canRequestAd, isViewportEligible]);

  if (!isViewportEligible || unavailable || (!isDevelopmentPlaceholder && !canRequestAd)) return null;

  const classNames = [styles.slot, styles[variant], isDevelopmentPlaceholder ? styles.placeholder : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <aside className={classNames} aria-label="광고">
      {isDevelopmentPlaceholder ? (
        <span>광고</span>
      ) : (
        <ins
          ref={adRef}
          className="adsbygoogle"
          data-ad-client={adConfig.clientId.trim()}
          data-ad-slot={slotId}
          data-ad-format={variant}
          data-full-width-responsive={variant === 'horizontal' ? 'true' : 'false'}
        />
      )}
    </aside>
  );
}

function useViewportRange(minViewportWidth: number, maxViewportWidth?: number) {
  const mediaQuery = `(min-width: ${minViewportWidth}px)${maxViewportWidth ? ` and (max-width: ${maxViewportWidth}px)` : ''}`;
  const [matches, setMatches] = useState(() => window.matchMedia(mediaQuery).matches);

  useEffect(() => {
    const query = window.matchMedia(mediaQuery);
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [mediaQuery]);

  return matches;
}
