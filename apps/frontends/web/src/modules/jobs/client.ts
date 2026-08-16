import { apiClient } from '@sylis/api-client/user';
import { JobEventType } from '@sylis/job-contracts';

export const jobsClient = apiClient.jobs;

export function subscribeToJob(
  jobId: string,
  onEvent: (event: MessageEvent<string>) => void,
): () => void {
  const source = new EventSource(jobsClient.eventsUrl(jobId), {
    withCredentials: true,
  });
  source.onmessage = onEvent;
  for (const eventType of Object.values(JobEventType)) {
    source.addEventListener(eventType, onEvent as EventListener);
  }
  return () => source.close();
}
