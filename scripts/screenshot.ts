// scripts/screenshot.ts
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENS_DIR = path.resolve(process.cwd(), 'docs/screens');
if (!fs.existsSync(SCREENS_DIR)) {
  fs.mkdirSync(SCREENS_DIR, { recursive: true });
}

const BASE_URL = 'http://localhost:5173';

async function run() {
  console.log('Starting Playwright automated screenshot suite...');
  const browser = await chromium.launch();
  const context = await browser.newContext();

  const consoleErrors: string[] = [];

  const targets = [
    {
      name: 'landing',
      path: '/',
      mobileWait: 2200,
      desktopWait: 2200,
    },
    {
      name: 'gallery',
      path: '/?gallery=1&no_intro=1',
      mobileWait: 1000,
      desktopWait: 1000,
    },
    {
      name: 'join',
      path: '/?room=TEST6X&no_intro=1',
      mobileWait: 1000,
      desktopWait: 1000,
    },
    {
      name: 'room',
      path: '/?room_fixture=1&no_intro=1',
      mobileWait: 1000,
      desktopWait: 1000,
    },
    {
      name: 'loading',
      path: '/?loading=1',
      mobileWait: 1200,
      desktopWait: 1200,
    },
  ];

  for (const target of targets) {
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[${target.name}] ${msg.text()}`);
      }
    });

    // 1. Mobile (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}${target.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(target.mobileWait);

    const mobilePath = path.join(SCREENS_DIR, `${target.name}-mobile.png`);
    await page.screenshot({ path: mobilePath, fullPage: true });
    console.log(`Saved: docs/screens/${target.name}-mobile.png (390x844)`);

    // Check 360px horizontal scroll constraint
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForTimeout(300);
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    console.log(`[360px check for ${target.name}]: Horizontal scroll = ${hasHorizontalScroll ? 'FAIL (overflow detected)' : 'PASS (no scroll)'}`);

    // 2. Desktop (1280x800)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE_URL}${target.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(target.desktopWait);

    const desktopPath = path.join(SCREENS_DIR, `${target.name}-desktop.png`);
    await page.screenshot({ path: desktopPath, fullPage: true });
    console.log(`Saved: docs/screens/${target.name}-desktop.png (1280x800)`);

    // Capture dark mode screenshot for landing
    if (target.name === 'landing') {
      await page.click('.switch');
      await page.waitForTimeout(500);
      const darkPath = path.join(SCREENS_DIR, `landing-desktop-dark.png`);
      await page.screenshot({ path: darkPath, fullPage: true });
      console.log(`Saved: docs/screens/landing-desktop-dark.png (1280x800 Dark Mode)`);
      // Revert back
      await page.click('.switch');
      await page.waitForTimeout(300);
    }

    // For gallery, capture grayscale version to verify accessibility without color
    if (target.name === 'gallery') {
      await page.evaluate(() => {
        document.documentElement.style.filter = 'grayscale(100%)';
      });
      await page.waitForTimeout(300);
      const grayscalePath = path.join(SCREENS_DIR, `gallery-desktop-grayscale.png`);
      await page.screenshot({ path: grayscalePath, fullPage: true });
      console.log(`Saved: docs/screens/gallery-desktop-grayscale.png (Grayscale 1280x800)`);
    }

    if (target.name === 'loading') {
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });
      await page.waitForTimeout(300);
      const darkLoadingPath = path.join(SCREENS_DIR, `loading-desktop-dark.png`);
      await page.screenshot({ path: darkLoadingPath, fullPage: true });
      console.log(`Saved: docs/screens/loading-desktop-dark.png (1280x800 Dark Mode)`);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'light');
      });
    }

    await page.close();
  }

  await browser.close();

  console.log('\n--- CONSOLE ERRORS REPORT ---');
  if (consoleErrors.length === 0) {
    console.log('✅ 0 console errors detected across all routes and viewport sizes.');
  } else {
    console.error('❌ Console errors detected:', consoleErrors);
    process.exit(1);
  }

  console.log('\nAll screenshots captured successfully.');
}

run().catch((err) => {
  console.error('Screenshot run failed:', err);
  process.exit(1);
});
