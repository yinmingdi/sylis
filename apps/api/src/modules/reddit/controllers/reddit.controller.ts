import { Controller, Get, Param, Query } from "@nestjs/common";

import { RedditService } from "../services/reddit.service";

@Controller("api/v1/explore/reddit")
export class RedditController {
  constructor(private readonly reddit: RedditService) {}
  @Get("feed") feed(@Query("subreddit") subreddit?: string) {
    return this.reddit.feed(subreddit);
  }
  @Get("posts/:externalId") post(@Param("externalId") id: string) {
    return this.reddit.post(id);
  }
}
