/** 2.4.1 Bypass Blocks (AAA): first focusable element on every page. */
export function SkipLink({ target }: { target: string }) {
  return (
    <a
      href={target}
      className="skip-link sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-focus focus:px-4 focus:py-2 focus:text-bg"
    >
      Skip to main content
    </a>
  );
}
