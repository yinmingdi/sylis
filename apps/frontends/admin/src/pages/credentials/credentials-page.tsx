import { CredentialStatus, CredentialType } from "@sylis/api-client/admin";
import {
  Button,
  DataList,
  Field,
  PageHeader,
  Select,
  TextInput,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { QueryBoundary } from "../../components";
import { credentialCommands, credentialQuery } from "../../modules/credentials";
import { useAdminQueryScope } from "../../modules/identity";
import { AdminReauthentication } from "../../modules/identity";
import { providerRouteQuery } from "../../modules/provider-routes";

enum CredentialAction {
  VALIDATE = "VALIDATE",
  QUARANTINE = "QUARANTINE",
  RESTORE = "RESTORE",
  REVOKE = "REVOKE",
  ROTATE = "ROTATE",
}

export function CredentialsPage() {
  const scope = useAdminQueryScope();
  const query = useQuery(credentialQuery(scope));
  const routes = useQuery(providerRouteQuery(scope));
  const cache = useQueryClient();
  const [providerKey, setProviderKey] = useState("deepseek");
  const [label, setLabel] = useState("DeepSeek platform");
  const [credentialType, setCredentialType] = useState(CredentialType.API_KEY);
  const [secret, setSecret] = useState("");
  const [reason, setReason] = useState("");
  const [profileId, setProfileId] = useState("");
  const [revisionId, setRevisionId] = useState("");
  const [validationProviderKey, setValidationProviderKey] = useState("");
  const [routeReleaseId, setRouteReleaseId] = useState("");
  const [action, setAction] = useState(CredentialAction.QUARANTINE);
  const [reauthenticated, setReauthenticated] = useState(false);
  const validationRoutes = useMemo(
    () =>
      (routes.data ?? []).filter(
        (route) => route.providerKey === validationProviderKey,
      ),
    [routes.data, validationProviderKey],
  );
  useEffect(() => {
    if (
      action === CredentialAction.VALIDATE &&
      !validationRoutes.some((route) => route.id === routeReleaseId)
    ) {
      setRouteReleaseId(validationRoutes[0]?.id ?? "");
    }
  }, [action, routeReleaseId, validationRoutes]);
  const create = useMutation({
    mutationFn: () =>
      credentialCommands.createCredential({
        providerKey,
        label,
        credentialType,
        secret,
        metadata: {},
        reason,
      }),
    onSuccess: async () => {
      setSecret("");
      setReason("");
      await cache.invalidateQueries({
        queryKey: credentialQuery(scope).queryKey,
      });
    },
  });
  const lifecycle = useMutation({
    mutationFn: () => {
      if (action === CredentialAction.VALIDATE) {
        return credentialCommands.validateCredential(
          revisionId,
          routeReleaseId,
          reason,
        );
      }
      if (action === CredentialAction.ROTATE) {
        return credentialCommands.rotateCredential(profileId, {
          credentialType,
          secret,
          metadata: {},
          reason,
        });
      }
      if (action === CredentialAction.REVOKE)
        return credentialCommands.revokeCredential(profileId, reason);
      return action === CredentialAction.QUARANTINE
        ? credentialCommands.quarantineCredential(profileId, reason)
        : credentialCommands.restoreCredential(profileId, reason);
    },
    onSuccess: async () => {
      setSecret("");
      setReason("");
      setProfileId("");
      setRevisionId("");
      setValidationProviderKey("");
      setRouteReleaseId("");
      await cache.invalidateQueries({
        queryKey: credentialQuery(scope).queryKey,
      });
    },
  });

  return (
    <div className="admin-page">
      <PageHeader eyebrow="Secret lifecycle" title="Credentials" />
      <form
        className="admin-command admin-command--stacked"
        autoComplete="off"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (reauthenticated) create.mutate();
        }}
      >
        <Field label="Provider">
          <TextInput
            required
            value={providerKey}
            onChange={(event) => setProviderKey(event.target.value)}
          />
        </Field>
        <Field label="Label">
          <TextInput
            required
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>
        <Field label="Credential type">
          <Select
            value={credentialType}
            onChange={(event) =>
              setCredentialType(event.target.value as CredentialType)
            }
          >
            {Object.values(CredentialType).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Secret">
          <TextInput
            required
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
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
        <Button
          type="submit"
          disabled={
            !reauthenticated || !secret || reason.length < 8 || create.isPending
          }
        >
          创建凭据
        </Button>
      </form>
      <QueryBoundary pending={query.isPending} error={query.error}>
        <DataList
          rows={(query.data ?? []).map((profile) => {
            const latestRevision = profile.revisions[0];
            const latestRevisionDetail = latestRevision
              ? `revision ${latestRevision.revisionNo} ${latestRevision.status} ${latestRevision.maskedHint}`
              : "no revisions";
            return {
              label: `${profile.providerKey} · ${profile.label}`,
              value: profile.status,
              detail: `${latestRevisionDetail} · active ${profile.currentRevisionId ?? "none"} · ${profile.id}`,
              action: (
                <div className="row-actions">
                  {latestRevision?.status === CredentialStatus.PENDING ? (
                    <Button
                      tone="primary"
                      onClick={() => {
                        setProfileId(profile.id);
                        setRevisionId(latestRevision.id);
                        setValidationProviderKey(profile.providerKey);
                        setAction(CredentialAction.VALIDATE);
                      }}
                    >
                      验证
                    </Button>
                  ) : null}
                  <Button
                    tone="quiet"
                    onClick={() => {
                      setProfileId(profile.id);
                      setAction(CredentialAction.ROTATE);
                    }}
                  >
                    轮换
                  </Button>
                  <Button
                    tone="secondary"
                    onClick={() => {
                      setProfileId(profile.id);
                      setAction(CredentialAction.QUARANTINE);
                    }}
                  >
                    隔离
                  </Button>
                  <Button
                    tone="danger"
                    onClick={() => {
                      setProfileId(profile.id);
                      setAction(CredentialAction.REVOKE);
                    }}
                  >
                    撤销
                  </Button>
                  <Button
                    tone="quiet"
                    onClick={() => {
                      setProfileId(profile.id);
                      setAction(CredentialAction.RESTORE);
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
      {profileId ? (
        <section className="admin-risk-command">
          <h2>{action.toUpperCase()} Credential</h2>
          <p>{profileId}</p>
          {action === CredentialAction.VALIDATE ? (
            <Field label="Provider Route">
              <Select
                required
                value={routeReleaseId}
                onChange={(event) => setRouteReleaseId(event.target.value)}
              >
                {validationRoutes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.providerKey} / {route.modelId}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {action === CredentialAction.ROTATE ? (
            <Field label="New secret">
              <TextInput
                required
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
              />
            </Field>
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
            tone={
              [
                CredentialAction.VALIDATE,
                CredentialAction.RESTORE,
                CredentialAction.ROTATE,
              ].includes(action)
                ? "primary"
                : "danger"
            }
            disabled={
              !reauthenticated ||
              reason.trim().length < 8 ||
              (action === CredentialAction.VALIDATE && !routeReleaseId) ||
              (action === CredentialAction.ROTATE && !secret) ||
              lifecycle.isPending
            }
            onClick={() => lifecycle.mutate()}
          >
            {action === CredentialAction.VALIDATE ? "验证并启用" : "执行"}
          </Button>
        </section>
      ) : null}
    </div>
  );
}
