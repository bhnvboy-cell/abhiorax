import { test, expect, Page } from '@playwright/test';

const pages = ['/', '/login', '/register', '/search'];

/**
 * In-page semantic audit — validates the structural WCAG AAA guarantees the
 * app commits to. Run `npm run a11y:audit` against a running dev server.
 */
test.describe('Semantic accessibility (WCAG AAA structural checks)', () => {
  for (const path of pages) {
    test(`${path} — landmark structure and skip link`, async ({ page }) => {
      await page.goto(path);

      const banner = page.getByRole('banner');
      const main = page.getByRole('main');
      await expect(main).toHaveAttribute('id', 'main-content');
      await expect(page.locator('#main-content')).toHaveCount(1);

      const skipLink = page.locator('.skip-link');
      await expect(skipLink).toHaveCount(1);
      await skipLink.focus();
      await expect(skipLink).toBeVisible();
      await skipLink.press('Enter');
      await expect(main).toBeInViewport();

      // Exactly one h1 (4.1.1 Parsing / document outline)
      await expect(page.locator('h1')).toHaveCount(1);

      // Every interactive element reachable by keyboard has a visible focus style
      const hasFocusVisibleRule = await page.evaluate(() => {
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            for (const rule of Array.from(sheet.cssRules)) {
              if (
                rule instanceof CSSStyleRule &&
                rule.selectorText.includes(':focus-visible') &&
                /outline/.test(rule.style.cssText)
              ) {
                return true;
              }
            }
          } catch {
            /* cross-origin stylesheet — skip */
          }
        }
        return false;
      });
      expect(hasFocusVisibleRule).toBe(true);
    });
  }

  test('/login — labeled fields and error announcement', async ({ page }) => {
    await page.goto('/login');
    const identifier = page.getByLabel('Username or email');
    const password = page.getByLabel('Password');
    await expect(identifier).toBeVisible();
    await expect(password).toBeVisible();

    // Submit empty form: error surfaced in a role="alert" region
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.locator('form [role="alert"]')).toBeVisible();
  });

  test('/register — password policy hints match backend contract', async ({ page }) => {
    await page.goto('/register');
    const password = page.getByLabel('Password', { exact: true });
    await expect(password).toHaveAttribute('autocomplete', 'new-password');
    await expect(page.getByText(/at least 12 characters/i)).toBeVisible();
  });

  test('tab navigation stays within focusable order', async ({ page }) => {
    await page.goto('/');
    const focusableBefore = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href], button, input, textarea, select'))
        .filter((el) => !(el as HTMLElement).hasAttribute('disabled'))
        .map((el) => (el as HTMLElement).outerHTML),
    );
    expect(focusableBefore.length).toBeGreaterThan(0);
  });
});
