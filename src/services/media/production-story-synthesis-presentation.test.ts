import { describe, expect, it } from "vitest";

import { mapStorySynthesesToArticleIds } from "@/services/media/production-story-synthesis-presentation";
import type { StorySynthesisReadResult } from "@/services/media/production-story-synthesis-core";
import type { MediaStoryCluster } from "@/services/media/daily-brief-core";

describe("production synthesis presentation mapping", () => {
  it("maps one batched story result to its underlying article cards", () => {
    const synthesis = {
      freshness: "CURRENT",
      artifact: {} as never,
    } satisfies StorySynthesisReadResult;
    const cluster = {
      clusterId: "cluster",
      articleIds: ["one", "two"],
    } as MediaStoryCluster;
    expect(
      mapStorySynthesesToArticleIds({
        clusters: [cluster],
        syntheses: new Map([[cluster.clusterId, synthesis]]),
      }),
    ).toEqual({ one: synthesis, two: synthesis });
  });

  it("does not create empty presentation entries for missing synthesis", () => {
    const cluster = {
      clusterId: "cluster",
      articleIds: ["one"],
    } as MediaStoryCluster;
    expect(
      mapStorySynthesesToArticleIds({
        clusters: [cluster],
        syntheses: new Map([
          [cluster.clusterId, { freshness: "MISSING", artifact: null }],
        ]),
      }),
    ).toEqual({});
  });
});
