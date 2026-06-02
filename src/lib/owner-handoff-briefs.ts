export type OwnerHandoffStep = {
  key: string;
  label: string;
  owner: string;
  status: string;
  blockerCount: number;
  nextAction: string;
  requiredInputs: string[];
  proofNeeded: string;
  proofArtifacts: string[];
};

export type OwnerHandoffCommandQueue = {
  localNow: Array<{
    owner: string;
    command: string;
  }>;
  externalRequired: Array<{
    owner: string;
    command: string;
  }>;
};

export type OwnerHandoffPacket = {
  owner: string;
  label: string;
  path: string;
  missingInputs: string[];
  nextAction?: string | null;
};

function uniqueValues(values: Array<string | null | undefined>, limit = 8) {
  return Array.from(new Set(values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))))
    .slice(0, limit);
}

export function buildOwnerHandoffBriefs<Step extends OwnerHandoffStep>(
  actionRows: Step[],
  commandQueue: OwnerHandoffCommandQueue,
  blockedPackets: OwnerHandoffPacket[],
) {
  const owners = uniqueValues(actionRows
    .filter((step) => step.status !== 'confirmed')
    .map((step) => step.owner), 10);

  return owners.map((owner) => {
    const ownerSteps = actionRows.filter((step) => step.owner === owner && step.status !== 'confirmed');
    const ownerPackets = blockedPackets.filter((packet) => packet.owner === owner);
    const safeLocalCommands = commandQueue.localNow
      .filter((command) => command.owner === owner)
      .map((command) => command.command);
    const externalInputCommands = commandQueue.externalRequired
      .filter((command) => command.owner === owner)
      .map((command) => command.command);

    return {
      owner,
      blockedWorkstreamCount: ownerSteps.length,
      blockedPacketCount: ownerPackets.length,
      workstreams: ownerSteps.map((step) => ({
        key: step.key,
        label: step.label,
        blockerCount: step.blockerCount,
        nextAction: step.nextAction,
      })),
      requiredInputs: uniqueValues(ownerSteps.flatMap((step) => step.requiredInputs)),
      proofNeeded: uniqueValues(ownerSteps.map((step) => step.proofNeeded), 5),
      proofArtifacts: uniqueValues(ownerSteps.flatMap((step) => step.proofArtifacts)),
      blockedPackets: ownerPackets.map((packet) => ({
        label: packet.label,
        path: packet.path,
        missingInputs: packet.missingInputs.slice(0, 6),
        nextAction: packet.nextAction?.trim()
          || 'Complete the missing packet inputs, regenerate this packet, then rerun the launch handoff.',
      })),
      safeLocalCommands: uniqueValues(safeLocalCommands, 10),
      externalInputCommands: uniqueValues(externalInputCommands, 10),
      firstAction: ownerSteps[0]?.nextAction ?? 'No blocked action is currently assigned to this owner.',
    };
  });
}
