import React, { useState, useCallback, useRef } from 'react';
import SettingsPanel from './components/SettingsPanel';
import TakeoffTable from './components/TakeoffTable';
import { ProjectSettings, AppState, AnalysisResult, SignageItem, SignTypeDefinition } from './types';
import { analyzeDrawing, fileToBase64 } from './services/geminiService';
import { convertPdfToImages } from './services/pdfService';
import { UploadCloud, FileImage, AlertCircle, Loader2, Maximize2, ChevronLeft, ChevronRight, FileText, CheckCircle2 } from 'lucide-react';

const DEFAULT_SETTINGS: ProjectSettings = {
  ruleA_OneSignPerRoom: true,
  ruleB_CombinedADASigns: true,
  ruleC_IdentifyExits: true,
  ruleD_ExteriorDoorNumbers: true,
  ruleE_IncludeDirectionals: true,
  ruleF_StairSignage: true,
  ruleG_SlidingBarSigns: true,
  extractionMode: 'Clockwise-Sweep',
};

const App: React.FC = () => {
  const [settings, setSettings] = useState<ProjectSettings>(DEFAULT_SETTINGS);
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  
  // File State
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [pages, setPages] = useState<string[]>([]); // Array of base64 images
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  
  // Analysis State
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Master Project State
  const [masterTakeoff, setMasterTakeoff] = useState<SignageItem[]>([]);
  const [masterCatalog, setMasterCatalog] = useState<SignTypeDefinition[]>([]);
  const [viewMode, setViewMode] = useState<'current' | 'master'>('current');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

      const result = await analyzeDrawing(
        base64Data, 
        mimeType, 
        settings, 
        `${currentFile?.name} (Page ${currentPageIndex + 1})`
      );
      
      setAnalysisResult(result);
      setAppState(AppState.COMPLETE);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred during analysis.");
      setAppState(AppState.ERROR);
    }
  };

  const handleAddToProject = () => {
    if (!analysisResult) return;

    // 1. Filter out existing items for the same sheets found in the new result to avoid duplication/outdated info
    // We assume the sheet name in the new result is the key.
    const newSheetNames = new Set(analysisResult.takeoff.map(i => i.sheet));
    const filteredMaster = masterTakeoff.filter(item => !newSheetNames.has(item.sheet));

    // 2. Append new items
    const newMasterTakeoff = [...filteredMaster, ...analysisResult.takeoff];
    setMasterTakeoff(newMasterTakeoff);

    // 3. Merge Catalogs (deduplicate by typeCode)
    const catalogMap = new Map<string, SignTypeDefinition>();
    masterCatalog.forEach(c => catalogMap.set(c.typeCode, c));
    analysisResult.catalog.forEach(c => catalogMap.set(c.typeCode, c));
    
    setMasterCatalog(Array.from(catalogMap.values()));

    // 4. Feedback
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const reset = () => {
    setAppState(AppState.IDLE);
    setCurrentFile(null);
    setPages([]);
    setCurrentPageIndex(0);
    setAnalysisResult(null);
    setErrorMsg(null);
    setMasterTakeoff([]);
    setMasterCatalog([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  const currentImage = pages[currentPageIndex];
  
  // Determine if we should show the results panel
  // Show if: We have a result OR we are looking at master view and it has items
  const showResultsPanel = (appState === AppState.COMPLETE && !!analysisResult) || (masterTakeoff.length > 0) || viewMode === 'master';

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <SettingsPanel settings={settings} setSettings={setSettings} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-10">
           <div className="flex items-center gap-4">
             {currentFile && (
               <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
                  {currentFile.type === 'application/pdf' ? <FileText className="w-4 h-4 text-red-500" /> : <FileImage className="w-4 h-4 text-blue-500" />}
                  <span className="text-sm font-medium text-slate-700 truncate max-w-xs">{currentFile.name}</span>
                  {pages.length > 1 && (
                    <span className="text-xs text-slate-500 font-mono ml-1 px-1.5 py-0.5 bg-slate-200 rounded">
                      Page {currentPageIndex + 1} / {pages.length}
                    </span>
                  )}
                  <button onClick={reset} className="text-xs text-red-500 hover:text-red-700 ml-2 font-medium">Reset</button>
               </div>
             )}
             
             {saveSuccess && (
               <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full text-xs font-bold animate-in fade-in zoom-in duration-300">
                 <CheckCircle2 className="w-4 h-4" />
                 Saved to Project
               </div>
             )}
           </div>

           <div>
              {pages.length > 0 && (appState === AppState.IDLE || appState === AppState.COMPLETE || appState === AppState.ERROR) && (
                <button 
                  onClick={startAnalysis}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 shadow-lg shadow-indigo-200 active:scale-95"
                >
                  <Maximize2 className="w-4 h-4" />
                  Analyze Page {currentPageIndex + 1}
                </button>
              )}
               {(appState === AppState.ANALYZING || appState === AppState.UPLOADING) && (
                <button disabled className="bg-slate-100 text-slate-500 px-6 py-2 rounded-lg font-medium text-sm flex items-center gap-2 cursor-wait">
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
                        className="absolute left-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 disabled:opacity-30 disabled:hover:bg-black/50 transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm"
                      >
                        <ChevronLeft className="w-6 h-6" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); nextPage(); }}
                        disabled={currentPageIndex === pages.length - 1}
                        className="absolute right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 disabled:opacity-30 disabled:hover:bg-black/50 transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm"
                      >
                        <ChevronRight className="w-6 h-6" />
                      </button>
                    </>
                   )}

                   {appState === AppState.ANALYZING && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-white/10 backdrop-blur-md p-6 rounded-xl border border-white/20 text-center shadow-2xl">
                         <Loader2 className="w-10 h-10 text-white animate-spin mx-auto mb-3" />
                         <h3 className="text-white font-medium text-lg">Extracting Signage</h3>
                         <p className="text-slate-300 text-sm mt-1">Applying {settings.extractionMode} Logic...</p>
                      </div>
                    </div>
                   )}
                   
                   {/* Error Overlay */}
                   {appState === AppState.ERROR && (
                     <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
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

                {/* Pagination Footer */}
                {pages.length > 1 && (
                  <div className="mt-4 flex items-center justify-center gap-4 bg-white p-2 rounded-lg border border-slate-200 shadow-sm mx-auto">
                    <button 
                      onClick={prevPage}
                      disabled={currentPageIndex === 0}
                      className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 text-slate-600 transition-colors"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm font-medium text-slate-700 w-24 text-center">
                      Page {currentPageIndex + 1} of {pages.length}
                    </span>
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
                    onToggleView={(isMaster) => setViewMode(isMaster ? 'master' : 'current')}
                    onAddToProject={handleAddToProject}
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