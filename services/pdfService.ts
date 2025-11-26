import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source to the CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs`;

export const convertPdfToImages = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  
  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    const images: string[] = [];

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      
      // Determine scale for high resolution (e.g., scale 2.5 for better OCR/Vision)
      const scale = 2.5;
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
      const base64 = canvas.toDataURL('image/jpeg', 0.8);
      images.push(base64); // Keep the data:image/jpeg;base64 prefix for display, strip it for API later if needed
    }

    return images;
  } catch (error) {
    console.error("Error processing PDF:", error);
    throw new Error("Failed to parse PDF file. Please ensure it is a valid PDF.");
  }
};