const LOCAL_ONLY_SCRAPER_USER_AGENT =
  'ClaimBot/0.1 (+https://example.invalid/operator-contact-required)';

export function getScraperUserAgent() {
  return process.env.SCRAPER_USER_AGENT?.trim() || LOCAL_ONLY_SCRAPER_USER_AGENT;
}
