import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import GoogleAnalytics from "./GoogleAnalytics";

vi.mock("next/script", () => ({
  default: ({ children, ...props }: React.ComponentProps<"script">) => (
    <script {...props}>{children}</script>
  ),
}));

describe("GoogleAnalytics", () => {
  afterEach(cleanup);

  it.each([undefined, "", "UA-123", "G-invalid id"])(
    "does not load tracking for an invalid measurement id: %s",
    (measurementId) => {
      const { container } = render(
        <GoogleAnalytics measurementId={measurementId} />
      );

      expect(container).toBeEmptyDOMElement();
    }
  );

  it("loads and configures the supplied GA4 measurement id once", () => {
    const { container } = render(
      <GoogleAnalytics measurementId="G-6QNWRT4M2Z" />
    );

    const scripts = container.querySelectorAll("script");
    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toHaveAttribute(
      "src",
      "https://www.googletagmanager.com/gtag/js?id=G-6QNWRT4M2Z"
    );
    expect(scripts[1].textContent).toContain(
      "gtag('config', 'G-6QNWRT4M2Z')"
    );
  });
});
