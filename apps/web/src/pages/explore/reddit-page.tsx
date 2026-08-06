import { ExternalLink, PageHeader, RefreshCw } from "@sylis/components";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { redditQueries } from "../../modules/reddit";
import { RemoteState } from "../page-utils";
import { asArray, asRecord, stringValue } from "../page-values";

export function RedditPage() {
  const query = useQuery(redditQueries.feed());
  const posts = asArray(query.data).map(asRecord);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Reddit"
        title="社区阅读"
        actions={
          <button
            className="plain-icon"
            onClick={() => query.refetch()}
            title="刷新"
          >
            <RefreshCw />
          </button>
        }
      />
      <RemoteState
        pending={query.isPending}
        error={query.error}
        empty={!query.isPending && posts.length === 0}
      >
        <div className="reading-feed">
          {posts.map((post) => {
            const revision = asRecord(asRecord(post.document).currentRevision);
            return (
              <Link
                key={stringValue(post.postId)}
                to={`/explore/reddit/${stringValue(post.postId)}`}
              >
                <span>r/{stringValue(post.subreddit, "all")}</span>
                <h2>{stringValue(revision.title, "Reddit post")}</h2>
                <p>{stringValue(revision.wordCount, "0")} words</p>
                <small>
                  {stringValue(post.score, "0")} points{" "}
                  <ExternalLink size={13} />
                </small>
              </Link>
            );
          })}
        </div>
      </RemoteState>
    </div>
  );
}
