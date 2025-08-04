import React from 'react';

interface TokenWarningProps {
  isWarning: boolean;
  isLimitReached: boolean;
  percentageUsed: number;
  onNewConversation: () => void;
}

export default function TokenWarning({
  isWarning,
  isLimitReached,
  percentageUsed,
  onNewConversation,
}: TokenWarningProps) {
  if (!isWarning && !isLimitReached) return null;

  if (isLimitReached) {
    return (
      <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 max-w-2xl w-full px-4">
        <div className="bg-red-50 border-2 border-red-400 rounded-xl p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-red-800">
                  Conversation Length Limit Reached
                </h3>
                <p className="text-sm text-red-700 mt-1">
                  This conversation has reached its maximum length.
                  Please start a new conversation to continue.
                </p>
              </div>
            </div>
            <button
              onClick={onNewConversation}
              className="ml-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              New Conversation
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 max-w-2xl w-full px-4">
      <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-orange-800">
                Conversation Getting Long
              </h3>
              <p className="text-sm text-orange-700 mt-1">
                This conversation is approaching its maximum length.
              </p>
              <p className="text-xs text-orange-600 mt-1">
                Consider starting a new conversation soon for the best experience.
              </p>
            </div>
          </div>
          <button
            onClick={onNewConversation}
            className="ml-4 bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            New Conversation
          </button>
        </div>
        
        {/* Progress bar - without labels */}
        <div className="mt-3">
          <div className="w-full bg-orange-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${
                percentageUsed >= 96 ? 'bg-red-600' : 
                percentageUsed >= 80 ? 'bg-orange-600' : 
                'bg-green-600'
              }`}
              style={{ width: `${Math.min(percentageUsed, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}