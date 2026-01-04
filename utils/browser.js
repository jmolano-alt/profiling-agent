const { chromium } = require('playwright');

class BrowserHelper {
  constructor() {
    this.browser = null;
    this.context = null;
  }

  async init() {
    if (this.browser) return;
    
    console.log('Launching browser...');
    
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });
    
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
    });
    
    console.log('Browser launched');
  }

  async newPage() {
    await this.init();
    const page = await this.context.newPage();
    page.setDefaultTimeout(30000);
    return page;
  }

  async close() {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    console.log('Browser closed');
  }

  async waitFor(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const browserHelper = new BrowserHelper();
module.exports = browserHelper;
