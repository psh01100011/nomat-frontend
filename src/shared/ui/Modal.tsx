import { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import styles from './surface.module.css';

export function Modal({
  open,
  title,
  width = 520,
  children,
  footer,
  onClose,
  closeButton = true,
}: {
  open: boolean;
  title: string;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  closeButton?: boolean;
}) {
  if (!open) return null;

  return (
    <div className={styles.backdrop} role="presentation">
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ '--modal-width': `${width}px` } as React.CSSProperties}
      >
        <header className={styles.modalHeader}>
          <div className={styles.toolbar}>
            <h2 className={styles.modalTitle}>{title}</h2>
            {closeButton && <Button icon={<X size={18} />} iconOnly variant="ghost" aria-label="닫기" onClick={onClose} />}
          </div>
        </header>
        <div className={styles.modalBody}>{children}</div>
        {footer && <footer className={styles.modalFooter}>{footer}</footer>}
      </section>
    </div>
  );
}
