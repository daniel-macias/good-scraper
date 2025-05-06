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

	let rawCategory = '';
	try {
		rawCategory = await page.$eval('.tags_nota .tag_nota', el => el.textContent.trim());
	} catch {
		rawCategory = '';
	}
	const normCat = normalizeCategory(rawCategory);
	const categories = ALLOWED_CATEGORIES.includes(normCat) ? [normCat] : [];

	const dateText = await page.$eval('.ficha_fila p:nth-of-type(2)', el => el.textContent.trim());
	const timeText = await page.$eval('.ficha_fila p:nth-of-type(4)', el => el.textContent.trim());

	// Parse and normalize dates
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
			_key: crypto.randomBytes(6).toString('hex'),
			start: start.toISOString(),
			end: end.toISOString(),
		};
	});

	// Slug generation
	const slug = {
		_type: 'slug',
		current: name
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^\w\s-]/g, '')
			.replace(/\s+/g, '-')
			.slice(0, 96)
	};

	// Image scraping
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

	// Create full event object
	const output = {
		_type: 'event',
		name,
		description,
		categories,
		slug,
		dates: dateRanges,
		promoImage,
		trending: false,
		priceRange: {
			minPrice: 0,
			maxPrice: 0
		}
	};

	console.log('📤 Uploading event to Sanity...');
	const created = await client.create(output);
	console.log('✅ Created with ID:', created._id);

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
