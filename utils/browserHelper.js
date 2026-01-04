const { chromium } = require('playwright');

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserPromise;
}

async function newContext(storageState) {
  const browser = await getBrowser();
  return browser.newContext({
    viewport: { width: 1280, height: 720 },
    storageState: storageState || undefined,
  });
}

module.exports = { newContext };
