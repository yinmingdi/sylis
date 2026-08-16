import { expect, test } from "@playwright/test";

import { TestTag, e2ePorts, e2eTags } from "../../runtime";

test(
  "DELIVERY-001-E2E all public deployment edges report ready",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.DEPLOYMENT),
  },
  async ({ request }) => {
    const ports = e2ePorts();
    const endpoints = [
      `http://127.0.0.1:${ports.web}/health`,
      `http://127.0.0.1:${ports.admin}/health`,
      `http://127.0.0.1:${ports.api}/health/ready`,
      `http://127.0.0.1:${ports.adminApi}/health/ready`,
      `http://127.0.0.1:${ports.agentApi}/health/ready`,
      `http://127.0.0.1:${ports.modelGateway}/health/ready`,
    ];
    for (const endpoint of endpoints) {
      const response = await request.get(endpoint);
      expect(response.ok(), endpoint).toBe(true);
    }
  },
);
