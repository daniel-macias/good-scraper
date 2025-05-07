const { chromium } = require('playwright');
const crypto = require('crypto');
const axios = require('axios');
const { createClient } = require('@sanity/client');
require('dotenv').config(); 

const client = createClient({
	projectId: '851c4m8b',
	dataset: 'production',
	apiVersion: '2024-02-05',
	useCdn: false,
	token: process.env.SANITY_TOKEN 
});

const MONTHS = {
	'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
	'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
	'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12',
};

const ALLOWED_CATEGORIES = [
	'musica', 'teatro', 'tecnologia', 'deporte', 'infantil', 'moda', 'arte',
	'feria', 'concierto', 'gastronomico', 'politico', 'remoto', 'educativo',
	'religioso', 'recaudacion', 'ambiental', 'cine', 'networking',
	'videojuegos', 'genero', 'taller'
];

async function main() {
	const [urlArg, uploadFlag] = process.argv.slice(2);
	if (!urlArg) {
		console.error('❌ Error: No URL provided.\nUsage: node index.js <url> [--upload]');
		process.exit(1);
	}
	const shouldUpload = uploadFlag === '--upload';

	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage();
	await page.goto(urlArg);

	const name = await page.$eval('.ficha_fila h1', el => el.textContent.trim());
	const description = await page.$eval('.texto', el => el.innerText.trim());

	let rawCategory = '';
	try {
		rawCategory = await page.$eval('.tags_nota .tag_nota', el => el.textContent.trim());
	} catch {
		rawCategory = '';
	}
	const normCat = normalizeCategory(rawCategory);
	const categories = ALLOWED_CATEGORIES.includes(normCat) ? [normCat] : [];

	const dateText = await page.$eval('.ficha_fila p:nth-of-type(2)', el => el.textContent.trim());
	let timeText = '10:00am';
	try {
		timeText = await page.evaluate(() => {
			const ps = Array.from(document.querySelectorAll('.ficha_fila p'));
			for (let i = 0; i < ps.length; i++) {
				if (ps[i].textContent.toLowerCase().includes('horario')) {
					return ps[i + 1]?.textContent.trim() || null;
				}
			}
			return null;
		});
		if (!timeText) throw new Error('No time found');
	} catch {
		console.warn('⚠️ No specific time found. Defaulting to 10:00am');
		timeText = '10:00am';
	}

	let cleanText = dateText
		.replace(/ma,\s*o/i, 'mayo')
		.replace(/^[a-záéíóúñü]+,\s*/i, '')
		.replace(/[.]/g, '')
		.trim()
		.toLowerCase();

	console.log('📅 Raw date string:', dateText);
	console.log('🧼 Cleaned date string:', cleanText);
	console.log('⏰ Time string:', timeText);

	let days = [];
	let month = '';
	let year = '';

	const rangeTwoMonths = cleanText.match(/^del\s+(\d{1,2})\s+de\s+([a-zñ]+)\s+al\s+(\d{1,2})\s+de\s+([a-zñ]+)\s+de\s+(\d{4})$/);
	const rangeOneMonth = cleanText.match(/^del\s+(\d{1,2})\s+al\s+(\d{1,2})\s+de\s+([a-zñ]+)\s+de\s+(\d{4})$/);
	const listDays = cleanText.match(/^([\d,\s]+)\s+([a-zñ]+)\s+(\d{4})$/);

	if (rangeTwoMonths) {
		const [_, startDay, startMonth, endDay, endMonth, y] = rangeTwoMonths;
		year = y;
		const start = parseInt(startDay);
		const end = parseInt(endDay);
		const startM = MONTHS[startMonth];
		const endM = MONTHS[endMonth];
		days = [];
		for (let d = start; d <= end; d++) {
			const month = d <= parseInt(endDay) ? startM : endM;
			days.push({ day: String(d).padStart(2, '0'), month });
		}
	} else if (rangeOneMonth) {
		const [_, startDay, endDay, m, y] = rangeOneMonth;
		year = y;
		month = MONTHS[m];
		days = Array.from({ length: endDay - startDay + 1 }, (_, i) => {
			return { day: String(parseInt(startDay) + i).padStart(2, '0'), month };
		});
	} else if (listDays) {
		const [_, raw, m, y] = listDays;
		year = y;
		month = MONTHS[m];
		days = raw.split(',').map(d => ({ day: d.trim().padStart(2, '0'), month }));
	} else {
		console.error('❌ Could not parse date:', cleanText);
		process.exit(1);
	}

	const DURATION_MINUTES = 90;
	const dateRanges = days.map(({ day, month }) => {
		const timeString = `${year}-${month}-${day}T${convertTimeTo24h(timeText)}:00Z`;
		console.log(`📆 Date: ${year}-${month}-${day}`);
		console.log(`➡️ Time: ${timeString}`);
		const start = new Date(timeString);
		const end = new Date(start.getTime() + DURATION_MINUTES * 60 * 1000);
		return {
			_key: crypto.randomBytes(6).toString('hex'),
			start: start.toISOString(),
			end: end.toISOString(),
		};
	});

	const slug = {
		_type: 'slug',
		current: name
			.toLowerCase()
			.normalize("NFD")
			.replace(/[^\u0300-\u036f]/g, '')
			.replace(/[^\w\s-]/g, '')
			.replace(/\s+/g, '-')
			.slice(0, 96)
	};

	let promoImage = null;
	try {
		const imageUrl = await page.$eval('.slide.wp-dark-mode-bg-image', el => {
			const style = el.getAttribute('style');
			const match = style.match(/url\(["']?(https:\/\/[^"')]+)["']?\)/);
			return match ? match[1] : null;
		});
		if (imageUrl) {
			const imgData = await axios.get(imageUrl, { responseType: 'arraybuffer' });
			const uploaded = await client.assets.upload('image', imgData.data, {
				filename: imageUrl.split('/').pop()
			});
			promoImage = {
				_type: 'image',
				asset: {
					_type: 'reference',
					_ref: uploaded._id
				}
			};
		}
	} catch (err) {
		console.warn('⚠️ Could not upload image:', err.message);
	}

	const output = {
		_type: 'event',
		name,
		description,
		categories,
		slug,
		dates: dateRanges,
		promoImage,
		trending: false,
		priceRange: { minPrice: 0, maxPrice: 0 }
	};

	if (shouldUpload) {
		console.log('📤 Uploading event to Sanity...');
		const created = await client.create(output);
		console.log('✅ Created with ID:', created._id);
	} else {
		console.log('📝 JSON preview:\n');
		console.log(JSON.stringify(output, null, 2));
	}

	await browser.close();
}

function convertTimeTo24h(timeStr) {
	const match = timeStr.match(/(\d+):(\d+)(am|pm)/i);
	if (!match) return '00:00';
	let [_, hours, minutes, meridian] = match;
	hours = parseInt(hours, 10);
	minutes = parseInt(minutes, 10);
	if (meridian.toLowerCase() === 'pm' && hours !== 12) hours += 12;
	if (meridian.toLowerCase() === 'am' && hours === 12) hours = 0;
	return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function normalizeCategory(text) {
	return text
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, '')
		.trim();
}

main();
