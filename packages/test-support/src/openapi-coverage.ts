import {
  ApiAudience,
  ApiAuthenticationMode,
  HttpMethod,
  OpenApiPathMatch,
} from "./test-contract";

export interface OpenApiAuthenticationRule {
  match: OpenApiPathMatch;
  path: string;
  method?: HttpMethod;
  authentication: ApiAuthenticationMode;
}

export interface OpenApiDocumentPolicy {
  audience: ApiAudience;
  source: string;
  rules: OpenApiAuthenticationRule[];
}

export interface OpenApiCoveragePolicy {
  schemaVersion: 1;
  documents: OpenApiDocumentPolicy[];
}

export interface OpenApiOperationCoverage {
  audience: ApiAudience;
  method: HttpMethod;
  path: string;
  operationId: string;
  authentication: ApiAuthenticationMode;
}

export interface OpenApiOperationInventory {
  schemaVersion: 1;
  operations: OpenApiOperationCoverage[];
}

export interface OpenApiOperation {
  operationId?: string;
  security?: Array<Record<string, never[]>>;
  [key: string]: unknown;
}

export interface OpenApiDocument {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: Record<string, unknown> & {
    securitySchemes?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

export interface OpenApiCompilationResult {
  issues: string[];
  documents: Map<string, OpenApiDocument>;
  inventory: OpenApiOperationInventory;
}

const methods = new Set<string>(Object.values(HttpMethod));

export function compileOpenApiOperationInventory(
  policy: OpenApiCoveragePolicy,
  sourceDocuments: ReadonlyMap<string, OpenApiDocument>,
): OpenApiCompilationResult {
  const issues: string[] = [];
  const documents = new Map<string, OpenApiDocument>();
  const operations: OpenApiOperationCoverage[] = [];

  for (const documentPolicy of policy.documents) {
    const source = sourceDocuments.get(documentPolicy.source);
    if (!source) {
      issues.push(
        `${documentPolicy.audience} OpenAPI document does not exist: ${documentPolicy.source}`,
      );
      continue;
    }

    const document = structuredClone(source);
    documents.set(documentPolicy.source, document);
    const operationIds = new Set<string>();

    for (const path of Object.keys(document.paths).sort()) {
      const pathItem = document.paths[path];
      for (const methodName of Object.keys(pathItem).sort()) {
        const method = methodName.toUpperCase();
        if (!methods.has(method)) continue;
        const operation = pathItem[methodName];
        const authentication = authenticationFor(
          documentPolicy.rules,
          method as HttpMethod,
          path,
        );
        if (!authentication) {
          issues.push(
            `${documentPolicy.audience} ${method} ${path} has no authentication rule`,
          );
          continue;
        }

        const operationId = operation.operationId?.trim();
        if (!operationId) {
          issues.push(
            `${documentPolicy.audience} ${method} ${path} has no operationId`,
          );
          continue;
        }
        if (operationIds.has(operationId)) {
          issues.push(
            `${documentPolicy.audience} has duplicate operationId ${operationId}`,
          );
          continue;
        }
        operationIds.add(operationId);

        operation["x-sylis-audience"] = documentPolicy.audience;
        operation["x-sylis-authentication"] = authentication;
        operation.security = securityRequirement(authentication);
        registerSecurityScheme(document, authentication);
        operations.push({
          audience: documentPolicy.audience,
          method: method as HttpMethod,
          path,
          operationId,
          authentication,
        });
      }
    }
  }

  operations.sort(
    (left, right) =>
      left.audience.localeCompare(right.audience) ||
      left.path.localeCompare(right.path) ||
      left.method.localeCompare(right.method),
  );

  return {
    issues,
    documents,
    inventory: { schemaVersion: 1, operations },
  };
}

function authenticationFor(
  rules: readonly OpenApiAuthenticationRule[],
  method: HttpMethod,
  path: string,
): ApiAuthenticationMode | undefined {
  const matches = rules
    .filter(
      (rule) =>
        (!rule.method || rule.method === method) &&
        (rule.match === OpenApiPathMatch.EXACT
          ? rule.path === path
          : path.startsWith(rule.path)),
    )
    .sort((left, right) => specificity(right) - specificity(left));
  return matches[0]?.authentication;
}

function specificity(rule: OpenApiAuthenticationRule): number {
  return (
    rule.path.length +
    (rule.method ? 10_000 : 0) +
    (rule.match === OpenApiPathMatch.EXACT ? 1_000_000 : 0)
  );
}

function securityRequirement(
  authentication: ApiAuthenticationMode,
): Array<Record<string, never[]>> {
  if (authentication === ApiAuthenticationMode.PUBLIC) return [];
  return [{ [securitySchemeName(authentication)]: [] }];
}

function registerSecurityScheme(
  document: OpenApiDocument,
  authentication: ApiAuthenticationMode,
): void {
  if (authentication === ApiAuthenticationMode.PUBLIC) return;
  const components = (document.components ??= {});
  const schemes = (components.securitySchemes ??= {});
  const name = securitySchemeName(authentication);
  schemes[name] ??= securityScheme(authentication);
}

function securitySchemeName(authentication: ApiAuthenticationMode): string {
  switch (authentication) {
    case ApiAuthenticationMode.USER_SESSION:
      return "sylis_session";
    case ApiAuthenticationMode.ADMIN_SESSION:
      return "sylis_admin_session";
    case ApiAuthenticationMode.SERVICE_GRANT:
      return "sylis_service_grant";
    case ApiAuthenticationMode.PUBLIC:
      throw new Error("Public operations do not have a security scheme");
  }
}

function securityScheme(authentication: ApiAuthenticationMode): unknown {
  switch (authentication) {
    case ApiAuthenticationMode.USER_SESSION:
      return { type: "apiKey", in: "cookie", name: "sylis_session" };
    case ApiAuthenticationMode.ADMIN_SESSION:
      return { type: "apiKey", in: "cookie", name: "sylis_admin_session" };
    case ApiAuthenticationMode.SERVICE_GRANT:
      return { type: "http", scheme: "bearer" };
    case ApiAuthenticationMode.PUBLIC:
      throw new Error("Public operations do not have a security scheme");
  }
}
