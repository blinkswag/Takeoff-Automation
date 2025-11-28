import React, { useMemo, useState } from 'react';
import { SignageItem, SignTypeDefinition } from '../types';
import { Download, Search, PlusCircle, Database, FileText, Layers, Trash2, ZoomIn, X, AlertTriangle, Table, Eye, Wand2, Edit3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface TakeoffTableProps {
  takeoff: SignageItem[];
  catalog: SignTypeDefinition[];
  isMasterView: boolean;
  onToggleView: (isMaster: boolean) => void;
  onAddToProject?: () => void;
  onRemoveRow: (item: SignageItem) => void;
  onUpdateItem: (item: SignageItem, updates: Partial<SignageItem>) => void;
  masterItemCount: number;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#10b981', '#3b82f6'];

const TakeoffTable: React.FC<TakeoffTableProps> = ({ 
  takeoff, 
  catalog, 
  isMasterView, 
  onToggleView, 
  onAddToProject,
  onRemoveRow,
  onUpdateItem,
  masterItemCount 
}) => {
  const [activeTab, setActiveTab] = useState<'takeoff' | 'catalog' | 'stats'>('takeoff');
  const [searchTerm, setSearchTerm] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<SignageItem | null>(null);

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

  const handleExport = async () => {
    // Check for ExcelJS loaded via script tag in index.html
    const ExcelJS = (window as any).ExcelJS;
    if (!ExcelJS) {
      alert("Excel export library is loading or failed to load. Please verify your connection.");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Signage Takeoff');

    // Define Columns
    worksheet.columns = [
      { header: 'Design', key: 'design', width: 15 },
      { header: 'Source', key: 'source', width: 15 },
      { header: 'Sheet', key: 'sheet', width: 15 },
      { header: 'Room #', key: 'roomNumber', width: 15 },
      { header: 'Room Name', key: 'roomName', width: 30 },
      { header: 'Sign Type', key: 'signType', width: 20 },
      { header: 'ADA', key: 'isADA', width: 10 },
      { header: 'Qty', key: 'quantity', width: 10 },
      { header: 'Size/Dim', key: 'dimensions', width: 20 },
      { header: 'Color', key: 'color', width: 20 },
      { header: 'Material', key: 'material', width: 30 },
      { header: 'Notes', key: 'notes', width: 50 },
    ];

    const dataToExport = searchTerm ? filteredTakeoff : takeoff;

    // Add Rows
    for (const item of dataToExport) {
      const row = worksheet.addRow({
        design: '', // Placeholder for image
        source: item.dataSource || 'Visual',
        sheet: item.sheet,
        roomNumber: item.roomNumber,
        roomName: item.roomName,
        signType: item.signType,
        isADA: item.isADA ? 'Yes' : 'No',
        quantity: item.quantity,
        dimensions: item.dimensions,
        color: item.color,
        material: item.material,
        notes: item.notes
      });

      // Set standard row height for images
      row.height = 60;

      // Embed Image if exists
      if (item.designImage) {
        try {
          // Remove prefix to get pure base64
          const base64Data = item.designImage.split(',')[1];
          const imageId = workbook.addImage({
            base64: base64Data,
            extension: 'jpeg', // Assuming jpeg from service, but png works too
          });

          worksheet.addImage(imageId, {
            tl: { col: 0, row: row.number - 1 }, // col 0 is 'Design'
            ext: { width: 80, height: 80 },
            editAs: 'oneCell'
          });
        } catch (e) {
          console.error("Failed to add image to excel row", e);
        }
      }
    }

    // Styling Header
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Align content
    worksheet.eachRow((row, rowNumber) => {
       if (rowNumber > 1) {
         row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
       }
    });

    // Write File
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", isMasterView ? "complete_project_takeoff.xlsx" : "page_takeoff.xlsx");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
      
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
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm font-medium transition-colors border border-emerald-700 shadow-sm"
            title={isMasterView ? "Download Complete Project Excel (.xlsx)" : "Download Current Page Excel (.xlsx)"}
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{isMasterView ? "Export Excel" : "Export Excel"}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-slate-50/50 custom-scrollbar relative">
        {activeTab === 'takeoff' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10 text-xs uppercase font-semibold text-slate-500 tracking-wider shadow-sm">
              <tr>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50 w-32">Design</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50">Sheet</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50">Room #</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50">Room Name</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50">Sign Type</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50 text-center">ADA</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50 text-center w-24">Qty</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50">Size/Dim</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50">Color</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50">Material</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50">Notes</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredTakeoff.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors text-sm text-slate-700 group">
                  <td className="px-6 py-3">
                    {item.designImage ? (
                      <div 
                        className="w-24 h-24 bg-slate-100 rounded border border-slate-200 overflow-hidden cursor-zoom-in hover:border-indigo-300 transition-colors relative group/img flex items-center justify-center"
                        onClick={() => setPreviewImage(item.designImage || null)}
                      >
                         <img src={item.designImage} alt="Sign Design" className="max-w-full max-h-full object-contain p-1" />
                         <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors" />
                      </div>
                    ) : (
                      <div className="w-24 h-24 bg-slate-50 rounded border border-slate-100 flex items-center justify-center text-slate-300">
                        <Layers className="w-8 h-8" />
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-3 font-medium text-slate-900 whitespace-nowrap">{item.sheet}</td>
                  <td className="px-6 py-3">{item.roomNumber || '-'}</td>
                  <td className="px-6 py-3">{item.roomName}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                       {/* Source Badge */}
                       {(!item.dataSource || item.dataSource === 'Visual') ? (
                         <div title="Found visually on plan (not in schedule)" className="flex items-center justify-center p-0.5 rounded-full bg-amber-100 text-amber-600">
                           <Eye className="w-3 h-3" />
                         </div>
                       ) : item.dataSource === 'Schedule' ? (
                          <div title="Extracted from Signage Schedule" className="flex items-center justify-center p-0.5 rounded-full bg-emerald-100 text-emerald-600">
                           <Table className="w-3 h-3" />
                         </div>
                       ) : (
                          <div title="Generated by Rule" className="flex items-center justify-center p-0.5 rounded-full bg-purple-100 text-purple-600">
                           <Wand2 className="w-3 h-3" />
                         </div>
                       )}
                       <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {item.signType}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-center">
                    {item.isADA ? (
                      <span className="w-2 h-2 rounded-full bg-blue-500 inline-block ring-2 ring-blue-100" title="ADA Compliant"></span>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-200 inline-block"></span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <input 
                      type="number" 
                      min="0"
                      value={item.quantity}
                      onChange={(e) => {
                         const val = parseInt(e.target.value);
                         if (!isNaN(val)) onUpdateItem(item, { quantity: val });
                      }}
                      className="w-16 px-2 py-1 border border-slate-200 rounded text-center font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-6 py-3 text-slate-500 whitespace-nowrap">{item.dimensions || '-'}</td>
                  <td className="px-6 py-3 text-slate-500">{item.color || '-'}</td>
                  <td className="px-6 py-3 text-slate-500">{item.material || '-'}</td>
                  <td className="px-6 py-3 text-slate-500 text-xs max-w-[200px] truncate" title={item.notes}>{item.notes}</td>
                  <td className="px-6 py-3 text-right">
                    <button 
                      onClick={() => setItemToDelete(item)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                      title="Remove row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredTakeoff.length === 0 && (
                 <tr>
                  <td colSpan={12} className="px-6 py-16 text-center text-slate-400">
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

        {/* Image Modal */}
        {previewImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
            <div className="relative bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-3 border-b border-slate-100">
                 <h3 className="font-semibold text-slate-700">Sign Visual Reference</h3>
                 <button onClick={() => setPreviewImage(null)} className="p-1 hover:bg-slate-100 rounded-full text-slate-500"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 flex items-center justify-center bg-slate-50 flex-1 overflow-auto">
                 <img src={previewImage} alt="Enlarged Sign" className="max-w-full max-h-full object-contain shadow-sm border border-slate-200" />
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {itemToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setItemToDelete(null)}>
            <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Delete Signage Item?</h3>
                  <p className="text-sm text-slate-500 mt-2">
                    Are you sure you want to remove the <strong>{itemToDelete.signType}</strong> for <strong>{itemToDelete.roomName || 'Unknown Room'}</strong>? This action cannot be undone.
                  </p>
                </div>
                <div className="flex items-center gap-3 w-full mt-2">
                  <button 
                    onClick={() => setItemToDelete(null)}
                    className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      onRemoveRow(itemToDelete);
                      setItemToDelete(null);
                    }}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
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

                    {type.designImage && (
                      <div className="mb-3 h-32 bg-slate-50 rounded border border-slate-100 flex items-center justify-center overflow-hidden">
                        <img src={type.designImage} alt={type.typeCode} className="max-h-full max-w-full object-contain" />
                      </div>
                    )}

                    <h3 className="text-slate-900 font-medium mb-2">{type.description}</h3>
                    <div className="space-y-1 text-xs text-slate-500 border-t border-slate-100 pt-2 mt-2">
                      {type.dimensions && <p><span className="font-semibold">Size:</span> {type.dimensions}</p>}
                      {type.mounting && <p><span className="font-semibold">Mounting:</span> {type.mounting}</p>}
                      {type.color && <p><span className="font-semibold">Color:</span> {type.color}</p>}
                      {type.material && <p><span className="font-semibold">Material:</span> {type.material}</p>}
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