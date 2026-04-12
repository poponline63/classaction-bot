// =============================================================================
// Generic label-driven form filler.
// =============================================================================
// Strategy: map each visible form field to a semantic "slot" (firstName,
// lastName, email, address1, city, state, zip) by inspecting the label
// text, placeholder, name attribute, and autocomplete attribute — then
// fill from the user's profile.
//
// This is deliberately simple. Per-administrator fillers (Phase 4+) can
// subclass this and add site-specific tweaks. Everything the generic
// filler does must be safely no-op when the field doesn't exist.
// =============================================================================

import type { Page, Locator } from 'playwright';
import type { Profile } from '@db/schema';

export type Slot =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'address1'
  | 'address2'
  | 'city'
  | 'state'
  | 'zip'
  | 'country'
  | 'dob';

export interface FillPlan {
  slot: Slot;
  value: string;
  strategy: string;              // 'label' | 'placeholder' | 'autocomplete' | 'name'
  selector: string;
}

// Regex patterns keyed by semantic slot. The first matching pattern wins.
const SLOT_PATTERNS: Array<[Slot, RegExp]> = [
  ['firstName', /first\s*name|given\s*name|forename|fname/i],
  ['lastName', /last\s*name|surname|family\s*name|lname/i],
  ['fullName', /full\s*name|your\s*name|\bname\b/i],
  ['email', /e[-\s]?mail|email\s*address/i],
  ['phone', /phone|telephone|mobile|cell/i],
  ['address1', /address\s*line\s*1|street\s*address|address\s*1|mailing\s*address|\baddress\b/i],
  ['address2', /address\s*line\s*2|apt|apartment|suite|unit|address\s*2/i],
  ['city', /\bcity\b|town/i],
  ['state', /\bstate\b|province|region/i],
  ['zip', /zip|postal\s*code|postcode/i],
  ['country', /country/i],
  ['dob', /date\s*of\s*birth|birth\s*date|dob/i],
];

// Firs/last name extracted from profile.legalName (best-effort split).
function splitName(legalName: string | null): { first: string; last: string; full: string } {
  const full = (legalName ?? '').trim();
  if (!full) return { first: '', last: '', full };
  const parts = full.split(/\s+/);
  if (parts.length === 1) return { first: parts[0]!, last: '', full };
  return { first: parts[0]!, last: parts.slice(1).join(' '), full };
}

function firstOf(arr: readonly string[] | null | undefined): string {
  return arr && arr.length > 0 ? arr[0]! : '';
}

export function buildSlotValues(profile: Profile | null): Record<Slot, string> {
  if (!profile) {
    return {
      firstName: '',
      lastName: '',
      fullName: '',
      email: '',
      phone: '',
      address1: '',
      address2: '',
      city: '',
      state: '',
      zip: '',
      country: 'US',
      dob: '',
    };
  }
  const name = splitName(profile.legalName);
  const addr = (profile.addressesJson ?? [])[0];
  return {
    firstName: name.first,
    lastName: name.last,
    fullName: name.full,
    email: firstOf(profile.emailsJson),
    phone: firstOf(profile.phonesJson),
    address1: addr?.street ?? '',
    address2: '',
    city: addr?.city ?? '',
    state: addr?.state ?? '',
    zip: addr?.zip ?? '',
    country: addr?.country ?? 'US',
    dob: profile.dateOfBirth ? profile.dateOfBirth.toISOString().slice(0, 10) : '',
  };
}

interface RawFieldInfo {
  tag: string;
  type: string;
  name: string;
  id: string;
  placeholder: string;
  autocomplete: string;
  labelText: string;
  selector: string;
  isSelect: boolean;
}

