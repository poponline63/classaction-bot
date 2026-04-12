// =============================================================================
// Attestation capture — legally critical.
// =============================================================================
// Before the filer clicks "submit", it must record the exact penalty-of-
// perjury text the user is about to agree to, VERBATIM from the DOM. This
// is what gets stored in `claims.submittedAttestationText` and becomes the
// audit trail proving what was acknowledged.
//
// If we can't find a penalty-of-perjury checkbox and associated text, the
// filer ABORTS. We do not guess, and we do not synthesize attestation text.
// =============================================================================

import type { Page } from 'playwright';

export interface CapturedAttestation {
  checkboxFound: boolean;
  text: string;                   // verbatim text
  source: 'label' | 'nearby' | 'fallback' | 'none';
  selector: string | null;        // selector of the checkbox we found
}

// Words/phrases that identify a penalty-of-perjury attestation.
const ATTESTATION_KEYWORDS = [
  'penalty of perjury',
  'under penalty of perjury',
  'penalties of perjury',
  'declare under penalty',
  'certify under penalty',
  'certify that',
  'affirm under penalty',
  'i declare',
  'truthful and accurate',
  'the information provided is true',
  'i confirm',
  'i hereby certify',
];

function containsAttestationKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return ATTESTATION_KEYWORDS.some((k) => lower.includes(k));
}

// Find every checkbox on the page. For each, look at:
//   1. its associated <label for="id"> text
//   2. a wrapping <label> text
//   3. the sibling text immediately before/after it
//   4. the enclosing <p>, <div>, <li>, <fieldset>
//
// Return the first checkbox whose context contains an attestation keyword.
export async function captureAttestation(page: Page): Promise<CapturedAttestation> {
  const result = await page.evaluate(() => {
    const visibleText = (el: Element | null): string => {
      if (!el) return '';
      const t = (el as HTMLElement).innerText ?? el.textContent ?? '';
      return t.replace(/\s+/g, ' ').trim();
    };

    const keywords = [
      'penalty of perjury',
      'under penalty of perjury',
      'penalties of perjury',
      'declare under penalty',
      'certify under penalty',
      'certify that',
      'affirm under penalty',
      'i declare',
      'truthful and accurate',
      'the information provided is true',
      'i confirm',
      'i hereby certify',
    ];

    const hasKeyword = (s: string): boolean => {
      const low = s.toLowerCase();
      return keywords.some((k) => low.includes(k));
    };

    const describeSelector = (el: Element): string => {
      const id = (el as HTMLElement).id;
      if (id) return `#${id}`;
      const name = (el as HTMLInputElement).name;
      if (name) return `input[name="${name}"]`;
      const path: string[] = [];
      let cur: Element | null = el;
      while (cur && cur.tagName !== 'BODY' && path.length < 5) {
        path.unshift(cur.tagName.toLowerCase());
        cur = cur.parentElement;
      }
      return path.join(' > ');
    };

    const boxes = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    );

    for (const box of boxes) {
      // 1. Associated label via `for`
      const id = box.id;
      if (id) {
        const lbl = document.querySelector(`label[for="${id}"]`);
        const txt = visibleText(lbl);
        if (txt && hasKeyword(txt)) {
          return {
            checkboxFound: true,
            text: txt,
            source: 'label',
            selector: describeSelector(box),
          };
        }
      }

      // 2. Wrapping <label>
      const wrap = box.closest('label');
      if (wrap) {
        const txt = visibleText(wrap);
        if (txt && hasKeyword(txt)) {
          return {
            checkboxFound: true,
            text: txt,
            source: 'label',
            selector: describeSelector(box),
          };
        }
      }

      // 3. Nearest enclosing paragraph/div/li with attestation keyword
      let node: Element | null = box;
      for (let i = 0; i < 5 && node; i++) {
        node = node.parentElement;
        if (!node) break;
        const txt = visibleText(node);
        if (txt.length > 30 && txt.length < 4000 && hasKeyword(txt)) {
          return {
            checkboxFound: true,
            text: txt,
            source: 'nearby',
            selector: describeSelector(box),
          };
        }
      }
    }

    // Fallback: is there a visible block of attestation text on the page at
    // all? If so we still know there is one, we just couldn't tie it to a
    // specific checkbox. We do NOT set checkboxFound=true in that case —
    // the filer uses checkboxFound to decide whether to abort.
    const paragraphs = Array.from(document.querySelectorAll('p, div, li'));
    for (const p of paragraphs) {
      const txt = visibleText(p);
      if (txt.length > 30 && txt.length < 4000 && hasKeyword(txt)) {
        return {
          checkboxFound: false,
          text: txt,
          source: 'fallback',
          selector: null,
        };
      }
    }

    return {
      checkboxFound: false,
      text: '',
      source: 'none',
      selector: null,
    };
  });

  return result as CapturedAttestation;
}
