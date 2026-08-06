import { Button, Field, PageHeader, TextInput } from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { EntityRows, QueryBoundary } from "../../app/view-utils";
import { AdminReauthentication } from "../../modules/identity";
import { operationCommands, operationQueries } from "../../modules/operations";

export function ImportsPage() {
  const query = useQuery(operationQueries.imports);
  const cache = useQueryClient();
  const [artifactUri, setUri] = useState("");
  const [artifactHash, setHash] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const create = useMutation({
    mutationFn: () =>
      operationCommands.imports.create(
        { artifactUri, artifactHash },
        crypto.randomUUID(),
      ),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: operationQueries.imports.queryKey }),
  });
  return (
    <div className="admin-page">
      <PageHeader eyebrow="Lexicon importer" title="导入" />
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
            value={artifactHash}
            onChange={(event) => setHash(event.target.value)}
          />
        </Field>
        <AdminReauthentication onStatusChange={setReauthenticated} />
        <Button type="submit" disabled={!reauthenticated || create.isPending}>
          创建导入
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
