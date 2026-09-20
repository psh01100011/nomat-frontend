import { ReactNode } from 'react';
import { Info } from 'lucide-react';
import styles from './form-field.module.css';

type FormFieldProps = {
  label: string;
  labelMeta?: string;
  required?: boolean;
  helperText?: string;
  helperTone?: 'neutral' | 'success' | 'danger';
  errorText?: string;
  tooltipText?: string;
  counterText?: string;
  reserveMessage?: boolean;
  children: ReactNode;
};

export function FormField({
  label,
  labelMeta,
  required = false,
  helperText,
  helperTone = 'neutral',
  errorText,
  tooltipText,
  counterText,
  reserveMessage = false,
  children,
}: FormFieldProps) {
  const message = errorText || helperText;
  const messageClassName = [
    styles.message,
    errorText ? styles.error : '',
    !errorText && helperTone === 'success' ? styles.success : '',
    !errorText && helperTone === 'danger' ? styles.error : '',
    !message ? styles.emptyMessage : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.field}>
      <span className={styles.header}>
        <span className={styles.label}>
          {label}
          {labelMeta && <span className={styles.labelMeta}>{labelMeta}</span>}
          {required && <span className={styles.required}> *</span>}
          {tooltipText && (
            <span className={styles.info} data-tooltip={tooltipText} aria-label={tooltipText}>
              <Info size={14} />
            </span>
          )}
        </span>
        {counterText && <span className={styles.counter}>{counterText}</span>}
      </span>
      {children}
      {(message || reserveMessage) && (
        <span className={messageClassName} aria-hidden={!message}>
          {message || ' '}
        </span>
      )}
    </div>
  );
}
