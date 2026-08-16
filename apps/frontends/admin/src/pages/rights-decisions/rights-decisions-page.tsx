import { RightsEvidenceKind } from "@sylis/api-client/admin";
import {
  Button,
  Field,
  PageHeader,
  Select,
  TextInput,
  Toggle,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { EntityRows, QueryBoundary } from "../../components";
import { AdminReauthentication } from "../../modules/identity";
import { useAdminQueryScope } from "../../modules/identity";
import {
  rightsDecisionCommands,
  rightsPolicyQuery,
} from "../../modules/rights-decisions";

export function RightsDecisionsPage() {
  const scope = useAdminQueryScope();
  const query = useQuery(rightsPolicyQuery(scope));
  const cache = useQueryClient();
  const [versionId, setVersionId] = useState("");
  const [policyVersion, setPolicyVersion] = useState("source-rights/1");
  const [evidenceKind, setEvidenceKind] = useState(
    RightsEvidenceKind.LICENSE_TEXT,
  );
  const [evidenceUri, setEvidenceUri] = useState("");
  const [evidenceHash, setEvidenceHash] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [attribution, setAttribution] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [reason, setReason] = useState("");
  const [mayBuild, setMayBuild] = useState(false);
  const [mayServe, setMayServe] = useState(false);
  const [mayExport, setMayExport] = useState(false);
  const [reauthenticated, setReauthenticated] = useState(false);
  const decide = useMutation({
    mutationFn: () =>
      rightsDecisionCommands.decideRights(versionId, {
        policyVersion,
        evidence: [
          {
            evidenceKind,
            referenceUri: evidenceUri.trim(),
            contentHash: evidenceHash.trim(),
            ...(evidenceNote.trim() ? { note: evidenceNote.trim() } : {}),
            capturedAt: new Date().toISOString(),
          },
        ],
        mayBuild,
        mayServe,
        mayExport,
        ...(attribution.trim() ? { attribution: attribution.trim() } : {}),
        restrictions: restrictions
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        effectiveAt: new Date().toISOString(),
        reason,
      }),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: rightsPolicyQuery(scope).queryKey }),
  });

  return (
    <div className="admin-page">
      <PageHeader eyebrow="Source governance" title="Rights Decisions" />
      <form
        className="admin-command admin-command--stacked"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (reauthenticated) decide.mutate();
        }}
      >
        <Field label="Dataset version ID">
          <TextInput
            required
            value={versionId}
            onChange={(event) => setVersionId(event.target.value)}
          />
        </Field>
        <Field label="Policy version">
          <TextInput
            required
            value={policyVersion}
            onChange={(event) => setPolicyVersion(event.target.value)}
          />
        </Field>
        <Field label="Evidence kind">
          <Select
            value={evidenceKind}
            onChange={(event) =>
              setEvidenceKind(event.target.value as RightsEvidenceKind)
            }
          >
            {Object.values(RightsEvidenceKind).map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Evidence URI">
          <TextInput
            required
            type="url"
            value={evidenceUri}
            onChange={(event) => setEvidenceUri(event.target.value)}
          />
        </Field>
        <Field label="Evidence SHA-256">
          <TextInput
            required
            pattern="sha256:[a-f0-9]{64}"
            value={evidenceHash}
            onChange={(event) => setEvidenceHash(event.target.value)}
          />
        </Field>
        <Field label="Evidence note">
          <TextInput
            value={evidenceNote}
            onChange={(event) => setEvidenceNote(event.target.value)}
          />
        </Field>
        <Field label="Attribution">
          <TextInput
            value={attribution}
            onChange={(event) => setAttribution(event.target.value)}
          />
        </Field>
        <Field label="Restrictions (comma separated)">
          <TextInput
            value={restrictions}
            onChange={(event) => setRestrictions(event.target.value)}
          />
        </Field>
        <Field label="Reason">
          <TextInput
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <Toggle
          checked={mayBuild}
          label="May build"
          onCheckedChange={setMayBuild}
        />
        <Toggle
          checked={mayServe}
          label="May serve"
          onCheckedChange={setMayServe}
        />
        <Toggle
          checked={mayExport}
          label="May export"
          onCheckedChange={setMayExport}
        />
        <AdminReauthentication onStatusChange={setReauthenticated} />
        <Button type="submit" disabled={!reauthenticated || decide.isPending}>
          记录决定
        </Button>
      </form>
      <QueryBoundary pending={query.isPending} error={query.error}>
        <EntityRows data={query.data} />
      </QueryBoundary>
    </div>
  );
}
