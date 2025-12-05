import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import SettingsPanel from './components/SettingsPanel';
import TakeoffTable from './components/TakeoffTable';
import { ProjectSettings, AppState, AnalysisResult, SignageItem, SignTypeDefinition } from './types';
import { analyzeDrawing, identifyKeyPages, cropImage } from './services/geminiService';
import { loadPdfDocument, renderPage, getPageText, extractPdfTextIndex, PDFDocumentProxy } from './services/pdfService';
import { UploadCloud, FileImage, AlertCircle, Loader2, Maximize2, ChevronLeft, ChevronRight, FileText, CheckCircle2, BookOpen, Plus, RefreshCw, Save, Crop, Move, ZoomIn, ZoomOut, MousePointer2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, XCircle } from 'lucide-react';
import JSZip from 'jszip';

const DEFAULT_SETTINGS: ProjectSettings = {
  autoStrategy: true,
  keyPages: []
};

// Normalized Bounds (0-1) relative to image size
interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

const App: React.FC = () => {
  const [settings, setSettings] = useState<ProjectSettings>(DEFAULT_SETTINGS);
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  
  // Layout State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(true);

  // File State
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  
  // PDF State (On-Demand Loading)
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  
  // Navigation
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [pageInput, setPageInput] = useState<string>("1");
  const [referencePagesInput, setReferencePagesInput] = useState<string>("");
  
  // Analysis State
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessingKeyPages, setIsProcessingKeyPages] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Master Project State
  const [masterTakeoff, setMasterTakeoff] = useState<SignageItem[]>([]);
  const [masterCatalog, setMasterCatalog] = useState<SignTypeDefinition[]>([]);
  const [viewMode, setViewMode] = useState<'current' | 'master'>('current');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Image Editor State (Zoom/Pan/Crop)
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [toolMode, setToolMode] = useState<'pan' | 'select'>('pan');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Selection/Crop State
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState({ x: 0, y: 0 }); // Normalized 0-1
  const [selectionBox, setSelectionBox] = useState<Bounds | null>(null); // Normalized 0-1
  
  // Modal State (Positioned Fixed)
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [modalPosition, setModalPosition] = useState({ top: 0, left: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Sync pageInput when page changes
  useEffect(() => {
    setPageInput((currentPageIndex + 1).toString());
    // Reset zoom/pan on page change
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
    setSelectionBox(null);
    setShowAssignmentModal(false);
  }, [currentPageIndex]);

  // Load a specific page for display
  const loadPageForDisplay = useCallback(async (index: number) => {
    if (!pdfDocRef.current) return;
    try {
      const image = await renderPage(pdfDocRef.current, index, 1.5); // Preview scale 1.5 is enough
      setCurrentImage(image);
    } catch (e) {
      console.error("Failed to render preview page", e);
      setErrorMsg("Failed to render page preview.");
    }
  }, []);

  const processUploadedPdf = async (file: File) => {
     try {
       const pdf = await loadPdfDocument(file);
       pdfDocRef.current = pdf;
       setNumPages(pdf.numPages);
       setCurrentPageIndex(0);
       
       // Render first page immediately
       await loadPageForDisplay(0);
       
       // Background: Text Extraction & Key Pages
       setIsProcessingKeyPages(true);
       (async () => {
         try {
            const pageTexts = await extractPdfTextIndex(pdf);
            const firstFewImages: string[] = [];
            const scanLimit = Math.min(3, pdf.numPages);
            for (let i = 0; i < scanLimit; i++) {
               const img = await renderPage(pdf, i, 1.0); 
               firstFewImages.push(img.split(',')[1]);
            }
            const detectedKeys = await identifyKeyPages(firstFewImages, pageTexts);
            if (detectedKeys.length > 0) {
              setSettings(prev => ({ ...prev, keyPages: detectedKeys }));
            }
         } catch (e) {
           console.warn("Key Page detection failed", e);
         } finally {
           setIsProcessingKeyPages(false);
         }
       })();
     } catch (err: any) {
        console.error(err);
        setErrorMsg("Failed to process PDF. " + err.message);
        setAppState(AppState.ERROR);
     }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      handleFileLoad(file);
    }
  };

  const handleFileLoad = async (file: File) => {
      const isPdf = file.type === 'application/pdf';
      const isImage = file.type.startsWith('image/');
      const isZip = file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';

      setCurrentFile(file);
      setErrorMsg(null);
      setAnalysisResult(null);
      setAppState(AppState.UPLOADING);
      setNumPages(0);
      setCurrentImage(null);
      pdfDocRef.current = null;

      try {
        if (isZip) {
          const zip = await JSZip.loadAsync(file);
          const dataFile = zip.file("project_data.json");
          if (!dataFile) throw new Error("Invalid project file: missing project_data.json");
          const dataStr = await dataFile.async("string");
          const projectData = JSON.parse(dataStr);

          setMasterTakeoff(projectData.masterTakeoff || []);
          setMasterCatalog(projectData.masterCatalog || []);
          setSettings(projectData.settings || DEFAULT_SETTINGS);
          setReferencePagesInput(projectData.referencePagesInput || "");
          if (projectData.masterTakeoff && projectData.masterTakeoff.length > 0) {
             setViewMode('master');
          }

          const sourcePdf = zip.file("source.pdf");
          if (sourcePdf) {
             const pdfBlob = await sourcePdf.async("blob");
             const pdfFile = new File([pdfBlob], "source.pdf", { type: "application/pdf" });
             setCurrentFile(pdfFile); 
             await processUploadedPdf(pdfFile);
          } else {
             console.warn("No source.pdf found in zip");
          }

        } else if (isPdf) {
           setReferencePagesInput("");
           setSettings(prev => ({ ...prev, keyPages: [] }));
           setMasterTakeoff([]);
           setMasterCatalog([]);
           await processUploadedPdf(file);

        } else if (isImage) {
           setReferencePagesInput("");
           setSettings(prev => ({ ...prev, keyPages: [] }));
           setMasterTakeoff([]);
           setMasterCatalog([]);
           setNumPages(1);
           const reader = new FileReader();
           reader.onload = (e) => {
             if (typeof e.target?.result === 'string') {
               setCurrentImage(e.target.result);
               setCurrentPageIndex(0);
             }
           };
           reader.readAsDataURL(file);
        } else {
           throw new Error("Unsupported file type.");
        }
        
        setAppState(AppState.IDLE);
      } catch (err: any) {
        console.error(err);
        setErrorMsg("Failed to process file. " + err.message);
        setAppState(AppState.ERROR);
      }
  };

  const handleSaveProject = async () => {
    if (!currentFile && masterTakeoff.length === 0) return;
    try {
      const zip = new JSZip();
      if (currentFile && currentFile.type === 'application/pdf') {
         zip.file("source.pdf", currentFile);
      }
      const projectData = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        masterTakeoff,
        masterCatalog,
        settings,
        referencePagesInput
      };
      zip.file("project_data.json", JSON.stringify(projectData, null, 2));
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      const baseName = currentFile ? currentFile.name.replace(/\.(pdf|zip)$/i, '') : 'signage_project';
      link.download = `${baseName}_project.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      console.error("Save failed", e);
      alert("Failed to save project.");
    }
  };

  const parsePageInput = (input: string, totalPages: number): number[] => {
    const pages = new Set<number>();
    const parts = input.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          const min = Math.min(start, end);
          const max = Math.max(start, end);
          for (let i = min; i <= max; i++) {
            if (i >= 1 && i <= totalPages) pages.add(i);
          }
        }
      } else {
        const page = parseInt(trimmed, 10);
        if (!isNaN(page) && page >= 1 && page <= totalPages) pages.add(page);
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  };

  const startAnalysis = async () => {
    if (!currentImage && !pdfDocRef.current) return;
    
    // Abort previous if any
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setAppState(AppState.ANALYZING);
    setErrorMsg(null);
    setViewMode('current');
    setSaveSuccess(false);
    
    // Auto-open panel on analysis start if it was closed
    setIsDetailsPanelOpen(true);

    try {
      let base64Data = "";
      let mimeType = "image/jpeg";
      let textLayer = "";

      if (pdfDocRef.current) {
        textLayer = await getPageText(pdfDocRef.current, currentPageIndex);
        const highResImage = await renderPage(pdfDocRef.current, currentPageIndex, 2.5);
        base64Data = highResImage.split(',')[1];
      } else if (currentImage) {
        base64Data = currentImage.split(',')[1];
        mimeType = currentImage.substring(currentImage.indexOf(':') + 1, currentImage.indexOf(';'));
      }

      const referenceImages: string[] = [];
      if (referencePagesInput.trim() !== "") {
        const pageNumbers = parsePageInput(referencePagesInput, numPages);
        for (const pageNum of pageNumbers) {
          const index = pageNum - 1;
          if (index !== currentPageIndex) {
             let refBase64 = "";
             if (pdfDocRef.current) {
               const img = await renderPage(pdfDocRef.current, index, 2.0);
               refBase64 = img.split(',')[1];
             }
             if (refBase64) referenceImages.push(refBase64);
          }
        }
      }

      const result = await analyzeDrawing(
        base64Data, 
        mimeType, 
        settings, 
        `${currentFile?.name} (Page ${currentPageIndex + 1})`,
        referenceImages,
        textLayer,
        controller.signal
      );
      
      // Inject Page Number into results
      if (result.takeoff && Array.isArray(result.takeoff)) {
        result.takeoff.forEach(item => {
           item.pageNumber = currentPageIndex + 1;
        });
      }

      setAnalysisResult(result);
      setAppState(AppState.COMPLETE);
    } catch (err: any) {
      if (err.message.includes("cancelled")) {
         // Should ideally handle cancel state cleanly, but error state is fine with msg
         console.log("Analysis cancelled");
         setAppState(AppState.IDLE);
         return;
      }
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred during analysis.");
      setAppState(AppState.ERROR);
    } finally {
        abortControllerRef.current = null;
    }
  };

  const cancelAnalysis = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
          setAppState(AppState.IDLE);
      }
  };

  // Data Handlers
  const handleAddToProject = useCallback(() => {
    if (!analysisResult) return;
    // Defensive check: ensure arrays exist
    if (!analysisResult.takeoff) analysisResult.takeoff = [];
    if (!analysisResult.catalog) analysisResult.catalog = [];

    const newSheetNames = new Set(analysisResult.takeoff.map(i => i.sheet));
    setMasterTakeoff(prevMaster => {
        const filteredMaster = prevMaster.filter(item => !newSheetNames.has(item.sheet));
        return [...filteredMaster, ...analysisResult.takeoff];
    });
    setMasterCatalog(prevCatalog => {
        const catalogMap = new Map<string, SignTypeDefinition>();
        // 1. Initialize with existing catalog
        (prevCatalog || []).forEach(c => catalogMap.set(c.typeCode.toLowerCase(), c));

        // 2. Upsert new items, preserving images if possible
        if (analysisResult.catalog && Array.isArray(analysisResult.catalog)) {
            analysisResult.catalog.forEach(c => {
                 const key = c.typeCode.toLowerCase();
                 // Feature: Preserve existing image if new one is missing but old one exists
                 if (catalogMap.has(key)) {
                    const existing = catalogMap.get(key);
                    if (existing && existing.designImage && !c.designImage) {
                        c.designImage = existing.designImage;
                    }
                 }
                 // Upsert (overwrite text, but we just preserved image if needed)
                 catalogMap.set(key, c);
            });
        }
        return Array.from(catalogMap.values());
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }, [analysisResult]);

  const handleRemoveRow = useCallback((itemToRemove: SignageItem) => {
    if (viewMode === 'master') {
      setMasterTakeoff(prev => prev.filter(item => item !== itemToRemove));
    } else {
      setAnalysisResult(prev => {
        if (!prev) return null;
        return { ...prev, takeoff: prev.takeoff.filter(item => item !== itemToRemove) };
      });
    }
  }, [viewMode]);

  const handleUpdateItem = useCallback((itemToUpdate: SignageItem, updates: Partial<SignageItem>) => {
    if (viewMode === 'master') {
      setMasterTakeoff(prev => prev.map(item => item === itemToUpdate ? { ...item, ...updates } : item));
    } else {
      setAnalysisResult(prev => {
        if (!prev) return null;
        return { ...prev, takeoff: prev.takeoff.map(item => item === itemToUpdate ? { ...item, ...updates } : item) };
      });
    }
  }, [viewMode]);

  const onToggleView = useCallback((isMaster: boolean) => {
    setViewMode(isMaster ? 'master' : 'current');
  }, []);

  const handleJumpToPage = useCallback((pageIndex: number) => {
    if (pageIndex >= 0 && pageIndex < numPages) {
      setCurrentPageIndex(pageIndex);
      loadPageForDisplay(pageIndex);
      setAnalysisResult(null);
      setAppState(AppState.IDLE);
      setViewMode('current');
    }
  }, [numPages, loadPageForDisplay]);

  const startNewProject = () => {
     if (window.confirm("Are you sure you want to start a new project? This will clear all data.")) {
        setAppState(AppState.IDLE);
        setCurrentFile(null);
        setNumPages(0);
        setCurrentImage(null);
        pdfDocRef.current = null;
        setCurrentPageIndex(0);
        setReferencePagesInput("");
        setAnalysisResult(null);
        setErrorMsg(null);
        setMasterTakeoff([]);
        setMasterCatalog([]);
        setViewMode('current');
        setSettings(DEFAULT_SETTINGS);
        if (fileInputRef.current) fileInputRef.current.value = '';
     }
  };

  const resetCurrentAnalysis = () => {
    setAnalysisResult(null);
    setAppState(AppState.IDLE);
    setErrorMsg(null);
  };

  const nextPage = () => {
    if (currentPageIndex < numPages - 1) {
      const next = currentPageIndex + 1;
      setCurrentPageIndex(next);
      loadPageForDisplay(next);
      setAnalysisResult(null);
      setAppState(AppState.IDLE);
      setViewMode('current');
    }
  };

  const prevPage = () => {
    if (currentPageIndex > 0) {
      const prev = currentPageIndex - 1;
      setCurrentPageIndex(prev);
      loadPageForDisplay(prev);
      setAnalysisResult(null);
      setAppState(AppState.IDLE);
      setViewMode('current');
    }
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(pageInput, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
      if (pageNum - 1 !== currentPageIndex) {
        const idx = pageNum - 1;
        setCurrentPageIndex(idx);
        loadPageForDisplay(idx);
        setAnalysisResult(null);
        setAppState(AppState.IDLE);
        setViewMode('current');
      }
    } else {
      setPageInput((currentPageIndex + 1).toString());
    }
  };

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(e.target.value);
  };

  const toggleCurrentPageAsReference = () => {
    const pageNum = (currentPageIndex + 1).toString();
    const currentRefs = referencePagesInput.split(',').map(s => s.trim()).filter(s => s !== "");
    if (currentRefs.includes(pageNum)) {
      const newRefs = currentRefs.filter(s => s !== pageNum);
      setReferencePagesInput(newRefs.join(', '));
    } else {
      const newRefs = [...currentRefs, pageNum];
      setReferencePagesInput(newRefs.join(', '));
    }
  };

  const isCurrentPageRef = () => {
    const pageNum = (currentPageIndex + 1).toString();
    const currentRefs = referencePagesInput.split(',').map(s => s.trim());
    return currentRefs.includes(pageNum);
  };

  // Helper to merge catalogs for display
  const displayedCatalog = useMemo(() => {
    if (viewMode === 'master') return masterCatalog;
    
    // Safety check for analysisResult.catalog
    const currentCatalog = Array.isArray(analysisResult?.catalog) ? analysisResult!.catalog : [];
    const combined = [...currentCatalog];
    const currentTypes = new Set(combined.map(c => c.typeCode.toLowerCase()));
    
    // Auto-associate: Use Master Catalog definitions if missing in current scan
    masterCatalog.forEach(mc => {
      if (!currentTypes.has(mc.typeCode.toLowerCase())) {
        combined.push(mc);
      } else {
         // If present in both, ensure image is preserved if missing in current scan
         const currentItem = combined.find(c => c.typeCode.toLowerCase() === mc.typeCode.toLowerCase());
         if (currentItem && !currentItem.designImage && mc.designImage) {
            currentItem.designImage = mc.designImage;
         }
      }
    });
    return combined;
  }, [viewMode, masterCatalog, analysisResult]);

  // --- IMAGE EDITOR HANDLERS (Zoom, Pan, Crop) ---

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only proceed if tool is active and we have an image container
    if (!imageContainerRef.current) return;

    if (toolMode === 'pan') {
      setIsDragging(true);
      // For panning, we track screen coordinates
      setDragStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
    } else if (toolMode === 'select') {
      const imgElement = imageContainerRef.current.querySelector('img');
      if (!imgElement) return;
      
      const rect = imgElement.getBoundingClientRect();
      
      // Calculate Normalized Coordinates (0-1) relative to the IMAGE ELEMENT
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      // Check if click is inside image bounds
      if (x < 0 || x > 1 || y < 0 || y > 1) return;

      setIsSelecting(true);
      setSelectionStart({ x, y });
      setSelectionBox({ x, y, w: 0, h: 0 });
      setShowAssignmentModal(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!imageContainerRef.current) return;

    if (toolMode === 'pan' && isDragging) {
      setPanPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    } else if (toolMode === 'select' && isSelecting) {
      const imgElement = imageContainerRef.current.querySelector('img');
      if (!imgElement) return;

      const rect = imgElement.getBoundingClientRect();
      
      const rawX = (e.clientX - rect.left) / rect.width;
      const rawY = (e.clientY - rect.top) / rect.height;
      
      const currentX = Math.max(0, Math.min(1, rawX));
      const currentY = Math.max(0, Math.min(1, rawY));

      const newX = Math.min(selectionStart.x, currentX);
      const newY = Math.min(selectionStart.y, currentY);
      const newW = Math.abs(currentX - selectionStart.x);
      const newH = Math.abs(currentY - selectionStart.y);

      setSelectionBox({ x: newX, y: newY, w: newW, h: newH });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    setIsDragging(false);
    if (isSelecting) {
      setIsSelecting(false);
      // Only show modal if box is big enough (e.g., > 1% of image size)
      if (selectionBox && (selectionBox.w > 0.01 || selectionBox.h > 0.01)) {
        // Calculate fixed position for the modal to ensure it is on top of everything
        // We use clientX/clientY from the mouse up event as the anchor
        
        // Smart Positioning: If click is too close to right edge, show modal to the left
        const screenW = window.innerWidth;
        const clickX = e.clientX;
        const isNearRightEdge = clickX > screenW - 250; 
        
        setModalPosition({
          top: e.clientY,
          left: isNearRightEdge ? clickX - 220 : clickX + 20
        });
        setShowAssignmentModal(true);
      } else {
        setSelectionBox(null);
      }
    }
  };

  const handleAssignToType = async (signType: string) => {
    if (!selectionBox || !currentImage) return;
    
    // Load image to get intrinsic dimensions
    const img = new Image();
    img.src = currentImage;
    await new Promise(r => img.onload = r);

    // Calculate Bounding Box in 0-1000 standard system
    const ymin = selectionBox.y * 1000;
    const xmin = selectionBox.x * 1000;
    const ymax = (selectionBox.y + selectionBox.h) * 1000;
    const xmax = (selectionBox.x + selectionBox.w) * 1000;

    const bbox = [ymin, xmin, ymax, xmax];

    const base64Crop = await cropImage(img, bbox, 0); // No padding for manual crop

    if (base64Crop) {
       // 1. Update Current Analysis Result
       setAnalysisResult(prev => {
          if (!prev) {
             return {
                 takeoff: [],
                 catalog: [{
                     typeCode: signType,
                     category: 'Manual',
                     description: 'Manual Extraction',
                     designImage: base64Crop,
                     boundingBox: bbox,
                     imageIndex: currentPageIndex
                 }]
             };
          }

          const newCatalog = prev.catalog ? [...prev.catalog] : [];
          const existingIndex = newCatalog.findIndex(c => c.typeCode === signType);
          
          if (existingIndex >= 0) {
             newCatalog[existingIndex] = { ...newCatalog[existingIndex], designImage: base64Crop };
          } else {
             newCatalog.push({
                typeCode: signType,
                category: 'Manual',
                description: 'Manual Extraction',
                designImage: base64Crop,
                boundingBox: bbox
             });
          }
          
          const newTakeoff = prev.takeoff ? prev.takeoff.map(item => {
             if (item.signType === signType) {
                 return { ...item, designImage: base64Crop };
             }
             return item;
          }) : [];

          return { ...prev, catalog: newCatalog, takeoff: newTakeoff };
       });

       // 2. Update Master Catalog
       setMasterCatalog(prevMaster => {
          const newCat = [...prevMaster];
          const existingIndex = newCat.findIndex(c => c.typeCode === signType);
          if (existingIndex >= 0) {
             newCat[existingIndex] = { ...newCat[existingIndex], designImage: base64Crop };
          } else {
             newCat.push({
                typeCode: signType,
                category: 'Manual',
                description: 'Manual Extraction',
                designImage: base64Crop
             });
          }
          return newCat;
       });

       // 3. Update Master Takeoff
       setMasterTakeoff(prevMasterTakeoff => {
           return prevMasterTakeoff.map(item => {
               if (item.signType === signType) {
                   return { ...item, designImage: base64Crop };
               }
               return item;
           });
       });

       setSelectionBox(null);
       setShowAssignmentModal(false);
       setToolMode('pan');
    }
  };

  const showResultsPanel = (appState === AppState.COMPLETE && !!analysisResult) || (masterTakeoff.length > 0) || viewMode === 'master';
  // If user explicitly closes the panel, respect that even if results are available
  const isPanelVisible = showResultsPanel && isDetailsPanelOpen;

  const availableTypes = useMemo(() => {
     const types = new Set<string>();
     (analysisResult?.takeoff || []).forEach(t => t.signType && types.add(t.signType));
     (analysisResult?.catalog || []).forEach(c => c.typeCode && types.add(c.typeCode));
     masterCatalog.forEach(c => c.typeCode && types.add(c.typeCode));
     return Array.from(types).sort();
  }, [analysisResult, masterCatalog]);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Fixed Modal Layer - Rendered at root to avoid z-index/overflow clipping */}
      {showAssignmentModal && (
        <div 
          className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-slate-200 p-3 min-w-[200px] animate-in fade-in zoom-in duration-100"
          style={{
            top: modalPosition.top,
            left: modalPosition.left,
          }}
          onMouseDown={e => e.stopPropagation()} 
        >
          <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Assign Visual To:</h4>
          <div className="max-h-40 overflow-y-auto space-y-1 mb-2 custom-scrollbar">
            {availableTypes.length > 0 ? availableTypes.map(type => (
              <button 
                key={type}
                onClick={() => handleAssignToType(type)}
                className="w-full text-left px-2 py-1.5 text-sm hover:bg-amber-50 rounded text-slate-700 flex items-center gap-2"
              >
                <MousePointer2 className="w-3 h-3 text-[#f9b800]" />
                {type}
              </button>
            )) : <p className="text-xs text-slate-400 italic px-2">No types found yet.</p>}
          </div>
          <div className="border-t border-slate-100 pt-2">
              <input 
                type="text" 
                placeholder="Or create new Type..."
                className="w-full text-sm border border-slate-200 rounded px-2 py-1 mb-2 focus:ring-1 focus:ring-[#f9b800] outline-none"
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAssignToType(e.currentTarget.value);
                }}
                autoFocus
              />
              <button onClick={() => setShowAssignmentModal(false)} className="w-full text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          </div>
        </div>
      )}

      {/* Sidebar */}
      {isSidebarOpen && (
        <SettingsPanel 
          settings={settings} 
          setSettings={setSettings} 
          onJumpToPage={handleJumpToPage}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-10 gap-3">
           
           <div className="flex items-center gap-3 flex-1 min-w-0">
             <img src="logo.png" alt="Logo" className="h-10 w-auto object-contain mr-2" onError={(e) => e.currentTarget.style.display = 'none'} />
             <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
                className="p-1.5 text-slate-400 hover:text-[#f9b800] hover:bg-slate-100 rounded transition-colors"
                title={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
             >
                {isSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
             </button>

             {currentFile && (
               <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 shadow-sm shrink-0">
                  {currentFile.type === 'application/pdf' ? <FileText className="w-4 h-4 text-red-500" /> : <FileImage className="w-4 h-4 text-blue-500" />}
                  <span className="text-sm font-medium text-slate-700 truncate max-w-[200px]">{currentFile.name}</span>
                  {numPages > 1 && (
                    <span className="text-xs text-slate-500 font-mono ml-1 px-1.5 py-0.5 bg-slate-200 rounded">
                      Page {currentPageIndex + 1} / {numPages}
                    </span>
                  )}
                  {isProcessingKeyPages && (
                    <span className="flex items-center gap-1.5 text-[10px] text-[#f9b800] bg-amber-50 px-2 py-0.5 rounded border border-amber-100 ml-2 animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Index...
                    </span>
                  )}
                  <button onClick={resetCurrentAnalysis} className="text-xs text-red-500 hover:text-red-700 ml-2 font-medium">Clear</button>
               </div>
             )}
             
             {saveSuccess && (
               <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full text-xs font-bold animate-in fade-in zoom-in duration-300">
                 <CheckCircle2 className="w-4 h-4" />
                 Saved!
               </div>
             )}
           </div>

           <div className="flex items-center gap-3">
              {/* Save Project Button */}
              {numPages > 0 && (
                <div className="flex gap-1">
                  <button 
                    onClick={handleSaveProject}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-bold uppercase transition-colors shadow-sm"
                    title="Save Project (ZIP)"
                  >
                    <Save className="w-4 h-4" />
                    Save Project
                  </button>
                </div>
              )}

              {/* New Project Button */}
              <button 
                onClick={startNewProject}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:text-[#f9b800] hover:bg-slate-50 rounded-md text-xs font-bold uppercase transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                New
              </button>

              {numPages > 0 && (
                <div className="flex items-center gap-2 bg-amber-50/50 px-3 py-1.5 rounded-lg border border-amber-100 shadow-sm transition-all focus-within:ring-2 focus-within:ring-[#f9b800]/20">
                    <BookOpen className="w-4 h-4 text-[#f9b800]" />
                    <div className="flex flex-col">
                      <label className="text-[10px] font-bold text-[#f9b800] uppercase leading-none mb-0.5">Ref Pages</label>
                       <div className="flex items-center gap-1">
                          <input 
                              type="text" 
                              value={referencePagesInput}
                              onChange={(e) => setReferencePagesInput(e.target.value)}
                              placeholder="1-3"
                              className="w-16 bg-transparent text-sm font-bold text-slate-700 placeholder:text-amber-200 outline-none h-4 border-none p-0 focus:ring-0"
                          />
                           <button 
                            onClick={toggleCurrentPageAsReference}
                            className={`p-0.5 rounded transition-all ${isCurrentPageRef() ? 'bg-[#f9b800] text-white' : 'hover:bg-amber-200 text-amber-300'}`}
                          >
                            {isCurrentPageRef() ? <CheckCircle2 className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          </button>
                       </div>
                    </div>
                </div>
              )}

              {numPages > 0 && (appState === AppState.IDLE || appState === AppState.COMPLETE || appState === AppState.ERROR) && (
                <button 
                  onClick={startAnalysis}
                  className="bg-[#f9b800] hover:bg-[#e0a800] text-white px-6 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 shadow-lg shadow-amber-100 active:scale-95 whitespace-nowrap"
                >
                  <Maximize2 className="w-4 h-4" />
                  Analyze Page {currentPageIndex + 1}
                </button>
              )}
               {(appState === AppState.ANALYZING || appState === AppState.UPLOADING) && (
                <button disabled className="bg-slate-100 text-slate-500 px-6 py-2 rounded-lg font-medium text-sm flex items-center gap-2 cursor-wait whitespace-nowrap">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {appState === AppState.UPLOADING ? 'Processing File...' : 'Analyzing Plan...'}
                </button>
              )}

              {showResultsPanel && (
                 <button 
                    onClick={() => setIsDetailsPanelOpen(!isDetailsPanelOpen)} 
                    className="p-1.5 text-slate-400 hover:text-[#f9b800] hover:bg-slate-100 rounded transition-colors ml-2 border-l border-slate-200 pl-3"
                    title={isDetailsPanelOpen ? "Close List View" : "Open List View"}
                 >
                    {isDetailsPanelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
                 </button>
              )}
           </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden p-6 relative flex flex-col">
          
          {numPages === 0 && appState !== AppState.UPLOADING && (
            <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/50 hover:bg-slate-100 transition-colors cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
              <div className="bg-white p-6 rounded-full shadow-sm mb-6 group-hover:scale-110 transition-transform">
                <UploadCloud className="w-12 h-12 text-[#f9b800]" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-800 mb-2">Upload Floor Plan or Project</h2>
              <p className="text-slate-500 max-w-md text-center mb-8">
                Upload PDF, Image, or Saved Project (.zip) to begin.
              </p>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept="image/*,.pdf,.zip"
              />
              <button className="bg-white border border-slate-300 text-slate-700 font-medium py-2 px-6 rounded-lg hover:bg-slate-50 shadow-sm transition-all">
                Select File
              </button>
            </div>
          )}

          {/* Loading State for initial file processing */}
          {appState === AppState.UPLOADING && numPages === 0 && (
             <div className="h-full flex flex-col items-center justify-center">
                <Loader2 className="w-12 h-12 text-[#f9b800] animate-spin mb-4" />
                <h3 className="text-lg font-medium text-slate-700">Loading Project...</h3>
                <p className="text-slate-500">Processing file and restoring state</p>
             </div>
          )}

          {/* Preview & Results Area */}
          {numPages > 0 && (
            <div className="flex-1 flex gap-6 overflow-hidden">
              {/* Image Viewer - Responsive Width based on Panels */}
              <div className={`flex-1 flex flex-col min-w-0 transition-all duration-500 ease-in-out ${isPanelVisible ? 'w-1/2' : 'w-full'}`}>
                
                {/* Tools Toolbar */}
                <div className="mb-2 flex items-center gap-2 justify-end">
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex items-center p-1">
                    <button 
                      onClick={() => setToolMode('pan')}
                      className={`p-1.5 rounded ${toolMode === 'pan' ? 'bg-amber-100 text-[#f9b800]' : 'text-slate-500 hover:bg-slate-50'}`}
                      title="Pan Tool (Move Image)"
                    >
                      <Move className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setToolMode('select')}
                      className={`p-1.5 rounded ${toolMode === 'select' ? 'bg-amber-100 text-[#f9b800]' : 'text-slate-500 hover:bg-slate-50'}`}
                      title="Selection Tool (Extract Visual)"
                    >
                      <Crop className="w-4 h-4" />
                    </button>
                    <div className="w-px h-4 bg-slate-200 mx-1" />
                    <button onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.5))} className="p-1.5 text-slate-500 hover:bg-slate-50 rounded"><ZoomOut className="w-4 h-4" /></button>
                    <span className="text-xs font-mono text-slate-500 w-8 text-center">{Math.round(zoomLevel * 100)}%</span>
                    <button onClick={() => setZoomLevel(z => Math.min(5, z + 0.5))} className="p-1.5 text-slate-500 hover:bg-slate-50 rounded"><ZoomIn className="w-4 h-4" /></button>
                  </div>
                </div>

                {/* Image Container */}
                <div 
                  ref={imageContainerRef}
                  className="flex-1 bg-slate-900 rounded-xl overflow-hidden relative border border-slate-800 shadow-inner group cursor-crosshair select-none"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                   {currentImage && (
                    <div 
                      className="absolute left-0 top-0 w-full h-full flex items-center justify-center transition-transform duration-75 ease-out"
                      style={{ 
                         transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)`,
                         cursor: toolMode === 'pan' ? (isDragging ? 'grabbing' : 'grab') : 'crosshair',
                         transformOrigin: 'center center'
                      }}
                    >
                      {/* Image Wrapper */}
                      <div className="relative inline-block shadow-2xl">
                          <img 
                            src={currentImage} 
                            alt={`Page ${currentPageIndex + 1}`} 
                            className="block max-w-[85vw] max-h-[85vh] object-contain" 
                            draggable={false}
                          />
                          
                          {/* Selection Overlay */}
                          {selectionBox && (
                            <div 
                              className="absolute border-2 border-[#f9b800] bg-[#f9b800]/20 z-20 pointer-events-none"
                              style={{
                                left: `${selectionBox.x * 100}%`,
                                top: `${selectionBox.y * 100}%`,
                                width: `${selectionBox.w * 100}%`,
                                height: `${selectionBox.h * 100}%`
                              }}
                            />
                          )}
                      </div>
                    </div>
                   )}
                   
                   {/* Navigation Overlay */}
                   {numPages > 1 && (
                    <>
                      <button 
                        onClick={(e) => { e.stopPropagation(); prevPage(); }}
                        disabled={currentPageIndex === 0}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 disabled:opacity-30 disabled:hover:bg-black/50 transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm z-30"
                      >
                        <ChevronLeft className="w-6 h-6" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); nextPage(); }}
                        disabled={currentPageIndex === numPages - 1}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 disabled:opacity-30 disabled:hover:bg-black/50 transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm z-30"
                      >
                        <ChevronRight className="w-6 h-6" />
                      </button>
                    </>
                   )}

                   {appState === AppState.ANALYZING && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-auto z-30 bg-black/10 backdrop-blur-[2px]">
                      <div className="bg-white/60 backdrop-blur-2xl p-8 rounded-3xl border border-white/60 text-center shadow-[0_8px_32px_rgba(31,38,135,0.15)] max-w-sm w-full mx-4 ring-1 ring-white/50">
                         <div className="w-16 h-16 bg-white/40 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-white/50 backdrop-blur-sm">
                            <Loader2 className="w-8 h-8 text-[#f9b800] animate-spin" />
                         </div>
                         <h3 className="text-slate-900 font-bold text-xl drop-shadow-sm">Extracting Signage</h3>
                         <p className="text-slate-800 font-medium text-sm mt-2 mb-4 drop-shadow-sm">Analyzing page layout & content...</p>
                         {referencePagesInput && (
                           <div className="flex items-center justify-center gap-1.5 mb-4">
                             <BookOpen className="w-3 h-3 text-[#f9b800]" />
                             <p className="text-[#f9b800] text-xs font-bold">
                               Including Refs: {referencePagesInput}
                             </p>
                           </div>
                         )}
                         <button 
                           onClick={cancelAnalysis}
                           className="w-full mt-2 py-2 px-4 bg-white/40 hover:bg-white/60 border border-white/60 rounded-xl text-sm font-bold text-slate-800 transition-colors flex items-center justify-center gap-2 backdrop-blur-md shadow-sm"
                         >
                           <XCircle className="w-4 h-4" />
                           Cancel Analysis
                         </button>
                      </div>
                    </div>
                   )}
                   
                   {/* Error Overlay */}
                   {appState === AppState.ERROR && (
                     <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-30">
                       <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-lg shadow-lg max-w-md">
                          <div className="flex items-center gap-3 mb-2">
                             <AlertCircle className="w-6 h-6 text-red-600" />
                             <h4 className="font-bold">Analysis Failed</h4>
                          </div>
                          <p className="text-sm mb-3">{errorMsg}</p>
                          <button onClick={() => setAppState(AppState.IDLE)} className="text-xs bg-white border border-red-200 px-3 py-1 rounded hover:bg-red-50 font-medium">Dismiss</button>
                       </div>
                     </div>
                   )}
                </div>

                {/* Pagination Controls */}
                {numPages > 1 && (
                  <div className="mt-4 flex items-center justify-center gap-2 bg-white p-2 rounded-lg border border-slate-200 shadow-sm mx-auto w-fit">
                      <button 
                        onClick={prevPage}
                        disabled={currentPageIndex === 0}
                        className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 text-slate-600 transition-colors"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      
                      <form onSubmit={handlePageInputSubmit} className="flex items-center gap-2 mx-2">
                        <span className="text-sm font-medium text-slate-600">Page</span>
                        <input 
                          type="text" 
                          inputMode="numeric"
                          value={pageInput}
                          onChange={handlePageInputChange}
                          onBlur={handlePageInputSubmit}
                          className="w-12 text-center border border-slate-300 rounded px-1 py-0.5 text-sm focus:border-[#f9b800] focus:ring-1 focus:ring-[#f9b800] outline-none transition-all text-slate-700 font-medium"
                        />
                        <span className="text-sm font-medium text-slate-600">of {numPages}</span>
                      </form>

                      <button 
                        onClick={nextPage}
                        disabled={currentPageIndex === numPages - 1}
                        className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 text-slate-600 transition-colors"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                  </div>
                )}
              </div>
              
              {/* Results Table - Right Panel */}
              {isPanelVisible && (
                <div className="flex-1 min-w-0 transition-all duration-500 ease-in-out animate-in slide-in-from-right-10 w-1/2">
                   <TakeoffTable 
                     takeoff={viewMode === 'master' ? masterTakeoff : (analysisResult?.takeoff || [])}
                     catalog={displayedCatalog}
                     isMasterView={viewMode === 'master'}
                     onToggleView={onToggleView}
                     onAddToProject={handleAddToProject}
                     onRemoveRow={handleRemoveRow}
                     onUpdateItem={handleUpdateItem}
                     masterItemCount={masterTakeoff.length}
                   />
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;