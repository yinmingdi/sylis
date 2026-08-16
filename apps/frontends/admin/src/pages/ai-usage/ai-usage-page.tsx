import {
  ModelPolicyScopeKind,
  ModelPurposeKind,
} from "@sylis/api-client/admin";
import {
  Button,
  Field,
  PageHeader,
  Select,
  TextInput,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { EntityRows, QueryBoundary } from "../../components";
import { aiUsageCommands, aiUsageQuery } from "../../modules/ai-usage";
import { useAdminQueryScope } from "../../modules/identity";
import { AdminReauthentication } from "../../modules/identity";

export function AiUsagePage() {
  const scope = useAdminQueryScope();
  const query = useQuery(aiUsageQuery(scope));
  const cache = useQueryClient();
  const [scopeKind, setScopeKind] = useState(ModelPolicyScopeKind.PLATFORM);
  const [scopeId, setScopeId] = useState("");
  const [purpose, setPurpose] = useState(ModelPurposeKind.AGENT_RUN);
  const [maxUnits, setMaxUnits] = useState("1000000");
  const [maxCostMicros, setMaxCostMicros] = useState("1000000");
  const [maxRequests, setMaxRequests] = useState("1000");
  const [windowSeconds, setWindowSeconds] = useState("86400");
  const [policyVersion, setPolicyVersion] = useState("model-policy/1");
  const [routeReleaseId, setRouteReleaseId] = useState("");
  const [reason, setReason] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const budget = useMutation({
    mutationFn: () =>
      aiUsageCommands.createBudgetPolicy({
        scopeKind,
        ...(scopeId ? { scopeId } : {}),
        purpose,
        maxUnits,
        maxCostMicros,
        windowSeconds: Number(windowSeconds),
        policyVersion,
        reason,
      }),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: aiUsageQuery(scope).queryKey }),
  });
  const quota = useMutation({
    mutationFn: () =>
      aiUsageCommands.createQuotaPolicy({
        scopeKind,
        ...(scopeId ? { scopeId } : {}),
        purpose,
        ...(routeReleaseId ? { routeReleaseId } : {}),
        maxRequests,
        maxUnits,
        windowSeconds: Number(windowSeconds),
        policyVersion,
        reason,
      }),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: aiUsageQuery(scope).queryKey }),
  });

  return (
    <div className="admin-page">
      <PageHeader eyebrow="Model accounting" title="AI Usage" />
      <QueryBoundary pending={query.isPending} error={query.error}>
        <div className="admin-three-column">
          <section>
            <h2>Totals</h2>
            <EntityRows data={query.data?.totals} />
          </section>
          <section>
            <h2>Budgets</h2>
            <EntityRows data={query.data?.budgets} />
          </section>
          <section>
            <h2>Quotas</h2>
            <EntityRows data={query.data?.quotas} />
          </section>
        </div>
        <section>
          <h2>Recent invocations</h2>
          <EntityRows data={query.data?.invocations} />
        </section>
      </QueryBoundary>
      <form
        className="admin-command admin-command--stacked"
        onSubmit={(event: FormEvent) => event.preventDefault()}
      >
        <Field label="Scope">
          <Select
            value={scopeKind}
            onChange={(event) =>
              setScopeKind(event.target.value as ModelPolicyScopeKind)
            }
          >
            {Object.values(ModelPolicyScopeKind).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Scope ID">
          <TextInput
            value={scopeId}
            onChange={(event) => setScopeId(event.target.value)}
          />
        </Field>
        <Field label="Purpose">
          <Select
            value={purpose}
            onChange={(event) =>
              setPurpose(event.target.value as ModelPurposeKind)
            }
          >
            {Object.values(ModelPurposeKind).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Route release ID">
          <TextInput
            value={routeReleaseId}
            onChange={(event) => setRouteReleaseId(event.target.value)}
          />
        </Field>
        <Field label="Max requests">
          <TextInput
            type="number"
            min="1"
            value={maxRequests}
            onChange={(event) => setMaxRequests(event.target.value)}
          />
        </Field>
        <Field label="Max units">
          <TextInput
            type="number"
            min="1"
            value={maxUnits}
            onChange={(event) => setMaxUnits(event.target.value)}
          />
        </Field>
        <Field label="Max cost micros">
          <TextInput
            type="number"
            min="1"
            value={maxCostMicros}
            onChange={(event) => setMaxCostMicros(event.target.value)}
          />
        </Field>
        <Field label="Window seconds">
          <TextInput
            type="number"
            min="60"
            value={windowSeconds}
            onChange={(event) => setWindowSeconds(event.target.value)}
          />
        </Field>
        <Field label="Policy version">
          <TextInput
            required
            value={policyVersion}
            onChange={(event) => setPolicyVersion(event.target.value)}
          />
        </Field>
        <Field label="Reason">
          <TextInput
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <AdminReauthentication onStatusChange={setReauthenticated} />
        <div className="row-actions">
          <Button
            type="button"
            disabled={!reauthenticated || reason.length < 8 || budget.isPending}
            onClick={() => budget.mutate()}
          >
            创建预算策略
          </Button>
          <Button
            type="button"
            tone="secondary"
            disabled={!reauthenticated || reason.length < 8 || quota.isPending}
            onClick={() => quota.mutate()}
          >
            创建配额策略
          </Button>
        </div>
      </form>
    </div>
  );
}
