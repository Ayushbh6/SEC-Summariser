'use client';

import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--gradient-from)] to-[var(--gradient-to)] transition-colors duration-300">
      {/* Header */}
      <header className="w-full px-4 lg:px-6 py-3 lg:py-4">
        <nav className="max-w-7xl mx-auto flex justify-between items-center gap-2">
          <div className="neumorphic-container px-3 sm:px-4 lg:px-6 py-2 lg:py-3 flex-shrink-0">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--foreground)]">
              <span className="hidden sm:inline">SEC Summariser</span>
              <span className="sm:hidden">SEC</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
            <ThemeToggle />
            <Link href="/signin">
              <button className="neumorphic-button px-3 sm:px-4 lg:px-6 py-2 lg:py-3 text-xs sm:text-sm lg:text-base text-[var(--foreground)] font-medium transition-all duration-200 hover:neumorphic-pressed">
                Sign In
              </button>
            </Link>
            <Link href="/signup">
              <button className="neumorphic-button-primary px-3 sm:px-4 lg:px-6 py-2 lg:py-3 text-xs sm:text-sm lg:text-base text-white font-medium transition-all duration-200 hover:neumorphic-pressed">
                Sign Up
              </button>
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-8 sm:py-12 lg:py-20">
        <div className="text-center space-y-8 lg:space-y-12">
          {/* Main Heading */}
          <div className="neumorphic-container-large p-6 sm:p-8 lg:p-12 max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-[var(--foreground)] mb-4 lg:mb-6 leading-tight">
              Intelligent SEC Filing
              <span className="block text-blue-600 dark:text-blue-400">Analysis</span>
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-[var(--foreground-secondary)] max-w-2xl mx-auto leading-relaxed">
              Access and analyze SEC filings with AI-powered insights. Get instant answers about company reports, financial data, and regulatory submissions.
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 mt-8 sm:mt-12 lg:mt-16">
            <div className="neumorphic-card p-6 lg:p-8 text-center space-y-3 lg:space-y-4">
              <div className="neumorphic-icon w-14 h-14 lg:w-16 lg:h-16 mx-auto flex items-center justify-center">
                <svg className="w-7 h-7 lg:w-8 lg:h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg lg:text-xl font-semibold text-[var(--foreground)]">Smart Document Retrieval</h3>
              <p className="text-sm lg:text-base text-[var(--foreground-secondary)]">
                Instantly find and access SEC filings by company name, ticker, or CIK with intelligent search capabilities.
              </p>
            </div>

            <div className="neumorphic-card p-6 lg:p-8 text-center space-y-3 lg:space-y-4">
              <div className="neumorphic-icon w-14 h-14 lg:w-16 lg:h-16 mx-auto flex items-center justify-center">
                <svg className="w-7 h-7 lg:w-8 lg:h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg lg:text-xl font-semibold text-[var(--foreground)]">Structured Analysis</h3>
              <p className="text-sm lg:text-base text-[var(--foreground-secondary)]">
                Extract and analyze financial tables, business descriptions, and key data points with preserved formatting.
              </p>
            </div>

            <div className="neumorphic-card p-6 lg:p-8 text-center space-y-3 lg:space-y-4">
              <div className="neumorphic-icon w-14 h-14 lg:w-16 lg:h-16 mx-auto flex items-center justify-center">
                <svg className="w-7 h-7 lg:w-8 lg:h-8 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="text-lg lg:text-xl font-semibold text-[var(--foreground)]">AI-Powered Chat</h3>
              <p className="text-sm lg:text-base text-[var(--foreground-secondary)]">
                Ask questions about SEC filings in natural language and get precise, contextual answers with source references.
              </p>
            </div>
          </div>


        </div>
      </main>
    </div>
  );
}