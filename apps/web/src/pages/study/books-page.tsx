import {
  BookOpen,
  Button,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@sylis/components";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import { booksQueries } from "../../modules/books";
import { RemoteState } from "../page-utils";
import { asArray, asRecord, stringValue } from "../page-values";

export function BooksPage() {
  const query = useQuery(booksQueries.list);
  const navigate = useNavigate();
  const enrollmentQuery = useQuery(booksQueries.enrollments);
  const books = asArray(query.data).map(asRecord);
  const enrollments = asArray(enrollmentQuery.data).map(asRecord);

  return (
    <div className="page">
      <PageHeader eyebrow="Vocabulary books" title="词书" />
      <RemoteState
        pending={query.isPending}
        error={query.error}
        empty={!query.isPending && books.length === 0}
      >
        <div className="book-grid">
          {books.map((book) => {
            const edition = asRecord(asArray(book.editions)[0]);
            const enrollment = enrollments.find(
              (item) => item.bookId === book.id && item.active === true,
            );
            return (
              <article key={stringValue(book.id)}>
                <BookOpen aria-hidden="true" />
                <span>{stringValue(book.languageTag, "en")}</span>
                <h2>{stringValue(book.title)}</h2>
                <p>{stringValue(book.description, "")}</p>
                {enrollment ? (
                  <StatusBadge tone="positive">学习中</StatusBadge>
                ) : null}
                {edition.id ? (
                  <Button
                    tone="secondary"
                    onClick={() =>
                      navigate(
                        `/study/books/${stringValue(book.id)}/editions/${stringValue(edition.id)}`,
                      )
                    }
                  >
                    查看 {stringValue(edition.version)}
                  </Button>
                ) : null}
              </article>
            );
          })}
        </div>
      </RemoteState>
      {!query.isPending && books.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="暂无词书"
          description="当前 release 没有可用词书。"
          action={<Link to="/lexicon/search">浏览词典</Link>}
        />
      ) : null}
    </div>
  );
}
