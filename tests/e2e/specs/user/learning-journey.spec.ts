import {
  ConsentDataCategory,
  ConsentDecision,
  ConsentPurpose,
  ExerciseResponseKind,
  type LexiconEntryView,
  type LexiconHeadwordView,
  type LexiconSenseView,
  type PedagogicalMaterialView,
} from "@sylis/api-client/user";

import {
  authenticatedMutationHeaders,
  registerUser,
  registerUserViaApi,
} from "../../fixtures/accounts";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2eTags } from "../../runtime";

interface ReleaseEnvelope<T> {
  releaseId: string;
  releaseVersion: string;
  data: T;
}

interface SearchHeadword {
  headwordId: string;
  displayText: string;
  entries: Array<{ entryId: string }>;
}

interface BookListItem {
  id: string;
  editions: Array<{ id: string; _count: { items: number } }>;
}

test(
  "LEXICON-001-E2E the active lexicon exposes structured senses, forms, relations, and collocations",
  {
    tag: e2eTags(TestTag.SYSTEM),
  },
  async ({ page }) => {
    const searchResponse = await page.request.get(
      "/api/v1/lexicon/search?q=bank&limit=20",
    );
    expect(searchResponse.ok()).toBeTruthy();
    const search = (await searchResponse.json()) as ReleaseEnvelope<{
      headwords: SearchHeadword[];
      collocations: unknown[];
    }>;
    const bank = search.data.headwords.find(
      (item) => item.displayText === "bank",
    );
    expect(bank).toBeTruthy();

    const detailResponse = await page.request.get(
      `/api/v1/lexicon/headwords/${bank!.headwordId}`,
    );
    expect(detailResponse.ok()).toBeTruthy();
    const detail =
      (await detailResponse.json()) as ReleaseEnvelope<LexiconHeadwordView>;
    expect(detail.releaseId).toBe(search.releaseId);
    const bankEntry = detail.data.entries[0]!;
    expect(
      bankEntry.forms.flatMap((form) =>
        form.representations.map((representation) => representation.text),
      ),
    ).toEqual(expect.arrayContaining(["bank", "/bæŋk/"]));
    expect(bankEntry.forms.flatMap((form) => form.media)).toContainEqual(
      expect.objectContaining({
        roleCode: "PRONUNCIATION",
        regionTag: "en-US",
        media: expect.objectContaining({
          mediaType: "AUDIO",
          mimeType: "audio/mpeg",
          byteLength: "2048",
        }),
      }),
    );
    expect(bankEntry.senses).toHaveLength(2);
    for (const sense of bankEntry.senses) {
      expect(sense.definitions[0]?.text).toBeTruthy();
      expect(sense.translations[0]?.text).toBeTruthy();
      const senseResponse = await page.request.get(
        `/api/v1/lexicon/senses/${sense.senseId}`,
      );
      expect(senseResponse.ok()).toBeTruthy();
      const senseDetail =
        (await senseResponse.json()) as ReleaseEnvelope<LexiconSenseView>;
      expect(senseDetail.data.examples.length).toBeGreaterThan(0);
      if (sense.definitions[0]?.text.startsWith("An organization")) {
        expect(senseDetail.data.usages).toContainEqual(
          expect.objectContaining({
            usageTypeCode: "DOMAIN",
            valueCode: "FINANCE",
          }),
        );
        expect(
          senseDetail.data.examples[0]!.example.citations[0],
        ).toMatchObject({ verified: true, year: 2026 });
        const concept = senseDetail.data.memberships[0]!.conceptRevision;
        expect(concept.definitions[0]!.text).toContain("financial services");
        expect(concept.outgoingRelations[0]).toMatchObject({
          typeCode: "HYPERNYM",
          direction: "DIRECTED",
        });
        expect(
          concept.outgoingRelations[0]!.target.definitions[0]!.text,
        ).toContain("established organization");
        const relatedHeadwords = [
          ...senseDetail.data.outgoingRelations.map(
            (relation) =>
              relation.target.entryRevision.headwordRevision.displayText,
          ),
          ...senseDetail.data.incomingRelations.map(
            (relation) =>
              relation.source.entryRevision.headwordRevision.displayText,
          ),
        ];
        expect(relatedHeadwords).toContain("account");
      }
    }

    const bankEntryResponse = await page.request.get(
      `/api/v1/lexicon/entries/${bankEntry.entryId}`,
    );
    expect(bankEntryResponse.ok()).toBeTruthy();
    const bankEntryDetail =
      (await bankEntryResponse.json()) as ReleaseEnvelope<LexiconEntryView>;
    expect(bankEntryDetail.data.headedCollocations).toContainEqual(
      expect.objectContaining({ canonicalText: "bank account" }),
    );
    expect(bankEntryDetail.data.etymologyHypotheses[0]).toMatchObject({
      hypothesisType: "BORROWING",
      status: "ACCEPTED",
    });
    expect(
      bankEntryDetail.data.etymologyHypotheses[0]!.links[0]!.sourceEtymons[0]!
        .etymon,
    ).toMatchObject({ languageTag: "non", form: "banki" });

    const entryMaterials = (await (
      await page.request.get(
        `/api/v1/lexicon/entries/${bankEntry.entryId}/materials`,
      )
    ).json()) as ReleaseEnvelope<PedagogicalMaterialView[]>;
    expect(entryMaterials.data).toContainEqual(
      expect.objectContaining({
        kind: "MNEMONIC",
        blocks: expect.arrayContaining([
          expect.objectContaining({ blockKind: "TEXT" }),
        ]),
      }),
    );

    const financialSense = bankEntry.senses.find((sense) =>
      sense.definitions.some((definition) =>
        definition.text.startsWith("An organization"),
      ),
    )!;
    const senseMaterials = (await (
      await page.request.get(
        `/api/v1/lexicon/senses/${financialSense.senseId}/materials`,
      )
    ).json()) as ReleaseEnvelope<PedagogicalMaterialView[]>;
    expect(senseMaterials.data).toContainEqual(
      expect.objectContaining({ kind: "LEARNER_EXPLANATION" }),
    );

    const runSearch = (await (
      await page.request.get("/api/v1/lexicon/search?q=run&limit=20")
    ).json()) as ReleaseEnvelope<{ headwords: SearchHeadword[] }>;
    const run = runSearch.data.headwords.find(
      (item) => item.displayText === "run",
    );
    const runHeadword = (await (
      await page.request.get(`/api/v1/lexicon/headwords/${run!.headwordId}`)
    ).json()) as ReleaseEnvelope<LexiconHeadwordView>;
    const runEntry = runHeadword.data.entries[0]!;
    expect(
      runEntry.forms.flatMap((form) =>
        form.representations.map((representation) => representation.text),
      ),
    ).toEqual(expect.arrayContaining(["run", "ran", "runs"]));
    const runsRepresentation = runEntry.forms
      .flatMap((form) => form.representations)
      .find((representation) => representation.text === "runs")!;
    expect(runsRepresentation.analyses[0]!.segments).toMatchObject([
      { surfaceText: "run", roleCode: "ROOT" },
      { surfaceText: "s", roleCode: "SUFFIX" },
    ]);
    expect(runEntry.inflectionGenerations).toHaveLength(2);
    expect(runEntry.frames[0]).toMatchObject({
      frameTypeCode: "INTRANSITIVE",
      displayTemplate: "SUBJECT runs",
    });
    expect(runEntry.senses[0]!.frames[0]!.mappings[0]).toMatchObject({
      syntacticArgument: { functionCode: "SUBJECT" },
      semanticArgument: { roleCode: "AGENT" },
    });

    const helpfulSearch = (await (
      await page.request.get("/api/v1/lexicon/search?q=helpful&limit=20")
    ).json()) as ReleaseEnvelope<{
      headwords: SearchHeadword[];
      collocations: Array<{ canonicalText: string }>;
    }>;
    expect(helpfulSearch.data.collocations).toContainEqual(
      expect.objectContaining({ canonicalText: "helpful advice" }),
    );
    const helpfulHeadword = helpfulSearch.data.headwords.find(
      (item) => item.displayText === "helpful",
    )!;
    const helpfulEntry = (await (
      await page.request.get(
        `/api/v1/lexicon/entries/${helpfulHeadword.entries[0]!.entryId}`,
      )
    ).json()) as ReleaseEnvelope<LexiconEntryView>;
    expect(helpfulEntry.data.wordFormations[0]).toMatchObject({
      formationTypeCode: "AFFIXATION",
      inputs: [
        { roleCode: "BASE" },
        {
          roleCode: "SUFFIX",
          morpheme: { identityKey: "en:-ful:derivational-suffix" },
        },
      ],
    });
    expect([
      ...helpfulEntry.data.outgoingRelations,
      ...helpfulEntry.data.incomingRelations,
    ]).toContainEqual(
      expect.objectContaining({
        typeCode: "DERIVATIONALLY_RELATED",
        direction: "SYMMETRIC",
      }),
    );
  },
);

