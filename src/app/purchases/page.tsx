import { db, schema } from '@db/client';
import { SETTLEMENT_CATEGORIES } from '@db/schema';
import { desc, eq } from 'drizzle-orm';
import { currentUserId } from '@lib/auth/current-user';
import { addPurchase, deletePurchase } from '../actions';

export const dynamic = 'force-dynamic';

export default async function PurchasesPage() {
  const userId = await currentUserId();
  const rows = await db
    .select()
    .from(schema.purchases)
    .where(eq(schema.purchases.userId, userId))
    .orderBy(desc(schema.purchases.purchaseDate));

  return (
    <>
      <h1>Purchases</h1>
      <p className="muted small">
        Purchases drive the <code>rulePurchaseMatch</code> rule. Merchant names are normalized on save.
      </p>

      <h2>Add a purchase</h2>
      <form action={addPurchase} className="form">
        <div>
          <label>Merchant *</label>
          <input type="text" name="merchant" required placeholder="RevitaLash" />
        </div>
        <div>
          <label>Product name</label>
          <input type="text" name="productName" placeholder="Advanced Eyelash Conditioner" />
        </div>
        <div>
          <label>Category *</label>
          <select name="category" required defaultValue="CONSUMER_PRODUCT_PURCHASE">
            {SETTLEMENT_CATEGORIES.filter((c) => c !== 'UNKNOWN').map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, ' ').toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Purchase date *</label>
          <input type="date" name="purchaseDate" required />
        </div>
        <div>
          <label>Amount ($)</label>
          <input type="number" name="amount" step="0.01" />
        </div>
        <div>
          <button className="btn" type="submit">
            Add purchase
          </button>
        </div>
      </form>

      <h2>Your purchases ({rows.length})</h2>
      {rows.length === 0 ? (
        <div className="empty">No purchases recorded.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Merchant</th>
              <th>Product</th>
              <th>Category</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.purchaseDate.toISOString().slice(0, 10)}</td>
                <td>{p.merchant}</td>
                <td>{p.productName ?? '—'}</td>
                <td className="small muted">{p.category}</td>
                <td>{p.amount ? `$${p.amount.toFixed(2)}` : '—'}</td>
                <td>
                  <form action={deletePurchase} className="inline-form">
                    <input type="hidden" name="id" value={p.id} />
                    <button className="btn danger" type="submit">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
