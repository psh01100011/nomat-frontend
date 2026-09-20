import { InputHTMLAttributes } from 'react';

type NumericTextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode' | 'pattern'> & {
  value: string;
  min: number;
  max: number;
  onChange: (value: string) => void;
};

export function NumericTextInput({ value, min, max, onChange, onBlur, ...props }: NumericTextInputProps) {
  return (
    <input
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onBlur={(event) => {
        onChange(String(clampNumber(value, min, max)));
        onBlur?.(event);
      }}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))}
      {...props}
    />
  );
}

function clampNumber(value: string, min: number, max: number) {
  if (!value) return min;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}