test(
  "LEXICON-002-E2E a learner discovers a complete word through the visible lexicon hierarchy",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ page, namespace }) => {
    await registerUserViaApi(page, namespace, "lexicon-browser");
    await page.goto("/lexicon/search");
    await page.getByLabel("搜索词典").fill("bank");
    await page.getByLabel("搜索词典").press("Enter");
    const bankResult = page
      .getByRole("link")
      .filter({ hasText: /^bank/ })
      .first();
    await expect(bankResult).toContainText("NOUN");
    await bankResult.click();

    await expect(page.getByRole("heading", { name: "bank" })).toBeVisible();
    await expect(page.locator(".form-strip")).toContainText("bank");
    await expect(page.locator(".form-strip")).toContainText("/bæŋk/");
    await expect(page.getByLabel("en-US发音")).toBeVisible();
    const senses = page.locator(".sense-list:not(.sense-list--nested) > li");
    await expect(senses).toHaveCount(2);
    await expect(senses.nth(0)).toContainText(
      "An organization that keeps and lends money.",
    );
    await expect(senses.nth(0)).toContainText("financial institution");
    await expect(senses.nth(1)).toContainText(
      "The land along the side of a river.",
    );
    await expect(senses.nth(1)).toContainText("river edge");

    const entryHref = await page
      .getByRole("link", { name: "完整词条" })
      .getAttribute("href");
    const financialSenseHref = await senses
      .nth(0)
      .getByRole("link")
      .getAttribute("href");
    expect(entryHref).toBeTruthy();
    expect(financialSenseHref).toBeTruthy();

    await page.goto(entryHref!);
    await expect(page.getByRole("heading", { name: "词组搭配" })).toBeVisible();
    await expect(page.getByText("bank account", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "词源" })).toBeVisible();
    await expect(page.getByText(/non banki/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "学习材料" })).toBeVisible();
    await expect(
      page.getByText(/根据附近的 money、loan 或 river/),
    ).toBeVisible();

    await page.goto(financialSenseHref!);
    await expect(page.getByRole("heading", { name: "释义" })).toBeVisible();
    await expect(
      page.getByText("The bank approved the small business loan."),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "搭配" })).toBeVisible();
    await expect(page.getByText("bank account", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "用法限制" })).toBeVisible();
    await expect(
      page.getByText(/receive deposits and provide loans/),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "概念关系" })).toBeVisible();
    await expect(page.getByText(/HYPERNYM/)).toBeVisible();
    await expect(page.getByText(/established organization/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "语义关系" })).toBeVisible();
    await expect(page.getByRole("link", { name: /account/ })).toBeVisible();
    await expect(page.getByText(/保存存款、管理账户/)).toBeVisible();

    await page.goto("/lexicon/search?q=run");
    await page.getByRole("link").filter({ hasText: /^run/ }).first().click();
    await expect(page.locator(".form-strip")).toContainText("run");
    await expect(page.locator(".form-strip")).toContainText("ran");
    await expect(page.locator(".form-strip")).toContainText("runs");
    await page.getByRole("link", { name: "完整词条" }).click();
    await expect(page.getByRole("heading", { name: "词形变化" })).toBeVisible();
    await expect(page.getByText("run → ran", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "形态结构" })).toBeVisible();
    await expect(page.getByText("run + s", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "句法框架" })).toBeVisible();
    await expect(page.getByText("SUBJECT runs", { exact: true })).toBeVisible();
  },
);

