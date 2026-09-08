import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Auth from "./Auth";

const mocks = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(),
  toast: vi.fn(),
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  requestPasswordReset: vi.fn(),
}));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    signInWithPassword: mocks.signInWithPassword,
    signUpWithPassword: mocks.signUpWithPassword,
    signInWithGoogle: mocks.signInWithGoogle,
    requestPasswordReset: mocks.requestPasswordReset,
    user: null,
    loading: false,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/components/auth/GoogleSignInButton", () => ({
  GoogleSignInButton: ({ isSignUp, onCredential }: any) => (
    <button type="button" onClick={() => onCredential("g".repeat(200), "nonce") }>
      {isSignUp ? "google-signup" : "google-login"}
    </button>
  ),
}));

describe("Auth Google account modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("does not create a Google account from login mode", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ exists: false }),
    })));

    render(<MemoryRouter><Auth /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "google-login" }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "auth.googleAccountNotFoundTitle",
      variant: "destructive",
    })));
    expect(mocks.signInWithGoogle).not.toHaveBeenCalled();
  });

  it("allows Google account creation only from signup mode", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<MemoryRouter><Auth /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "auth.startFree" }));
    fireEvent.click(screen.getByRole("button", { name: "google-signup" }));

    await waitFor(() => expect(mocks.signInWithGoogle).toHaveBeenCalledWith("g".repeat(200), "nonce"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

vi.mock("@/components/auth/AuthCaptcha", () => ({
  AuthCaptcha: ({ onToken }: { onToken: (token: string) => void }) => <>
    <button type="button" onClick={() => onToken("verified-token")}>verify-captcha</button>
    <button type="button" onClick={() => onToken("")}>expire-captcha</button>
  </>,
}));

describe("CAPTCHA protected forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");
  });
  it("blocks login before verification and after token expiry", () => {
    render(<MemoryRouter><Auth /></MemoryRouter>);
    const login = screen.getByRole("button", { name: "auth.login" });
    expect(login).toBeDisabled();
    fireEvent.click(screen.getByText("verify-captcha"));
    expect(login).toBeEnabled();
    fireEvent.click(screen.getByText("expire-captcha"));
    expect(login).toBeDisabled();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
  it("passes a token for signup and consumes it after submission", async () => {
    render(<MemoryRouter><Auth /></MemoryRouter>);
    fireEvent.click(screen.getByText("auth.startFree"));
    fireEvent.change(screen.getByLabelText("auth.email"), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText("auth.password"), { target: { value: "Test-password123!" } });
    fireEvent.click(screen.getByText("verify-captcha"));
    fireEvent.click(screen.getByRole("button", { name: "auth.createAccount" }));
    await waitFor(() => expect(mocks.signUpWithPassword).toHaveBeenCalledWith("test@example.com", "Test-password123!", "", "verified-token"));
    await waitFor(() => expect(screen.getByRole("button", { name: "auth.login" })).toBeDisabled());
  });
  it("requires a fresh token after a recovery request fails", async () => {
    mocks.requestPasswordReset.mockRejectedValueOnce(new Error("Network error"));
    render(<MemoryRouter><Auth /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("auth.email"), { target: { value: "test@example.com" } });
    expect(screen.getByText("auth.forgotPassword")).toBeDisabled();
    fireEvent.click(screen.getByText("verify-captcha"));
    fireEvent.click(screen.getByText("auth.forgotPassword"));
    await waitFor(() => expect(mocks.requestPasswordReset).toHaveBeenCalledWith("test@example.com", "verified-token"));
    await waitFor(() => expect(screen.getByText("auth.forgotPassword")).toBeDisabled());
  });
});
