# Legal Posture

This tool automates claim filing for class action settlements. It operates under a strict premise:

## Core principle

**The tool never fabricates eligibility.**

- The user's eligibility profile (purchases, data breach exposures, addresses) IS their attestation of which classes they belong to.
- Auto-filing applies that attestation to forms — it does not invent facts.
- Every claim references a `class_authorization` row containing verbatim attestation text that the user explicitly enabled.

## Architecture-enforced safeguards

These are enforced in code, not docs:

1. **`claims.classAuthorizationId` NOT NULL + ON DELETE RESTRICT** — a claim cannot exist without an active authorization, and you cannot delete an authorization that claims reference.
2. **Preflight re-check** — before every filing, the matcher re-runs on fresh profile + fresh authorization state. Any drift aborts the claim.
3. **Revocation cascade** — revoking an authorization cancels all QUEUED/PREFLIGHT claims linked to it in a single transaction.
4. **Verbatim attestation capture** — DOM-scraped at submit time and stored in `claims.submittedAttestationText`. If capture fails, the filer aborts before clicking submit.
5. **Screenshot triad** — empty form, filled form, confirmation page per claim.
6. **Never-file proof-required** — MVP excludes `proofRequired = true` settlements from auto-filing. They appear in the review queue only.
7. **Eligible-only query surface** — the filer's query is `WHERE verdict='ELIGIBLE' AND class_authorization.enabled=true AND proofRequired=false`. INELIGIBLE settlements are invisible to the filer.
8. **Append-only audit log** — `audit_log` exposes only insert and select.
9. **Rate-limited filings** — worker caps at `CLAIM_FILER_MAX_PER_DAY` (default 20) to prevent runaway automation in case of a matcher bug.
10. **Shadow mode default** — `CLAIM_FILER_MODE=shadow` runs the full pipeline but stops before clicking submit. Flip to `live` only after manual verification per administrator.

## What this tool is NOT

- It is not legal advice.
- It does not determine whether you qualify for a class — you determine that when you enable an authorization.
- It is not a replacement for reading the settlement notice. Auto-filing is a mechanical convenience layered on top of your own attestation.

## Before public launch (Phase 5)

- Attorney review of the attestation flow and Terms of Service.
- Per-user browser contexts so no user's fingerprints leak into another user's filings.
- Written data retention policy for screenshots, form data, and audit logs.
