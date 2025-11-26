import React, { useMemo, useState } from 'react';
import { SignageItem, SignTypeDefinition } from '../types';
import { Download, Search, PlusCircle, Database, FileText, Layers } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface TakeoffTableProps {
  takeoff: SignageItem[];
  catalog: SignTypeDefinition[];
  isMasterView: boolean;
  onToggleView: (isMaster: boolean) => void;
  onAddToProject?: () => void;
  masterItemCount: number;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#10b981', '#3b82f6'];

const TakeoffTable: React.FC<TakeoffTableProps> = ({ 
  takeoff, 
  catalog, 
  isMasterView, 
  onToggleView, 
  onAddToProject,
  masterItemCount 
}) => {
  const [activeTab, setActiveTab] = useState<'takeoff' | 'catalog' | 'stats'>('takeoff');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTakeoff = useMemo(() => {
    return takeoff.filter(item => 
      item.roomName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.roomNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.signType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sheet.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [takeoff, searchTerm]);

  const statsData = useMemo(() => {
    const counts: Record<string, number> = {};
    takeoff.forEach(item => {
      counts[item.signType] = (counts[item.signType] || 0) + item.quantity;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [takeoff]);

  const totalSigns = takeoff.reduce((acc, curr) => acc + curr.quantity, 0);
  const totalADA = takeoff.filter(t => t.isADA).reduce((acc, curr) => acc + curr.quantity, 0);

  const handleExport = () => {
    const headers = ["Sheet", "Room #", "Room Name", "Sign Type", "ADA", "Qty", "Notes"];
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + takeoff.map(row => 
        `"${row.sheet}","${row.roomNumber}","${row.roomName}","${row.signType}","${row.isADA ? 'Yes' : 'No'}","${row.quantity}","${row.notes}"`
      ).join("\n");
    
    const filename = isMasterView ? "complete_project_takeoff.csv" : "page_takeoff.csv";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      
      {/* Scope Toggle Header */}
      <div className="bg-slate-100 p-2 border-b border-slate-200 flex items-center justify-between">
        <div className="flex bg-slate-200/50 p-1 rounded-lg">
          <button 
            onClick={() => onToggleView(false)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all ${!isMasterView ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <FileText className="w-3.5 h-3.5" />
            Current Page
          </button>
          <button 
            onClick={() => onToggleView(true)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all ${isMasterView ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Database className="w-3.5 h-3.5" />
            Full Project
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${isMasterView ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-300 text-slate-600'}`}>
              {masterItemCount}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
           {!isMasterView && onAddToProject && (
             <button 
               onClick={onAddToProject}
               className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-bold uppercase tracking-wide transition-colors shadow-sm"
             >
               <PlusCircle className="w-3.5 h-3.5" />
               Save to Project
             </button>
           )}
        </div>
      </div>

      {/* Main Toolbar */}
      <div className="bg-white border-b border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-4">
          <button 
            onClick={() => setActiveTab('takeoff')}
            className={`text-sm font-medium transition-colors border-b-2 pb-1 ${activeTab === 'takeoff' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            Signage List
          </button>
          <button 
            onClick={() => setActiveTab('catalog')}
            className={`text-sm font-medium transition-colors border-b-2 pb-1 ${activeTab === 'catalog' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            Type Catalog
          </button>
          <button 
            onClick={() => setActiveTab('stats')}
            className={`text-sm font-medium transition-colors border-b-2 pb-1 ${activeTab === 'stats' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            Analytics
          </button>
        </div>

        <div className="flex items-center gap-3">
           {activeTab === 'takeoff' && (
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Filter signs..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all w-48"
              />
            </div>
           )}
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-sm font-medium transition-colors border border-slate-200"
            title={isMasterView ? "Download Complete Project CSV" : "Download Current Page CSV"}
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{isMasterView ? "Export Project" : "Export Page"}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-slate-50/50 custom-scrollbar relative">
        {activeTab === 'takeoff' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10 text-xs uppercase font-semibold text-slate-500 tracking-wider shadow-sm">
              <tr>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50">Sheet</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50">Room #</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50">Room Name</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50">Sign Type</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50 text-center">ADA</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50 text-center">Qty</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredTakeoff.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors text-sm text-slate-700">
                  <td className="px-6 py-3 font-medium text-slate-900 whitespace-nowrap">{item.sheet}</td>
                  <td className="px-6 py-3">{item.roomNumber || '-'}</td>
                  <td className="px-6 py-3">{item.roomName}</td>
                  <td className="px-6 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {item.signType}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center">
                    {item.isADA ? (
                      <span className="w-2 h-2 rounded-full bg-blue-500 inline-block ring-2 ring-blue-100" title="ADA Compliant"></span>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-200 inline-block"></span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-center font-semibold text-slate-900">{item.quantity}</td>
                  <td className="px-6 py-3 text-slate-500 text-xs">{item.notes}</td>
                </tr>
              ))}
              {filteredTakeoff.length === 0 && (
                 <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                       <Layers className="w-8 h-8 text-slate-300" />
                       <p>No signage data found in {isMasterView ? 'Project' : 'Current Page'}.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {activeTab === 'catalog' && (
          <div className="p-6">
            {catalog.length === 0 ? (
               <div className="text-center text-slate-400 py-12">No sign types defined yet.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {catalog.map((type, idx) => (
                  <div key={idx} className="bg-white border border-slate-200 rounded-lg p-5 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-3">
                      <div className="bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold px-3 py-1 rounded text-sm">
                        {type.typeCode}
                      </div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider bg-slate-50 px-2 py-1 rounded">
                        {type.category}
                      </span>
                    </div>
                    <h3 className="text-slate-900 font-medium mb-2">{type.description}</h3>
                    <div className="space-y-1 text-xs text-slate-500 border-t border-slate-100 pt-2 mt-2">
                      {type.dimensions && <p><span className="font-semibold">Size:</span> {type.dimensions}</p>}
                      {type.mounting && <p><span className="font-semibold">Mounting:</span> {type.mounting}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="p-8 h-full flex flex-col">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 flex-shrink-0">
               <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
                 <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Total Signs</h4>
                 <p className="text-3xl font-bold text-slate-800">{totalSigns}</p>
               </div>
               <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
                 <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">ADA Compliant</h4>
                 <p className="text-3xl font-bold text-blue-600">{totalADA}</p>
               </div>
               <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
                 <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Unique Types</h4>
                 <p className="text-3xl font-bold text-emerald-600">{catalog.length}</p>
               </div>
            </div>

            <div className="flex-1 min-h-0 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <h4 className="text-slate-800 font-medium mb-4 text-sm">Distribution by Type</h4>
              <div className="h-full w-full pb-8">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statsData} margin={{ bottom: 20 }}>
                    <XAxis dataKey="name" tick={{fontSize: 10}} interval={0} angle={-45} textAnchor="end" height={60} />
                    <YAxis />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                      itemStyle={{ color: '#fff' }}
                      cursor={{fill: '#f1f5f9'}}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {statsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TakeoffTable;