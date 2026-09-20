import { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './button.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconOnly?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconOnly = false,
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const classNames = [
    styles.button,
    styles[variant],
    size !== 'md' ? styles[size] : '',
    iconOnly ? styles.iconOnly : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classNames} type={type} {...props}>
      {icon}
      {!iconOnly && children}
    </button>
  );
}
