// services/rocketreach.js
const fs = require('fs');
const path = require('path');
const { newContext } = require('../utils/browserHelper');

const RR_HOME = 'https://rocketreach.co/';
const RR_DASH = 'https://rocketreach.co/dashboard';
const USER = process.env.ROCKETREACH_USER;
const PASS = process.env.ROCKETREACH_PASS;

let rrStorageState = null;

function safeStr(v) {
  return (v == null) ? '' : String(v).trim();
}

function buildQuery(p = {}) {
  const email = safeStr(p.email);
  const phone = safeStr(p.phone);
  const name = safeStr(p.name);
  const city = safeStr(p.city);
  const state = safeStr(p.state);

  return email || phone || [name, city, state].filter(Boolean).join(' ').trim();
}

async function debugDump(page, tag = 'rr_debug') {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = process.env.TMPDIR || '/tmp';
    const png = path.join(outDir, `${tag}_${ts}.png`);
    const html = path.join(outDir, `${tag}_${ts}.html`);

    await page.screenshot({ path: png, fullPage: true }).catch(() => {});
    const content = await page.content().catch(() => '');
    if (content) fs.writeFileSync(html, content, 'utf8');
  } catch (_) {
    // ignore
  }
}

async function isDashboard(page) {
  // Señales típicas de dashboard / sesión activa
  const dashboardSignals = [
    'text=/Recent Searches/i',
    'text=/Saved Searches/i',
    'text=/Search/i',
    'a[href*="dashboard"]',
  ];

  for (const sel of dashboardSignals) {
    try {
      const count = await page.locator(sel).count();
      if (count > 0) return true;
    } catch (_) {}
  }
  return false;
}

async function isLoginPage(page) {
  // Señales típicas de login
  const loginSignals = [
    'input[type="email"]',
    'input[name*="email" i]',
    'input[placeholder*="email" i]',
    'input[type="password"]',
    'text=/Log\\s*In/i',
    'text=/Sign\\s*In/i',
  ];

  for (const sel of loginSignals) {
    try {
      const count = await page.locator(sel).count();
      if (count > 0) return true;
    } catch (_) {}
  }
  return false;
}

async function clickIfExists(page, selector, timeout = 2000) {
  try {
    const loc = page.locator(selector).first();
    await loc.waitFor({ timeout });
    await loc.click({ timeout });
    return true;
  } catch (_) {
    return false;
  }
}

async function ensureLoggedIn(page) {
  // 1) Ir al dashboard (si hay session, debería entrar)
  await page.goto(RR_DASH, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);

  if (await isDashboard(page)) return;

  // 2) Si no estamos en dashboard, ir al home y buscar entry a login
  await page.goto(RR_HOME, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);

  // Botones comunes de login (varían por UI)
  await clickIfExists(page, 'a:has-text("Log In")').catch(() => {});
  await clickIfExists(page, 'a:has-text("Login")').catch(() => {});
  await clickIfExists(page, 'a:has-text("Sign In")').catch(() => {});
  await clickIfExists(page, 'button:has-text("Log In")').catch(() => {});
  await clickIfExists(page, 'button:has-text("Login")').catch(() => {});
  await clickIfExists(page, 'button:has-text("Sign In")').catch(() => {});

  // 3) Esperar que aparezca login o dashboard
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (await isDashboard(page)) return;
    if (await isLoginPage(page)) break;
    await page.waitForTimeout(800);
  }

  if (await isDashboard(page)) return;

  // 4) Login con selectores tolerantes
  const emailSel = 'input[type="email"], input[name*="email" i], input[placeholder*="email" i]';
  const passSel =
    'input[type="password"], input[name*="pass" i], input[placeholder*="pass" i], input[name="password"]';

  const email = page.locator(emailSel).first();
  const pass = page.locator(passSel).first();

  try {
    await email.waitFor({ timeout: 45000 });
  } catch (e) {
    await debugDump(page, 'rr_no_email_input');
    throw new Error(
      `RocketReach login: no veo input email. URL=${await page.url().catch(() => 'unknown')}`
    );
  }

  await email.fill(USER);
  await pass.fill(PASS);

  // Botón submit tolerante
  const submit = page
    .locator(
      'button[type="submit"], input[type="submit"], button:has-text("Log In"), button:has-text("Login"), button:has-text("Sign In")'
    )
    .first();

  // Click + esperar navegación/estado
  try {
    await Promise.allSettled([
      submit.click({ timeout: 15000 }),
      page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}),
    ]);
  } catch (_) {
    // si click falla, seguimos a validación
  }

  // 5) Confirmar dashboard (o al menos que salió del login)
  const deadline2 = Date.now() + 45000;
  while (Date.now() < deadline2) {
    if (await isDashboard(page)) return;
    // si seguimos en login, puede ser error/captcha
    await page.waitForTimeout(1000);
  }

  await debugDump(page, 'rr_login_failed');
  throw new Error(
    `RocketReach login failed or blocked (captcha/selector). URL=${await page.url().catch(() => 'unknown')}`
  );
}

