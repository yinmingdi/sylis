import type { ExerciseView } from "@sylis/api-client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ExercisePlayer } from "./exercise-player";

const attempt = (
  responseKind: ExerciseView["exercise"]["responseKind"],
  overrides: Partial<ExerciseView["exercise"]> = {},
): ExerciseView => ({
  id: `attempt-${responseKind}`,
  status: "PRESENTED",
  presentedAt: "2026-08-05T00:00:00.000Z",
  exercise: {
    id: `exercise-${responseKind}`,
    taskKind: "FORM_TO_MEANING",
    responseKind,
    responseCardinality: "SINGLE",
    responsePlacement: "AFTER_STIMULUS",
    prompt: { languageTag: "zh-CN", text: "选择或填写答案" },
    maxScore: 1,
    responseConfig: null,
    choices: [],
    stimuli: [],
    ...overrides,
  },
});

describe("ExercisePlayer", () => {
  it("submits a single choice using a stable request key", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => ({ correct: true }));
    render(
      <ExercisePlayer
        attempt={attempt("CHOICE", {
          choices: [
            { id: "choice-run", languageTag: "en", text: "run" },
            { id: "choice-walk", languageTag: "en", text: "walk" },
          ],
        })}
        onSubmit={onSubmit}
      />,
    );

    const submit = screen.getByRole("button", { name: "提交答案" });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "run" }));
    await user.click(submit);

    expect(onSubmit).toHaveBeenCalledWith(
      "attempt-CHOICE",
      { responseKind: "CHOICE", choiceIds: ["choice-run"] },
      expect.any(String),
    );
    expect(await screen.findByText("回答正确")).toBeInTheDocument();
  });

  it.each(["SHORT_TEXT", "EXTENDED_TEXT"] as const)(
    "submits a consent-bound %s response only inside configured limits",
    async (responseKind) => {
      const user = userEvent.setup();
      const onSubmit = vi.fn(async () => ({ correct: false }));
      render(
        <ExercisePlayer
          attempt={attempt(responseKind, {
            responseConfig: {
              minCharacters: 3,
              maxCharacters: 20,
              minWords: 1,
              maxWords: 3,
            },
          })}
          consentRecordId="consent-1"
          onSubmit={onSubmit}
        />,
      );

      const input = screen.getByLabelText("你的答案");
      const submit = screen.getByRole("button", { name: "提交答案" });
      await user.type(input, "go");
      expect(submit).toBeDisabled();
      await user.type(input, "ing");
      await user.click(submit);

      expect(onSubmit).toHaveBeenCalledWith(
        `attempt-${responseKind}`,
        { responseKind, text: "going", consentRecordId: "consent-1" },
        expect.any(String),
      );
    },
  );

  it("submits a no-capture self report without personal content", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => ({ correct: null }));
    render(
      <ExercisePlayer attempt={attempt("NO_CAPTURE")} onSubmit={onSubmit} />,
    );

    await user.click(screen.getByRole("button", { name: "需要重练" }));
    await user.click(screen.getByRole("button", { name: "提交答案" }));

    expect(onSubmit).toHaveBeenCalledWith(
      "attempt-NO_CAPTURE",
      { responseKind: "NO_CAPTURE", selfReported: false },
      expect.any(String),
    );
  });

  it("renders top-level and nested audio, video, and image material", () => {
    const { container } = render(
      <ExercisePlayer
        attempt={attempt("NO_CAPTURE", {
          stimuli: [
            {
              roleCode: "PROMPT",
              stimulusRevision: {
                id: "stimulus-1",
                blocks: [
                  {
                    id: "block-1",
                    position: 0,
                    blockKind: "MEDIA",
                    roleCode: "PROMPT",
                    media: {
                      id: "audio-1",
                      mediaType: "AUDIO",
                      mimeType: "audio/mpeg",
                      contentUri: "https://cdn.example/audio.mp3",
                    },
                    material: {
                      id: "material-1",
                      kind: "PRONUNCIATION_GUIDE",
                      learningLanguageTag: "en",
                      supportLanguageTag: "zh-CN",
                      blocks: [
                        {
                          id: "video-block",
                          position: 0,
                          blockKind: "MEDIA",
                          roleCode: "EXPLANATION",
                          media: {
                            id: "video-1",
                            mediaType: "VIDEO",
                            mimeType: "video/mp4",
                            contentUri: "https://cdn.example/video.mp4",
                          },
                        },
                        {
                          id: "image-block",
                          position: 1,
                          blockKind: "MEDIA",
                          roleCode: "EXPLANATION",
                          media: {
                            id: "image-1",
                            mediaType: "IMAGE",
                            mimeType: "image/webp",
                            contentUri: "https://cdn.example/image.webp",
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        })}
        onSubmit={vi.fn(async () => undefined)}
      />,
    );

    expect(
      container.querySelector('audio[src$="audio.mp3"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('video[src$="video.mp4"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('img[src$="image.webp"]'),
    ).toBeInTheDocument();
  });
});
