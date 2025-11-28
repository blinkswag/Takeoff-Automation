
import React from 'react';
import { ProjectSettings } from '../types';
import { Layout, ArrowRightCircle, Sparkles, BrainCircuit } from 'lucide-react';

interface SettingsPanelProps {
  settings: ProjectSettings;
  setSettings: React.Dispatch<React.SetStateAction<ProjectSettings>>;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, setSettings }) => {
  return (
    <div className="w-80 bg-slate-900 text-slate-100 flex flex-col h-full border-r border-slate-700 shadow-xl z-20 overflow-y-auto">
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-indigo-500 p-2 rounded-lg">
            <Layout className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Signage Agent</h1>
        </div>
        <p className="text-xs text-slate-400">Automated Architectural Takeoff</p>
      </div>

      <div className="p-6 space-y-8">
        
        {/* Auto Strategy Indicator */}
        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2 text-indigo-400 uppercase text-xs font-bold tracking-wider mb-2">
            <BrainCircuit className="w-4 h-4" />
            AI Strategy
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            The Agent automatically selects the best extraction strategy (Sweep, Block, or Schedule-First) based on the page density and layout.
          </p>
        </div>

        {/* Feature List */}
        <div className="space-y-4">
           <div className="flex items-center gap-2 text-indigo-400 uppercase text-xs font-bold tracking-wider">
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
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span>Visual Symbol Extraction</span>
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
