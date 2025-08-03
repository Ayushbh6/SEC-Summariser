import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#e8e8e8] to-[#d4d4d4]">
      {/* Header */}
      <header className="w-full px-6 py-4">
        <nav className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="neumorphic-container px-6 py-3">
            <h1 className="text-2xl font-bold text-gray-700">SEC Summariser</h1>
          </div>
          
          <div className="flex space-x-4">
            <Link href="/signin">
              <button className="neumorphic-button px-6 py-3 text-gray-700 font-medium transition-all duration-200 hover:neumorphic-pressed">
                Sign In
              </button>
            </Link>
            <Link href="/signup">
              <button className="neumorphic-button-primary px-6 py-3 text-white font-medium transition-all duration-200 hover:neumorphic-pressed">
                Sign Up
              </button>
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center space-y-12">
          {/* Main Heading */}
          <div className="neumorphic-container-large p-12 max-w-4xl mx-auto">
            <h2 className="text-5xl md:text-6xl font-bold text-gray-800 mb-6 leading-tight">
              Intelligent SEC Filing
              <span className="block text-blue-600">Analysis</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              Access and analyze SEC filings with AI-powered insights. Get instant answers about company reports, financial data, and regulatory submissions.
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-8 mt-16">
            <div className="neumorphic-card p-8 text-center space-y-4">
              <div className="neumorphic-icon w-16 h-16 mx-auto flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-800">Smart Document Retrieval</h3>
              <p className="text-gray-600">
                Instantly find and access SEC filings by company name, ticker, or CIK with intelligent search capabilities.
              </p>
            </div>

            <div className="neumorphic-card p-8 text-center space-y-4">
              <div className="neumorphic-icon w-16 h-16 mx-auto flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-800">Structured Analysis</h3>
              <p className="text-gray-600">
                Extract and analyze financial tables, business descriptions, and key data points with preserved formatting.
              </p>
            </div>

            <div className="neumorphic-card p-8 text-center space-y-4">
              <div className="neumorphic-icon w-16 h-16 mx-auto flex items-center justify-center">
                <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-800">AI-Powered Chat</h3>
              <p className="text-gray-600">
                Ask questions about SEC filings in natural language and get precise, contextual answers with source references.
              </p>
            </div>
          </div>


        </div>
      </main>
    </div>
  );
}