import React, { useMemo, useState } from 'react';
import { SignageItem, SignTypeDefinition } from '../types';
import { Download, Search, PlusCircle, Database, FileText, Layers, Trash2, ZoomIn, X, AlertTriangle, Table, Eye, Wand2, Edit3, FileDown, Pencil, Check } from 'lucide-react';
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

const COLORS = ['#f9b800', '#8b5cf6', '#ec4899', '#f43f5e', '#10b981', '#3b82f6'];

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

  // Edit State
  const [editingLocation, setEditingLocation] = useState<{ item: SignageItem, field: keyof SignageItem } | null>(null);
  const [editValue, setEditValue] = useState<string | number | boolean>("");

  // Defensive checks to ensure arrays exist
  const safeTakeoff = useMemo(() => Array.isArray(takeoff) ? takeoff : [], [takeoff]);
  const safeCatalog = useMemo(() => Array.isArray(catalog) ? catalog : [], [catalog]);

  const filteredTakeoff = useMemo(() => {
    return safeTakeoff.filter(item => 
      (item.roomName && item.roomName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.roomNumber && item.roomNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.signType && item.signType.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.sheet && item.sheet.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.pageNumber && item.pageNumber.toString().includes(searchTerm))
    );
  }, [safeTakeoff, searchTerm]);

  const statsData = useMemo(() => {
    const counts: Record<string, number> = {};
    if (Array.isArray(safeTakeoff)) {
      safeTakeoff.forEach(item => {
        if (item && item.signType) {
          counts[item.signType] = (counts[item.signType] || 0) + (item.quantity || 0);
        }
      });
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [safeTakeoff]);

  const totalSigns = safeTakeoff.reduce((acc, curr) => acc + (curr.quantity || 0), 0);
  const totalADA = safeTakeoff.filter(t => t.isADA).reduce((acc, curr) => acc + (curr.quantity || 0), 0);

  // Fallback to find design image in catalog if item doesn't have one
  const getDesignImage = (item: SignageItem) => {
    if (item.designImage) return item.designImage;
    if (!item.signType) return undefined;
    
    // Normalize logic matching the extraction service
    const normalize = (s: string) => s.toLowerCase().replace(/sign|type|[\s\-\.]/g, "");
    const itemKey = normalize(item.signType);
    
    // 1. Try Exact match on typeCode
    let typeDef = safeCatalog.find(c => c.typeCode && normalize(c.typeCode) === itemKey);
    
    // 2. Try partial match if no exact match
    if (!typeDef) {
       typeDef = safeCatalog.find(c => c.typeCode && (normalize(c.typeCode).includes(itemKey) || itemKey.includes(normalize(c.typeCode))));
    }
    
    return typeDef?.designImage;
  };

  // Editing Handlers
  const startEditing = (item: SignageItem, field: keyof SignageItem) => {
    setEditingLocation({ item, field });
    const val = item[field];
    if (Array.isArray(val)) {
      setEditValue("");
    } else {
      setEditValue((val as string | number | boolean) ?? "");
    }
  };

  const cancelEditing = () => {
    setEditingLocation(null);
    setEditValue("");
  };

  const saveEditing = () => {
    if (!editingLocation) return;
    const { item, field } = editingLocation;
    
    let finalValue: any = editValue;
    if (field === 'quantity') finalValue = Number(editValue) || 0;
    
    // Check if changed
    if (item[field] !== finalValue) {
        if (window.confirm(`Are you sure you want to save changes to ${field}?`)) {
             onUpdateItem(item, { [field]: finalValue });
        }
    }
    setEditingLocation(null);
    setEditValue("");
  };

  const renderEditableCell = (
    item: SignageItem, 
    field: keyof SignageItem, 
    type: 'text' | 'number' | 'boolean' = 'text', 
    extraClasses: string = ""
  ) => {
    const isEditing = editingLocation?.item === item && editingLocation?.field === field;

    return (
        <td className={`px-6 py-3 ${extraClasses} relative group/cell`}>
            {isEditing ? (
                <div className="absolute inset-0 p-1 flex items-center bg-white z-20 shadow-lg border border-[#f9b800]/50 min-w-[120px]">
                    {type === 'boolean' ? (
                       <select 
                         value={editValue ? 'true' : 'false'} 
                         onChange={(e) => setEditValue(e.target.value === 'true')}
                         className="flex-1 text-xs p-1 border border-slate-300 rounded focus:ring-2 focus:ring-[#f9b800] outline-none"
                         autoFocus
                         onKeyDown={(e) => {
                             if(e.key === 'Enter') saveEditing();
                             if(e.key === 'Escape') cancelEditing();
                         }}
                       >
                         <option value="true">Yes</option>
                         <option value="false">No</option>
                       </select>
                    ) : (
                       <input 
                        type={type}
                        value={editValue as string}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 w-full text-xs px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-[#f9b800] outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                            if(e.key === 'Enter') saveEditing();
                            if(e.key === 'Escape') cancelEditing();
                        }}
                       />
                    )}
                    <div className="flex ml-1 gap-0.5 shrink-0">
                        <button onClick={saveEditing} className="p-1 bg-emerald-100 text-emerald-600 rounded hover:bg-emerald-200" title="Save"><Check className="w-3 h-3"/></button>
                        <button onClick={cancelEditing} className="p-1 bg-slate-100 text-slate-500 rounded hover:bg-slate-200" title="Cancel"><X className="w-3 h-3"/></button>
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-between gap-2 min-h-[20px]">
                    <span className={`truncate block w-full ${type === 'boolean' ? 'flex justify-center' : ''}`} title={String(item[field] || '')}>
                        {type === 'boolean' ? (
                            item[field] ? <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block ring-2 ring-blue-100" title="ADA Compliant"></span> : <span className="w-2.5 h-2.5 rounded-full bg-slate-200 inline-block"></span>
                        ) : (
                            item[field] || <span className="text-slate-300">-</span>
                        )}
                    </span>
                    <button 
                        onClick={() => startEditing(item, field)}
                        className="opacity-0 group-hover/cell:opacity-100 p-1 text-slate-400 hover:text-[#f9b800] transition-all transform hover:scale-110 bg-white/50 rounded"
                        title="Edit"
                    >
                        <Pencil className="w-3 h-3" />
                    </button>
                </div>
            )}
        </td>
    );
  };

  const handleExportExcel = async () => {
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
      { header: 'Page', key: 'pageNumber', width: 10 },
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

    const dataToExport = searchTerm ? filteredTakeoff : safeTakeoff;

    // Add Rows
    for (const item of dataToExport) {
      const displayImage = getDesignImage(item);
      const row = worksheet.addRow({
        design: '', // Placeholder for image
        pageNumber: item.pageNumber || '',
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
      if (displayImage) {
        try {
          // Remove prefix to get pure base64
          const base64Data = displayImage.split(',')[1];
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

  const handleExportPDF = async () => {
    const { jspdf } = window as any;
    if (!jspdf) {
      alert("PDF library not loaded. Please wait or refresh.");
      return;
    }

    try {
      // --- COMMON CONFIG ---
      // Requirement: Orientation always Landscape
      const doc = new jspdf.jsPDF('l'); 
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      const title = isMasterView 
        ? (activeTab === 'takeoff' ? "Project Signage Schedule" : "Project Sign Type Catalog") 
        : (activeTab === 'takeoff' ? "Sheet Signage Schedule" : "Sign Type Catalog");

      // Header Function
      const drawHeader = () => {
         doc.setFontSize(16);
         doc.setTextColor(15, 23, 42); // Slate 900
         doc.text(title, 14, 15);
         doc.setFontSize(10);
         doc.setTextColor(100);
         doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - 50, 15);
         doc.setLineWidth(0.5);
         doc.setDrawColor(200);
         doc.line(14, 18, pageWidth - 14, 18);
      };

      if (activeTab === 'takeoff') {
        // --- 1. SIGNAGE LIST PDF ---
        drawHeader();
        
        const dataToExport = searchTerm ? filteredTakeoff : safeTakeoff;
        
        // Requirement: Include ALL columns
        const tableBody = dataToExport.map(item => [
          "", // Image placeholder
          item.pageNumber || '',
          item.sheet,
          item.roomNumber || '-',
          item.roomName,
          item.signType,
          item.isADA ? 'Yes' : 'No',
          item.quantity,
          item.dimensions || '-',
          item.color || '-',
          item.material || '-',
          item.notes || '-'
        ]);

        (doc as any).autoTable({
          startY: 25,
          head: [["Design", "Pg", "Sheet", "Room #", "Room Name", "Type", "ADA", "Qty", "Size", "Color", "Material", "Notes"]],
          body: tableBody,
          rowPageBreak: 'avoid',
          theme: 'grid',
          // Requirement: Ensure all contents are visible (linebreak overflow)
          styles: { 
             fontSize: 7, 
             valign: 'middle', 
             cellPadding: 2, 
             overflow: 'linebreak',
             minCellHeight: 15
          },
          headStyles: { 
             fillColor: [249, 184, 0], // Brand Color #f9b800
             textColor: 255,
             fontStyle: 'bold'
          },
          // Adjust column widths to fit landscape page
          columnStyles: {
            0: { cellWidth: 15 }, // Design
            1: { cellWidth: 8 },  // Pg
            2: { cellWidth: 20 }, // Sheet
            3: { cellWidth: 15 }, // Room #
            4: { cellWidth: 30 }, // Room Name
            5: { cellWidth: 15 }, // Type
            6: { cellWidth: 10 }, // ADA
            7: { cellWidth: 10 }, // Qty
            8: { cellWidth: 20 }, // Size
            9: { cellWidth: 20 }, // Color
            10: { cellWidth: 30 }, // Material
            11: { cellWidth: 'auto' } // Notes (Takes remaining)
          },
          didDrawCell: (data: any) => {
            // Draw image in the first column
            if (data.section === 'body' && data.column.index === 0) {
              const item = dataToExport[data.row.index];
              const img = getDesignImage(item);
              if (img) {
                try {
                   // Calculate aspect ratio fit
                   const dim = data.cell.height - 2; 
                   const x = data.cell.x + 1;
                   const y = data.cell.y + 1;
                   doc.addImage(img, 'JPEG', x, y, dim, dim);
                } catch(e) { /* Ignore image errors */ }
              }
            }
          }
        });

        doc.save(isMasterView ? 'project_schedule_landscape.pdf' : 'sheet_schedule_landscape.pdf');

      } else if (activeTab === 'catalog') {
        // --- 2. CATALOG PDF ---
        drawHeader();
        
        let yPos = 25;
        const cardHeight = 45;
        
        // Requirement: No background color box. Cleaner layout.
        safeCatalog.forEach((type, index) => {
          // Check page break
          if (yPos + cardHeight > pageHeight - 10) {
             doc.addPage('l'); // Force new page to be landscape too
             drawHeader();
             yPos = 25;
          }

          const imgSize = 40;
          
          // 1. Image
          if (type.designImage) {
            try {
               doc.addImage(type.designImage, 'JPEG', 14, yPos, imgSize, imgSize, undefined, 'FAST');
               // Add border around image
               doc.setDrawColor(220);
               doc.rect(14, yPos, imgSize, imgSize);
            } catch(e) {}
          } else {
             // Placeholder
             doc.setDrawColor(200);
             doc.rect(14, yPos, imgSize, imgSize);
             doc.setFontSize(8);
             doc.setTextColor(150);
             doc.text("No Image", 19, yPos + 20);
          }

          // 2. Type Info
          const xStart = 60;
          
          doc.setTextColor(30, 41, 59); // Slate 800
          doc.setFontSize(14);
          doc.setFont(undefined, 'bold');
          doc.text(`Type: ${type.typeCode}`, xStart, yPos + 6);
          
          doc.setFontSize(10);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(100);
          doc.text(type.category, pageWidth - 14, yPos + 6, { align: 'right' });

          doc.setDrawColor(220);
          doc.line(xStart, yPos + 9, pageWidth - 14, yPos + 9);

          // Description
          doc.setFontSize(11);
          doc.setTextColor(15, 23, 42);
          doc.text(type.description || 'No description provided.', xStart, yPos + 16);

          // Specs Grid
          doc.setFontSize(9);
          doc.setTextColor(71, 85, 105); // Slate 600
          
          const row1Y = yPos + 26;
          const row2Y = yPos + 34;

          // Column 1
          doc.setFont(undefined, 'bold'); doc.text("Size:", xStart, row1Y);
          doc.setFont(undefined, 'normal'); doc.text(type.dimensions || '-', xStart + 15, row1Y);

          // Column 2
          doc.setFont(undefined, 'bold'); doc.text("Mounting:", xStart + 80, row1Y);
          doc.setFont(undefined, 'normal'); doc.text(type.mounting || '-', xStart + 100, row1Y);
          
          // Column 1 Row 2
          doc.setFont(undefined, 'bold'); doc.text("Color:", xStart, row2Y);
          doc.setFont(undefined, 'normal'); doc.text(type.color || '-', xStart + 15, row2Y);

          // Column 2 Row 2
          doc.setFont(undefined, 'bold'); doc.text("Material:", xStart + 80, row2Y);
          doc.setFont(undefined, 'normal'); doc.text(type.material || '-', xStart + 100, row2Y);

          // Separator Line between items (instead of box)
          yPos += cardHeight + 5;
          if (yPos < pageHeight - 10) {
             doc.setDrawColor(240);
             doc.line(14, yPos - 2.5, pageWidth - 14, yPos - 2.5);
          }
        });

        doc.save('sign_type_catalog.pdf');

      } else if (activeTab === 'stats') {
        // --- 3. ANALYTICS PDF ---
        const element = document.getElementById('analytics-content');
        if (element) {
           const html2canvas = (window as any).html2canvas;
           if(!html2canvas) {
             alert("Snapshot library missing.");
             return;
           }
           
           // Capture container
           const canvas = await html2canvas(element, { 
             scale: 2,
             backgroundColor: '#ffffff',
             logging: false
           });
           
           const doc = new jspdf.jsPDF('l', 'mm', 'a4');
           const imgData = canvas.toDataURL('image/png');
           
           const pdfWidth = doc.internal.pageSize.getWidth();
           const pdfHeight = doc.internal.pageSize.getHeight();
           const imgProps = doc.getImageProperties(imgData);
           
           // Fit image to PDF page
           const ratio = Math.min((pdfWidth - 20) / imgProps.width, (pdfHeight - 30) / imgProps.height);
           const width = imgProps.width * ratio;
           const height = imgProps.height * ratio;
           const x = (pdfWidth - width) / 2;
           const y = 20;

           drawHeader();
           doc.addImage(imgData, 'PNG', x, y, width, height);
           doc.save('analytics_report.pdf');
        }
      }

    } catch (e) {
      console.error("PDF Export failed", e);
      alert("Failed to generate PDF. Check console for details.");
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
      
      {/* Scope Toggle Header */}
      <div className="bg-slate-100 p-2 border-b border-slate-200 flex items-center justify-between">
        <div className="flex bg-slate-200/50 p-1 rounded-lg">
          <button 
            onClick={() => onToggleView(false)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all ${!isMasterView ? 'bg-white text-[#f9b800] shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <FileText className="w-3.5 h-3.5" />
            Current Page
          </button>
          <button 
            onClick={() => onToggleView(true)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all ${isMasterView ? 'bg-white text-[#f9b800] shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Database className="w-3.5 h-3.5" />
            Full Project
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${isMasterView ? 'bg-amber-100 text-[#c28e00]' : 'bg-slate-300 text-slate-600'}`}>
              {masterItemCount}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
           {!isMasterView && onAddToProject && (
             <button 
               onClick={onAddToProject}
               className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f9b800] hover:bg-[#d9a000] text-white rounded-md text-xs font-bold uppercase tracking-wide transition-colors shadow-sm"
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
            className={`text-sm font-medium transition-colors border-b-2 pb-1 ${activeTab === 'takeoff' ? 'border-[#f9b800] text-[#f9b800]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            Signage List
          </button>
          <button 
            onClick={() => setActiveTab('catalog')}
            className={`text-sm font-medium transition-colors border-b-2 pb-1 ${activeTab === 'catalog' ? 'border-[#f9b800] text-[#f9b800]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            Type Catalog
          </button>
          <button 
            onClick={() => setActiveTab('stats')}
            className={`text-sm font-medium transition-colors border-b-2 pb-1 ${activeTab === 'stats' ? 'border-[#f9b800] text-[#f9b800]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            Analytics
          </button>
        </div>

        <div className="flex items-center gap-3">
           {activeTab === 'takeoff' && (
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#f9b800] transition-colors" />
              <input 
                type="text" 
                placeholder="Filter signs..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#f9b800] focus:bg-white transition-all w-48"
              />
            </div>
           )}
          
          <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button 
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-white text-emerald-700 rounded-md text-sm font-medium transition-all"
              title="Download Excel"
            >
              <Table className="w-4 h-4" />
              <span className="hidden sm:inline">Excel</span>
            </button>
            <div className="w-px h-4 bg-slate-300 mx-1"></div>
            <button 
              onClick={handleExportPDF}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-white text-red-600 rounded-md text-sm font-medium transition-all"
              title="Download PDF"
            >
              <FileDown className="w-4 h-4" />
              <span className="hidden sm:inline">PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-slate-50/50 custom-scrollbar relative">
        {activeTab === 'takeoff' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10 text-xs uppercase font-semibold text-slate-500 tracking-wider shadow-sm">
              <tr>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50 w-32">Design</th>
                <th className="px-6 py-3 border-b border-slate-200 bg-slate-50 w-24">Page</th>
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
              {filteredTakeoff.map((item, idx) => {
                const displayImage = getDesignImage(item);
                return (
                  <tr key={idx} className="hover:bg-amber-50 transition-colors text-sm text-slate-700 group">
                    <td className="px-6 py-3">
                      {displayImage ? (
                        <div 
                          className="w-24 h-24 bg-slate-100 rounded border border-slate-200 overflow-hidden cursor-zoom-in hover:border-[#f9b800]/50 transition-colors relative group/img flex items-center justify-center"
                          onClick={() => setPreviewImage(displayImage)}
                        >
                          <img src={displayImage} alt="Sign Design" className="max-w-full max-h-full object-contain p-1" />
                          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors" />
                        </div>
                      ) : (
                        <div className="w-24 h-24 bg-slate-50 rounded border border-slate-100 flex items-center justify-center text-slate-300">
                          <Layers className="w-8 h-8" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-500">{item.pageNumber || '-'}</td>
                    <td className="px-6 py-3 font-medium text-slate-900 whitespace-nowrap">{item.sheet}</td>
                    
                    {/* Editable Cells */}
                    {renderEditableCell(item, 'roomNumber', 'text')}
                    {renderEditableCell(item, 'roomName', 'text')}
                    
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
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                          {item.signType}
                        </span>
                      </div>
                    </td>

                    {renderEditableCell(item, 'isADA', 'boolean')}
                    {renderEditableCell(item, 'quantity', 'number')}
                    {renderEditableCell(item, 'dimensions', 'text')}
                    {renderEditableCell(item, 'color', 'text')}
                    {renderEditableCell(item, 'material', 'text')}
                    {renderEditableCell(item, 'notes', 'text', 'text-slate-500 text-xs max-w-[200px]')}

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
                );
              })}
              {filteredTakeoff.length === 0 && (
                 <tr>
                  <td colSpan={13} className="px-6 py-16 text-center text-slate-400">
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
            {safeCatalog.length === 0 ? (
               <div className="text-center text-slate-400 py-12">No sign types defined yet.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {safeCatalog.map((type, idx) => (
                  <div key={idx} className="bg-white border border-slate-200 rounded-lg p-5 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-3">
                      <div className="bg-amber-50 text-[#c28e00] border border-amber-100 font-bold px-3 py-1 rounded text-sm">
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
          <div className="p-8 h-full flex flex-col" id="analytics-content">
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
                 <p className="text-3xl font-bold text-emerald-600">{safeCatalog.length}</p>
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