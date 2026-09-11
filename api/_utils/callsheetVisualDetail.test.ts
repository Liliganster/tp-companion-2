import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ destroy: vi.fn(), cancel: vi.fn(), render: vi.fn(), getPage: vi.fn(), create: vi.fn(), canvas: { width: 0, height: 0, toBuffer: vi.fn() } }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ getDocument: () => ({ promise: Promise.resolve({ getPage: m.getPage }), destroy: m.destroy }) }));
vi.mock('@napi-rs/canvas', () => ({ createCanvas: m.create }));
import { callsheetVisualDetail } from './callsheetVisualDetail';
beforeEach(() => {
  m.destroy.mockResolvedValue(undefined);
  m.canvas.toBuffer.mockReturnValue(Buffer.from('PNG'));
  m.create.mockImplementation((width, height) => { m.canvas.width = width; m.canvas.height = height; return m.canvas; });
  m.render.mockReturnValue({ promise: Promise.resolve(), cancel: m.cancel });
  m.getPage.mockResolvedValue({ getViewport: ({ scale }: { scale: number }) => ({ width: 20000 * scale, height: 30000 * scale }), render: m.render });
});
afterEach(() => vi.useRealTimers());
it('bounds the bitmap for oversized pages and releases the PDF and canvas after rendering', async () => {
  expect(await callsheetVisualDetail(Buffer.from('original'))).toEqual(Buffer.from('PNG'));
  expect(m.getPage).toHaveBeenCalledExactlyOnceWith(1);
  const [width, height] = m.create.mock.calls[0];
  expect(width).toBeLessThanOrEqual(2000); expect(height).toBeLessThanOrEqual(700);
  expect(m.destroy).toHaveBeenCalledOnce();
  expect(m.canvas.width).toBe(1); expect(m.canvas.height).toBe(1);
});
it('cancels a stalled render after five seconds and releases its document', async () => {
  vi.useFakeTimers();
  m.render.mockReturnValue({ promise: new Promise(() => {}), cancel: m.cancel });
  const pending = expect(callsheetVisualDetail(Buffer.from('original'))).rejects.toThrow('visual_detail_timeout');
  await vi.waitFor(() => expect(m.render).toHaveBeenCalled());
  await vi.advanceTimersByTimeAsync(5000);
  await pending;
  expect(m.cancel).toHaveBeenCalled(); expect(m.destroy).toHaveBeenCalledOnce();
  expect(m.canvas.width).toBe(1);
});
