# Legal Posture

ClaimBot helps users discover, review, prepare, and, only when explicitly enabled, file class action settlement claims. It operates under a strict premise:

## Core Principle

**The tool never fabricates eligibility.**

- The user's eligibility profile, including purchases, data breach exposures, and addresses, is their attestation of which classes they may belong to.
- Automated preparation applies that attestation to forms. It does not invent facts.
- Every claim references a `class_authorization` row containing verbatim attestation text that the user explicitly enabled.

## Architecture-Enforced Safeguards

These are enforced in code, not only in docs:

1. **`claims.classAuthorizationId` NOT NULL + ON DELETE RESTRICT** - a claim cannot exist without an active authorization, and you cannot delete an authorization that claims reference.
2. **Preflight re-check** - before every filing, the matcher re-runs on fresh profile and fresh authorization state. Any drift aborts the claim.
3. **Revocation cascade** - revoking an authorization cancels all `QUEUED` and `PREFLIGHT` claims linked to it in a single transaction.
4. **Verbatim attestation capture** - DOM-scraped during form preparation and stored in `claims.submittedAttestationText`. If capture fails, the filer aborts before any live submit action.
5. **Evidence capture** - empty form, filled form, and, in live mode only, confirmation evidence are retained with the claim.
6. **Never-file proof-required** - `proofRequired = true` settlements stay in review until supporting documents are handled manually.
7. **Review-ready query surface** - the filer query requires a passing matcher verdict, active authorization, and `proofRequired=false`.
8. **Append-only audit log** - `audit_log` exposes only insert and select helpers.
9. **Rate-limited filings** - worker attempts are capped by `CLAIM_FILER_MAX_PER_DAY` to prevent runaway automation.
10. **Shadow mode default** - `CLAIM_FILER_MODE=shadow` runs the preparation pipeline but stops before clicking submit. Flip to `live` only after manual verification per administrator.

## What This Tool Is Not

- It is not legal advice.
- It does not determine legal class membership. The user supplies their own attestations, and ClaimBot only applies those saved facts through authorization and proof gates.
- It is not a replacement for reading the settlement notice.
- It does not support claims where the stored profile facts do not meet the class definition.

## Before Client Launch

- Attorney review of the attestation flow and Terms of Service.
- Hosted Identity enabled so profile facts, authorizations, claim records, and audit logs are access-controlled.
- Per-user browser contexts before any multi-client live filing operation.
- Written data retention policy for screenshots, form data, and audit logs.
- `CLAIM_FILER_MODE=shadow` for onboarding and QA until live filing has been reviewed.
- Real production contacts in `SCRAPER_USER_AGENT` and `CLAIMBOT_SUPPORT_EMAIL`.
