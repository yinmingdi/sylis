import { expect, test, type Page } from "@playwright/test";

const exercise = {
  id: "attempt-1",
  status: "PRESENTED",
  presentedAt: "2026-08-05T00:00:00.000Z",
  exercise: {
    id: "exercise-1",
    taskKind: "FORM_TO_MEANING",
    responseKind: "CHOICE",
    responseCardinality: "SINGLE",
    responsePlacement: "AFTER_STIMULUS",
    prompt: { languageTag: "zh-CN", text: "run 的中文含义是？" },
    maxScore: 1,
    responseConfig: { minSelections: 1, maxSelections: 1 },
    choices: [
      { id: "choice-1", languageTag: "zh-CN", text: "跑" },
      { id: "choice-2", languageTag: "zh-CN", text: "坐" },
    ],
    stimuli: [],
  },
};

async function mockStudyApi(page: Page) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/api/v1/auth/session") {
      return route.fulfill({
        json: {
          actor: {
            id: "user-1",
            locale: "zh-CN",
            timezone: "Asia/Shanghai",
            createdAt: "2026-08-05T00:00:00.000Z",
          },
          session: {
            id: "session-1",
            audience: "USER",
            authStrength: "PASSWORD",
            expiresAt: "2026-08-06T00:00:00.000Z",
          },
          roles: [],
          csrfToken: "csrf-1",
        },
      });
    }
    if (path === "/api/v1/users/me/consents") {
      return route.fulfill({ json: [] });
    }
    if (path === "/api/v1/study/today" && request.method() === "GET") {
      return route.fulfill({
        json: {
          localDate: "2026-08-05",
          items: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              completedAt: null,
              objective: {
                knowledgeFacet: "MEANING",
                retrievalDirection: "RECALL",
              },
            },
          ],
        },
      });
    }
    if (path === "/api/v1/study/attempts" && request.method() === "POST") {
      expect(request.headers()["idempotency-key"]).toBeTruthy();
      return route.fulfill({ json: exercise });
    }
    if (
      path === "/api/v1/study/attempts/attempt-1/responses" &&
      request.method() === "POST"
    ) {
      expect(request.headers()["idempotency-key"]).toBeTruthy();
      expect(request.postDataJSON()).toEqual({
        responseKind: "CHOICE",
        choiceIds: ["choice-1"],
      });
      return route.fulfill({
        status: 201,
        json: {
          attemptId: "attempt-1",
          status: "SUBMITTED",
          score: 1,
          maxScore: 1,
          correct: true,
          feedback: [],
        },
      });
    }
    return route.fulfill({
      status: 404,
      json: { title: "Unhandled test route" },
    });
  });
}

test.beforeEach(async ({ page }) => mockStudyApi(page));

test("a learner completes one study exercise", async ({ page }) => {
  await page.goto("/study");
  await expect(page.getByRole("heading", { name: "背单词" })).toBeVisible();
  await page.getByRole("button", { name: /MEANING/ }).click();
  await expect(
    page.getByRole("heading", { name: "run 的中文含义是？" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "跑" }).click();
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText("回答正确")).toBeVisible();

  const viewport = page.viewportSize();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(viewport?.width).toBeGreaterThanOrEqual(320);
});
