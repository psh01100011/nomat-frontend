import { ReactNode } from 'react';
import styles from './surface.module.css';

export function Alert({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'danger' | 'success' }) {
  return (
    <div
      className={[styles.alert, tone === 'danger' ? styles.alertDanger : '', tone === 'success' ? styles.alertSuccess : '']
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