test(
  "LEARNING-001-E2E a learner enrolls in the 200-word book and completes a scored review",
  {
    tag: e2eTags(TestTag.SYSTEM),
  },
  async ({ learnerPage: page, namespace }) => {
    const headers = await authenticatedMutationHeaders(page);

    const booksResponse = await page.request.get("/api/v1/vocabulary-books");
    expect(booksResponse.ok()).toBeTruthy();
    const books = (await booksResponse.json()) as ReleaseEnvelope<
      BookListItem[]
    >;
    expect(books.data).toHaveLength(1);
    const book = books.data[0]!;
    const edition = book.editions[0]!;
    expect(edition._count.items).toBe(200);

    const editionResponse = await page.request.get(
      `/api/v1/vocabulary-books/${book.id}/editions/${edition.id}?after=-1&limit=200`,
    );
    const editionBody = (await editionResponse.json()) as ReleaseEnvelope<{
      items: Array<{ displayText: string }>;
      nextPosition: number | null;
    }>;
    expect(editionResponse.ok()).toBeTruthy();
    expect(editionBody.data.items).toHaveLength(200);
    expect(editionBody.data.nextPosition).toBeNull();

    const enrollmentResponse = await page.request.post(
      "/api/v1/study/enrollments",
      {
        headers,
        data: { bookId: book.id, editionId: edition.id, dailyNewLimit: 5 },
      },
    );
    expect(enrollmentResponse.ok()).toBeTruthy();

    const todayResponse = await page.request.get("/api/v1/study/today");
    expect(todayResponse.ok()).toBeTruthy();
    const today = (await todayResponse.json()) as {
      status: string;
      items: Array<{ id: string; objectiveRevisionId: string }>;
    };
    expect(today.status).toBe("READY");
    expect(today.items).toHaveLength(5);

    const attemptResponse = await page.request.post("/api/v1/study/attempts", {
      headers: {
        ...headers,
        "Idempotency-Key": namespace.idempotencyKey("learning-attempt"),
      },
      data: { planItemId: today.items[0]!.id },
    });
    expect(attemptResponse.ok()).toBeTruthy();
    const attempt = (await attemptResponse.json()) as {
      id: string;
      exercise: {
        responseKind: ExerciseResponseKind;
        choices: Array<{ id: string; text: string }>;
      };
    };
    expect(attempt.exercise.responseKind).toBe(ExerciseResponseKind.CHOICE);
    const correctChoice = attempt.exercise.choices.find(
      (choice) => choice.text === "bank",
    );
    expect(correctChoice).toBeTruthy();

    const submissionResponse = await page.request.post(
      `/api/v1/study/attempts/${attempt.id}/responses`,
      {
        headers: {
          ...headers,
          "Idempotency-Key": namespace.idempotencyKey("learning-response"),
        },
        data: {
          responseKind: ExerciseResponseKind.CHOICE,
          choiceIds: [correctChoice!.id],
        },
      },
    );
    expect(submissionResponse.ok()).toBeTruthy();
    const submission = (await submissionResponse.json()) as {
      status: string;
      correct: boolean;
      score: number;
    };
    expect(submission).toMatchObject({
      status: "SUBMITTED",
      correct: true,
      score: 1,
    });

    const reviewResponse = await page.request.post("/api/v1/study/reviews", {
      headers: {
        ...headers,
        "Idempotency-Key": namespace.idempotencyKey("learning-review"),
      },
      data: { attemptId: attempt.id, rating: 3 },
    });
    expect(reviewResponse.ok()).toBeTruthy();
    const stats = (await (
      await page.request.get("/api/v1/study/stats")
    ).json()) as { reviews: number; attempts: number };
    expect(stats).toMatchObject({ reviews: 1, attempts: 1 });
  },
);

