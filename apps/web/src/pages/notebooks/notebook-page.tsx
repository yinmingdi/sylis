import {
  Button,
  Field,
  NotebookPen,
  PageHeader,
  Plus,
  TextInput,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { notebookCommands, notebookQueries } from "../../modules/notebooks";
import { RemoteState } from "../page-utils";
import { asArray, asRecord, stringValue } from "../page-values";

export function NotebookPage() {
  const query = useQuery(notebookQueries.list);
  const cache = useQueryClient();
  const [title, setTitle] = useState("");
  const create = useMutation({
    mutationFn: () => notebookCommands.create({ title }),
    onSuccess: async () => {
      setTitle("");
      await cache.invalidateQueries({
        queryKey: notebookQueries.list.queryKey,
      });
    },
  });
  const notebooks = asArray(query.data).map(asRecord);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Notebook"
        title="生词本"
        actions={
          <form
            className="inline-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (title.trim()) create.mutate();
            }}
          >
            <Field label="新建生词本">
              <TextInput
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="名称"
              />
            </Field>
            <Button icon={Plus} type="submit" disabled={!title.trim()}>
              新建
            </Button>
          </form>
        }
      />
      <RemoteState
        pending={query.isPending}
        error={query.error}
        empty={!query.isPending && notebooks.length === 0}
      >
        <div className="book-grid">
          {notebooks.map((notebook) => (
            <article key={stringValue(notebook.id)}>
              <NotebookPen />
              <span>
                {stringValue(
                  notebook._count ? asRecord(notebook._count).items : "0",
                )}{" "}
                项
              </span>
              <h2>{stringValue(notebook.title)}</h2>
              <p>{stringValue(notebook.description, "")}</p>
              <Link to={`/notebooks/${stringValue(notebook.id)}`}>打开</Link>
            </article>
          ))}
        </div>
      </RemoteState>
    </div>
  );
}
