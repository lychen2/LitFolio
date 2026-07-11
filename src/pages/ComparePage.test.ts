import { describe, expect, it } from "vitest";
import { extractComparisonDifferenceRows } from "./ComparePage";

describe("extractComparisonDifferenceRows", () => {
  it("extracts problem, method, data, and limitation columns from a comparison table", () => {
    const rows = extractComparisonDifferenceRows(`
| Paper | Problem | Method | Data / setting | Main finding | Limitation |
| --- | --- | --- | --- | --- | --- |
| P1 | retrieval recall | dense encoder | MS MARCO | higher recall | slow indexing |
| P2 | reranking precision | cross encoder | BEIR | better precision | expensive inference |
`);

    expect(rows).toEqual([
      {
        paper: "P1",
        problem: "retrieval recall",
        method: "dense encoder",
        data: "MS MARCO",
        limitation: "slow indexing",
      },
      {
        paper: "P2",
        problem: "reranking precision",
        method: "cross encoder",
        data: "BEIR",
        limitation: "expensive inference",
      },
    ]);
  });

  it("supports Chinese comparison table headers", () => {
    const rows = extractComparisonDifferenceRows(`
| 论文 | 问题 | 方法 | 数据 | 局限 |
| --- | --- | --- | --- | --- |
| P1 | 召回 | 双塔 | 中文问答 | 需要负样本 |
`);

    expect(rows[0]).toMatchObject({
      paper: "P1",
      problem: "召回",
      method: "双塔",
      data: "中文问答",
      limitation: "需要负样本",
    });
  });

  it("returns no rows when the report has no structured difference table", () => {
    expect(extractComparisonDifferenceRows("These papers differ in scope.")).toEqual([]);
  });
});
