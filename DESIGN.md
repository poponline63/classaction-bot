# ClaimBot Design System — "Quiet Confidence"

Version 2.0 · June 2026 · Supersedes the Kimi dark workspace system entirely.

---

## 0. Design Philosophy

ClaimBot asks people to trust it with their identity, their purchase history, and
legal claims worth real money. The design's only job is to make that trust feel
earned. Every decision below follows from four principles:

1. **Calm surfaces, loud hierarchy.** Backgrounds are nearly invisible; the
   eye is steered by type weight and spacing, not boxes and borders. (Linear,
   Notion)
2. **One idea per screen.** Each page answers exactly one question and offers
   exactly one primary action. Everything else collapses behind progressive
   disclosure. (Apple)
3. **Money-grade precision.** Numbers, statuses, and guarantees are typeset
   like a financial product: tabular figures, explicit states, no ambiguity.
   (Stripe)
4. **Speed is a feature.** Nothing animates longer than 200ms, nothing blocks
   on decoration, perceived performance beats visual flourish. (Raycast, Arc)

The register is **product, not marketing**. Customer screens speak in plain
verbs. Legal guardrails read as quiet competence ("Nothing is filed without
your approval"), never as warnings that scare or hedge.

---

## 1. Typography System

### Fonts

| Role | Stack | Rationale |
|---|---|---|
| Display & UI | `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI Variable Display", "Segoe UI", Inter, Roboto, sans-serif` | Native rendering speed, zero font download, the Apple/Linear feel comes free on every OS |
| Body | Same stack, Text optical sizes | One family, two optical roles — fewer moving parts |
| Numeric / data | Same stack + `font-variant-numeric: tabular-nums` | Stripe-style column-stable money and counts |
| Code / IDs (operator surfaces only) | `ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace` | Claim IDs, audit digests |

No webfonts. Ever. This is both the fastest and the most native-feeling option.

### Scale (1.250 major third, 16px base)

| Token | Size / Line height | Weight | Usage |
|---|---|---|---|
| `display` | 56 / 1.05 | 700 | Homepage hero only |
| `title-1` | 40 / 1.1 | 700 | Page heroes ("Find matches.") |
| `title-2` | 28 / 1.15 | 650 | Section heads |
| `title-3` | 21 / 1.25 | 650 | Card titles, panel heads |
| `headline` | 17 / 1.3 | 600 | Emphasis rows, nav-active |
| `body` | 15 / 1.55 | 400 | Default text |
| `callout` | 14 / 1.5 | 400 | Secondary copy in cards |
| `footnote` | 13 / 1.45 | 400 | Meta, timestamps |
| `caption` | 11 / 1.3 | 600, +0.06em tracking, uppercase | Eyebrows, table headers, chips |

Rules:
- Letter-spacing is never negative (house accessibility rule, enforced by validator).
- Body text never exceeds 68ch measure.
- Weight creates hierarchy before size does: a 15/600 label beats a 21/400 title.
- Headings are sentence case. Never title case, never all-caps except `caption`.

---

## 2. Color System

### Neutral scale (the product is 95% neutral)

| Token | Light | Dark | Usage |
|---|---|---|---|
| `gray-0` | `#ffffff` | `#161618` | Cards, raised surfaces |
| `gray-1` | `#f5f5f7` | `#0e0e10` | Page background |
| `gray-2` | `#e8e8ed` | `#222226` | Pressed fills, dividers-strong |
| `gray-3` | `#d2d2d7` | `#36363c` | Disabled fills |
| `gray-4` | `#86868b` | `#7c7c84` | Muted text, icons-secondary |
| `gray-5` | `#515154` | `#b3b3ba` | Secondary text |
| `gray-6` | `#1d1d1f` | `#f5f5f7` | Primary text |
| `border` | `rgba(0,0,0,.09)` | `rgba(255,255,255,.10)` | Hairlines everywhere |
| `border-strong` | `rgba(0,0,0,.15)` | `rgba(255,255,255,.16)` | Inputs, focused tables |

### Primary

One accent. Indigo — chosen because it reads "fintech-trustworthy" without
borrowing a bank's blue or a startup's purple.

| Token | Light | Dark |
|---|---|---|
| `accent` | `#5e5ce6` | `#7d7aff` |
| `accent-hover` | `#4a48c9` | `#8e8bff` |
| `accent-soft` | `rgba(94,92,230,.10)` | `rgba(125,122,255,.14)` |
| `on-accent` | `#ffffff` | `#ffffff` |

The accent appears in exactly four places: the primary button, the active nav
item, focus rings, and links. If a screen shows indigo more than four times,
something is mislabeled as primary.

### Semantic (status is sacred — never decorative)

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `good` | `#1d8a3c` | `#32d74b` | Filed, verified, safe-mode confirmations |
| `warn` | `#b25000` | `#ffb340` | Needs review, proof required, limits reached |
| `bad` | `#d70015` | `#ff6961` | Failed checks, revoked, destructive |
| `info` | `#0071e3` | `#6cb2ff` | Review-mode cues, neutral status |

Each ships with a `-soft` tint (10–13% alpha) for chip backgrounds. Status
colors are reserved for actual state — a green button or red headline is a
design bug.

### Dark mode strategy

- **Mechanism:** every token is a CSS custom property; dark mode is one
  `@media (prefers-color-scheme: dark)` override block plus a
  `[data-theme="dark"]` attribute for manual choice. No component knows which
  mode it's in.
- **Rollout:** light is the default and the marketing face (current state).
  Dark ships second, behind the OS preference, after the token migration is
  proven — the codebase already consumes tokens exclusively, so dark mode is
  a ~80-line addendum, not a project.
- **Dark is not inverted light:** surfaces get *lighter* as they raise
  (`#0e0e10 → #161618 → #222226`), shadows are replaced by 1px inner-top
  highlights, and accent/semantic colors shift up one luminance step for
  contrast (values above).

---

## 3. Spacing System

### Scale (4px base)

`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 · 96`

Rules of thumb: 8 inside controls, 16 inside cards, 24 between cards,
48–64 between page sections, 80–96 around the homepage hero.

### Containers

| Token | Width | Usage |
|---|---|---|
| `container-text` | 680px | Legal pages, long-form |
| `container-form` | 760px | Intake, auth |
| `container-app` | 1120px | Dashboard, lists |
| `container-wide` | 1320px | Tables, settlements browser |

Pages center their container; the canvas never stretches edge-to-edge.

### Grid

- 12-column, 24px gutter inside `container-app`.
- Cards snap to 12 / 6 / 4 / 3 columns; never 5 or 7.
- Breakpoints: `480` (phone-lg), `768` (tablet), `1024` (desktop), `1280` (wide).
- Mobile-first: every component defines its 375px layout before its desktop one.
- Touch targets ≥ 44px at every size (validator-enforced).

---

## 4. Component System

### Buttons

| Variant | Recipe | Use |
|---|---|---|
| Primary | `accent` fill, white text, 12px radius, subtle top inner-highlight, hover: darken + lift 1px | One per view |
| Secondary | `gray-0` fill, `border`, `gray-6` text, hover: `gray-1` | Supporting actions |
| Ghost | Transparent, `gray-5` text, hover: `fill` | Toolbars, rows |
| Destructive | `bad` fill, confirm-step required | Revoke, delete |

Sizes: 44px default, 36px `sm` (dense rows only), 52px `lg` (hero CTAs).
Loading state: label fades to 60%, inline 16px spinner replaces icon — width
never changes (no layout shift).

### Cards

- `gray-0` on `gray-1` page, `border` hairline, 16px radius, `shadow-soft`
  (`0 6px 22px rgba(0,0,0,.07)`).
- Interactive cards lift on hover (`shadow` + translateY(-2px), 150ms).
- A card holds one concept: one title, ≤2 metrics, one action. More = split it.
- No nested cards. Inner grouping uses spacing and hairline dividers.

### Inputs

- 44px min height, 12px radius, `gray-0` fill, `border-strong`.
- Focus: accent border + 4px `accent-soft` ring, no outline jump.
- Labels above (13/600, `gray-5`); helper text below (13, `gray-4`); error
  swaps helper to `bad` with the message — fields never just turn red.
- Inline validation on blur, never on keystroke.

### Dropdowns / Selects / Menus

- Trigger = input recipe with chevron.
- Panel: `gray-0`, 12px radius, `shadow`, 4px padding; options 36px,
  8px radius, hover `fill`, selected gets accent check.
- Opens in 120ms (scale .98→1 + fade); closes in 80ms. Searchable beyond 8 options.

### Tables

- Header row: `caption` style on `gray-1`, sticky.
- Rows: 52px, hairline-separated, hover `gray-1`, no zebra.
- Numerics right-aligned, tabular figures. Status rendered as chips, never raw text.
- Mobile: tables reflow into stacked cards — no horizontal scroll, ever.

### Navigation

- **Desktop:** 240px frosted sidebar (`rgba(255,255,255,.78)` + 24px blur),
  flat list, max two groups (Tasks / Find), active = `accent-soft` pill +
  600 weight. Operator items live under one "More" disclosure.
- **Topbar:** 56px frosted, page title left, ≤2 status chips + account right.
  Status chips link to /status; raw operator detail never renders here.
- **Mobile:** 5-item frosted bottom tab bar (Home, Find, Review, Claims,
  Account). Anything else lives inside pages.

### Search

- One global pattern: ⌘K / Ctrl-K command palette (Raycast). Searches
  settlements, claims, and pages from anywhere; the settlements browser embeds
  the same component inline. 300ms debounce, results grouped by type,
  keyboard-first.

### Filters

- Chip row above tables: closed chip shows `Category · 3`; open is a dropdown
  panel with checkboxes. Active filters get `accent-soft` fill and an ✕.
  "Clear all" appears at ≥2 active. State persists in the URL.

### Status chips (house specialty)

Capsule, 24px, `-soft` background + semantic text, 11/600 caps, optional 6px
dot. The entire trust story (Shadow safe · Needs proof · Filed · 3 of 5 left)
is told in chips with identical anatomy everywhere.

---

## 5. Motion System

Motion = physics, not theater. One curve: `cubic-bezier(0.25, 0.1, 0.25, 1)`.

| Interaction | Spec |
|---|---|
| Hover (buttons, cards) | 150ms; color + 1–2px lift |
| Press | 80ms scale to .985 |
| Focus ring | 120ms fade-in |
| Dropdown/popover | 120ms in (fade + scale .98→1), 80ms out |
| Page transitions | None. Instant route swaps; Next.js prefetch makes nav feel < 100ms. Content reveals top-down with a single 150ms fade |
| Loading (known shape) | Skeletons: `gray-2` blocks, 1.2s shimmer, matching final layout exactly — zero shift |
| Loading (actions) | Inline spinner in the control; the page never blocks |
| Scroll | No scroll-jacking, no parallax. One allowed effect: homepage sections fade+rise 8px on first entry (120ms, disabled under `prefers-reduced-motion`) |
| Numbers | Count-up on dashboard stats, 300ms, once per load |

`prefers-reduced-motion` collapses everything to ≤10ms (already enforced).

---

## 6. Homepage Vision (signed-out `/`)

Today the signed-out experience is a login wall — the product has no public
face. The new homepage is a single scrolling page, structured like Stripe's:
each section exists to remove one specific objection.

1. **Hero** — `display` headline: **"Money from class actions you never knew
   you were part of."** Sub: one sentence ("Tell ClaimBot a few facts. It
   finds settlements you may qualify for and handles the easy filings — free
   for 5 claims a month."). One primary CTA ("Check what you qualify for"),
   one ghost ("How it works"). Right side: a real product screenshot in a
   browser frame, not an illustration. *Why: visitors must grasp the value and
   the price in five seconds, and product screenshots signal "this is real
   software," which is the entire trust battle for an unfamiliar legal tool.*
2. **Proof bar** — settlements tracked (live count), claims prepared, "filings
   reviewed before anything is submitted." *Why: numbers beat adjectives; an
   automated counter also proves the catalog is alive.*
3. **How it works — 3 steps** (Add facts → See matches → Approve and track),
   each step a card with a cropped UI screenshot. *Why: the product's actual
   flow is its best sales pitch; showing the same screens users will meet
   eliminates the signup-to-reality gap.*
4. **The trust section** — "Nothing is filed without you." Three quiet cards:
   permission per claim type, proof stays manual, every action receipted in
   an audit log. *Why: the #1 objection for a legal-automation product is fear
   of it acting alone; answering it explicitly converts skeptics rather than
   avoiding the topic.*
5. **Pricing strip** — Free (5 filings/mo) vs paid (uncapped) in two cards,
   honest copy, links to /pricing. *Why: surfacing price on the homepage
   pre-qualifies signups and reads as confidence (Linear/Stripe never hide
   pricing).*
6. **Final CTA** — repeat hero CTA on `gray-6` band, white text. *Why: scroll
   completion is intent; don't make returners scroll back up.*
7. **Footer** — legal disclaimers, terms/privacy in full prose ("ClaimBot is
   not a law firm and does not guarantee eligibility or payment"). *Why: the
   disclaimer placed plainly in the footer reads as integrity; buried, it
   reads as evasion.*

No carousels, no testimonials-with-stock-photos, no chat widget.

## 7. Dashboard Vision (signed-in `/`)

### Information architecture

Today the dashboard narrates everything at once. The rebuild answers, in
order, the only three questions a user has:

1. **"Anything new for me?"** → **Next Action slot** (single full-width card,
   the one highest-leverage action: finish profile → review N matches →
   approve queued claim → "all caught up"). One primary button. *Conversion:
   every session lands on a decision, not a status report.*
2. **"Where's my money?"** → **Pipeline strip**: four equal stat cards —
   Possible matches · Needs review · Tracking · Filed — each a count + delta
   ("+3 this week"), each clicking into its filtered list. *Discoverability:
   the funnel teaches the product model wordlessly.*
3. **"Is anything stuck?"** → **Attention list**: claims/matches blocked on
   the user (proof, permission, expiring deadlines), each row = chip + title +
   one resolving action. Empty state says "Nothing needs you," and means it.

Below the fold only: recent activity (5 rows → /audit) and a compact
free-plan meter ("2 of 5 filings used this month — resets July 1") with an
upgrade ghost-button. *Conversion: usage-meter upgrades outperform banner ads
and stay honest.*

### What gets demoted

Safety lockups, launch checklists, operator receipts, and explanation panels
move to /status, /trust, and collapsed drawers. The dashboard keeps chips
("Shadow safe", "You approve everything") as 24px capsules, with detail one
click away — trust is ambient, not lectured.

### Discoverability

- ⌘K palette everywhere (find any settlement/claim/page in two keystrokes).
- Pipeline cards double as navigation — the funnel *is* the nav model.
- First-run: dashboard renders as a 3-step checklist (profile → permissions →
  first review) and converts to the standard layout when complete.

---

## 8. Implementation Notes (for the build phase — not now)

- All existing CSS classes already consume tokens; this system lands by
  swapping token values and component recipes in the final cascade layer of
  `globals.css`, exactly like the v1.5 light migration.
- New surfaces (homepage, dashboard IA, ⌘K) are additive routes/components —
  zero changes to API routes, auth, matcher, queue, or billing logic.
- Validator pins (`validate:ui`, `validate:pwa`, `pwa-readiness`) must be
  updated in the same commit as any token/copy change.
- Ship order: ① tokens/components polish → ② dashboard IA → ③ public
  homepage → ④ ⌘K palette → ⑤ dark mode.