test(
  "LEARNING-003-E2E a learner enrolls from the book UI and sees scored study progress",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ page, namespace }) => {
    await registerUserViaApi(page, namespace, "learning-browser");
    await page.goto("/study/books");
    const book = page
      .locator("article")
      .filter({ hasText: "Sylis E2E Pilot 200" });
    await expect(book).toContainText(
      "Deterministic vocabulary book used by root E2E journeys.",
    );
    await book.getByRole("button", { name: "查看 1.0.0" }).click();
    await expect(
      page.getByRole("heading", { name: "Sylis E2E Pilot 200" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "加载更多" }).click();
    await expect(page.getByText("200 个已加载条目")).toBeVisible();

    await page.getByLabel("每日新词").fill("5");
    await page.getByRole("button", { name: "加入学习" }).click();
    await expect(page.getByText("当前学习版本", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "开始学习" }).click();

    const objectives = page.getByRole("region", { name: "今日学习目标" });
    await expect(objectives.getByRole("button")).toHaveCount(5);
    await objectives.getByRole("button").first().click();
    const player = page.getByRole("region", { name: "单词练习" });
    await expect(player).toBeVisible();
    await player.getByRole("radio", { name: "bank" }).click();
    await player.getByRole("button", { name: "提交答案" }).click();
    await expect(player.getByText("回答正确", { exact: true })).toBeVisible();

    await page
      .getByRole("region", { name: "掌握程度评分" })
      .getByRole("button", { name: "熟练" })
      .click();
    await expect(page.getByRole("status")).toHaveText("学习进度已更新");
    await expect(
      page
        .getByRole("region", { name: "学习统计" })
        .getByRole("article")
        .filter({ hasText: "完成练习" }),
    ).toContainText("1");
  },
);

