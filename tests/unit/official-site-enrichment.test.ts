import { describe, expect, it } from 'vitest';
import {
  candidateOfficialSiteUrls,
  detectAdministratorFromOfficialSite,
  extractClaimDeadlineFromOfficialSite,
} from '../../src/lib/scraper/official-site-enrichment';

describe('official settlement site enrichment', () => {
  it('detects administrator platform text from official pages and block pages', () => {
    expect(detectAdministratorFromOfficialSite(
      'https://example-settlement.com',
      'This website is using a security service to protect ecar-dc.epiqglobal.com.',
    )).toBe('epiq');
    expect(detectAdministratorFromOfficialSite(
      'https://example-settlement.com',
      'For questions, contact JND Legal Administration.',
    )).toBe('jnd');
    expect(detectAdministratorFromOfficialSite(
      'https://example-settlement.com',
      'Settlement administration by Kroll Settlement Administration LLC.',
    )).toBe('kcc');
  });

  it('extracts claim deadlines only from claim-specific deadline context', () => {
    const deadline = extractClaimDeadlineFromOfficialSite(`
      <main>
        <p>The final approval hearing is June 1, 2026.</p>
        <p>Claim Form Deadline: 7/6/26</p>
      </main>
    `, new Date('2026-05-26T00:00:00.000Z'));

    expect(deadline?.toISOString().slice(0, 10)).toBe('2026-07-06');
  });

  it('builds official-site fallback URLs for retired or looping source links', () => {
    expect(candidateOfficialSiteUrls('https://www.zonoliteatticinsulation.com/Hm1.aspx')).toEqual([
      'https://www.zonoliteatticinsulation.com/Hm1.aspx',
      'https://zonoliteatticinsulation.com/Hm1.aspx',
      'https://www.zonoliteatticinsulation.com/s/faqs',
    ]);

    expect(candidateOfficialSiteUrls('http://www.roguepathfinderqx60cvtsettlement.com/')).toEqual([
      'http://www.roguepathfinderqx60cvtsettlement.com/',
      'http://roguepathfinderqx60cvtsettlement.com/',
    ]);
  });
});
