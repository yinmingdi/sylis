import { DataList, PageHeader } from "@sylis/components";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { QueryBoundary } from "../../components";
import { record, value } from "../../utils";
import { assetQueries } from "../../modules/assets";
import { useAdminQueryScope } from "../../modules/identity";

export function AssetsPage() {
  const scope = useAdminQueryScope();
  const { assetId = "" } = useParams();
  const list = useQuery(assetQueries.list(scope));
  const detail = useQuery({
    ...assetQueries.detail(scope, assetId),
    enabled: Boolean(assetId),
  });
  return (
    <div className="admin-page">
      <PageHeader eyebrow="Redacted metadata" title="Assets" />
      <div className="admin-agent-layout" data-detail={Boolean(assetId)}>
        <QueryBoundary pending={list.isPending} error={list.error}>
          <DataList
            rows={(list.data ?? []).map((asset) => {
              const revision = record(asset.currentRevision);
              return {
                label: value(revision.filename, asset.id),
                value: value(asset.status),
                detail: `${value(asset.purpose)} · ${value(revision.detectedMimeType, value(revision.declaredMimeType))} · ${asset.id}`,
                action: (
                  <Link
                    className="sy-button sy-button--quiet"
                    to={`/assets/${asset.id}`}
                  >
                    查看
                  </Link>
                ),
              };
            })}
          />
        </QueryBoundary>
        {assetId ? (
          <aside className="admin-agent-detail">
            <header>
              <div>
                <span>Asset metadata</span>
                <h2>{assetId}</h2>
              </div>
              <Link to="/assets">关闭</Link>
            </header>
            <QueryBoundary pending={detail.isPending} error={detail.error}>
              <dl className="admin-agent-facts">
                {Object.entries(record(detail.data)).map(([key, item]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>
                      {value(
                        item,
                        typeof item === "object" ? "structured" : "-",
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </QueryBoundary>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
