import React from 'react';
import { ProjectSettings } from '../types';
import { Settings, CheckSquare, List, Layout, ArrowRightCircle } from 'lucide-react';

interface SettingsPanelProps {
  settings: ProjectSettings;
  setSettings: React.Dispatch<React.SetStateAction<ProjectSettings>>;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, setSettings }) => {
  const toggleSetting = (key: keyof ProjectSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSettings(prev => ({ ...prev, extractionMode: e.target.value as any }));
  };

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
        
        {/* Extraction Mode */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-indigo-400 uppercase text-xs font-bold tracking-wider">
            <Settings className="w-4 h-4" />
            Extraction Strategy
          </div>
          <select 
            value={settings.extractionMode}
            onChange={handleModeChange}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200"
          >
            <option value="Clockwise-Sweep">Clockwise Sweep (Default)</option>
            <option value="Page-by-Page">Page-by-Page</option>
            <option value="Block-Based">Block-Based</option>
            <option value="Quadrant-Sweep">Quadrant Sweep</option>
          </select>
        </div>

        {/* Rules */}
        <div className="space-y-4">
           <div className="flex items-center gap-2 text-indigo-400 uppercase text-xs font-bold tracking-wider">
            <List className="w-4 h-4" />
            Signage Rules
          </div>
          
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex items-center">
                <input 
                  type="checkbox" 
                  checked={settings.ruleA_OneSignPerRoom}
                  onChange={() => toggleSetting('ruleA_OneSignPerRoom')}
                  className="peer h-4 w-4 opacity-0 absolute"
                />
                <div className="w-5 h-5 bg-slate-800 border-2 border-slate-600 rounded peer-checked:bg-indigo-500 peer-checked:border-indigo-500 transition-colors flex items-center justify-center">
                   {settings.ruleA_OneSignPerRoom && <CheckSquare className="w-3 h-3 text-white" />}
                </div>
              </div>
              <div className="text-sm text-slate-300 group-hover:text-white transition-colors">
                <span className="font-semibold block">Rule A: Standard Rooms</span>
                <span className="text-xs text-slate-500">1 Sign per named room</span>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex items-center">
                <input 
                  type="checkbox" 
                  checked={settings.ruleB_CombinedADASigns}
                  onChange={() => toggleSetting('ruleB_CombinedADASigns')}
                  className="peer h-4 w-4 opacity-0 absolute"
                />
                <div className="w-5 h-5 bg-slate-800 border-2 border-slate-600 rounded peer-checked:bg-indigo-500 peer-checked:border-indigo-500 transition-colors flex items-center justify-center">
                   {settings.ruleB_CombinedADASigns && <CheckSquare className="w-3 h-3 text-white" />}
                </div>
              </div>
              <div className="text-sm text-slate-300 group-hover:text-white transition-colors">
                <span className="font-semibold block">Rule B: ADA Restrooms</span>
                <span className="text-xs text-slate-500">Combine Tactile + Braille</span>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex items-center">
                <input 
                  type="checkbox" 
                  checked={settings.ruleC_IdentifyExits}
                  onChange={() => toggleSetting('ruleC_IdentifyExits')}
                  className="peer h-4 w-4 opacity-0 absolute"
                />
                <div className="w-5 h-5 bg-slate-800 border-2 border-slate-600 rounded peer-checked:bg-indigo-500 peer-checked:border-indigo-500 transition-colors flex items-center justify-center">
                   {settings.ruleC_IdentifyExits && <CheckSquare className="w-3 h-3 text-white" />}
                </div>
              </div>
               <div className="text-sm text-slate-300 group-hover:text-white transition-colors">
                <span className="font-semibold block">Rule C: Exits</span>
                <span className="text-xs text-slate-500">Auto-identify egress points</span>
              </div>
            </label>

             <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex items-center">
                <input 
                  type="checkbox" 
                  checked={settings.ruleD_ExteriorDoorNumbers}
                  onChange={() => toggleSetting('ruleD_ExteriorDoorNumbers')}
                  className="peer h-4 w-4 opacity-0 absolute"
                />
                <div className="w-5 h-5 bg-slate-800 border-2 border-slate-600 rounded peer-checked:bg-indigo-500 peer-checked:border-indigo-500 transition-colors flex items-center justify-center">
                   {settings.ruleD_ExteriorDoorNumbers && <CheckSquare className="w-3 h-3 text-white" />}
                </div>
              </div>
              <div className="text-sm text-slate-300 group-hover:text-white transition-colors">
                <span className="font-semibold block">Rule D: Ext. Door Numbers</span>
                <span className="text-xs text-slate-500">1 Inside / 1 Outside</span>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex items-center">
                <input 
                  type="checkbox" 
                  checked={settings.ruleF_StairSignage}
                  onChange={() => toggleSetting('ruleF_StairSignage')}
                  className="peer h-4 w-4 opacity-0 absolute"
                />
                 <div className="w-5 h-5 bg-slate-800 border-2 border-slate-600 rounded peer-checked:bg-indigo-500 peer-checked:border-indigo-500 transition-colors flex items-center justify-center">
                   {settings.ruleF_StairSignage && <CheckSquare className="w-3 h-3 text-white" />}
                </div>
              </div>
              <div className="text-sm text-slate-300 group-hover:text-white transition-colors">
                <span className="font-semibold block">Rule F: Stairwells</span>
                <span className="text-xs text-slate-500">ID + Floor Level signs</span>
              </div>
            </label>
             <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex items-center">
                <input 
                  type="checkbox" 
                  checked={settings.ruleG_SlidingBarSigns}
                  onChange={() => toggleSetting('ruleG_SlidingBarSigns')}
                  className="peer h-4 w-4 opacity-0 absolute"
                />
                 <div className="w-5 h-5 bg-slate-800 border-2 border-slate-600 rounded peer-checked:bg-indigo-500 peer-checked:border-indigo-500 transition-colors flex items-center justify-center">
                   {settings.ruleG_SlidingBarSigns && <CheckSquare className="w-3 h-3 text-white" />}
                </div>
              </div>
              <div className="text-sm text-slate-300 group-hover:text-white transition-colors">
                <span className="font-semibold block">Rule G: Sliding Bars</span>
                <span className="text-xs text-slate-500">Staff/Privacy rooms</span>
              </div>
            </label>

          </div>
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
