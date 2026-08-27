import { expect, it } from "vitest";
import { formatCompactCount } from "./format-count";

it.each([
  [0, "0"], [1, "1"], [999, "999"],
  [1000, "1千"], [1200, "1.2千"], [9999, "9.9千"],
  [10000, "1万"], [12000, "1.2万"], [999999, "99.9万"],
  [1000000, "100万"], [99999999, "9999万"],
  [100000000, "1亿"], [120000000, "1.2亿"],
  [99900000000, "999亿"], [100000000000, "999亿+"],
])("formats %i without rounding up or unbounded digit growth", (count, expected) => {
  expect(formatCompactCount(count)).toBe(expected);
});
