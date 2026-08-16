import { LexicalTargetKind } from "@sylis/api-client/user";

import { authenticatedMutationHeaders } from "../../fixtures/accounts";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2eTags } from "../../runtime";

interface ReleaseEnvelope<T> {
  data: T;
}

test(
  "NOTEBOOK-001-E2E a learner can revise and retire a typed notebook item",
  {
    tag: e2eTags(TestTag.SYSTEM),
  },
  async ({ learnerPage: page, namespace }) => {
    const headers = await authenticatedMutationHeaders(page);
    const searchResponse = await page.request.get(
      "/api/v1/lexicon/search?q=bank&limit=20",
    );
    expect(searchResponse.ok()).toBeTruthy();
    const search = (await searchResponse.json()) as ReleaseEnvelope<{
      headwords: Array<{ headwordId: string; displayText: string }>;
    }>;
    const target = search.data.headwords.find(
      (headword) => headword.displayText === "bank",
    );
    expect(target).toBeTruthy();

    const createResponse = await page.request.post("/api/v1/notebooks", {
      headers,
      data: { name: `E2E notebook ${namespace.value}` },
    });
    expect(createResponse.ok()).toBeTruthy();
    const notebook = (await createResponse.json()) as {
      id: string;
      name: string;
    };

    const addResponse = await page.request.post(
      `/api/v1/notebooks/${notebook.id}/items`,
      {
        headers,
        data: {
          target: {
            kind: LexicalTargetKind.HEADWORD,
            id: target!.headwordId,
          },
          note: "Initial note",
          tags: ["finance"],
        },
      },
    );
    expect(addResponse.ok()).toBeTruthy();
    const item = (await addResponse.json()) as {
      id: string;
      revisionId: string;
    };

    const updateResponse = await page.request.patch(
      `/api/v1/notebooks/${notebook.id}/items/${item.id}`,
      {
        headers,
        data: { note: "Revised note", tags: ["finance", "review"] },
      },
    );
    expect(updateResponse.ok()).toBeTruthy();
    const revised = (await updateResponse.json()) as {
      revisionId: string;
      targetKind: LexicalTargetKind;
    };
    expect(revised.revisionId).not.toBe(item.revisionId);
    expect(revised.targetKind).toBe(LexicalTargetKind.HEADWORD);

    const itemsResponse = await page.request.get(
      `/api/v1/notebooks/${notebook.id}/items`,
    );
    expect(itemsResponse.ok()).toBeTruthy();
    await expect(itemsResponse.json()).resolves.toEqual([
      expect.objectContaining({
        id: item.id,
        revisionId: revised.revisionId,
        note: "Revised note",
        tags: ["finance", "review"],
        displayText: "bank",
      }),
    ]);

    const removeItemResponse = await page.request.delete(
      `/api/v1/notebooks/${notebook.id}/items/${item.id}`,
      { headers },
    );
    expect(removeItemResponse.status()).toBe(204);
    const retiredItems = await page.request.get(
      `/api/v1/notebooks/${notebook.id}/items`,
    );
    await expect(retiredItems.json()).resolves.toEqual([]);

    const removeNotebookResponse = await page.request.delete(
      `/api/v1/notebooks/${notebook.id}`,
      { headers },
    );
    expect(removeNotebookResponse.status()).toBe(204);
    const notebooksResponse = await page.request.get("/api/v1/notebooks");
    const notebooks = (await notebooksResponse.json()) as Array<{ id: string }>;
    expect(notebooks).not.toContainEqual(
      expect.objectContaining({ id: notebook.id }),
    );
  },
);
