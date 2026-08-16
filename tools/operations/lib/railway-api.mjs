const ENDPOINT = "https://backboard.railway.com/graphql/v2";

const request = async (query, variables) => {
  const token = process.env.RAILWAY_API_TOKEN?.trim();
  if (!token) throw new Error("RAILWAY_API_TOKEN is required");
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    const error = new Error(
      `Railway API request failed with HTTP ${response.status}`,
    );
    error.details = payload.errors ?? payload;
    throw error;
  }
  return payload.data;
};

export async function getDeployment(id) {
  const data = await request(
    `query deployment($id: String!) {
      deployment(id: $id) {
        id
        status
        canRollback
      }
    }`,
    { id },
  );
  if (!data.deployment)
    throw new Error(`Railway deployment ${id} was not found`);
  return data.deployment;
}

export async function rollbackDeployment(id) {
  const deployment = await getDeployment(id);
  if (!deployment.canRollback) {
    throw new Error(`Railway deployment ${id} cannot be rolled back`);
  }
  const data = await request(
    `mutation deploymentRollback($id: String!) {
      deploymentRollback(id: $id) {
        id
        status
      }
    }`,
    { id },
  );
  return { before: deployment, rollback: data.deploymentRollback };
}
