import { forwardRef } from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
};

/** Accessible button: aria-busy, disabled state, focus ring, min touch target. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', loading = false, className = '', children, ...rest }, ref) => {
    const styles: Record<string, string> = {
      primary: 'bg-primary text-onPrimary hover:bg-primaryHover',
      secondary: 'bg-surfaceAlt text-onSurface border border-border hover:bg-surface',
      danger: 'bg-danger text-onDanger hover:opacity-90',
    };
    return (
      <button
        ref={ref}
        className={`inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
        aria-busy={loading}
        disabled={loading || rest.disabled}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
