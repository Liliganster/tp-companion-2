import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ download: vi.fn(), upload: vi.fn(), remove: vi.fn(), signed: vi.fn(), list: vi.fn(), auth: vi.fn(), rate: vi.fn(), storage: vi.fn() }));
vi.mock("../../src/lib/supabaseServer.js", () => ({ supabaseAdmin: { storage: { from: mocks.storage } } }));
vi.mock("./supabase.js", () => ({ requireSupabaseUser: mocks.auth, sendJson: (res: any, status: number, data: any) => { res.status = status; res.data = data; } }));
vi.mock("./rateLimit.js", () => ({ enforceRateLimit: mocks.rate }));
import { decodeUploadTicket, encodeUploadTicket, handleSecureUpload } from "./secureUpload";

const uid = "00000000-0000-4000-8000-000000000001";
const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const ticket = () => ({ userId: uid, bucket: "project_documents" as const, path: `${uid}/2026-09/receipt.pdf`, staging: `${uid}/random.pdf`, mime: "application/pdf", size: pdf.length, expires: Date.now() + 60_000 });
const response = () => ({ setHeader: vi.fn(), status: 0, data: null as any });
beforeEach(() => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-signing-key-not-a-real-credential");
  mocks.auth.mockResolvedValue({ id: uid }); mocks.rate.mockResolvedValue(true);
  mocks.storage.mockReturnValue({ download: mocks.download, upload: mocks.upload, remove: mocks.remove, createSignedUploadUrl: mocks.signed, list: mocks.list });
  mocks.download.mockResolvedValue({ data: new Blob([pdf], { type: "application/pdf" }), error: null });
  mocks.upload.mockResolvedValue({ error: null }); mocks.remove.mockResolvedValue({ error: null });
  mocks.list.mockResolvedValue({ data: [] }); mocks.signed.mockResolvedValue({ data: { token: "signed-test" }, error: null });
});
describe("server upload enforcement", () => {
  it("rejects tampered, expired and cross-user tickets", () => {
    const token = encodeUploadTicket(ticket());
    expect(() => decodeUploadTicket(token + "x", uid)).toThrow();
    expect(() => decodeUploadTicket(token, "another-user")).toThrow();
    expect(() => decodeUploadTicket(encodeUploadTicket({ ...ticket(), expires: 1 }), uid)).toThrow();
    expect(() => decodeUploadTicket(undefined as any, uid)).toThrow();
  });
  it("stores only the validated bytes and removes staging", async () => {
    const res = response();
    await handleSecureUpload({ method: "POST", body: { ticket: encodeUploadTicket(ticket()) } }, res, true);
    expect(res.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledWith(ticket().path, pdf, { contentType: "application/pdf", upsert: false });
    expect(mocks.remove).toHaveBeenCalledWith([ticket().staging]);
  });
  it("rejects executable bytes with a fake PDF MIME and deletes staging", async () => {
    const bytes = new Uint8Array(pdf.length).fill(65); bytes[0] = 77; bytes[1] = 90;
    mocks.download.mockResolvedValue({ data: new Blob([bytes], { type: "application/pdf" }) });
    const res = response();
    await handleSecureUpload({ method: "POST", body: { ticket: encodeUploadTicket(ticket()) } }, res, true);
    expect(res.status).toBe(400); expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.remove).toHaveBeenCalled();
  });
  it("rejects a changed size and MIME at finalization", async () => {
    for (const file of [new Blob([pdf, "extra"], { type: "application/pdf" }), new Blob([pdf], { type: "image/png" })]) {
      mocks.download.mockResolvedValue({ data: file });
      const res = response();
      await handleSecureUpload({ method: "POST", body: { ticket: encodeUploadTicket(ticket()) } }, res, true);
      expect(res.status).toBe(400);
    }
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it.each(["other-user/a.pdf", `${uid}/../a.pdf`, `${uid}/a.exe`, `${uid}/a%2f.pdf`])("rejects unsafe destination %s", async path => {
    const res = response();
    await handleSecureUpload({ method: "POST", body: { bucket: "project_documents", path, contentType: "application/pdf", size: 100 } }, res, false);
    expect(res.status).toBe(400); expect(mocks.signed).not.toHaveBeenCalled();
  });
  it("issues upload URLs only for quarantine", async () => {
    const res = response();
    await handleSecureUpload({ method: "POST", body: { bucket: "project_documents", path: ticket().path, contentType: "application/pdf", size: pdf.length } }, res, false);
    expect(res.status).toBe(200);
    expect(mocks.storage.mock.calls.every(([bucket]) => bucket === "upload_quarantine")).toBe(true);
    expect(decodeUploadTicket(res.data.ticket, uid).path).toBe(ticket().path);
  });
  it("does nothing without authentication or after rate limiting", async () => {
    mocks.auth.mockResolvedValue(null);
    await handleSecureUpload({ method: "POST" }, response(), false);
    expect(mocks.storage).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({ id: uid }); mocks.rate.mockResolvedValue(false);
    await handleSecureUpload({ method: "POST" }, response(), false);
    expect(mocks.storage).not.toHaveBeenCalled();
  });
});
