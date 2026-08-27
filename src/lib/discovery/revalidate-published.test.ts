import { describe, expect, it } from "vitest";
import { publishedOutcome } from "./revalidate-published";
import type { PublicationDecision } from "./official/types";

function decision(value: PublicationDecision["decision"]): PublicationDecision {
  return { decision: value, reasons: [], comparisons: [], evidence: null };
}

describe("published IPO revalidation", () => {
  it("maps official matches, conflicts and gaps without mutating semantics", () => {
    expect(publishedOutcome(decision("AUTO_PUBLISH"))).toBe("MATCHED");
    expect(publishedOutcome(decision("EXCEPTION"))).toBe("DRIFT");
    expect(publishedOutcome(decision("RETRY"))).toBe("RETRY");
  });
});
