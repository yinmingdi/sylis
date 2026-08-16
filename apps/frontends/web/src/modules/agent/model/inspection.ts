export enum AgentInspectionKind {
  ARTIFACT = 'ARTIFACT',
  PROPOSAL = 'PROPOSAL',
}

export interface AgentInspection {
  kind: AgentInspectionKind;
  id: string;
}

export function parseAgentInspection(
  value: URLSearchParams,
): AgentInspection | null {
  const artifactId = value.get('artifact');
  if (artifactId) return { kind: AgentInspectionKind.ARTIFACT, id: artifactId };
  const proposalId = value.get('proposal');
  if (proposalId) return { kind: AgentInspectionKind.PROPOSAL, id: proposalId };
  return null;
}
