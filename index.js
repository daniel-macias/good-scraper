const { chromium } = require('playwright');

async function main() {
	const url = process.argv[2]; // get the URL passed as an argument

	if (!url) {
		console.error('Error: No URL provided.\nUsage: node index.js <url>');
		process.exit(1);
	}

	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage();
	await page.goto(url);

	const pageTitle = await page.title();
	console.log('Page title:', pageTitle);

	await browser.close();
}

main();
