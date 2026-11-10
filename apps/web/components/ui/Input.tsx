import { forwardRef, useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

/** Accessible labeled input with error announcement (3.3.1 Error Identification). */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, id, className = '', ...rest }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const describedBy = [hint ? `${inputId}-hint` : '', error ? `${inputId}-error` : '']
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-base font-medium text-onSurface">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={`min-h-11 rounded-md border bg-surface px-4 py-2 text-onSurface placeholder:text-onSurfaceDim ${
            error ? 'border-danger' : 'border-border'
          } ${className}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-sm text-onSurfaceDim">
            {hint}
          </p>
        )}
        {error && (
          <p id={`${inputId}-error`} role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';
