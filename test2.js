const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.setViewport({ width: 1280, height: 800 });
  console.log('Navigating...');
  await page.goto('https://my-finder-email-production.up.railway.app/', { waitUntil: 'networkidle0' });
  
  console.log('Page loaded. Taking screenshot of login...');
  await page.screenshot({ path: '/Users/linh/.gemini/antigravity-ide/brain/e97b1d79-1e7c-4001-91c5-52c8755c9b6c/scratch/login.png' });
  
  try {
    await page.type('input[placeholder="username"]', 'leon');
    await page.type('input[type="password"]', 'leon123');
    await page.click('button');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    console.log('Logged in successfully');
  } catch (e) {
    console.log('Login failed', e.message);
  }

  await page.screenshot({ path: '/Users/linh/.gemini/antigravity-ide/brain/e97b1d79-1e7c-4001-91c5-52c8755c9b6c/scratch/dashboard.png' });

  try {
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div')).filter(el => el.textContent.includes('Bài viết'));
      for (const t of tabs) {
        if (t.textContent.includes('Bài viết')) {
          t.click();
          break;
        }
      }
    });
    console.log('Clicked sites tab');
    await new Promise(r => setTimeout(r, 3000));
  } catch(e) {}

  await page.screenshot({ path: '/Users/linh/.gemini/antigravity-ide/brain/e97b1d79-1e7c-4001-91c5-52c8755c9b6c/scratch/sites.png' });

  const innerText = await page.evaluate(() => document.body.innerText);
  console.log('Body Text Snippet:');
  console.log(innerText.substring(0, 500));
  
  await browser.close();
})();
