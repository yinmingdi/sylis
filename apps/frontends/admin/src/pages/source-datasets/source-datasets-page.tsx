import {
  SourceDatasetVersionStatus,
  type AdminJsonObject,
} from "@sylis/api-client/admin";
import {
  Button,
  DataList,
  Field,
  PageHeader,
  RefreshCw,
  TextInput,
  Toggle,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { QueryBoundary } from "../../components";
import { AdminReauthentication } from "../../modules/identity";
import { useAdminQueryScope } from "../../modules/identity";
import {
  sourceDatasetCommands,
  sourceDatasetQueries,
} from "../../modules/source-datasets";
import { array, record, value } from "../../utils";

export function SourceDatasetsPage() {
  const scope = useAdminQueryScope();
  const { datasetId = "", versionId = "" } = useParams();
  const query = useQuery(sourceDatasetQueries.list(scope));
  const synchronizationQuery = useQuery({
    ...sourceDatasetQueries.synchronizations(scope, versionId),
    enabled: Boolean(versionId),
  });
  const cache = useQueryClient();
  const [reauthenticated, setReauthenticated] = useState(false);
  const [datasetKey, setDatasetKey] = useState("");
  const [datasetName, setDatasetName] = useState("");
  const [homepageUri, setHomepageUri] = useState("");
  const [version, setVersion] = useState("");
  const [sourceUri, setSourceUri] = useState("");
  const [checksum, setChecksum] = useState("");
  const [adapter, setAdapter] = useState("");
  const [parserVersion, setParserVersion] = useState("");
  const [schemaVersion, setSchemaVersion] = useState("");
  const [mayBuild, setMayBuild] = useState(false);
  const [mayServe, setMayServe] = useState(false);
  const [mayExport, setMayExport] = useState(false);
  const [attribution, setAttribution] = useState("");
  const datasets = useMemo(() => array(query.data).map(record), [query.data]);
  const selectedDataset = datasets.find((item) => value(item.id) === datasetId);
  const selectedVersion = array(selectedDataset?.versions)
    .map(record)
    .find((item) => value(item.id) === versionId);

  const register = useMutation({
    mutationFn: () =>
      sourceDatasetCommands.registerVersion({
        datasetKey,
        datasetName,
        homepageUri,
        version,
        sourceUri,
        checksum,
        retrievedAt: new Date().toISOString(),
        adapter,
        parserVersion,
        schemaVersion,
        validationSummary: {} as AdminJsonObject,
        status: SourceDatasetVersionStatus.REGISTERED,
        rights: {
          mayBuild,
          mayServe,
          mayExport,
          requiresAttribution: Boolean(attribution.trim()),
          ...(attribution.trim() ? { attribution: attribution.trim() } : {}),
          effectiveFrom: new Date().toISOString(),
        },
      }),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: sourceDatasetQueries.list(scope).queryKey,
      }),
  });
  const synchronize = useMutation({
    mutationFn: () =>
      sourceDatasetCommands.synchronize(versionId, crypto.randomUUID()),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: sourceDatasetQueries.synchronizations(scope, versionId)
          .queryKey,
      }),
  });

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="Source registry"
        title="Source Datasets"
        actions={
          versionId ? (
            <Button
              icon={RefreshCw}
              disabled={!reauthenticated || synchronize.isPending}
              onClick={() => synchronize.mutate()}
            >
              创建同步任务
            </Button>
          ) : null
        }
      />
      <div className="admin-agent-layout" data-detail={Boolean(versionId)}>
        <QueryBoundary pending={query.isPending} error={query.error}>
          <DataList
            rows={datasets.flatMap((dataset) =>
              array(dataset.versions)
                .map(record)
                .map((datasetVersion) => ({
                  label: `${value(dataset.name, value(dataset.key))} · ${value(datasetVersion.version)}`,
                  value: value(datasetVersion.status),
                  detail: `${value(datasetVersion.checksum)} · ${value(datasetVersion.retrievedAt)}`,
                  action: (
                    <Link
                      className="sy-button sy-button--quiet"
                      to={`/lexicon/sources/${value(dataset.id)}/versions/${value(datasetVersion.id)}`}
                    >
                      查看
                    </Link>
                  ),
                })),
            )}
          />
        </QueryBoundary>
        {versionId ? (
          <aside className="admin-agent-detail">
            <header>
              <div>
                <span>Dataset version</span>
                <h2>{value(selectedVersion?.version, versionId)}</h2>
              </div>
              <Link to="/lexicon/sources">关闭</Link>
            </header>
            <dl className="admin-agent-facts">
              {Object.entries(selectedVersion ?? {}).map(([key, item]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>
                    {value(item, typeof item === "object" ? "structured" : "-")}
                  </dd>
                </div>
              ))}
            </dl>
            <AdminReauthentication onStatusChange={setReauthenticated} />
            <QueryBoundary
              pending={synchronizationQuery.isPending}
              error={synchronizationQuery.error}
            >
              <DataList
                rows={array(synchronizationQuery.data)
                  .map(record)
                  .map((item) => ({
                    label: value(item.id),
                    value: value(item.status),
                    detail: value(item.createdAt),
                  }))}
              />
            </QueryBoundary>
          </aside>
        ) : null}
      </div>
      {!versionId ? (
        <form
          className="admin-command admin-command--stacked"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (reauthenticated) register.mutate();
          }}
        >
          <Field label="Dataset key">
            <TextInput
              required
              value={datasetKey}
              onChange={(event) => setDatasetKey(event.target.value)}
            />
          </Field>
          <Field label="Name">
            <TextInput
              required
              value={datasetName}
              onChange={(event) => setDatasetName(event.target.value)}
            />
          </Field>
          <Field label="Homepage URI">
            <TextInput
              required
              type="url"
              value={homepageUri}
              onChange={(event) => setHomepageUri(event.target.value)}
            />
          </Field>
          <Field label="Version">
            <TextInput
              required
              value={version}
              onChange={(event) => setVersion(event.target.value)}
            />
          </Field>
          <Field label="Source URI">
            <TextInput
              required
              type="url"
              value={sourceUri}
              onChange={(event) => setSourceUri(event.target.value)}
            />
          </Field>
          <Field label="SHA-256">
            <TextInput
              required
              pattern="sha256:[a-f0-9]{64}"
              value={checksum}
              onChange={(event) => setChecksum(event.target.value)}
            />
          </Field>
          <Field label="Adapter">
            <TextInput
              required
              value={adapter}
              onChange={(event) => setAdapter(event.target.value)}
            />
          </Field>
          <Field label="Parser version">
            <TextInput
              required
              value={parserVersion}
              onChange={(event) => setParserVersion(event.target.value)}
            />
          </Field>
          <Field label="Schema version">
            <TextInput
              required
              value={schemaVersion}
              onChange={(event) => setSchemaVersion(event.target.value)}
            />
          </Field>
          <Field label="Attribution">
            <TextInput
              value={attribution}
              onChange={(event) => setAttribution(event.target.value)}
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
          <Button
            type="submit"
            disabled={!reauthenticated || register.isPending}
          >
            注册版本
          </Button>
        </form>
      ) : null}
    </div>
  );
}
