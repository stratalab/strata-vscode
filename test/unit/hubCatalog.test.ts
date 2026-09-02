import { describe, expect, it } from "vitest";
import {
  HubApiClient,
  HubApiError,
  datasetListQuery,
  firstJsonObject,
  hubEndpointUrl,
  normalizeHubUrl,
} from "../../src/hub/catalog";

describe("StrataHub catalog client", () => {
  it("renders list filters as the hub v1 query contract expects", () => {
    const query = datasetListQuery({
      tasks: ["analytics", "ai"],
      tags: ["finance"],
      query: "semantic vectors",
      primitives: ["kv", "json"],
      license: "MIT",
      sizeMinBytes: 10,
      sizeMaxBytes: 200,
      sort: "recent",
      includeFacets: true,
      limit: 50,
      offset: 100,
    });

    expect(query).toBe(
      "?q=semantic+vectors&task=analytics&task=ai&tag=finance&primitive=kv&primitive=json&license=MIT&size_min_bytes=10&size_max_bytes=200&sort=recent&include_facets=true&limit=50&offset=100",
    );
  });

  it("reads optional dataset facets from the list response", async () => {
    let seenUrl = "";
    const client = new HubApiClient("https://hub.example", async (input) => {
      seenUrl = String(input);
      return new Response(
        JSON.stringify({
          total: 1,
          offset: 0,
          limit: 50,
          items: [],
          facets: {
            scope: "filtered",
            primitives: [{ value: "kv", count: 1 }],
            tasks: [{ value: "analytics", count: 1 }],
            tags: [],
            licenses: [{ value: "MIT", count: 1 }],
            badges: [],
            size_buckets: [{ bucket: "under1mib", count: 1 }],
          },
        }),
      );
    });

    const page = await client.listDatasets({ query: "analytics", includeFacets: true, limit: 50 });

    expect(seenUrl).toBe("https://hub.example/v1/datasets?q=analytics&include_facets=true&limit=50");
    expect(page.facets?.tasks).toEqual([{ value: "analytics", count: 1 }]);
  });

  it("normalizes hub origins and avoids duplicate v1 path segments", () => {
    expect(normalizeHubUrl("hub.stratahub.io")).toBe("https://hub.stratahub.io/");
    expect(normalizeHubUrl("https://hub.example/v1")).toBe("https://hub.example/v1/");
    expect(hubEndpointUrl("hub.stratahub.io", "/v1/info")).toBe("https://hub.stratahub.io/v1/info");
    expect(hubEndpointUrl("https://hub.example/v1", "/v1/datasets")).toBe("https://hub.example/v1/datasets");
  });

  it("extracts the first JSON object from mixed CLI output", () => {
    expect(firstJsonObject("warning\n{\"hub.url\":\"https://hub.example\",\"source\":\"config\"}\n")).toEqual({
      "hub.url": "https://hub.example",
      source: "config",
    });
  });

  it("maps problem responses into typed hub errors", async () => {
    const client = new HubApiClient(
      "https://hub.example",
      async () =>
        new Response(JSON.stringify({ code: "hub.unavailable", detail: "catalog is offline" }), {
          status: 503,
        }),
    );

    await expect(client.info()).rejects.toMatchObject({
      status: 503,
      code: "hub.unavailable",
      message: "catalog is offline",
      retryable: true,
    } satisfies Partial<HubApiError>);
  });
});
