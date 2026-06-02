import { db, schema } from '@db/client';
import { SETTLEMENT_CATEGORIES } from '@db/schema';
import { desc, eq } from 'drizzle-orm';
import { currentUserId } from '@lib/auth/current-user';
import { isClientFeatureEnabled, isSettlementCategoryEnabled } from '@lib/features';
import { addPurchase, deletePurchase } from '../actions';
import EvidenceHandlingPanel from '../EvidenceHandlingPanel';
import PurchaseEvidenceBrowser, { type PurchaseEvidenceBrowserRow } from './PurchaseEvidenceBrowser';

export const dynamic = 'force-dynamic';

function categoryLabel(category: string) {
  return category
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function fmtDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function PurchasesPage() {
  const userId = await currentUserId();
  const settlementSearchEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH');
  const rows = await db
    .select()
    .from(schema.purchases)
    .where(eq(schema.purchases.userId, userId))
    .orderBy(desc(schema.purchases.purchaseDate));
  const categoryCount = new Set(rows.map((row) => row.category)).size;
  const datedCount = rows.filter((row) => row.purchaseDate).length;
  const amountCount = rows.filter((row) => row.amount != null).length;
  const proofStagedCount = rows.filter((row) => row.receiptPath).length;
  const manualCount = rows.filter((row) => row.source === 'manual').length;
  const latestPurchase = rows[0]?.purchaseDate;
  const purchaseBrowserRows: PurchaseEvidenceBrowserRow[] = rows.map((purchase) => ({
    id: purchase.id,
    merchant: purchase.merchant,
    productName: purchase.productName ?? 'Product or service not recorded',
    categoryLabel: categoryLabel(purchase.category),
    purchaseDateLabel: fmtDate(purchase.purchaseDate),
    amountLabel: purchase.amount ? `$${purchase.amount.toFixed(2)}` : 'Amount not recorded',
    sourceLabel: purchase.source,
    proofLabel: purchase.receiptPath ? 'Document note saved' : 'Document note needed',
    proofStaged: Boolean(purchase.receiptPath),
    hasAmount: purchase.amount != null,
    matcherDetail: settlementSearchEnabled
      ? 'Merchant and date support class-period matching; proof review still applies.'
      : 'Merchant and date support scoped opportunity review; proof review still applies.',
    evidenceTone: purchase.receiptPath ? 'green' : purchase.amount != null ? 'blue' : 'yellow',
  }));

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Evidence profile</div>
          <h1>Purchases</h1>
          <p>
            {settlementSearchEnabled
              ? 'Add purchases, subscriptions, products, and dates that can support class-period matching. Merchant names are normalized when saved.'
              : 'Add purchases, subscriptions, products, and dates that can support scoped claim review. Merchant names are normalized when saved.'}
          </p>
        </div>
      </div>

      <section className="dashboard-section section-flush">
        <header className="section-header">
          <h2>Evidence coverage</h2>
          <p className="muted">
            {settlementSearchEnabled
              ? 'Purchase evidence helps the matcher compare merchants, categories, and class periods. Claims still require eligibility review, permission, and proof review before final checks.'
              : 'Purchase evidence helps ClaimBot compare merchants, categories, and purchase dates against scoped opportunity records. Claims still require eligibility review, permission, and proof review before final checks.'}
          </p>
        </header>
        <div className="stats-grid" aria-label="Purchase evidence coverage">
          <div className="stat-card">
            <div className="stat-label">Purchase records</div>
            <div className="stat-value green">{rows.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Categories covered</div>
            <div className="stat-value blue">{categoryCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Dated records</div>
            <div className="stat-value text">{datedCount}</div>
          </div>
          <div className={`stat-card ${rows.length > 0 && proofStagedCount === 0 ? 'needs-review' : ''}`}>
            <div className="stat-label">Document notes</div>
            <div className={`stat-value ${proofStagedCount > 0 ? 'green' : 'text'}`}>{proofStagedCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Latest purchase</div>
            <div className="stat-value text">{latestPurchase ? fmtDate(latestPurchase) : 'None'}</div>
          </div>
        </div>
        <div className="trust-strip">
          <div className="trust-item">
            <strong>{amountCount} with amount</strong>
            <span>Amounts are optional unless a settlement specifically needs payment detail.</span>
          </div>
          <div className="trust-item">
            <strong>{proofStagedCount} document references</strong>
            <span>Saved document notes help manual review but do not bypass proof-required checks.</span>
          </div>
          <div className="trust-item">
            <strong>{manualCount} manual entries</strong>
            <span>User-provided facts stay reviewable and can be deleted.</span>
          </div>
          <div className="trust-item">
            <strong>{settlementSearchEnabled ? 'Class-period matching' : 'Scoped-review timing'}</strong>
            <span>
              {settlementSearchEnabled
                ? 'Dates help separate eligible windows from uncertain matches.'
                : 'Dates help compare saved facts with assigned opportunity windows.'}
            </span>
          </div>
          <div className="trust-item">
            <strong>No fabrication</strong>
            <span>ClaimBot uses stored evidence only and keeps weak matches in review.</span>
          </div>
        </div>
      </section>

      <EvidenceHandlingPanel href="#purchase-evidence-intake" />

      <PurchaseEvidenceBrowser rows={purchaseBrowserRows} />

      <div className="settings-grid">
        <form id="purchase-evidence-intake" action={addPurchase} className="card form">
          <h2 className="section-flush">Add purchase evidence</h2>
          <div className="evidence-intake-lockup" aria-label="Evidence intake safeguards">
            <div className="evidence-intake-lock">Locked review</div>
            <div>
              <h3>Your facts. Human review. No fabrication.</h3>
              <p>
                Added evidence stays in shadow mode until a reviewer verifies your proof. ClaimBot logs every action
                and uses only facts you provide.
              </p>
              <div className="evidence-intake-actions" aria-label="Evidence support links">
                <a href="/privacy-policy">Privacy &amp; Support</a>
                <a href="/contact">Contact support</a>
              </div>
            </div>
          </div>
          <div>
            <label>Merchant</label>
            <input type="text" name="merchant" required placeholder="RevitaLash" />
          </div>
          <div>
            <label>Product or service</label>
            <input type="text" name="productName" placeholder="Advanced Eyelash Conditioner" />
          </div>
          <div>
            <label>Category</label>
            <select name="category" required defaultValue="CONSUMER_PRODUCT_PURCHASE">
              {SETTLEMENT_CATEGORIES.filter((c) => c !== 'UNKNOWN' && isSettlementCategoryEnabled(c)).map((category) => (
                <option key={category} value={category}>
                  {categoryLabel(category)}
                </option>
              ))}
            </select>
          </div>
          <div className="field-grid">
            <div>
              <label>Purchase date</label>
              <input type="date" name="purchaseDate" required />
            </div>
            <div>
              <label>Amount</label>
              <input type="number" name="amount" step="0.01" placeholder="Optional" />
            </div>
          </div>
          <div>
            <label>Document note or secure link</label>
            <input type="text" name="receiptPath" placeholder="Optional note, order number, or secure link" />
            <div className="hint">Saving a document note helps review; ClaimBot still keeps proof-required claims out of the permissioned filing path.</div>
          </div>
          <button className="btn" type="submit">Add for Manual Review</button>
        </form>

        <aside className="notice">
          <h3>Document notes</h3>
          <p>
            {settlementSearchEnabled
              ? 'Purchase evidence feeds the matcher. Strong merchant and date matches can move a settlement into match review; saved document notes help manual review when a settlement requires proof.'
              : 'Purchase evidence feeds scoped claim review. Strong merchant and date matches can move an assigned opportunity into match review; saved document notes help manual review when proof is required.'}
          </p>
          <div className="status-row">
            <span className="tag">Class period</span>
            <span className="tag">Merchant match</span>
            <span className="tag">Document note</span>
            <span className="tag">No fabrication</span>
          </div>
        </aside>
      </div>

      <h2>Your purchases ({rows.length})</h2>
      {rows.length === 0 ? (
        <div className="empty">
          <h3>No purchases recorded</h3>
          <p>
            {settlementSearchEnabled
              ? 'Add verified purchases or subscriptions to improve settlement matching.'
              : 'Add verified purchases or subscriptions to improve scoped claim review.'}
          </p>
        </div>
      ) : (
        <div className="evidence-grid">
          {rows.map((purchase) => (
            <article key={purchase.id} className="evidence-card">
              <div className="evidence-card-head">
                <div>
                  <h3>{purchase.merchant}</h3>
                  <p>{purchase.productName ?? 'Product or service not recorded'}</p>
                </div>
                <span className="tag">{categoryLabel(purchase.category)}</span>
              </div>
              <div className="evidence-facts">
                <div>
                  <span>Purchase date</span>
                  <strong>{fmtDate(purchase.purchaseDate)}</strong>
                </div>
                <div>
                  <span>Amount</span>
                  <strong>{purchase.amount ? `$${purchase.amount.toFixed(2)}` : 'Not recorded'}</strong>
                </div>
                <div>
                  <span>Source</span>
                  <strong>{purchase.source}</strong>
                </div>
                <div>
                  <span>Document note</span>
                  <strong>{purchase.receiptPath ? 'Saved' : 'Needed if requested'}</strong>
                </div>
              </div>
              <div className="queue-readiness compact ready">
                <strong>Matcher input</strong>
                <span>
                  {settlementSearchEnabled
                    ? 'Merchant and date are used for class-period matching.'
                    : 'Merchant and date are used for scoped opportunity review.'}
                  {purchase.receiptPath ? ' Document note is saved for manual review.' : ' Add a document note when an opportunity asks for proof.'}
                </span>
              </div>
              <form action={deletePurchase} className="inline-form">
                <input type="hidden" name="id" value={purchase.id} />
                <button className="btn danger sm" type="submit">Delete evidence</button>
              </form>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
