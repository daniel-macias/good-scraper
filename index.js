const { chromium } = require('playwright');

const MONTHS = {
	'enero': '01',
	'febrero': '02',
	'marzo': '03',
	'abril': '04',
	'mayo': '05',
	'junio': '06',
	'julio': '07',
	'agosto': '08',
	'septiembre': '09',
	'octubre': '10',
	'noviembre': '11',
	'diciembre': '12',
};

async function main() {
	const url = process.argv[2];

	if (!url) {
		console.error('❌ Error: No URL provided.\nUsage: node index.js <url>');
		process.exit(1);
	}

	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage();
	await page.goto(url);

	const eventTitle = await page.$eval('.ficha_fila h1', el => el.textContent.trim());
	const description = await page.$eval('.texto', el => el.innerText.trim());
	const category = await page.$eval('.tags_nota .tag_nota', el => el.textContent.trim());
	const dateText = await page.$eval('.ficha_fila p:nth-of-type(2)', el => el.textContent.trim());
	const timeText = await page.$eval('.ficha_fila p:nth-of-type(4)', el => el.textContent.trim());

	// --- NEW CLEANING LOGIC ---
	const cleanText = dateText
		.replace(/\./g, '') // remove dots
		.replace(/\s*y\s*/gi, ',') // replace ' y ' with comma
		.replace(/de\s+/gi, '') // remove 'de'
		.trim();

	// Now cleanText looks like: "22,23,29 abril 2025"

	const parts = cleanText.split(' ');
	const days = parts[0].split(',').map(d => d.trim());
	const month = MONTHS[parts[1].toLowerCase()];
	const year = parts[2];

	const times = [];

	for (const day of days) {
		const formattedDay = day.padStart(2, '0');
		const isoString = `${year}-${month}-${formattedDay}T${convertTimeTo24h(timeText)}:00Z`;
		times.push(isoString);
	}

	console.log('Event title:', eventTitle);
	console.log('Description:', description);
	console.log('Category:', category);
	console.log('Dates (ISO):', times);

	await browser.close();
}

function convertTimeTo24h(timeStr) {
	const match = timeStr.match(/(\d+):(\d+)(am|pm)/i);
	if (!match) return '00:00'; // fallback
	let [_, hours, minutes, meridian] = match;
	hours = parseInt(hours, 10);
	minutes = parseInt(minutes, 10);
	if (meridian.toLowerCase() === 'pm' && hours !== 12) hours += 12;
	if (meridian.toLowerCase() === 'am' && hours === 12) hours = 0;
	return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

main();
