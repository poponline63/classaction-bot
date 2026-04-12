import 'dotenv/config';
import * as cheerio from 'cheerio';
import { politeFetch } from '../src/lib/scraper/http';

async function main() {
  const html = await politeFetch('https://www.classaction.org/settlements');
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  $('a').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    if (/settlement|case|lawsuit/i.test(href)) seen.add(href);
  });
  console.log(`links: ${seen.size}`);
  for (const l of Array.from(seen).slice(0, 40)) console.log(' -', l);
}
main().catch((e) => { console.error(e); process.exit(1); });
