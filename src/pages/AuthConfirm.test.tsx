import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { verifyOtp: mocks.verifyOtp } },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

import AuthConfirm from "./AuthConfirm";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/confirm" element={<AuthConfirm />} />
        <Route path="/auth/reset" element={<div>Reset listo</div>} />
        <Route path="/auth" element={<div>Login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuthConfirm", () => {
  beforeEach(() => {
    mocks.verifyOtp.mockReset();
    mocks.toast.mockReset();
  });

  it("espera la confirmación del usuario antes de consumir el código", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });
    renderAt("/auth/confirm?token_hash=secure-hash&type=recovery");

    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Continuar de forma segura" }));

    await waitFor(() => {
      expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "secure-hash", type: "recovery" });
    });
    expect(await screen.findByText("Reset listo")).toBeInTheDocument();
  });

  it("rechaza enlaces incompletos sin llamar a Supabase", async () => {
    renderAt("/auth/confirm?type=recovery");

    expect(await screen.findByText("Enlace no válido")).toBeInTheDocument();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
