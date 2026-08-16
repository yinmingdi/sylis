export interface PublicArtifactRightsPolicy {
  key: string;
  mayBuild: boolean;
  mayServe: boolean;
  mayExport: boolean;
  requiresAttribution: boolean;
  attribution?: string | null;
}

export function publicArtifactRightsViolation(
  policy: PublicArtifactRightsPolicy,
): string | null {
  if (policy.mayBuild !== true) {
    return `SOURCE_RIGHTS_BUILD_FORBIDDEN:${policy.key}`;
  }
  if (policy.mayServe !== true) {
    return `SOURCE_RIGHTS_SERVE_FORBIDDEN:${policy.key}`;
  }
  if (policy.mayExport !== true) {
    return `SOURCE_RIGHTS_EXPORT_FORBIDDEN:${policy.key}`;
  }
  if (
    policy.requiresAttribution &&
    (typeof policy.attribution !== "string" ||
      policy.attribution.trim().length === 0)
  ) {
    return `SOURCE_RIGHTS_ATTRIBUTION_MISSING:${policy.key}`;
  }
  return null;
}

export function assertPublicArtifactSourceRights(
  policies: PublicArtifactRightsPolicy[],
): void {
  for (const policy of policies) {
    const violation = publicArtifactRightsViolation(policy);
    if (violation) throw new Error(violation);
  }
}
