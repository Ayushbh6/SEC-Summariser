'use client';

import { useState } from 'react';

interface ExportButtonProps {
  availableSummaries: number;
  onExport: () => Promise<void>;
}

export default function ExportButton({ availableSummaries, onExport }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (isExporting || availableSummaries === 0) return;
    
    setIsExporting(true);
    try {
      await onExport();
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  if (availableSummaries === 0) {
    return null;
  }

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className="neumorphic-button relative px-3 lg:px-6 py-2 lg:py-3 text-sm lg:text-base text-[var(--foreground)] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="flex items-center gap-1 lg:gap-2">
        {isExporting ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--foreground)]"></div>
            <span className="hidden sm:inline">Exporting...</span>
          </>
        ) : (
          <>
            <svg 
              className="w-4 lg:w-5 h-4 lg:h-5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
              />
            </svg>
            <span className="hidden lg:inline">Export Summaries</span>
            <span className="hidden sm:inline lg:hidden">Export</span>
            <span className="sm:hidden">Exp</span>
          </>
        )}
      </div>
      {availableSummaries > 0 && !isExporting && (
        <div className="absolute -top-1 -right-1 lg:-top-2 lg:-right-2 bg-blue-600 dark:bg-blue-500 text-white text-xs font-bold rounded-full h-5 w-5 lg:h-6 lg:w-6 flex items-center justify-center">
          {availableSummaries}
        </div>
      )}
    </button>
  );
}