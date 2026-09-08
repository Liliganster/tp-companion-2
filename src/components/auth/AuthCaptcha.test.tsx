import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthCaptcha } from "./AuthCaptcha";

afterEach(() => { delete window.turnstile; });
describe("AuthCaptcha lifecycle", () => {
  it("clears expired tokens, retries failures, and removes widgets on unmount", async () => {
    let callbacks: Record<string, unknown> = {};
    const remove = vi.fn();
    const renderWidget = vi.fn((_element, options) => { callbacks = options; return "widget"; });
    window.turnstile = { render: renderWidget, remove };
    const onToken = vi.fn();
    const view = render(<AuthCaptcha siteKey="site" onToken={onToken} />);
    await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce());
    act(() => (callbacks.callback as (token: string) => void)("token"));
    expect(onToken).toHaveBeenLastCalledWith("token");
    act(() => (callbacks["expired-callback"] as () => void)());
    expect(onToken).toHaveBeenLastCalledWith("");
    act(() => (callbacks["error-callback"] as () => void)());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Reintentar"));
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(2));
    expect(remove).toHaveBeenCalledOnce();
    view.unmount();
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