// Pull every visible input/select/textarea + its associated label text,
// so we can pick slots in pure JS and fill via Playwright in Node.
async function enumerateFields(page: Page): Promise<RawFieldInfo[]> {
  return page.evaluate(() => {
    const describeSelector = (el: Element): string => {
      const id = (el as HTMLElement).id;
      if (id) return `#${CSS.escape(id)}`;
      const name = (el as HTMLInputElement).name;
      if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
      return el.tagName.toLowerCase();
    };
    const labelFor = (el: Element): string => {
      const id = (el as HTMLElement).id;
      if (id) {
        const lbl = document.querySelector(`label[for="${id}"]`);
        if (lbl) return (lbl.textContent ?? '').replace(/\s+/g, ' ').trim();
      }
      const wrap = el.closest('label');
      if (wrap) return (wrap.textContent ?? '').replace(/\s+/g, ' ').trim();
      const prev = el.previousElementSibling;
      if (prev && prev.tagName === 'LABEL') {
        return (prev.textContent ?? '').replace(/\s+/g, ' ').trim();
      }
      return '';
    };
    const elts = Array.from(
      document.querySelectorAll<HTMLElement>('input, select, textarea'),
    );
    const out: RawFieldInfo[] = [];
    for (const el of elts) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const type = ((el as HTMLInputElement).type ?? '').toLowerCase();
      if (
        type === 'hidden' ||
        type === 'submit' ||
        type === 'button' ||
        type === 'checkbox' ||
        type === 'radio' ||
        type === 'file'
      ) {
        continue;
      }
      out.push({
        tag: el.tagName.toLowerCase(),
        type,
        name: (el as HTMLInputElement).name ?? '',
        id: el.id ?? '',
        placeholder: (el as HTMLInputElement).placeholder ?? '',
        autocomplete: (el as HTMLInputElement).autocomplete ?? '',
        labelText: labelFor(el),
        selector: describeSelector(el),
        isSelect: el.tagName === 'SELECT',
      });
    }
    return out;
  });
}

function matchSlot(field: RawFieldInfo): Slot | null {
  const corpus = [
    field.labelText,
    field.placeholder,
    field.name,
    field.id,
    field.autocomplete,
  ]
    .join(' ')
    .toLowerCase();
  for (const [slot, re] of SLOT_PATTERNS) {
    if (re.test(corpus)) return slot;
  }
  return null;
}

export interface FillResult {
  plans: FillPlan[];
  filled: number;
  skipped: number;
}

export interface FillProgressCallback {
  onField: (slot: Slot, value: string, filled: number, total: number) => Promise<void>;
}

const FRIENDLY_SLOT_NAMES: Record<Slot, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  fullName: 'Full Name',
  email: 'Email',
  phone: 'Phone',
  address1: 'Street Address',
  address2: 'Address Line 2',
  city: 'City',
  state: 'State',
  zip: 'Zip Code',
  country: 'Country',
  dob: 'Date of Birth',
};

// Fill the form field by field, emitting progress after each one.
export async function fillGeneric(
  page: Page,
  profile: Profile | null,
  progress?: FillProgressCallback,
): Promise<FillResult> {
  const values = buildSlotValues(profile);
  const fields = await enumerateFields(page);

  // Count fillable fields first so we can show "3 of 8"
  let totalFillable = 0;
  for (const f of fields) {
    const slot = matchSlot(f);
    if (slot && values[slot]) totalFillable++;
  }

  const plans: FillPlan[] = [];
  let filled = 0;
  let skipped = 0;

  for (const f of fields) {
    const slot = matchSlot(f);
    if (!slot) {
      skipped++;
      continue;
    }
    const val = values[slot];
    if (!val) {
      skipped++;
      continue;
    }
    try {
      const loc: Locator = page.locator(f.selector).first();
      if (f.isSelect) {
        try {
          await loc.selectOption({ value: val });
        } catch {
          try {
            await loc.selectOption({ label: val });
          } catch {
            skipped++;
            continue;
          }
        }
      } else {
        await loc.fill(val);
      }
      filled++;
      plans.push({
        slot,
        value: val,
        strategy: f.labelText ? 'label' : f.placeholder ? 'placeholder' : f.autocomplete ? 'autocomplete' : 'name',
        selector: f.selector,
      });

      // Emit progress after each field — the viewer shows this in real-time
      if (progress) {
        await progress.onField(slot, val, filled, totalFillable);
      }

      // Small delay between fields so the user can see them appear one by one
      await page.waitForTimeout(400);
    } catch {
      skipped++;
    }
  }

  return { plans, filled, skipped };
}

export { FRIENDLY_SLOT_NAMES };
