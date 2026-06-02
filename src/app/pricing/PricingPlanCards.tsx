'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';

type BillingCycle = 'monthly' | 'yearly';

type PlanCheckoutState = {
  price: string;
  cadence: string;
  href: string;
  cta: string;
  configured: boolean;
  note: string | null;
};

export type PricingPlanCard = {
  name: string;
  audience: string;
  features: string[];
  tone: string;
  featured: boolean;
  badge: string | null;
  monthly: PlanCheckoutState;
  yearly: PlanCheckoutState;
};

export default function PricingPlanCards({ plans }: { plans: PricingPlanCard[] }) {
  const [cycle, setCycle] = useState<BillingCycle>('yearly');

  return (
    <section className="pricing-cycle-panel" aria-label="ClaimBot pricing tiers">
      <div className="pricing-cycle-head">
        <div>
          <div className="eyebrow">Plan switcher</div>
          <h2>Choose monthly flexibility or annual savings</h2>
          <p>
            Compare the same Free, Plus, and Pro features with monthly flexibility or a lower annual price.
          </p>
        </div>
        <div className="pricing-cycle-toggle" role="group" aria-label="Billing cycle">
          <button
            className={cycle === 'monthly' ? 'active' : undefined}
            type="button"
            aria-pressed={cycle === 'monthly'}
            onClick={() => setCycle('monthly')}
          >
            Monthly
          </button>
          <button
            className={cycle === 'yearly' ? 'active' : undefined}
            type="button"
            aria-pressed={cycle === 'yearly'}
            onClick={() => setCycle('yearly')}
          >
            Annual
            <span>Save</span>
          </button>
        </div>
      </div>

      <div className="pricing-plan-strip">
        {plans.map((tier) => {
          const checkout = tier[cycle];
          return (
            <article className={`pricing-plan-card ${tier.featured ? 'featured' : ''}`} key={tier.name}>
              <div className="pricing-card-head">
                <span className={`tag ${tier.tone}`}>{tier.name}</span>
                {tier.badge && <span className="tag good">{tier.badge}</span>}
              </div>
              <div className="tier-price">
                <strong>{checkout.price}</strong>
                <span>{checkout.cadence}</span>
              </div>
              <p>{tier.audience}</p>
              <ul className="pricing-plan-feature-list" aria-label={`${tier.name} included features`}>
                {tier.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <Link className={`btn ${tier.featured ? '' : 'ghost'}`} href={checkout.href}>
                {checkout.cta}
                <ArrowRight aria-hidden="true" size={15} />
              </Link>
              {checkout.note && <small className="pricing-plan-note">{checkout.note}</small>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
