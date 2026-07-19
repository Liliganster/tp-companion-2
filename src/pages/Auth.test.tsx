import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Auth from "./Auth";

const mocks = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    signInWithPassword: vi.fn(),
    signUpWithPassword: vi.fn(),
    signInWithGoogle: mocks.signInWithGoogle,
    requestPasswordReset: vi.fn(),
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
