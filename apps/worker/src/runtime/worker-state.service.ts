import { Injectable } from "@nestjs/common";

@Injectable()
export class WorkerStateService {
  draining = false;
  runningJobId: string | null = null;
  lastDatabaseSuccessAt: Date | null = null;

  get ready(): boolean {
    return !this.draining && this.lastDatabaseSuccessAt !== null;
  }
}