async function runSearch(page, query) {
  // RocketReach cambia mucho el placeholder; mejor buscar el input de búsqueda en dashboard.
  // Estrategia:
  // 1) Priorizar inputs con placeholders típicos.
  // 2) Fallback: primer input visible en zona principal.
  const candidates = [
    'input[placeholder*="LinkedIn" i]',
    'input[placeholder*="Job Title" i]',
    'input[placeholder*="Search" i]',
    'input[type="search"]',
    'input',
  ];

  let q = null;
  for (const sel of candidates) {
    const loc = page.locator(sel).filter({ hasNotText: '' }).first();
    try {
      // waitFor visible si existe
      await loc.waitFor({ timeout: 8000 });
      q = loc;
      break;
    } catch (_) {}
  }

  if (!q) {
    await debugDump(page, 'rr_no_search_input');
    throw new Error('RocketReach search: no encuentro input de búsqueda.');
  }

  await q.click().catch(() => {});
  await q.fill(query);
  await q.press('Enter').catch(() => {});
  await page.waitForTimeout(2000);
}

async function extractSocialLinks(page) {
  const firstLinkedIn = await page.locator('a[href*="linkedin.com"]').first().getAttribute('href').catch(() => null);
  const firstFacebook = await page.locator('a[href*="facebook.com"]').first().getAttribute('href').catch(() => null);
  const firstInstagram = await page.locator('a[href*="instagram.com"]').first().getAttribute('href').catch(() => null);
  const firstX = await page.locator('a[href*="x.com"], a[href*="twitter.com"]').first().getAttribute('href').catch(() => null);

  return {
    linkedin: firstLinkedIn || '',
    facebook: firstFacebook || '',
    instagram: firstInstagram || '',
    twitter: '',
    x: firstX || '',
    other: [],
  };
}

async function findSocialProfiles(parameters = {}) {
  if (!USER || !PASS) {
    throw new Error('RocketReach credentials missing (ROCKETREACH_USER/ROCKETREACH_PASS)');
  }

  // newContext debe aceptar (storageState) y devolver un BrowserContext (Playwright)
  const context = await newContext(rrStorageState);
  const page = await context.newPage();

  try {
    await ensureLoggedIn(page);

    // Guardar sesión para futuras ejecuciones (reduce logins)
    rrStorageState = await context.storageState().catch(() => rrStorageState);

    const query = buildQuery(parameters);
    if (!query) return { social_links: {}, query: '' };

    await runSearch(page, query);
    const social_links = await extractSocialLinks(page);

    return { query, social_links };
  } catch (e) {
    // dump extra para debugging
    await debugDump(page, 'rr_exception');
    throw e;
  } finally {
    await context.close().catch(() => {});
  }
}

module.exports = { findSocialProfiles };