test(
  "NOTEBOOK-002-E2E a learner manages a saved lexical target through the visible notebook journey",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ page, namespace }) => {
    await registerUserViaApi(page, namespace, "notebook-browser");
    const notebookName = `E2E notebook ${namespace.value}`;
    const updatedNote = `Reviewed in ${namespace.value}`;
    const uniqueTag = `finance-${namespace.value}`;

    await page.goto("/notebooks");
    await page.getByLabel("新建生词本").fill(notebookName);
    await page.getByRole("button", { name: "新建" }).click();
    const notebook = page.locator("article").filter({ hasText: notebookName });
    await expect(notebook).toContainText("0 项");

    await page.goto("/lexicon/search?q=bank");
    await page.getByRole("link").filter({ hasText: /^bank/ }).first().click();
    await page.getByLabel("选择生词本").selectOption({ label: notebookName });
    await page.getByRole("button", { name: "收藏" }).click();
    await expect(page.getByRole("button", { name: "已收藏" })).toBeVisible();

    await page.goto("/notebooks");
    const populatedNotebook = page
      .locator("article")
      .filter({ hasText: notebookName });
    await expect(populatedNotebook).toContainText("1 项");
    await populatedNotebook.getByRole("link", { name: "打开" }).click();
    await expect(
      page.getByRole("heading", { name: notebookName }),
    ).toBeVisible();

    const itemFilter = page.getByLabel("筛选生词本条目");
    await itemFilter.fill("bank");
    await expect(page.getByRole("link", { name: "bank" })).toBeVisible();
    await page.getByRole("button", { name: "编辑 bank" }).click();
    const editor = page.getByRole("form", { name: "编辑 bank" });
    await editor.getByLabel("编辑笔记").fill(updatedNote);
    await editor.getByLabel("标签").fill(`${uniqueTag}, money`);
    await editor.getByRole("button", { name: "保存修改" }).click();
    await expect(page.getByText(updatedNote)).toBeVisible();
    await expect(page.getByText(`#${uniqueTag}`)).toBeVisible();

    await itemFilter.fill(uniqueTag);
    await expect(page.getByRole("link", { name: "bank" })).toBeVisible();
    await page.getByRole("button", { name: "移除 bank" }).click();
    await expect(page.getByRole("link", { name: "bank" })).toHaveCount(0);

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain(notebookName);
      await dialog.accept();
    });
    await page.getByRole("button", { name: "删除生词本" }).click();
    await expect(page).toHaveURL(/\/notebooks$/);
    await expect(
      page.locator("article").filter({ hasText: notebookName }),
    ).toHaveCount(0);
  },
);

