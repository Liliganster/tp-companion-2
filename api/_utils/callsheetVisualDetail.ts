/** Supplement the complete PDF with a larger view of its first-page header.
 * Small logos can disappear at the provider's full-page PDF resolution.
 * This is extra visual evidence, never a replacement for any document page.
 */
export async function callsheetVisualDetail(bytes: Buffer): Promise<Buffer> {
  const [{ getDocument }, { createCanvas }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'), import('@napi-rs/canvas'),
  ]);
  const loading = getDocument({ data: Uint8Array.from(bytes), isEvalSupported: false, useSystemFonts: true });
  let render: { cancel(): void } | undefined;
  let canvas: import('@napi-rs/canvas').Canvas | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const document = await loading.promise;
        const page = await document.getPage(1);
        const size = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 2000 / Math.max(size.width, size.height));
        const viewport = page.getViewport({ scale });
        // Clip the extra view, not the PDF sent to the model. Bound bitmap memory.
        canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height * 0.35)));
        const task = page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport });
        render = task;
        await task.promise;
        return canvas.toBuffer('image/png');
      })(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { render?.cancel(); reject(new Error('visual_detail_timeout')); }, 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    render?.cancel();
    await loading.destroy();
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}
