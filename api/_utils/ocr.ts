/**
 * OCR module using Tesseract.js for text extraction from PDFs.
 * Converts PDF pages to images, then runs OCR on each page.
 * Supports German (deu) and English (eng) languages.
 * 
 * Also returns page images for Gemini Vision dual-analysis.
 */

import Tesseract from "tesseract.js";

// Lazy import pdf-to-img to avoid issues at module load time
let pdfToImg: typeof import("pdf-to-img") | null = null;

async function getPdfToImg() {
  if (!pdfToImg) {
    pdfToImg = await import("pdf-to-img");
  }
  return pdfToImg;
}

export interface OcrResult {
  text: string;
  confidence: number;
  pages: number;
  durationMs: number;
}

export interface OcrWithImagesResult extends OcrResult {
  /** Base64-encoded PNG images of each page (for Gemini Vision) */
  pageImages: string[];
}

/**
 * Extract text from a PDF using OCR (Tesseract.js).
 * Converts each page to an image, runs OCR, and concatenates results.
 * 
 * @param pdfBuffer - The PDF file as a Buffer
 * @param options - OCR options
 * @returns OCR result with extracted text, confidence, and metadata
 */
export async function extractTextFromPdfWithOcr(
  pdfBuffer: Buffer,
  options: {
    maxPages?: number;
    languages?: string;
    timeoutMs?: number;
  } = {}
): Promise<OcrResult> {
  const startTime = Date.now();
  const { maxPages = 3, languages = "deu+eng", timeoutMs = 30000 } = options;

  const allText: string[] = [];
  let totalConfidence = 0;
  let pageCount = 0;

  try {
    const { pdf } = await getPdfToImg();
    
    // Convert PDF to images (yields PNG buffers for each page)
    const pdfDocument = await pdf(pdfBuffer, { scale: 2 }); // scale 2 = ~150 DPI for better OCR
    
    for await (const pageImage of pdfDocument) {
      if (pageCount >= maxPages) break;
      
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        console.warn(`[OCR] Timeout reached after ${pageCount} pages`);
        break;
      }

      pageCount++;
      
      try {
        // Run OCR on this page image
        const result = await Tesseract.recognize(pageImage, languages, {
          logger: () => {}, // Suppress progress logs
        });
        
        if (result.data.text) {
          allText.push(result.data.text.trim());
          totalConfidence += result.data.confidence;
        }
      } catch (pageError) {
        console.warn(`[OCR] Failed to process page ${pageCount}:`, pageError);
        // Continue with other pages
      }
    }

    const avgConfidence = pageCount > 0 ? totalConfidence / pageCount : 0;
    const combinedText = allText.join("\n\n--- PAGE BREAK ---\n\n");

    return {
      text: combinedText,
      confidence: avgConfidence,
      pages: pageCount,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error("[OCR] Failed to process PDF:", error);
    return {
      text: "",
      confidence: 0,
      pages: 0,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Extract text from an image using OCR (Tesseract.js).
 * 
 * @param imageBuffer - The image file as a Buffer (PNG, JPG, etc.)
 * @param languages - Languages to use for OCR (default: "deu+eng")
 * @returns OCR result with extracted text and confidence
 */
export async function extractTextFromImageWithOcr(
  imageBuffer: Buffer,
  languages = "deu+eng"
): Promise<OcrResult> {
  const startTime = Date.now();

  try {
    const result = await Tesseract.recognize(imageBuffer, languages, {
      logger: () => {},
    });

    return {
      text: result.data.text.trim(),
      confidence: result.data.confidence,
      pages: 1,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error("[OCR] Failed to process image:", error);
    return {
      text: "",
      confidence: 0,
      pages: 0,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Check if OCR text is better than pdf-parse text.
 * Uses heuristics: OCR is better if confidence is high and text is longer.
 */
export function shouldUseOcrText(
  ocrText: string,
  pdfParseText: string,
  ocrConfidence: number
): boolean {
  // If pdf-parse got good text (has substantial content), prefer it (faster)
  const pdfParseLength = pdfParseText.trim().length;
  const ocrLength = ocrText.trim().length;

  // If pdf-parse has decent text and OCR confidence is low, use pdf-parse
  if (pdfParseLength > 200 && ocrConfidence < 70) {
    return false;
  }

  // If OCR has much more text and good confidence, use OCR
  if (ocrLength > pdfParseLength * 1.5 && ocrConfidence > 60) {
    return true;
  }

  // If pdf-parse has very little text (scanned PDF), use OCR
  if (pdfParseLength < 100 && ocrLength > 100) {
    return true;
  }

  // Default to pdf-parse (faster)
  return false;
}

/**
 * Extract first N pages from PDF as images + OCR text.
 * Returns both for dual-analysis: OCR text + Gemini Vision on images.
 * 
 * IMPORTANT: Only processes first 2 pages as callsheet info is always there.
 */
export async function extractPagesWithOcr(
  pdfBuffer: Buffer,
  options: {
    maxPages?: number;
    languages?: string;
    timeoutMs?: number;
  } = {}
): Promise<OcrWithImagesResult> {
  const startTime = Date.now();
  const { maxPages = 2, languages = "deu+eng", timeoutMs = 25000 } = options;

  const allText: string[] = [];
  const pageImages: string[] = [];
  let totalConfidence = 0;
  let pageCount = 0;

  try {
    const { pdf } = await getPdfToImg();
    
    // Convert PDF to images (yields PNG buffers for each page)
    // Scale 2 = ~150 DPI for good OCR + Vision quality
    const pdfDocument = await pdf(pdfBuffer, { scale: 2 });
    
    for await (const pageImage of pdfDocument) {
      if (pageCount >= maxPages) break;
      
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        console.warn(`[OCR] Timeout reached after ${pageCount} pages`);
        break;
      }

      pageCount++;
      
      // Store the image as base64 for Gemini Vision
      const imageBuffer = Buffer.isBuffer(pageImage) ? pageImage : Buffer.from(pageImage);
      pageImages.push(imageBuffer.toString("base64"));
      
      try {
        // Run OCR on this page image
        const result = await Tesseract.recognize(imageBuffer, languages, {
          logger: () => {}, // Suppress progress logs
        });
        
        if (result.data.text) {
          allText.push(result.data.text.trim());
          totalConfidence += result.data.confidence;
        }
      } catch (pageError) {
        console.warn(`[OCR] Failed to OCR page ${pageCount}:`, pageError);
        // Continue - we still have the image for Vision
      }
    }

    const avgConfidence = pageCount > 0 ? totalConfidence / pageCount : 0;
    const combinedText = allText.join("\n\n--- PAGE BREAK ---\n\n");

    return {
      text: combinedText,
      confidence: avgConfidence,
      pages: pageCount,
      pageImages,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error("[OCR] Failed to process PDF pages:", error);
    return {
      text: "",
      confidence: 0,
      pages: 0,
      pageImages: [],
      durationMs: Date.now() - startTime,
    };
  }
}
