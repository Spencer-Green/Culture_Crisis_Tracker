import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import {
  buildCensusAiesDownloadUrl,
  inspectCensusAies,
} from "@/data-sources/music/census-aies-api";

const BASIC =
  "#GEOTYPE|ST|GEO_ID|GEO_LABEL|GEO_ID_F|SECTOR|INDLEVEL|NAICS|NAICS_LABEL|NAICS_F|TYPOP|TYPOP_LABEL|TAXSTAT|TAXSTAT_LABEL|YEAR|RCPT_TOT_VAL|RCPT_TOT_VAL_F|PAY_ANN_VAL|PAY_ANN_VAL_F|PAY_QTR1_VAL|PAY_QTR1_VAL_F|EMP_MAR12_NUM|EMP_MAR12_NUM_F|RCPT_TOT_CV|RCPT_TOT_CV_F|PAY_ANN_CV|PAY_ANN_CV_F|PAY_QTR1_CV|PAY_QTR1_CV_F|EMP_MAR12_CV|EMP_MAR12_CV_F\n01|00|0100000US|United States||51|6|512250|Record production and distribution||00|All establishments|00|All establishments|2023|13698582||2202030||635105||13163||2.1||1.6||1.2||3|\n";
const EXPENSE =
  "#GEOTYPE|ST|GEO_ID|GEO_LABEL|GEO_ID_F|SECTOR|NAICS|NAICS_LABEL|NAICS_F|TYPOP|TYPOP_LABEL|TAXSTAT|TAXSTAT_LABEL|YEAR|RCPT_TOT_VAL|RCPT_TOT_VAL_F|EXPS_TOT_DVAL|EXPS_TOT_DVAL_F|RCPT_TOT_CV|RCPT_TOT_CV_F|EXPS_TOT_CV|EXPS_TOT_CV_F|INDLEVEL|SUBSECTOR|INDGROUP\n01|00|0100000US|United States||51|512250|Record production and distribution||00|All establishments|00|All establishments|2023|13698582||12151050||2.1||1.4||6|512|5122\n";

describe("Census AIES downloads", () => {
  it("builds bounded official ZIP URLs and rejects non-Census hosts", () => {
    expect(
      buildCensusAiesDownloadUrl(
        "https://www2.census.gov/programs-surveys/aies/data",
        2023,
        "AIES00BASIC",
      ),
    ).toBe(
      "https://www2.census.gov/programs-surveys/aies/data/2023/AIES00BASIC.zip",
    );
    expect(() =>
      buildCensusAiesDownloadUrl(
        "https://example.com/aies",
        2023,
        "AIES00BASIC",
      ),
    ).toThrow(/official HTTPS download host/);
  });

  it("retrieves only registered official tables and returns one merged record", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(zipSync({ "AIES00BASIC.dat": strToU8(BASIC) }), {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(zipSync({ "AIES00EXP01.dat": strToU8(EXPENSE) }), {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
      );
    const result = await inspectCensusAies(
      "https://www2.census.gov/programs-surveys/aies/data",
      { fetchImplementation },
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(result.files.map((file) => file.table)).toEqual([
      "AIES00BASIC",
      "AIES00EXP01",
    ]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].naicsCode).toBe("512250");
  });
});
