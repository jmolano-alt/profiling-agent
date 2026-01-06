// services/rocketreach.js
const fs = require('fs');
const path = require('path');
const { newContext } = require('../utils/browserHelper');

const RR_HOME = 'https://rocketreach.co/';
const RR_DASH = 'https://rocketreach.co/dashboard';

// Candidatos comunes de login (no depende de click en home)
const RR_LOGIN_CANDIDATES = [
  'https://rocketreach.co/login',
  'https://rocketreach.co/signin',
  'https://rocketreach.co/users/sign_in',
  'https://rocketreach.co/account/login',
];

const USER = process.env.ROCKETREACH_USER;
const PASS = process.env.ROCKETREACH_PASS;

// Persistencia liviana de sesión (mejor que memoria cuando el servicio sigue vivo)
const STATE_PATH = path.join(process.env.TMPDIR || '/tmp', 'rr_storage_state.json');

let rrStorageState = null;
try {
  if (fs.existsSync(STATE_PATH)) {
    rrStorageState = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  }
} catch (_) {
  rrStorageState = null;
}

function safeStr(v) {
  return v == null ? '' : String(v).trim();
}

function buildQueryMeta(p = {}) {
  const email = safeStr(p.email);
  const phone = safeStr(p.phone);
  const name = safeStr(p.name);
  const city = safeStr(p.city);
  const state = safeStr(p.state);

  if (email) return { query: email, query_used: 'email' };
  if (phone) return { query: phone, query_used: 'phone' };

  const query = [name, city, state].filter(Boolean).join(' ').trim();
  return { query, query_used: query ? 'name_city_state' : '' };
}

function safePageUrl(page) {
  try { return page.url(); } catch (_) { return 'unknown'; }
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
  } catch (_) {}
}

async function isDashboard(page) {
  const dashboardSignals = [
    'a[href*="/dashboard"]',
    'text=/Recent Searches/i',
    'text=/Saved Searches/i',
    'text=/Search/i',
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

async function doLogin(page) {
  const emailSel = 'input[type="email"], input[name*="email" i], input[placeholder*="email" i]';
  const passSel =
    'input[type="password"], input[name*="pass" i], input[placeholder*="pass" i], input[name="password"]';

  const email = page.locator(emailSel).first();
  const pass = page.locator(passSel).first();

  try {
    await email.waitFor({ timeout: 20000 });
  } catch (_) {
    await debugDump(page, 'rr_no_email_input');
    throw new Error(`RocketReach login: no veo input email. URL=${safePageUrl(page)}`);
  }

  await email.fill(USER);
  await pass.fill(PASS);

  const submit = page
    .locator(
      'button[type="submit"], input[type="submit"], button:has-text("Log In"), button:has-text("Login"), button:has-text("Sign In")'
    )
    .first();

  await Promise.allSettled([
    submit.click({ timeout: 15000 }).catch(() => {}),
    page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {}),
  ]);
}

async function ensureLoggedIn(page) {
  // 1) Intentar dashboard directo
  await page.goto(RR_DASH, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);
  if (await isDashboard(page)) return;

  // 2) Intentar URLs directas de login
  for (const url of RR_LOGIN_CANDIDATES) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(800);

    if (await isDashboard(page)) return;

    if (await isLoginPage(page)) {
      await doLogin(page);

      // Confirmar dashboard post-login
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        if (await isDashboard(page)) return;
        await page.waitForTimeout(1000);
      }

      await debugDump(page, 'rr_login_failed');
      throw new Error(`RocketReach login failed or blocked (captcha/selector). URL=${safePageUrl(page)}`);
    }
  }

  // 3) Fallback: home + clicks
  await page.goto(RR_HOME, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);

  await clickIfExists(page, 'a:has-text("Log In")').catch(() => {});
  await clickIfExists(page, 'a:has-text("Login")').catch(() => {});
  await clickIfExists(page, 'a:has-text("Sign In")').catch(() => {});
  await clickIfExists(page, 'button:has-text("Log In")').catch(() => {});
  await clickIfExists(page, 'button:has-text("Login")').catch(() => {});
  await clickIfExists(page, 'button:has-text("Sign In")').catch(() => {});

  // Esperar login o dashboard
  const deadline2 = Date.now() + 30000;
  while (Date.now() < deadline2) {
    if (await isDashboard(page)) return;
    if (await isLoginPage(page)) break;
    await page.waitForTimeout(800);
  }
  if (await isDashboard(page)) return;

  if (await isLoginPage(page)) {
    await doLogin(page);

    const deadline3 = Date.now() + 45000;
    while (Date.now() < deadline3) {
      if (await isDashboard(page)) return;
      await page.waitForTimeout(1000);
    }
  }

  await debugDump(page, 'rr_login_failed_final');
  throw new Error(`RocketReach login failed or blocked (captcha/selector). URL=${safePageUrl(page)}`);
}

async function runSearch(page, query) {
  // candidatos “razonables” sin tocar inputs del login
  const candidates = [
    'input[type="search"]',
    'input[placeholder*="Search" i]',
    'input[placeholder*="search" i]',
  ];

  let q = null;
  for (const sel of candidates) {
    const loc = page.locator(sel).first();
    try {
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

  const debug = {
    stage: 'start',
    query_used: '',
    query_value: '',
    url: '',
  };

  const context = await newContext(rrStorageState);
  const page = await context.newPage();

  try {
    debug.stage = 'ensure_logged_in';
    await ensureLoggedIn(page);
    debug.url = safePageUrl(page);

    // guardar sesión para próximas ejecuciones
    try {
      rrStorageState = await context.storageState();
      fs.writeFileSync(STATE_PATH, JSON.stringify(rrStorageState), 'utf8');
    } catch (_) {}

    const meta = buildQueryMeta(parameters);
    debug.query_used = meta.query_used;
    debug.query_value = meta.query;

    if (!meta.query) return { social_links: {}, query: '', debug };

    debug.stage = 'search';
    await runSearch(page, meta.query);

    debug.stage = 'extract';
    const social_links = await extractSocialLinks(page);

    return { query: meta.query, social_links, debug };
  } catch (e) {
    await debugDump(page, 'rr_exception');
    // Propaga error (n8n lo captura en errors[])
    throw e;
  } finally {
    await context.close().catch(() => {});
  }
}

module.exports = { findSocialProfiles };
