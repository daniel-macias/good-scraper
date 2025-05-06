const { chromium } = require('playwright');
const crypto = require('crypto');

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

	const name = await page.$eval('.ficha_fila h1', el => el.textContent.trim());
	const description = await page.$eval('.texto', el => el.innerText.trim());
	const category = await page.$eval('.tags_nota .tag_nota', el => el.textContent.trim());
	const dateText = await page.$eval('.ficha_fila p:nth-of-type(2)', el => el.textContent.trim());
	const timeText = await page.$eval('.ficha_fila p:nth-of-type(4)', el => el.textContent.trim());

	const cleanText = dateText
		.replace(/\./g, '')
		.replace(/\s*y\s*/gi, ',')
		.replace(/de\s+/gi, '')
		.replace(/,/g, ', ')
		.replace(/\s+/g, ' ')
		.trim();

	const match = cleanText.match(/^([\d,\s]+)\s+([a-zA-Z]+)\s+(\d{4})$/);
	if (!match) {
		console.error('❌ Could not parse date:', cleanText);
		process.exit(1);
	}

	const [, rawDays, monthName, year] = match;
	const month = MONTHS[monthName.toLowerCase()];
	const days = rawDays.split(',').map(d => d.trim().padStart(2, '0'));

	const DURATION_MINUTES = 90;
	const dateRanges = days.map(day => {
		const timeString = `${year}-${month}-${day}T${convertTimeTo24h(timeText)}:00Z`;
		const start = new Date(timeString);
		const end = new Date(start.getTime() + DURATION_MINUTES * 60 * 1000);
		return {
			_key: crypto.randomBytes(6).toString('hex'), // Sanity requires unique keys
			start: start.toISOString(),
			end: end.toISOString(),
		};
	});

	// Format output like your example
	const output = {
		_type: 'event',
		name,
		description,
		categories: [category.toLowerCase()],
		dates: dateRanges,
		trending: false, // or true if you want default
		priceRange: {
			minPrice: 0,
			maxPrice: 0
		}
		// location, promoImage, slug, etc can be added later
	};

	console.log(JSON.stringify(output, null, 2));
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
