const { chromium } = require('playwright');

async function main() {
	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage();
	await page.goto('https://www.wikipedia.org/');

	const pageTitle = await page.title();
	console.log('Page title:', pageTitle);

	await browser.close();
}

main();
