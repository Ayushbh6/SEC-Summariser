export class ExportService {
  static async exportReportsToExcel(token: string, conversationId?: string | null): Promise<void> {
    try {
      // Build URL with optional conversation_id query param
      const url = new URL('/api/reports/export', window.location.origin);
      if (conversationId) {
        url.searchParams.append('conversation_id', conversationId);
      }
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to export reports');
      }

      // Get the filename from the Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : 'SEC_Reports_Summary.xlsx';

      // Convert response to blob
      const blob = await response.blob();

      // Create download link
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
      }, 100);

    } catch (error) {
      console.error('Export failed:', error);
      throw error;
    }
  }

  static async checkExportAvailability(token: string): Promise<boolean> {
    try {
      const response = await fetch('/api/reports/export', {
        method: 'HEAD',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to check export availability:', error);
      return false;
    }
  }
}