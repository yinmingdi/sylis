import { AgentEventType } from "@sylis/agent-contracts";
import {
  AgentStreamFrameType,
  type AgentSessionSnapshotView,
} from "@sylis/api-client/agent";
import type { Page } from "@playwright/test";

import { e2ePorts } from "../runtime";

export interface AgentSseFrame {
  id: number;
  type: AgentEventType;
  payload: Readonly<Record<string, unknown>>;
}

export interface ReadAgentSseOptions {
  lastEventId: number;
  maximumEvents?: number;
  stopAt?: AgentEventType;
  timeoutMs?: number;
}

export interface AgentSessionSnapshotFrame extends AgentSessionSnapshotView {
  id: number;
}

enum AgentSseFailureCode {
  HTTP = "AGENT_SSE_HTTP",
  TIMEOUT = "AGENT_SSE_TIMEOUT",
}

export async function readAgentSse(
  page: Page,
  sessionId: string,
  options: ReadAgentSseOptions,
): Promise<AgentSseFrame[]> {
  if (!Number.isSafeInteger(options.lastEventId) || options.lastEventId < 1) {
    throw new Error("AGENT_SSE_LAST_EVENT_ID_REQUIRED");
  }
  return collectAgentSseFrames(page, sessionId, {
    lastEventId: options.lastEventId,
    timeoutMs: options.timeoutMs,
    project: (frame) =>
      frame.type === AgentStreamFrameType.SESSION_SNAPSHOT
        ? null
        : (frame as AgentSseFrame),
    done: (frames, frame) =>
      frames.length >= (options.maximumEvents ?? Number.POSITIVE_INFINITY) ||
      frame.type === options.stopAt,
  });
}

export async function readAgentSessionSnapshot(
  page: Page,
  sessionId: string,
): Promise<AgentSessionSnapshotFrame> {
  const frames = await collectAgentSseFrames(page, sessionId, {
    timeoutMs: 10_000,
    project: (frame) =>
      frame.type === AgentStreamFrameType.SESSION_SNAPSHOT
        ? (frame as AgentSessionSnapshotFrame)
        : null,
    done: (snapshots) => snapshots.length === 1,
  });
  return frames[0]!;
}

interface ParsedAgentSseFrame {
  id: number;
  type: AgentEventType | AgentStreamFrameType;
  payload?: Readonly<Record<string, unknown>>;
}

async function collectAgentSseFrames<T>(
  page: Page,
  sessionId: string,
  options: {
    lastEventId?: number;
    timeoutMs?: number;
    project: (frame: ParsedAgentSseFrame) => T | null;
    done: (frames: readonly T[], frame: ParsedAgentSseFrame) => boolean;
  },
): Promise<T[]> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const origin = `http://127.0.0.1:${e2ePorts().web}`;
  const cookies = await page.context().cookies(origin);
  const headers = new Headers({
    Accept: "text/event-stream",
    Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; "),
  });
  if (options.lastEventId !== undefined) {
    headers.set("Last-Event-ID", String(options.lastEventId));
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const frames: T[] = [];
  try {
    const response = await fetch(
      new URL(`/api/agent/v1/sessions/${sessionId}/events`, origin),
      { headers, signal: controller.signal },
    );
    if (!response.ok || !response.body) {
      throw new Error(`${AgentSseFailureCode.HTTP}_${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return frames;
      buffer += decoder.decode(chunk.value, { stream: true });

      let boundary = buffer.match(/\r?\n\r?\n/);
      while (boundary?.index !== undefined) {
        const rawFrame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        boundary = buffer.match(/\r?\n\r?\n/);

        const frame = parseAgentSseFrame(rawFrame);
        if (!frame) continue;
        const projected = options.project(frame);
        if (projected !== null) frames.push(projected);
        if (options.done(frames, frame)) return frames;
      }
    }
  } catch (error) {
    if (timedOut) {
      throw new Error(`${AgentSseFailureCode.TIMEOUT}_${timeoutMs}`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

function parseAgentSseFrame(rawFrame: string): ParsedAgentSseFrame | null {
  if (rawFrame.startsWith(":")) return null;
  const lines = rawFrame.split(/\r?\n/);
  const eventId = Number(
    lines
      .find((line) => line.startsWith("id:"))
      ?.slice(3)
      .trimStart(),
  );
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!Number.isSafeInteger(eventId) || !data) return null;
  return {
    id: eventId,
    ...(JSON.parse(data) as Omit<ParsedAgentSseFrame, "id">),
  };
}
