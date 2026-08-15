import { describe, expect, it, vi } from "vitest";

import { inspectLPA, validateLPAUrl } from "@/data-sources/theatre/lpa-api";

const archive = `<li id="ticket-survey-2024"><a href="ticket-survey-2024/index.html">Live Performance Attendance and Revenue Report 2024 <span class="pub">Published Sep 2025</span></a></li>`;
const shell = '<script src="js/app.current.js"></script>';
const category = (label: string) =>
  `average ticket price changed from $100 in 2023 to $110 in 2024 Categories ${label} Final.pdf totalRevenueAttendance:{xAxis:[{categories:[2023,2024]}],series:[{name:"Revenue",type:"column",data:[10,11]},{name:"Attendance",type:"column",yAxis:1,data:[1,1.1]}]}`;
const bundle = `${category("Theatre")};${category("Musical Theatre")}`;

describe("LPA public report client", () => {
  it("allows only the official HTTPS report host", () => {
    expect(validateLPAUrl("https://reports.liveperformance.com.au/")).toBe(
      "https://reports.liveperformance.com.au/",
    );
    expect(() => validateLPAUrl("https://example.com/report")).toThrow(
      "official HTTPS reports host",
    );
    expect(() =>
      validateLPAUrl("http://reports.liveperformance.com.au/"),
    ).toThrow("official HTTPS reports host");
  });

  it("uses three bounded sequential requests and persists nothing", async () => {
    const responses = [archive, shell, bundle];
    const fetchImplementation = vi.fn(async () =>
      Promise.resolve(new Response(responses.shift(), { status: 200 })),
    );
    const inspection = await inspectLPA(
      "https://reports.liveperformance.com.au/",
      { fetchImplementation },
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(inspection.requestCount).toBe(3);
    expect(inspection.latestYear).toBe(2024);
    expect(inspection.records).toHaveLength(4);
  });

  it("sanitizes transport failures", async () => {
    await expect(
      inspectLPA("https://reports.liveperformance.com.au/", {
        fetchImplementation: async () => {
          throw new Error("sensitive internal transport detail");
        },
      }),
    ).rejects.toThrow("public report retrieval failed");
  });
});
