'use client';

import { useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';

interface SummaryNotificationProps {
  isProcessing: boolean;
  processingCount: number;
  completedCount: number;
  lastCompletedAt: Date | null;
  onExport: () => void;
  resetCompletedCount: () => void;
}

export default function SummaryNotification({
  isProcessing,
  processingCount,
  completedCount,
  lastCompletedAt,
  onExport,
  resetCompletedCount,
}: SummaryNotificationProps) {
  // Show processing notification
  useEffect(() => {
    if (isProcessing && processingCount > 0) {
      toast.loading(
        `Summarizing ${processingCount} report${processingCount > 1 ? 's' : ''}...`,
        {
          id: 'summary-processing',
          duration: Infinity,
        }
      );
    } else {
      toast.dismiss('summary-processing');
    }
  }, [isProcessing, processingCount]);

  // Show completion notification
  useEffect(() => {
    if (completedCount > 0 && lastCompletedAt) {
      toast.success(
        (t) => (
          <div className="flex items-center justify-between gap-4">
            <span>
              {completedCount} summary{completedCount > 1 ? ' summaries' : ''} ready!
            </span>
            <button
              onClick={() => {
                onExport();
                toast.dismiss(t.id);
                resetCompletedCount();
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors"
            >
              Export Excel
            </button>
          </div>
        ),
        {
          id: 'summary-complete',
          duration: 10000,
        }
      );
    }
  }, [completedCount, lastCompletedAt, onExport, resetCompletedCount]);

  return (
    <Toaster
      position="top-center"
      toastOptions={{
        className: '',
        style: {
          background: '#ffffff',
          color: '#374151',
          padding: '12px 16px',
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        },
        success: {
          iconTheme: {
            primary: '#10b981',
            secondary: '#ffffff',
          },
        },
        loading: {
          iconTheme: {
            primary: '#3b82f6',
            secondary: '#ffffff',
          },
        },
      }}
    />
  );
}