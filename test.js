const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('https://my-finder-email-production.up.railway.app/', { waitUntil: 'networkidle0' });
  
  console.log('Page loaded. Checking for login...');
  
  try {
    await page.waitForSelector('input[placeholder="username"]', { timeout: 5000 });
    console.log('Login screen found, logging in...');
    await page.type('input[placeholder="username"]', 'leon');
    await page.type('input[type="password"]', 'leon123');
    await page.click('button');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    console.log('Logged in successfully');
  } catch (e) {
    console.log('No login screen or login failed', e.message);
  }

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
  } catch(e) {
    console.log('Failed to click tab', e.message);
  }

  const innerText = await page.evaluate(() => document.body.innerText);
  console.log('Body Text Snippet:');
  console.log(innerText.substring(0, 1000));
  
  await browser.close();
})();
