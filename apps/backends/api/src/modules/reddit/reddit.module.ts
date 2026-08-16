import { Module } from "@nestjs/common";

import { RedditController } from "./controllers/reddit.controller";
import { RedditService } from "./services/reddit.service";

@Module({ controllers: [RedditController], providers: [RedditService] })
export class RedditModule {}
