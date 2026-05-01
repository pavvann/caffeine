// Tests for the structured-output parser in decider.ts. The agent
// writes a JSON code block under "## Decider Output: Iteration N" in
// STATE.md; parseDeciderOutput is what turns that back into a typed
// DeciderOutput for the orchestrator.

import { describe, expect, it } from "vitest";
import { parseDeciderOutput } from "./decider";

const valid = (n: number) =>
  [
    "## Some other section",
    "blah blah",
    "",
    `## Decider Output: Iteration ${n}`,
    "",
    "```json",
    JSON.stringify(
      {
        decision: "loop",
        reason: "5 tests failed; recoverable",
        loop_tasks: ["fix mock in src/foo.test.ts:15"],
      },
      null,
      2,
    ),
    "```",
    "",
    "## Some later section",
  ].join("\n");

describe("parseDeciderOutput", () => {
  it("returns null when the heading for the requested iteration is absent", () => {
    const md = "## Decider Output: Iteration 2\n\n```json\n{}\n```";
    expect(parseDeciderOutput(md, 1)).toBeNull();
  });

  it("returns null when there is no JSON code block after the heading", () => {
    const md = "## Decider Output: Iteration 1\n\nnope, just prose here.";
    expect(parseDeciderOutput(md, 1)).toBeNull();
  });

  it("returns null when JSON is malformed", () => {
    const md =
      "## Decider Output: Iteration 1\n\n```json\n{ not valid json,, }\n```";
    expect(parseDeciderOutput(md, 1)).toBeNull();
  });

  it("returns null when decision field is unknown", () => {
    const md =
      '## Decider Output: Iteration 1\n\n```json\n{"decision":"hesitate","reason":"x"}\n```';
    expect(parseDeciderOutput(md, 1)).toBeNull();
  });

  it("parses a well-formed loop decision with targeted tasks", () => {
    const out = parseDeciderOutput(valid(1), 1);
    expect(out).toEqual({
      decision: "loop",
      reason: "5 tests failed; recoverable",
      loop_tasks: ["fix mock in src/foo.test.ts:15"],
    });
  });

  it("parses a done decision and ignores any stray loop_tasks", () => {
    const md =
      '## Decider Output: Iteration 1\n\n```json\n{"decision":"done","reason":"all green","loop_tasks":["should not appear"]}\n```';
    const out = parseDeciderOutput(md, 1);
    expect(out).toEqual({ decision: "done", reason: "all green" });
  });

  it("parses a halt decision without loop_tasks", () => {
    const md =
      '## Decider Output: Iteration 3\n\n```json\n{"decision":"halt","reason":"max iterations"}\n```';
    expect(parseDeciderOutput(md, 3)).toEqual({
      decision: "halt",
      reason: "max iterations",
    });
  });

  it("filters non-string entries from loop_tasks", () => {
    const md =
      '## Decider Output: Iteration 1\n\n```json\n{"decision":"loop","reason":"r","loop_tasks":["good", 42, null, "also good"]}\n```';
    expect(parseDeciderOutput(md, 1)).toEqual({
      decision: "loop",
      reason: "r",
      loop_tasks: ["good", "also good"],
    });
  });

  it("treats an empty loop_tasks array as undefined (orchestrator falls back to raw failures)", () => {
    const md =
      '## Decider Output: Iteration 1\n\n```json\n{"decision":"loop","reason":"r","loop_tasks":[]}\n```';
    const out = parseDeciderOutput(md, 1);
    expect(out).toEqual({ decision: "loop", reason: "r" });
  });

  it("matches the exact iteration heading and not a substring", () => {
    // "Iteration 1" should not match "Iteration 10" — only an exact match.
    const md =
      '## Decider Output: Iteration 10\n\n```json\n{"decision":"done","reason":"r"}\n```';
    expect(parseDeciderOutput(md, 1)).toBeNull();
    expect(parseDeciderOutput(md, 10)).toEqual({
      decision: "done",
      reason: "r",
    });
  });
});
