import { PageHeader, Section } from "@sylis/components";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { redditQueries } from "../../modules/reddit";
import { RemoteState } from "../page-utils";
import { asRecord, stringValue } from "../page-values";

export function RedditPostPage() {
  const { externalId = "" } = useParams();
  const query = useQuery(redditQueries.post(externalId));
  const post = asRecord(query.data);
  const revision = asRecord(asRecord(post.document).currentRevision);
  return (
    <div className="page reading-document">
      <PageHeader
        eyebrow={`r/${stringValue(post.subreddit, "reddit")}`}
        title={stringValue(revision.title, "帖子")}
      />
      <RemoteState pending={query.isPending} error={query.error}>
        <Section>
          <div className="prose">{stringValue(revision.content, "")}</div>
        </Section>
        <Section>
          <h2>来源</h2>
          <a
            href={stringValue(post.sourceUrl)}
            rel="noreferrer"
            target="_blank"
          >
            {stringValue(post.sourceUrl)}
          </a>
        </Section>
      </RemoteState>
    </div>
  );
}
