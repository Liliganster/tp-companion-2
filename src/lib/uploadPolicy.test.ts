import { describe, expect, it } from "vitest";
import { validateUploadBytes, validateUploadMetadata, UPLOAD_LIMITS } from "./uploadPolicy";
import { isSupportedCallsheetFile } from "./callsheetMime";

const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=", "base64"));
describe("upload security policy", () => {
  it("accepts PDF and PNG signatures", () => {
    expect(() => validateUploadBytes(pdf, "application/pdf")).not.toThrow();
    expect(() => validateUploadBytes(png, "image/png")).not.toThrow();
  });
  it.each(["application/pdf", "image/jpeg", "image/png"])("rejects disguised executables (%s)", mime => {
    expect(() => validateUploadBytes(new TextEncoder().encode("MZ executable content"), mime)).toThrow();
  });
  it("rejects truncated or mismatched files", () => {
    expect(() => validateUploadBytes(pdf.slice(0, -8), "application/pdf")).toThrow();
    expect(() => validateUploadBytes(png.slice(0, -1), "image/png")).toThrow();
    expect(() => validateUploadBytes(pdf, "image/jpeg")).toThrow();
  });
  it("requires supported extension and matching MIME", () => {
    expect(validateUploadMetadata("callsheets", "test.JPG", "image/jpeg", 100)).toBe("image/jpeg");
    for (const [name, mime] of [["test.exe", "application/pdf"], ["test.pdf", "image/jpeg"], ["test.webp", "image/webp"], ["test", "application/pdf"]]) {
      expect(() => validateUploadMetadata("callsheets", name, mime, 100)).toThrow();
      expect(isSupportedCallsheetFile({ name, type: mime })).toBe(false);
    }
  });
  it("rejects empty, oversized and fraudulent sizes for both buckets", () => {
    for (const bucket of ["callsheets", "project_documents"] as const) {
      for (const size of [0, -1, NaN, 1.5, UPLOAD_LIMITS[bucket] + 1]) expect(() => validateUploadMetadata(bucket, "a.pdf", "application/pdf", size)).toThrow();
      expect(() => validateUploadMetadata(bucket, "a.pdf", "application/pdf", UPLOAD_LIMITS[bucket])).not.toThrow();
    }
  });
});
