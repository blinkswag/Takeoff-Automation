import React from 'react';
import { ProjectSettings, KeyPage } from '../types';
import { ArrowRightCircle, Sparkles, BrainCircuit, FileSearch, ArrowRight } from 'lucide-react';

interface SettingsPanelProps {
  settings: ProjectSettings;
  setSettings: React.Dispatch<React.SetStateAction<ProjectSettings>>;
  onJumpToPage?: (pageIndex: number) => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, setSettings, onJumpToPage }) => {
  return (
    <div className="w-80 bg-slate-900 text-slate-100 flex flex-col h-full border-r border-slate-700 shadow-xl z-20 overflow-y-auto custom-scrollbar">
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <img 
            src="https://blinksigns.com/wp-content/uploads/2022/03/blinksign_logo.png" 
            alt="BlinkSigns" 
            className="h-8 w-auto object-contain" 
            onError={(e) => e.currentTarget.style.display = 'none'}
          />
          <h1 className="text-2xl font-bold tracking-tight">BlinkSigns</h1>
        </div>
        <p className="text-sm text-slate-400 mt-2">Signage Takeoff Agent</p>
      </div>

      <div className="p-6 space-y-8">
        
        {/* Auto Strategy Indicator */}
        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2 text-[#f9b800] uppercase text-xs font-bold tracking-wider mb-2">
            <BrainCircuit className="w-4 h-4" />
            AI Strategy
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            The Agent automatically selects the best extraction strategy (Sweep, Block, or Schedule-First) based on the page density and layout.
          </p>
        </div>

        {/* Detected Key Pages Section */}
        {settings.keyPages && settings.keyPages.length > 0 && (
           <div className="space-y-3">
             <div className="flex items-center gap-2 text-emerald-400 uppercase text-xs font-bold tracking-wider">
               <FileSearch className="w-4 h-4" />
               Detected Key Pages
             </div>
             <div className="space-y-2">
               {settings.keyPages.map((page, idx) => (
                 <button 
                   key={idx}
                   onClick={() => onJumpToPage?.(page.pageIndex)}
                   className="w-full bg-slate-800 hover:bg-slate-700 p-3 rounded-md text-left transition-colors border border-slate-700 group relative"
                 >
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-sm text-slate-200">{page.sheetNumber}</span>
                      <span className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded text-slate-400 border border-slate-600">
                        {page.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 truncate">{page.description}</p>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="w-4 h-4 text-[#f9b800]" />
                    </div>
                 </button>
               ))}
             </div>
           </div>
        )}

        {/* Feature List */}
        <div className="space-y-4">
           <div className="flex items-center gap-2 text-[#f9b800] uppercase text-xs font-bold tracking-wider">
            <Sparkles className="w-4 h-4" />
            Active Capabilities
          </div>
          
          <ul className="space-y-3 text-sm text-slate-400">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span>Auto-detect Signage Schedules</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span>Smart ADA & Braille Recognition</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span>Spec & Legend Integration</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-auto p-6 border-t border-slate-800 text-xs text-slate-500">
        <div className="flex items-center gap-2 mb-2">
           <ArrowRightCircle className="w-4 h-4 text-emerald-500" />
           <span>System Status: Ready</span>
        </div>
        Gemini 2.5 Flash Connected
      </div>
    </div>
  );
};

export default SettingsPanel;