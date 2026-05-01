// Pure unit tests for `decide`. Four cases mirror the four logical
// branches:
//   1. exit 0                                → "done"
//   2. exit !=0 AND currentIteration < max   → "loop"
//   3. exit !=0 AND currentIteration === max → "halt" (boundary)
//   4. exit !=0 AND currentIteration >  max  → "halt" (over)

import { describe, expect, it } from "vitest";
import { decide } from "./decider";

describe("decide", () => {
  it("returns 'done' on exit 0", () => {
    expect(decide({ e2eExitCode: 0, currentIteration: 1, maxIterations: 3 })).toBe("done");
  });

  it("returns 'loop' on non-zero exit when currentIteration < maxIterations", () => {
    expect(decide({ e2eExitCode: 1, currentIteration: 1, maxIterations: 3 })).toBe("loop");
  });

  it("returns 'halt' on non-zero exit when currentIteration === maxIterations", () => {
    expect(decide({ e2eExitCode: 1, currentIteration: 3, maxIterations: 3 })).toBe("halt");
  });

  it("returns 'halt' on non-zero exit when currentIteration > maxIterations", () => {
    expect(decide({ e2eExitCode: 2, currentIteration: 5, maxIterations: 3 })).toBe("halt");
  });
});
