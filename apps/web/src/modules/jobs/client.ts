import { apiClient } from "@sylis/api-client";

export const jobsClient = apiClient.jobs;

export function subscribeToJob(
  jobId: string,
  onEvent: (event: MessageEvent<string>) => void,
): () => void {
  const source = new EventSource(jobsClient.eventsUrl(jobId), {
    withCredentials: true,
  });
  source.onmessage = onEvent;
  for (const eventType of [
    "job.started",
    "job.progress",
    "job.warning",
    "job.paused",
    "job.completed",
    "job.failed",
    "job.cancelled",
  ]) {
    source.addEventListener(eventType, onEvent as EventListener);
  }
  return () => source.close();
}
