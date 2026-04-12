import 'dotenv/config';
import * as cheerio from 'cheerio';
import { politeFetch } from '../src/lib/scraper/http';

async function main() {
  const html = await politeFetch('https://www.classaction.org/settlements');
  const $ = cheerio.load(html);

  // Look at the structure — what wraps each external link?
  const externalLinks = $('a').filter((_, el) => {
    const href = $(el).attr('href') ?? '';
    return /^https?:\/\//.test(href) && /settlement/i.test(href);
  }).slice(0, 3);

  externalLinks.each((i, el) => {
    console.log(`\n===== LINK ${i} =====`);
    const $el = $(el);
    console.log('href:', $el.attr('href'));
    console.log('text:', $el.text().trim().slice(0, 80));
    // Walk up the DOM looking for the card wrapper
    for (let depth = 0; depth < 5; depth++) {
      const $parent = depth === 0 ? $el.parent() : $el.parents().eq(depth);
      if ($parent.length === 0) break;
      const tag = $parent.prop('tagName');
      const cls = $parent.attr('class') ?? '';
      const id = $parent.attr('id') ?? '';
      console.log(`  parent[${depth}]: <${tag} id="${id}" class="${cls}">`);
    }
    // Print the card-level text
    const cardText = $el.parents().eq(2).text().trim().slice(0, 400);
    console.log('  card text snippet:', cardText.replace(/\s+/g, ' '));
  });

  // Also check headings near external links
  console.log('\n===== HEADINGS =====');
  $('h2, h3').slice(0, 15).each((i, el) => {
    console.log(` h[${i}]:`, $(el).text().trim().slice(0, 100));
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
