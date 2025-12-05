
import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source to the CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs`;

// Define the type for the PDF Document Proxy
export type PDFDocumentProxy = pdfjsLib.PDFDocumentProxy;

/**
 * Loads the PDF document from a File object.
 * Returns the PDFDocumentProxy which allows accessing individual pages.
 */
export const loadPdfDocument = async (file: File): Promise<PDFDocumentProxy> => {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    return await loadingTask.promise;
  } catch (error) {
    console.error("Error loading PDF:", error);
    throw new Error("Failed to load PDF file. Please ensure it is a valid PDF.");
  }
};

/**
 * Renders a specific page from the PDF document to a Base64 JPEG string.
 * @param pdf - The loaded PDFDocumentProxy
 * @param pageIndex - 0-based index of the page to render
 * @param scale - Rendering scale (default 2.0 for high res)
 */
export const renderPage = async (pdf: PDFDocumentProxy, pageIndex: number, scale: number = 2.0): Promise<string> => {
  try {
    // PDF.js uses 1-based indexing for getPage
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (!context) throw new Error("Could not get canvas context");

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext as any).promise;

    // Convert to base64 JPEG
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch (error) {
    console.error(`Error rendering page ${pageIndex}:`, error);
    throw new Error(`Failed to render page ${pageIndex + 1}`);
  }
};

/**
 * Extracts text content from a specific page.
 * @param pdf - The loaded PDFDocumentProxy
 * @param pageIndex - 0-based index
 */
export const getPageText = async (pdf: PDFDocumentProxy, pageIndex: number): Promise<string> => {
  try {
    const page = await pdf.getPage(pageIndex + 1);
    const textContent = await page.getTextContent();
    const strings = textContent.items.map((item: any) => item.str);
    return strings.join(" ");
  } catch (error) {
    console.warn(`Failed to extract text from page ${pageIndex}`, error);
    return "";
  }
};

/**
 * Extracts text from all pages to build a map of Page Index -> Raw Text.
 * Optimized to use an existing PDF document proxy if available.
 */
export const extractPdfTextIndex = async (pdf: PDFDocumentProxy): Promise<string[]> => {
  const numPages = pdf.numPages;
  const pageTexts: string[] = [];

  // Limit full text scan to first 20 pages for performance if document is huge, 
  // or scan all if needed. For Key Pages, usually first few matter.
  // Let's scan all but sequentially to not hang UI.
  for (let i = 1; i <= numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const strings = textContent.items.map((item: any) => item.str);
      pageTexts.push(strings.join(" "));
    } catch (e) {
      console.warn(`Failed to extract text from page ${i}`, e);
      pageTexts.push("");
    }
  }
  
  return pageTexts;
};
