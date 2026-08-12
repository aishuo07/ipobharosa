import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, SegmentedTabs, StatePanel, TabButton, TextInput } from "./ui";

describe("UI primitives", () => {
  it("exposes selected tab state to assistive technology", () => {
    const html = renderToStaticMarkup(<SegmentedTabs label="IPO status"><TabButton active>Open</TabButton></SegmentedTabs>);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
  });

  it("preserves native disabled semantics", () => {
    expect(renderToStaticMarkup(<Button disabled>Apply</Button>)).toContain("disabled");
    expect(renderToStaticMarkup(<TextInput disabled />)).toContain("disabled");
  });

  it("uses alert semantics for error states", () => {
    expect(renderToStaticMarkup(<StatePanel tone="error" title="Could not load" />)).toContain('role="alert"');
  });
});
