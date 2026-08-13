import puppeteer from 'puppeteer-core';
import fs from 'fs';

async function run() {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Forward console logs
  page.on('console', async (msg) => {
    try {
      const args = await Promise.all(msg.args().map(arg => arg.jsonValue().catch(() => '[Unserializable]')));
      console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`, args.length > 0 ? args : '');
    } catch (err) {
      console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
    }
  });

  // Handle page errors
  page.on('pageerror', (err) => {
    console.error(`[BROWSER ERROR] ${err.toString()}`);
  });

  console.log("Navigating to login...");
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle2' });

  console.log("Logging in...");
  await page.type('input[type="email"]', 'admin@gmail.com');
  await page.type('input[type="password"]', 'admin1234');
  await page.click('button[type="submit"]');
  
  console.log("Waiting for redirect...");
  await new Promise(r => setTimeout(r, 3000));
  console.log("Current URL after login attempt:", page.url());

  console.log("Navigating to quotes list...");
  await page.goto('http://localhost:3001/new-dashboard/admin/quotes', { waitUntil: 'networkidle2' });
  console.log("Current URL after navigating to quotes:", page.url());

  // Print page HTML content snippet to see if it's the login page or list page
  const pageText = await page.evaluate(() => document.body.innerText.substring(0, 500));
  console.log("Page Content Snippet:", pageText);

  const targetLink = 'http://localhost:3001/new-dashboard/admin/quotes/6a7d8e352462ad1431477e1d/edit-visual';
  console.log(`Navigating to editor directly: ${targetLink}`);
  await page.goto(targetLink, { waitUntil: 'networkidle2' });

  // Let the editor initialize
  await new Promise(r => setTimeout(r, 3000));

  console.log("Creating dummy upload image...");
  const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  fs.writeFileSync('test_upload.png', pngBuffer);

  console.log("Finding hidden file input...");
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) {
    console.error("Could not find file input.");
    await browser.close();
    return;
  }

  console.log("Uploading test_upload.png...");
  await fileInput.uploadFile('test_upload.png');

  console.log("Waiting for element addition and load...");
  await new Promise(r => setTimeout(r, 6000));

  console.log("Taking screenshot of canvas...");
  await page.screenshot({ path: 'editor_screenshot.png' });
  console.log("Screenshot saved to editor_screenshot.png");

  await browser.close();
  console.log("Browser closed.");
}

run().catch(console.error);
