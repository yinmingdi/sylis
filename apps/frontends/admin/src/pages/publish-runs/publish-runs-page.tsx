import { Button, Field, PageHeader, TextInput } from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { EntityRows, QueryBoundary } from "../../components";
import { AdminReauthentication } from "../../modules/identity";
import { useAdminQueryScope } from "../../modules/identity";
import {
  publishRunCommands,
  publishRunQueries,
} from "../../modules/publish-runs";

export function PublishRunsPage() {
  const scope = useAdminQueryScope();
  const query = useQuery(publishRunQueries.list(scope));
  const cache = useQueryClient();
  const [artifactUri, setUri] = useState("");
  const [artifactHash, setHash] = useState("");
  const [expectedSchema, setExpectedSchema] = useState(
    "sylis.lexicon-artifact/1",
  );
  const [reauthenticated, setReauthenticated] = useState(false);
  const create = useMutation({
    mutationFn: () =>
      publishRunCommands.create(
        { artifactUri, artifactHash, expectedSchema },
        crypto.randomUUID(),
      ),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: publishRunQueries.list(scope).queryKey,
      }),
  });

  return (
    <div className="admin-page">
      <PageHeader eyebrow="Lexicon publisher" title="Publish Runs" />
      <form
        className="admin-command"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (reauthenticated) create.mutate();
        }}
      >
        <Field label="Artifact URI">
          <TextInput
            required
            value={artifactUri}
            onChange={(event) => setUri(event.target.value)}
          />
        </Field>
        <Field label="SHA-256">
          <TextInput
            required
            pattern="sha256:[a-f0-9]{64}"
            value={artifactHash}
            onChange={(event) => setHash(event.target.value)}
          />
        </Field>
        <Field label="Expected schema">
          <TextInput
            required
            value={expectedSchema}
            onChange={(event) => setExpectedSchema(event.target.value)}
          />
        </Field>
        <AdminReauthentication onStatusChange={setReauthenticated} />
        <Button type="submit" disabled={!reauthenticated || create.isPending}>
          创建发布任务
        </Button>
        {create.error ? (
          <p className="admin-error">{create.error.message}</p>
        ) : null}
      </form>
      <QueryBoundary pending={query.isPending} error={query.error}>
        <EntityRows data={query.data} />
      </QueryBoundary>
    </div>
  );
}
