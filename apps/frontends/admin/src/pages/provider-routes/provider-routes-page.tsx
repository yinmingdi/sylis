import { ProviderHealthProbeKind } from "@sylis/api-client/admin";
import {
  Button,
  DataList,
  Field,
  PageHeader,
  Select,
  TextInput,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { QueryBoundary } from "../../components";
import { AdminReauthentication } from "../../modules/identity";
import { useAdminQueryScope } from "../../modules/identity";
import {
  providerRouteCommands,
  providerRouteQuery,
} from "../../modules/provider-routes";
import { array, record, value } from "../../utils";

type RouteAction = "probe" | "revoke" | "restore";

export function ProviderRoutesPage() {
  const scope = useAdminQueryScope();
  const query = useQuery(providerRouteQuery(scope));
  const cache = useQueryClient();
  const [routeId, setRouteId] = useState("");
  const [action, setAction] = useState<RouteAction>("probe");
  const [credentialRevisionId, setCredentialRevisionId] = useState("");
  const [probeKind, setProbeKind] = useState(
    ProviderHealthProbeKind.STRUCTURED_GENERATION,
  );
  const [reason, setReason] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const command = useMutation({
    mutationFn: () => {
      if (action === "probe") {
        return providerRouteCommands.probeRoute(routeId, {
          credentialRevisionId,
          probeKind,
          reason,
        });
      }
      return action === "revoke"
        ? providerRouteCommands.revokeRoute(routeId, reason)
        : providerRouteCommands.restoreRoute(routeId, reason);
    },
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: providerRouteQuery(scope).queryKey,
      }),
  });

  return (
    <div className="admin-page">
      <PageHeader eyebrow="Model execution" title="Model Routes" />
      <QueryBoundary pending={query.isPending} error={query.error}>
        <DataList
          rows={(query.data ?? []).map((route) => {
            const health = record(array(route.healthObservations)[0]);
            return {
              label: `${value(route.providerKey)} / ${value(route.modelId)}`,
              value: `${value(route.status)} · ${value(health.status, "NO_PROBE")}`,
              detail: `${value(route.releaseDigest)} · ${route.id}`,
              action: (
                <div className="row-actions">
                  <Button
                    tone="quiet"
                    onClick={() => {
                      setRouteId(route.id);
                      setAction("probe");
                    }}
                  >
                    探测
                  </Button>
                  <Button
                    tone="danger"
                    onClick={() => {
                      setRouteId(route.id);
                      setAction("revoke");
                    }}
                  >
                    安全撤销
                  </Button>
                  <Button
                    tone="secondary"
                    onClick={() => {
                      setRouteId(route.id);
                      setAction("restore");
                    }}
                  >
                    恢复
                  </Button>
                </div>
              ),
            };
          })}
        />
      </QueryBoundary>
      {routeId ? (
        <section className="admin-risk-command">
          <h2>{action.toUpperCase()} Model Route</h2>
          <p>{routeId}</p>
          {action === "probe" ? (
            <>
              <Field label="Credential revision ID">
                <TextInput
                  required
                  value={credentialRevisionId}
                  onChange={(event) =>
                    setCredentialRevisionId(event.target.value)
                  }
                />
              </Field>
              <Field label="Probe kind">
                <Select
                  value={probeKind}
                  onChange={(event) =>
                    setProbeKind(event.target.value as ProviderHealthProbeKind)
                  }
                >
                  {Object.values(ProviderHealthProbeKind).map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          ) : null}
          <Field label="Reason">
            <TextInput
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <AdminReauthentication onStatusChange={setReauthenticated} />
          <Button
            tone={action === "revoke" ? "danger" : "primary"}
            disabled={
              !reauthenticated ||
              !reason.trim() ||
              (action === "probe" && !credentialRevisionId) ||
              command.isPending
            }
            onClick={() => command.mutate()}
          >
            执行
          </Button>
        </section>
      ) : null}
    </div>
  );
}
