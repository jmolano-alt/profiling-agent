const { newContext } = require('../utils/browser');

const BASE = 'https://rocketreach.co/dashboard';
const USER = process.env.ROCKETREACH_USER;
const PASS = process.env.ROCKETREACH_PASS;

let rrStorageState = null;

function buildQuery(p) {
  return (p.email && String(p.email).trim()) ||
         (p.phone && String(p.phone).trim()) ||
         [p.name, p.city, p.state].filter(Boolean).join(' ').trim();
}

async function ensureLoggedIn(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  // Si ya vemos el buscador del dashboard, asumimos sesión OK
  const searchBox = page.locator('input').filter({ hasText: '' }).first();
  const hasDashboard = await page.getByText(/Recent Searches|Saved Searches/i).count().catch(() => 0);
  if (hasDashboard) return;

  // Si redirige a login, intentamos un login genérico
  // (selectores tolerantes)
  const email = page.locator('input[type="email"], input[name*="email" i], input[placeholder*="email" i]').first();
  const pass = page.locator('input[type="password"], input[name*="pass" i], input[placeholder*="pass" i]').first();

  await email.waitFor({ timeout: 15000 });
  await email.fill(USER);
  await pass.fill(PASS);

  const btn = page.locator('button:has-text("Log In"), button:has-text("Login"), button:has-text("Sign In"), input[type="submit"]').first();
  await btn.click();

  // Espera dashboard
  await page.getByText(/Recent Says|Recent Searches|Saved Searches/i).first().waitFor({ timeout: 30000 }).catch(() => {});
}

async function runSearch(page, query) {
  // Busca un input grande tipo “e.g. LinkedIn URL...”
  const q = page.locator('input[placeholder*="LinkedIn" i], input[placeholder*="Job Title" i], input').first();
  await q.waitFor({ timeout: 20000 });
  await q.fill(query);
  await q.press('Enter');
  await page.waitForTimeout(1500);
}

async function extractSocialLinks(page) {
  const firstLinkedIn = await page.locator('a[href*="linkedin.com"]').first().getAttribute('href').catch(() => null);
  const firstFacebook = await page.locator('a[href*="facebook.com"]').first().getAttribute('href').catch(() => null);
  const firstInstagram = await page.locator('a[href*="instagram.com"]').first().getAttribute('href').catch(() => null);
  const firstX = await page.locator('a[href*="x.com"], a[href*="twitter.com"]').first().getAttribute('href').catch(() => null);

  const other = [];
  return {
    linkedin: firstLinkedIn || '',
    facebook: firstFacebook || '',
    instagram: firstInstagram || '',
    twitter: '',
    x: firstX || '',
    other,
  };
}

async function findSocialProfiles(parameters) {
  if (!USER || !PASS) {
    throw new Error('RocketReach credentials missing (ROCKETREACH_USER/ROCKETREACH_PASS)');
  }

  const context = await newContext(rrStorageState);
  const page = await context.newPage();

  try {
    await ensureLoggedIn(page);
    rrStorageState = await context.storageState();

    const query = buildQuery(parameters);
    if (!query) return { social_links: {} };

    await runSearch(page, query);

    const social_links = await extractSocialLinks(page);

    return {
      query,
      social_links,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

module.exports = { findSocialProfiles };
