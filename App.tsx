
import React, { useState, useCallback, useRef, useEffect } from 'react';
import SettingsPanel from './components/SettingsPanel';
import TakeoffTable from './components/TakeoffTable';
import { ProjectSettings, AppState, AnalysisResult, SignageItem, SignTypeDefinition } from './types';
import { analyzeDrawing } from './services/geminiService';
import { convertPdfToImages } from './services/pdfService';
import { UploadCloud, FileImage, AlertCircle, Loader2, Maximize2, ChevronLeft, ChevronRight, FileText, CheckCircle2, BookOpen, Plus, RefreshCw } from 'lucide-react';

const DEFAULT_SETTINGS: ProjectSettings = {
  autoStrategy: true,
};

const App: React.FC = () => {
  const [settings, setSettings] = useState<ProjectSettings>(DEFAULT_SETTINGS);
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  
  // File State
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [pages, setPages] = useState<string[]>([]); // Array of base64 images
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [pageInput, setPageInput] = useState<string>("1");
  const [referencePagesInput, setReferencePagesInput] = useState<string>("");
  
  // Analysis State
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Master Project State
  const [masterTakeoff, setMasterTakeoff] = useState<SignageItem[]>([]);
  const [masterCatalog, setMasterCatalog] = useState<SignTypeDefinition[]>([]);
  const [viewMode, setViewMode] = useState<'current' | 'master'>('current');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync pageInput when page changes via buttons
  useEffect(() => {
    setPageInput((currentPageIndex + 1).toString());
  }, [currentPageIndex]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      const isPdf = file.type === 'application/pdf';
      const isImage = file.type.startsWith('image/');

      if (!isPdf && !isImage) {
        setErrorMsg("Please upload a PDF or an Image file.");
        setAppState(AppState.ERROR);
        return;
      }

      setCurrentFile(file);
      setErrorMsg(null);
      setAnalysisResult(null);
      setReferencePagesInput(""); // Reset reference pages on new file
      setAppState(AppState.UPLOADING); // Use UPLOADING state to show loading spinner for PDF conversion

      try {
        if (isPdf) {
           const extractedPages = await convertPdfToImages(file);
           setPages(extractedPages);
           setCurrentPageIndex(0);
        } else {
           // Standard Image
           const reader = new FileReader();
           reader.onload = (e) => {
             if (typeof e.target?.result === 'string') {
               setPages([e.target.result]);
               setCurrentPageIndex(0);
             }
           };
           reader.readAsDataURL(file);
        }
        setAppState(AppState.IDLE); // Ready for analysis
      } catch (err: any) {
        console.error(err);
        setErrorMsg("Failed to process file. " + err.message);
        setAppState(AppState.ERROR);
      }
    }
  };

  const startAnalysis = async () => {
    if (pages.length === 0) return;

    setAppState(AppState.ANALYZING);
    setErrorMsg(null);
    setViewMode('current');
    setSaveSuccess(false);

    try {
      // Get current page base64, strip prefix if necessary
      const currentPageBase64Full = pages[currentPageIndex];
      const base64Data = currentPageBase64Full.split(',')[1];
      const mimeType = currentPageBase64Full.substring(currentPageBase64Full.indexOf(':') + 1, currentPageBase64Full.indexOf(';'));

      // Process Reference Pages
      const referenceImages: string[] = [];
      if (referencePagesInput.trim() !== "") {
        const refs = referencePagesInput.split(',').map(s => s.trim());
        
        for (const ref of refs) {
          const pageNum = parseInt(ref, 10);
          if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= pages.length) {
            const index = pageNum - 1;
            // Don't include the current page as a reference to itself to avoid redundancy
            if (index !== currentPageIndex) {
               const refFull = pages[index];
               referenceImages.push(refFull.split(',')[1]);
            }
          }
        }
      }

      const result = await analyzeDrawing(
        base64Data, 
        mimeType, 
        settings, 
        `${currentFile?.name} (Page ${currentPageIndex + 1})`,
        referenceImages
      );
      
      setAnalysisResult(result);
      setAppState(AppState.COMPLETE);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred during analysis.");
      setAppState(AppState.ERROR);
    }
  };

  // Memoized handlers to prevent unnecessary child re-renders
  const handleAddToProject = useCallback(() => {
    if (!analysisResult) return;

    // 1. Filter out existing items for the same sheets found in the new result to avoid duplication/outdated info
    const newSheetNames = new Set(analysisResult.takeoff.map(i => i.sheet));
    setMasterTakeoff(prevMaster => {
        const filteredMaster = prevMaster.filter(item => !newSheetNames.has(item.sheet));
        return [...filteredMaster, ...analysisResult.takeoff];
    });

    // 2. Merge Catalogs (deduplicate by typeCode)
    setMasterCatalog(prevCatalog => {
        const catalogMap = new Map<string, SignTypeDefinition>();
        prevCatalog.forEach(c => catalogMap.set(c.typeCode, c));
        analysisResult.catalog.forEach(c => catalogMap.set(c.typeCode, c));
        return Array.from(catalogMap.values());
    });

    // 3. Feedback
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }, [analysisResult]);

  const handleRemoveRow = useCallback((itemToRemove: SignageItem) => {
    if (viewMode === 'master') {
      setMasterTakeoff(prev => prev.filter(item => item !== itemToRemove));
    } else {
      setAnalysisResult(prev => {
        if (!prev) return null;
        return {
          ...prev,
          takeoff: prev.takeoff.filter(item => item !== itemToRemove)
        };
      });
    }
  }, [viewMode]);

  const handleUpdateItem = useCallback((itemToUpdate: SignageItem, updates: Partial<SignageItem>) => {
    if (viewMode === 'master') {
      setMasterTakeoff(prev => prev.map(item => item === itemToUpdate ? { ...item, ...updates } : item));
    } else {
      setAnalysisResult(prev => {
        if (!prev) return null;
        return {
          ...prev,
          takeoff: prev.takeoff.map(item => item === itemToUpdate ? { ...item, ...updates } : item)
        };
      });
    }
  }, [viewMode]);

  const onToggleView = useCallback((isMaster: boolean) => {
    setViewMode(isMaster ? 'master' : 'current');
  }, []);

  // Full Project Reset
  const startNewProject = () => {
     if (window.confirm("Are you sure you want to start a new project? This will clear all extracted data.")) {
        setAppState(AppState.IDLE);
        setCurrentFile(null);
        setPages([]);
        setCurrentPageIndex(0);
        setReferencePagesInput("");
        setAnalysisResult(null);
        setErrorMsg(null);
        setMasterTakeoff([]);
        setMasterCatalog([]);
        setViewMode('current');
        if (fileInputRef.current) fileInputRef.current.value = '';
     }
  };

  // Simple Reset (Clear current analysis view)
  const resetCurrentAnalysis = () => {
    setAnalysisResult(null);
    setAppState(AppState.IDLE);
    setErrorMsg(null);
  };

  const nextPage = () => {
    if (currentPageIndex < pages.length - 1) {
      setCurrentPageIndex(prev => prev + 1);
      setAnalysisResult(null); // Clear result when changing page
      setAppState(AppState.IDLE);
      setViewMode('current');
    }
  };

  const prevPage = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(prev => prev - 1);
      setAnalysisResult(null);
      setAppState(AppState.IDLE);
      setViewMode('current');
    }
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(pageInput, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= pages.length) {
      if (pageNum - 1 !== currentPageIndex) {
        setCurrentPageIndex(pageNum - 1);
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
      const newRefs = [...currentRefs, pageNum].sort((a,b) => parseInt(a) - parseInt(b));
      setReferencePagesInput(newRefs.join(', '));
    }
  };

  const isCurrentPageRef = () => {
    const pageNum = (currentPageIndex + 1).toString();
    const currentRefs = referencePagesInput.split(',').map(s => s.trim());
    return currentRefs.includes(pageNum);
  };

  const currentImage = pages[currentPageIndex];
  
  // Determine if we should show the results panel
  const showResultsPanel = (appState === AppState.COMPLETE && !!analysisResult) || (masterTakeoff.length > 0) || viewMode === 'master';

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <SettingsPanel settings={settings} setSettings={setSettings} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-10 gap-4">
           <div className="flex items-center gap-4 flex-1 min-w-0">
             {currentFile && (
               <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 shadow-sm shrink-0">
                  {currentFile.type === 'application/pdf' ? <FileText className="w-4 h-4 text-red-500" /> : <FileImage className="w-4 h-4 text-blue-500" />}
                  <span className="text-sm font-medium text-slate-700 truncate max-w-[200px]">{currentFile.name}</span>
                  {pages.length > 1 && (
                    <span className="text-xs text-slate-500 font-mono ml-1 px-1.5 py-0.5 bg-slate-200 rounded">
                      Page {currentPageIndex + 1} / {pages.length}
                    </span>
                  )}
                  <button onClick={resetCurrentAnalysis} className="text-xs text-red-500 hover:text-red-700 ml-2 font-medium">Clear</button>
               </div>
             )}
             
             {saveSuccess && (
               <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full text-xs font-bold animate-in fade-in zoom-in duration-300">
                 <CheckCircle2 className="w-4 h-4" />
                 Saved to Project
               </div>
             )}
           </div>

           <div className="flex items-center gap-4">
              {/* New Project Button */}
              <button 
                onClick={startNewProject}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-50 rounded-md text-xs font-bold uppercase transition-colors"
                title="Close current project and start fresh"
              >
                <RefreshCw className="w-4 h-4" />
                New Project
              </button>

              {pages.length > 0 && (
                <div className="flex items-center gap-2 bg-indigo-50/50 px-3 py-1.5 rounded-lg border border-indigo-100 shadow-sm transition-all focus-within:ring-2 focus-within:ring-indigo-500/20">
                    <BookOpen className="w-4 h-4 text-indigo-500" />
                    <div className="flex flex-col">
                      <label className="text-[10px] font-bold text-indigo-400 uppercase leading-none mb-0.5">Ref Pages</label>
                       <div className="flex items-center gap-1">
                          <input 
                              type="text" 
                              value={referencePagesInput}
                              onChange={(e) => setReferencePagesInput(e.target.value)}
                              placeholder="e.g. 1, 3"
                              className="w-20 bg-transparent text-sm font-bold text-slate-700 placeholder:text-indigo-200 outline-none h-4 border-none p-0 focus:ring-0"
                              title="Enter page numbers of Legends or Specifications to use as reference for this analysis"
                          />
                           <button 
                            onClick={toggleCurrentPageAsReference}
                            className={`p-0.5 rounded transition-all ${isCurrentPageRef() ? 'bg-indigo-500 text-white' : 'hover:bg-indigo-200 text-indigo-300'}`}
                            title={isCurrentPageRef() ? "Unmark current page as reference" : "Mark current page as reference"}
                          >
                            {isCurrentPageRef() ? <CheckCircle2 className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          </button>
                       </div>
                    </div>
                </div>
              )}

              {pages.length > 0 && (appState === AppState.IDLE || appState === AppState.COMPLETE || appState === AppState.ERROR) && (
                <button 
                  onClick={startAnalysis}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 shadow-lg shadow-indigo-200 active:scale-95 whitespace-nowrap"
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
           </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden p-6 relative flex flex-col">
          
          {pages.length === 0 && appState !== AppState.UPLOADING && (
            <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/50 hover:bg-slate-100 transition-colors cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
              <div className="bg-white p-6 rounded-full shadow-sm mb-6 group-hover:scale-110 transition-transform">
                <UploadCloud className="w-12 h-12 text-indigo-500" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-800 mb-2">Upload Floor Plan</h2>
              <p className="text-slate-500 max-w-md text-center mb-8">
                Upload architectural drawings (PDF or Image) to begin automated signage takeoff.
              </p>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept="image/*,.pdf"
              />
              <button className="bg-white border border-slate-300 text-slate-700 font-medium py-2 px-6 rounded-lg hover:bg-slate-50 shadow-sm transition-all">
                Select PDF or Image
              </button>
            </div>
          )}

          {/* Loading State for initial file processing */}
          {appState === AppState.UPLOADING && pages.length === 0 && (
             <div className="h-full flex flex-col items-center justify-center">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                <h3 className="text-lg font-medium text-slate-700">Converting File...</h3>
                <p className="text-slate-500">Generating high-resolution previews</p>
             </div>
          )}

          {/* Preview & Results Area */}
          {pages.length > 0 && (
            <div className="flex-1 flex gap-6 overflow-hidden">
              {/* Image Viewer */}
              <div className={`flex-1 flex flex-col min-w-0 transition-all duration-500 ease-in-out ${showResultsPanel ? 'w-1/2' : 'w-full'}`}>
                
                {/* Image Container */}
                <div className="flex-1 bg-slate-900 rounded-xl overflow-hidden relative flex items-center justify-center border border-slate-800 shadow-inner group">
                   {currentImage && (
                    <img 
                      src={currentImage} 
                      alt={`Page ${currentPageIndex + 1}`} 
                      className={`max-w-full max-h-full object-contain ${appState === AppState.ANALYZING ? 'opacity-50 animate-pulse' : ''}`} 
                    />
                   )}
                   
                   {/* Navigation Overlay */}
                   {pages.length > 1 && (
                    <>
                      <button 
                        onClick={(e) => { e.stopPropagation(); prevPage(); }}
                        disabled={currentPageIndex === 0}
                        className="absolute left-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 disabled:opacity-30 disabled:hover:bg-black/50 transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm z-20"
                      >
                        <ChevronLeft className="w-6 h-6" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); nextPage(); }}
                        disabled={currentPageIndex === pages.length - 1}
                        className="absolute right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 disabled:opacity-30 disabled:hover:bg-black/50 transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm z-20"
                      >
                        <ChevronRight className="w-6 h-6" />
                      </button>
                    </>
                   )}

                   {appState === AppState.ANALYZING && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                      <div className="bg-white/10 backdrop-blur-md p-6 rounded-xl border border-white/20 text-center shadow-2xl">
                         <Loader2 className="w-10 h-10 text-white animate-spin mx-auto mb-3" />
                         <h3 className="text-white font-medium text-lg">Extracting Signage</h3>
                         <p className="text-slate-300 text-sm mt-1">Analyzing page layout & content...</p>
                         {referencePagesInput && (
                           <p className="text-indigo-200 text-xs mt-2 bg-indigo-900/50 px-2 py-1 rounded border border-indigo-500/30">
                             + Reading Reference Pages: {referencePagesInput}
                           </p>
                         )}
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
                {pages.length > 1 && (
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
                          className="w-12 text-center border border-slate-300 rounded px-1 py-0.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-slate-700 font-medium"
                        />
                        <span className="text-sm font-medium text-slate-600">of {pages.length}</span>
                      </form>

                      <button 
                        onClick={nextPage}
                        disabled={currentPageIndex === pages.length - 1}
                        className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 text-slate-600 transition-colors"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                  </div>
                )}
              </div>
              
              {/* Results Table - Shown when analysis is done OR viewing master */}
              {showResultsPanel && (
                <div className="w-1/2 h-full animate-in fade-in slide-in-from-right-4 duration-500">
                  <TakeoffTable 
                    takeoff={viewMode === 'master' ? masterTakeoff : (analysisResult?.takeoff || [])}
                    catalog={viewMode === 'master' ? masterCatalog : (analysisResult?.catalog || [])}
                    isMasterView={viewMode === 'master'}
                    onToggleView={onToggleView}
                    onAddToProject={handleAddToProject}
                    onRemoveRow={handleRemoveRow}
                    onUpdateItem={handleUpdateItem}
                    masterItemCount={masterTakeoff.reduce((acc, curr) => acc + curr.quantity, 0)}
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