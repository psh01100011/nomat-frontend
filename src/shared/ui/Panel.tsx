import { HTMLAttributes } from 'react';
import styles from './surface.module.css';

type PanelProps = HTMLAttributes<HTMLDivElement> & {
  padded?: boolean;
};

export function Panel({ padded = true, className = '', ...props }: PanelProps) {
  return (
    <div
      className={[styles.panel, padded ? styles.panelPadded : '', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
