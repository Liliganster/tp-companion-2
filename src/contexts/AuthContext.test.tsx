import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";

const mocks = vi.hoisted(() => {
  const signInWithPassword = vi.fn(async () => ({ error: null }));
  const signUp = vi.fn(async () => ({ error: null }));
  const signInWithOAuth = vi.fn(async () => ({ error: null }));
  const signOut = vi.fn(async () => ({ error: null }));
  const getSession = vi.fn(async () => ({ data: { session: null } }));
  const unsubscribe = vi.fn();

  const onAuthStateChange = vi.fn(() => ({
    data: { subscription: { unsubscribe } },
  }));

  return { signInWithPassword, signUp, signInWithOAuth, signOut, getSession, onAuthStateChange, unsubscribe };
});

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
      signInWithOAuth: mocks.signInWithOAuth,
      signOut: mocks.signOut,
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  },
}));

vi.mock("@/lib/sentryClient", () => ({
  setSentryUser: vi.fn(),
}));

import { AuthProvider, useAuth } from "./AuthContext";

function CaptureAuth({ out }: { out: { current: ReturnType<typeof useAuth> | null } }) {
  out.current = useAuth();
  return null;
}

describe("AuthContext", () => {
  it("calls supabase auth methods", async () => {
    const out: { current: ReturnType<typeof useAuth> | null } = { current: null };

    render(
      <AuthProvider>
        <CaptureAuth out={out} />
      </AuthProvider>,
    );

    await waitFor(() => expect(out.current).not.toBeNull());

    await out.current!.signInWithPassword("a@b.com", "pw");
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.com", password: "pw" });

    await out.current!.signUpWithPassword("a@b.com", "pw", "Name");
    expect(mocks.signUp).toHaveBeenCalled();
  });
});

