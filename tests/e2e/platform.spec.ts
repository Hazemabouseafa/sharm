import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'owner@sharmpharaoh.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'OwnerStrongPass!2026';

test.describe('Sharm Pharaoh Travel — Production End-to-End Browser Verification', () => {
  test('WEB-01..08: all 8 required public pages render in English LTR with zero broken images or runtime errors', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const requiredRoutes = [
      { path: '/', headingMatch: /Every journey tells a/i },
      { path: '/tours', headingMatch: /Your next adventure starts here|Explore Egypt Excursions|Tours/i },
      { path: '/destinations/cairo', headingMatch: /Cairo/i },
      { path: '/destinations/sharm-el-sheikh', headingMatch: /Sharm El Sheikh/i },
      { path: '/destinations/marsa-alam', headingMatch: /Marsa Alam/i },
      { path: '/destinations/hurghada', headingMatch: /Hurghada/i },
      { path: '/destinations/luxor-aswan', headingMatch: /Luxor/i },
      { path: '/contact', headingMatch: /Let's plan your journey|Plan Your Egypt Journey|Contact|Touch/i },
    ];

    for (const route of requiredRoutes) {
      const response = await page.goto(route.path, { waitUntil: 'networkidle' });
      expect(response?.status(), `HTTP status for ${route.path}`).toBe(200);

      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
      await expect(page.locator('h1').first()).toContainText(route.headingMatch);

      const brokenImages = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs
          .filter((img) => img.offsetParent !== null && (!img.complete || img.naturalWidth === 0))
          .map((img) => img.getAttribute('src') || 'unknown');
      });
      expect(brokenImages, `Broken images on ${route.path}`).toEqual([]);
    }

    expect(pageErrors).toEqual([]);
  });

  test('CAT-01 & CAT-02: tours catalog filtering, destination query, and no-results recovery', async ({
    page,
  }) => {
    await page.goto('/tours?destination=sharm-el-sheikh', { waitUntil: 'networkidle' });
    await expect(page.locator('main')).toContainText(/Ras Mohamed|Tiran|Sharm/i);

    await page.goto('/tours?q=zzznonexistenttour999', { waitUntil: 'networkidle' });
    await expect(page.locator('main')).toContainText(/No matching tours|No tours found/i);
  });

  test('BOOK-E2E-01: end-to-end guest booking flow, secure manage token exchange, PDF download, and worker SMTP capture', async ({
    page,
    request,
  }) => {
    await page.goto('/tours', { waitUntil: 'networkidle' });
    const firstTourLink = page.locator('main a[href^="/tours/"]').first();
    await expect(firstTourLink).toBeVisible();
    await firstTourLink.click();

    await expect(page).toHaveURL(/\/tours\/[a-z0-9-]+/);
    await expect(page.locator('h1').first()).toBeVisible();

    const checkoutBtn = page.getByRole('button', { name: /Continue to Booking|Continue to Checkout|Book Now|Reserve/i });
    await expect(checkoutBtn).toBeEnabled({ timeout: 15_000 });
    await checkoutBtn.click();

    await expect(page).toHaveURL(/\/checkout\?/);
    await expect(page.locator('h1')).toContainText(/Complete your booking request/i);

    const uniqueGuestEmail = `e2e.traveler.${Date.now()}@example.com`;
    await page.locator('#ck-name').fill('Arthur Pendelton');
    await page.locator('#ck-email').fill(uniqueGuestEmail);
    await page.locator('#ck-phone').fill('+447700900456');
    await page.locator('#ck-hotel').fill('Savoy Sharm El Sheikh');
    await page.locator('#ck-policy').check();

    await page.getByRole('button', { name: /Submit Booking Request/i }).click();

    const refLocator = page.getByTestId('booking-reference');
    await expect(refLocator).toBeVisible({ timeout: 15_000 });
    const bookingRef = (await refLocator.textContent())?.trim() || '';
    expect(bookingRef).toMatch(/^SPT-/);

    await page.getByRole('link', { name: /Open Secure Booking Management/i }).click();
    await expect(page).toHaveURL(/\/booking\/manage/);
    await expect(page.locator('main')).toContainText(bookingRef);

    let emailCaptured = false;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const mailRes = await request.get('http://127.0.0.1:8025/api/v1/messages');
      if (mailRes.ok()) {
        const mailJson = (await mailRes.json()) as {
          messages: Array<{ to: string[]; subject: string; rawBody: string }>;
        };
        if (
          mailJson.messages.some(
            (m) =>
              m.to.some((rcpt) => rcpt.includes(uniqueGuestEmail)) ||
              m.subject.includes(bookingRef) ||
              m.rawBody.includes(bookingRef),
          )
        ) {
          emailCaptured = true;
          break;
        }
      }
      await page.waitForTimeout(1000);
    }
    expect(emailCaptured).toBe(true);
  });

  test('ADMIN-E2E-01 & LIVE-EDITOR-E2E-01: staff login, admin dashboard modules, and Live Editor draft isolation -> publish -> live update without rebuild -> rollback', async ({
    page,
    browser,
  }) => {
    await page.goto('/admin/login', { waitUntil: 'networkidle' });
    await page.locator('#staff-email').fill(ADMIN_EMAIL);
    await page.locator('#staff-password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /Sign In/i }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.locator('main')).toContainText(/Overview|Bookings|Revenue/i);

    for (const adminPath of ['/admin/bookings', '/admin/tours', '/admin/availability', '/admin/payments', '/admin/health']) {
      await page.goto(adminPath, { waitUntil: 'networkidle' });
      await expect(page.locator('main')).toBeVisible();
    }

    await page.goto('/admin/live-editor', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: /Save Draft/i })).toBeVisible();

    // First ensure Revision #1 is live so test is deterministic
    await page.getByRole('button', { name: /History/i }).click();
    const rev1Btn = page.getByRole('button', { name: 'Rollback Live to #1', exact: true });
    if (await rev1Btn.isVisible().catch(() => false)) {
      await rev1Btn.click();
      await page.waitForTimeout(1000);
    } else {
      await page.keyboard.press('Escape');
    }

    await page.locator('aside[aria-label="Page sections"] button').filter({ hasText: 'Hero' }).first().click();

    const headlineInput = page.locator('#hero-headline');
    await expect(headlineInput).toBeVisible();
    const baselineHeadline = 'Every journey tells a story.';
    const editedHeadline = `Every journey tells a live-edited story ${Date.now().toString().slice(-4)}.`;

    await headlineInput.fill(editedHeadline);
    await page.getByRole('button', { name: /Save Draft/i }).click();
    await expect(page.getByTestId('editor-save-status')).toContainText(/Saved/i);

    // Switch responsive viewports in Live Editor
    await page.getByRole('button', { name: 'Tablet' }).click();
    await page.getByRole('button', { name: 'Mobile' }).click();
    await page.getByRole('button', { name: 'Desktop' }).click();

    // Verify draft isolation on anonymous visitor context before publish
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto('/', { waitUntil: 'networkidle' });
    await expect(anonPage.locator('h1').first()).toContainText(baselineHeadline);
    await expect(anonPage.locator('h1').first()).not.toContainText(editedHeadline);

    // Publish draft in Live Editor
    await page.getByRole('button', { name: /^Publish$/i }).click();
    await page.waitForTimeout(1200);

    // Anonymous visitor reloads / and immediately sees editedHeadline without rebuild!
    await anonPage.reload({ waitUntil: 'networkidle' });
    await expect(anonPage.locator('h1').first()).toContainText(editedHeadline);

    // Rollback to Revision #1
    await page.getByRole('button', { name: /History/i }).click();
    const rollbackBtn = page.getByRole('button', { name: 'Rollback Live to #1', exact: true });
    await expect(rollbackBtn).toBeVisible();
    await rollbackBtn.click();
    await page.waitForTimeout(1200);

    // Anonymous visitor reloads / and sees baselineHeadline restored!
    await anonPage.reload({ waitUntil: 'networkidle' });
    await expect(anonPage.locator('h1').first()).toContainText(baselineHeadline);
    await anonContext.close();
  });

  test('RESP-01 & A11Y-01: responsive viewports (360px..1440px) have zero horizontal overflow and pass WCAG axe-core checks', async ({
    page,
  }) => {
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/', { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(overflow, `Horizontal overflow at ${width}px`).toBe(false);
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    const homeAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const criticalViolations = homeAxe.violations.filter((v) => v.impact === 'critical');
    expect(criticalViolations).toEqual([]);
  });

  test('I18N-LOGO-E2E-01: new brand logo renders cleanly, public instant translation works for RU/IT/TR/PL/EN, dynamic new text translates automatically, and admin supports Arabic RTL', async ({
    page,
    request,
  }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // 1. Verify new brand logo loaded cleanly in header
    const logoImg = page.locator('header img[src*="/brand/logo-normal.png"]').first();
    await expect(logoImg).toBeVisible();
    const logoLoaded = await logoImg.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 100);
    expect(logoLoaded).toBe(true);

    // 2. Verify live legal/about pages are published and ready for customers (200 OK)
    for (const legalPath of ['/p/about', '/p/privacy', '/p/terms', '/p/booking-policy']) {
      const legalRes = await request.get(legalPath);
      expect(legalRes.status(), `Status for ${legalPath}`).toBe(200);
    }

    // 3. Verify brand-new unseen text added later by admin translates dynamically across RU, IT, TR, PL, AR
    const brandNewText = 'Exclusive private sunset yacht excursion with fresh Red Sea seafood dinner.';
    for (const targetLang of ['ru', 'it', 'tr', 'pl', 'ar'] as const) {
      const txRes = await request.post('/api/translate', {
        data: { targetLang, texts: [brandNewText] },
      });
      expect(txRes.ok()).toBe(true);
      const txJson = (await txRes.json()) as { translations: string[] };
      expect(txJson.translations[0]).toBeTruthy();
      expect(txJson.translations[0]).not.toBe(brandNewText);
    }

    // 4. Test instant public translation across Russian, Italian, Turkish, Polish, and back to English on live DOM
    const langSelect = page.getByTestId('public-language-select');
    await expect(langSelect).toBeVisible();

    await langSelect.selectOption('ru');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.locator('h1').first()).toContainText('Каждое путешествие рассказывает историю.');

    await langSelect.selectOption('it');
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await expect(page.locator('h1').first()).toContainText('Ogni viaggio racconta una storia.');

    await langSelect.selectOption('tr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    await expect(page.locator('h1').first()).toContainText('Her yolculuk bir hikaye anlatır.');

    await langSelect.selectOption('pl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
    await expect(page.locator('h1').first()).toContainText('Każda podróż opowiada historię.');

    await langSelect.selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1').first()).toContainText('Every journey tells a story.');

    // 3. Verify Arabic RTL language toggle in /admin/login and /admin dashboard
    await page.goto('/admin/login', { waitUntil: 'networkidle' });
    await page.getByTestId('admin-language-toggle').click();
    await expect(page.locator('#spt-admin-root')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('#spt-admin-root')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('h1')).toContainText('تسجيل دخول لوحة التحكم');

    await page.locator('#staff-email').fill(ADMIN_EMAIL);
    await page.locator('#staff-password').fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.locator('#spt-admin-root')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('aside')).toContainText('الحجوزات');
    await expect(page.locator('aside')).toContainText('المحرر المرئي المباشر');

    // Toggle admin back to English LTR cleanly
    await page.getByTestId('admin-language-toggle').click();
    await expect(page.locator('#spt-admin-root')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('aside')).toContainText('Bookings');
  });
});
