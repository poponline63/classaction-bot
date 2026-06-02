import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ClaimBot Worker Smoke Claim Form',
  robots: {
    index: false,
    follow: false,
  },
};

export default function SmokeClaimFormPage() {
  return (
    <main className="smoke-claim-form-page">
      <section className="smoke-claim-form-shell">
        <div className="smoke-claim-form-kicker">Worker smoke fixture</div>
        <h1>ClaimBot Paid Automation Smoke Claim Form</h1>
        <p>
          This static form is used only to prove that the hosted paid automation worker can
          process a due file_claim job in shadow mode. It is not a real settlement form.
        </p>

        <form action="/smoke/claim-form/submitted" method="get" className="smoke-claim-form">
          <div className="smoke-claim-form-grid">
            <label htmlFor="firstName">
              First Name
              <input id="firstName" name="firstName" autoComplete="given-name" required />
            </label>
            <label htmlFor="lastName">
              Last Name
              <input id="lastName" name="lastName" autoComplete="family-name" required />
            </label>
            <label htmlFor="email">
              Email Address
              <input id="email" name="email" type="email" autoComplete="email" required />
            </label>
            <label htmlFor="phone">
              Phone Number
              <input id="phone" name="phone" type="tel" autoComplete="tel" />
            </label>
            <label htmlFor="street">
              Street Address
              <input id="street" name="street" autoComplete="address-line1" required />
            </label>
            <label htmlFor="city">
              City
              <input id="city" name="city" autoComplete="address-level2" required />
            </label>
            <label htmlFor="state">
              State
              <select id="state" name="state" autoComplete="address-level1" required>
                <option value="">Select</option>
                <option value="AZ">Arizona</option>
                <option value="CA">California</option>
                <option value="NV">Nevada</option>
                <option value="TX">Texas</option>
                <option value="WA">Washington</option>
              </select>
            </label>
            <label htmlFor="zip">
              Zip Code
              <input id="zip" name="zip" autoComplete="postal-code" required />
            </label>
          </div>

          <label className="smoke-claim-form-attestation" htmlFor="attest">
            <input id="attest" name="attest" type="checkbox" required />
            <span>
              I certify under penalty of perjury that this hosted worker smoke uses synthetic
              ClaimBot test data, that the information provided is true for this fixture, and
              that no real claim is being submitted from this proof run.
            </span>
          </label>

          <button type="submit">Submit Smoke Claim</button>
        </form>
      </section>
    </main>
  );
}
