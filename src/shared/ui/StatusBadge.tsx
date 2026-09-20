import styles from './status.module.css';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'primary';

export function StatusBadge({ children, tone = 'neutral' }: { children: string; tone?: BadgeTone }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
