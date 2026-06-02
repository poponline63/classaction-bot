import { describe, expect, it } from 'vitest';
import { buildOwnerHandoffBriefs } from '../../src/lib/owner-handoff-briefs';

describe('buildOwnerHandoffBriefs', () => {
  it('carries packet next actions into owner handoff briefs', () => {
    const briefs = buildOwnerHandoffBriefs(
      [
        {
          key: 'hosted-database',
          label: 'Hosted database packet',
          owner: 'operator',
          status: 'blocked',
          blockerCount: 1,
          nextAction: 'Connect the hosted database.',
          requiredInputs: ['Hosted DATABASE_URL'],
          proofNeeded: 'Hosted database packet',
          proofArtifacts: ['data/hosted-database-packet.md'],
        },
      ],
      {
        localNow: [{ owner: 'operator', command: 'npm run hosted:db:packet' }],
        externalRequired: [],
      },
      [
        {
          owner: 'operator',
          label: 'Hosted database packet',
          path: 'data/hosted-database-packet.md',
          missingInputs: ['Real hosted DATABASE_URL'],
          nextAction: 'Connect the hosted database, run hosted migrations, then regenerate the hosted database packet.',
        },
      ],
    );

    expect(briefs).toHaveLength(1);
    expect(briefs[0]?.blockedPackets[0]).toMatchObject({
      label: 'Hosted database packet',
      path: 'data/hosted-database-packet.md',
      nextAction: 'Connect the hosted database, run hosted migrations, then regenerate the hosted database packet.',
    });
  });
});
