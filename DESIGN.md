---
name: ClaimBot
description: A careful settlement-claim workflow for matching, review, and guarded filing.
colors:
  bg-primary: "#0f1117"
  bg-secondary: "#141621"
  panel: "#1a1d27"
  surface: "#252836"
  text-primary: "#f0f0f5"
  text-secondary: "#9ca3af"
  muted: "#8a8f98"
  accent: "#b892ff"
  accent-strong: "#c9a8ff"
  success: "#22c55e"
  success-text: "#4ade80"
  warning: "#fbbf24"
  danger: "#f87171"
  info: "#60a5fa"
typography:
  display:
    fontFamily: "Georgia, Times New Roman, serif"
    fontSize: "54px"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "0"
  headline:
    fontFamily: "Georgia, Times New Roman, serif"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0"
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 850
    lineHeight: 1.2
    letterSpacing: "0.05em"
rounded:
  sm: "4px"
  md: "8px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg-primary}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
    height: "44px"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "16px"
---

# Design System: ClaimBot

## 1. Overview

**Creative North Star: "The Careful Claim Desk"**

ClaimBot is a focused product interface for a high-trust workflow. It should feel calm, bounded, and competent: a customer knows the next action, sees why automation is safe or blocked, and never has to read launch paperwork to use the product.

The system uses a dark restrained workspace with a single violet accent, muted semantic states, compact controls, and clear progressive disclosure. Customer pages stay task-first; Launch, Packet Center, Audit, and Settings hold setup records and operator-level detail.

**Key Characteristics:**
- Dense but readable product UI.
- One primary action per surface.
- Short safety copy with explicit boundaries.
- Low-radius controls and panels.
- Status colors reserved for actual state.

## 2. Colors

The palette is dark, restrained, and state-rich: violet is the product accent, green marks safe progress, blue marks review/status, yellow marks caution, and red marks hard failure.

### Primary
- **Desk Violet** (#b892ff): Primary action color, active navigation, and the main brand accent. Use sparingly.

### Secondary
- **Review Blue** (#60a5fa): Status and review-mode cues.
- **Safe Green** (#22c55e / #4ade80): Confirmed readiness, safe progress, and shadow-mode assurance.

### Tertiary
- **Caution Amber** (#fbbf24): Warnings, blocked setup, proof-required review, and non-fatal gates.
- **Stop Red** (#f87171): Failed checks, unsafe states, and destructive warnings.

### Neutral
- **Workspace Black** (#0f1117): Page background.
- **Sidebar Slate** (#141621): Navigation and secondary shell surface.
- **Panel Slate** (#1a1d27): Cards and grouped tool surfaces.
- **Raised Slate** (#252836): Hover and elevated controls.
- **Primary Text** (#f0f0f5): Main text.
- **Secondary Text** (#9ca3af): Supporting text.
- **Muted Text** (#8a8f98): Metadata only.

### Named Rules

**The One Accent Rule.** Violet is for current selection and primary action, not decoration.

**The No Setup Leak Rule.** Customer pages can mention readiness, but raw commands, artifact paths, and operator proof language stay in Launch, Packet Center, Audit, and Settings.

## 3. Typography

**Display Font:** Georgia with Times New Roman fallback
**Body Font:** system-ui with platform sans fallbacks
**Label/Mono Font:** system-ui for labels; code uses the browser monospace stack where needed

**Character:** The serif display type gives the product a calmer, more editorial heading voice, while system sans keeps controls, labels, and data familiar.

### Hierarchy
- **Display** (400, up to 54px, 1.04 line-height): Product page H1s and major page heroes only.
- **Headline** (400, 24-30px, tight line-height): Panel and section leads.
- **Title** (650-800, 13-18px): Cards, summary rows, and compact status groups.
- **Body** (400, 14px, 1.6 line-height): Explanatory copy, capped around 65-75ch.
- **Label** (800-850, 10-12px, uppercase only for short labels): Kicker text, navigation groups, and status chips.

### Named Rules

**The Product Scale Rule.** Do not use oversized marketing type inside compact dashboard panels.

## 4. Elevation

ClaimBot uses tonal layering first and shadows second. Panels sit on darker surfaces with subtle borders; shadows are reserved for primary surfaces and hover feedback, not every card.

### Shadow Vocabulary
- **Primary panel** (`0 24px 70px rgba(0, 0, 0, 0.36)`): Large grouped surfaces only.
- **Soft card** (`0 16px 48px rgba(0, 0, 0, 0.28)`): Important cards that need separation.
- **Hover lift** (`transform: translateY(-1px)` with a low blur shadow): Clickable controls only.

### Named Rules

**The Flat-At-Rest Rule.** Most surfaces are flat with borders. Lift appears on interaction or true page-leading surfaces.

## 5. Components

### Buttons
- **Shape:** Low radius (4px) with 44px minimum height.
- **Primary:** Desk Violet background with dark text, used for the one primary next action.
- **Hover / Focus:** Slightly brighter violet, visible outline on keyboard focus, no layout shift.
- **Secondary / Ghost:** Raised Slate or transparent surface with clear border. Use for alternate navigation.

### Chips
- **Style:** Small, high-weight labels with semantic tinted backgrounds.
- **State:** Green for confirmed, amber for blocked/warning, blue for review/status, red for failure.

### Cards / Containers
- **Corner Style:** 4px for cards, 8px for larger grouped panels.
- **Background:** Panel Slate at rest, Raised Slate on hover.
- **Shadow Strategy:** Soft shadows only for leading surfaces or interactive cards.
- **Border:** Subtle full border, never a thick side stripe.
- **Internal Padding:** 16px for cards, 24-32px for major dashboard surfaces.

### Inputs / Fields
- **Style:** Dark panel background, full border, 4px radius.
- **Focus:** Violet outline or border shift with enough contrast.
- **Error / Disabled:** Error uses Stop Red; disabled lowers opacity but keeps labels readable.

### Navigation
- Sidebar uses grouped sections: Tasks, Find, More. Active items use violet tint and full border. Mobile uses the same task-first vocabulary with 44px touch targets and a bottom nav.

### Dashboard
- Lead with one clear next action, then a small status snapshot. Put detailed readiness and operator-facing setup inside collapsed drawers.

## 6. Do's and Don'ts

### Do:
- **Do** keep customer workflow surfaces to profile, review, and tracking first.
- **Do** use Desk Violet for the primary action and current navigation only.
- **Do** keep copy plainspoken, careful, and short.
- **Do** preserve 44px touch targets and visible focus states.
- **Do** route setup evidence to Launch and Packet Center.

### Don't:
- **Don't** put launch-console language on customer screens.
- **Don't** promise legal certainty, payout certainty, eligibility, or proof bypasses.
- **Don't** expose raw command snippets, setup artifacts, or audit export URLs on normal customer pages.
- **Don't** use thick side-stripe accent borders on cards or alerts.
- **Don't** make paid automation look like a semi-automated checklist when eligible no-proof claims can run hands-off after gates clear.
