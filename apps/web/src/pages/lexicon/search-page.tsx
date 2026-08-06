import { EmptyState, PageHeader, Search, TextInput } from "@sylis/components";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { lexiconQueries } from "../../modules/lexicon";
import { asRecord, stringValue } from "../page-values";

export function LexiconSearchPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const searchTerm = params.get("q")?.trim() ?? "";
  const request = useQuery({
    ...lexiconQueries.search(searchTerm),
    enabled: searchTerm.length > 0,
  });
  const headwords = request.data?.headwords ?? [];
  const collocations = request.data?.collocations ?? [];
  return (
    <div className="page">
      <PageHeader eyebrow="Lexicon" title="词典" />
      <form
        className="search-box"
        onSubmit={(event) => {
          event.preventDefault();
          setParams(query.trim() ? { q: query.trim() } : {});
        }}
      >
        <Search aria-hidden="true" />
        <TextInput
          aria-label="搜索词典"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入单词或词组"
        />
      </form>
      {request.isPending ? (
        <div className="skeleton-lines">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {!request.isPending && !params.get("q") ? (
        <EmptyState
          icon={Search}
          title="搜索词典"
          description="输入单词或词组。"
        />
      ) : null}
      {request.isError ? (
        <EmptyState
          icon={Search}
          title="搜索失败"
          description={request.error.message}
        />
      ) : null}
      {headwords.length > 0 ? (
        <section className="search-results">
          <h2>词条</h2>
          {headwords.map((item) => (
            <Link
              key={item.headwordId}
              to={`/lexicon/headwords/${item.headwordId}`}
            >
              <strong>{item.displayText}</strong>
              <span>
                {item.entries
                  .map((entry) => entry.partOfSpeechCode)
                  .join(" · ")}
              </span>
            </Link>
          ))}
        </section>
      ) : null}
      {collocations.length > 0 ? (
        <section className="search-results">
          <h2>词组</h2>
          {collocations.map((value, index) => {
            const item = asRecord(value);
            return (
              <div key={stringValue(item.id, String(index))}>
                <strong>{stringValue(item.canonicalText)}</strong>
              </div>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
