import { ReactNode } from 'react';
import styles from './surface.module.css';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <div>
        <p className={styles.emptyTitle}>{title}</p>
        {description && <p className={styles.emptyText}>{description}</p>}
        {action && <div style={{ marginTop: '1rem' }}>{action}</div>}
      </div>
    </div>
  );
}