test(
  "LEARNING-002-E2E a learner completes every exercise response kind through the player",
  {
    tag: e2eTags(TestTag.BROWSER),
  },
  async ({ page }, testInfo) => {
    await registerUser(page, testInfo);
    const headers = await authenticatedMutationHeaders(page);

    const consentResponse = await page.request.post(
      "/api/v1/users/me/consent-records",
      {
        headers,
        data: {
          purpose: ConsentPurpose.LEARNING_RESPONSE_RETENTION,
          categories: [ConsentDataCategory.LEARNING_RESPONSE],
          policyVersion: "0.0.1",
          decision: ConsentDecision.GRANTED,
        },
      },
    );
    expect(consentResponse.ok()).toBeTruthy();

    const books = (await (
      await page.request.get("/api/v1/vocabulary-books")
    ).json()) as ReleaseEnvelope<BookListItem[]>;
    const book = books.data[0]!;
    const edition = book.editions[0]!;
    const enrollmentResponse = await page.request.post(
      "/api/v1/study/enrollments",
      {
        headers,
        data: { bookId: book.id, editionId: edition.id, dailyNewLimit: 5 },
      },
    );
    expect(enrollmentResponse.ok()).toBeTruthy();

    const completedKinds = new Set<ExerciseResponseKind>();
    for (let attemptIndex = 0; attemptIndex < 4; attemptIndex += 1) {
      await page.goto("/study");
      await page
        .getByRole("region", { name: "今日学习目标" })
        .getByRole("button")
        .nth(attemptIndex)
        .click();
      const player = page.getByRole("region", { name: "单词练习" });
      await expect(player).toBeVisible();

      const choices = player.getByRole("radiogroup", { name: "答案选项" });
      const shortText = player.getByRole("textbox", { name: "单词答案" });
      const extendedText = player.getByRole("textbox", { name: "句子答案" });
      if (await choices.isVisible()) {
        completedKinds.add(ExerciseResponseKind.CHOICE);
        await player.getByRole("radio", { name: "bank" }).click();
      } else if (await shortText.isVisible()) {
        completedKinds.add(ExerciseResponseKind.SHORT_TEXT);
        await shortText.fill("bank");
      } else if (await extendedText.isVisible()) {
        completedKinds.add(ExerciseResponseKind.EXTENDED_TEXT);
        await extendedText.fill("I use bank in a complete example sentence.");
        await player.getByRole("button", { name: "查看评分标准" }).click();
        await player.getByRole("button", { name: "已完成" }).click();
      } else {
        completedKinds.add(ExerciseResponseKind.NO_CAPTURE);
        await player.getByRole("button", { name: "查看参考" }).click();
        await expect(
          player.getByText("完成练习", { exact: true }),
        ).toBeVisible();
        await player.getByRole("button", { name: "已完成" }).click();
      }

      await player.getByRole("button", { name: "提交答案" }).click();
      await expect(
        player.getByText(
          /回答正确|回答已记录|已记录，继续巩固|已记录为掌握|已安排重练/,
        ),
      ).toBeVisible();
    }

    expect(completedKinds).toEqual(
      new Set(Object.values(ExerciseResponseKind)),
    );
  },
);
