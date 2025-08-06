'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signUp } from '@/lib/supabase';
import ThemeToggle from '@/components/ThemeToggle';

export default function SignUpPage() {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!firstName.trim()) {
      setError('First name is required');
      setLoading(false);
      return;
    }

    if (!email.trim()) {
      setError('Email is required');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const { error } = await signUp(email, password, firstName);
      
      if (error) {
        setError(error.message);
      } else {
        setSuccess(true);
        // Redirect to signin page after successful signup
        setTimeout(() => {
          router.push('/signin?message=Please check your email to confirm your account');
        }, 2000);
      }
          } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--gradient-from)] to-[var(--gradient-to)] flex items-center justify-center px-6 py-12 transition-colors duration-300">
      {/* Theme Toggle - positioned absolutely */}
      <div className="absolute top-4 right-4 lg:top-6 lg:right-6">
        <ThemeToggle />
      </div>
      
      <div className="w-full max-w-md px-4 lg:px-0">
        {/* Header */}
        <div className="text-center mb-6 lg:mb-8">
          <Link href="/">
            <div className="neumorphic-container inline-block px-4 lg:px-6 py-2 lg:py-3 mb-4 lg:mb-6 cursor-pointer">
              <h1 className="text-xl lg:text-2xl font-bold text-[var(--foreground)]">SEC Summariser</h1>
            </div>
          </Link>
          <h2 className="text-2xl lg:text-3xl font-bold text-[var(--foreground)] mb-2">Create Account</h2>
          <p className="text-sm lg:text-base text-[var(--foreground-secondary)]">Join SEC Summariser to access powerful filing analysis</p>
        </div>

        {/* Sign Up Form */}
        <div className="neumorphic-container-large p-6 lg:p-8">
          {success ? (
            <div className="text-center">
              <div className="neumorphic-icon w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-[var(--foreground)] mb-2">Account Created Successfully!</h3>
              <p className="text-[var(--foreground-secondary)] mb-4">Please check your email to confirm your account.</p>
              <p className="text-sm text-[var(--foreground-secondary)]">Redirecting to sign in...</p>
            </div>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-5 lg:space-y-6">
              {/* First Name */}
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  First Name
                </label>
                <div className="neumorphic-container p-3 lg:p-4">
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-transparent outline-none text-sm lg:text-base text-[var(--foreground)] placeholder-[var(--foreground-secondary)]"
                    placeholder="Enter your first name"
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  Email Address
                </label>
                <div className="neumorphic-container p-3 lg:p-4">
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-transparent outline-none text-sm lg:text-base text-[var(--foreground)] placeholder-[var(--foreground-secondary)]"
                    placeholder="Enter your email"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  Password
                </label>
                <div className="neumorphic-container p-3 lg:p-4">
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent outline-none text-sm lg:text-base text-[var(--foreground)] placeholder-[var(--foreground-secondary)]"
                    placeholder="Create a password (min. 6 characters)"
                    required
                  />
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full neumorphic-button-primary py-3 lg:py-4 text-base lg:text-lg font-semibold text-white transition-all duration-200 hover:neumorphic-pressed disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>
          )}

          {/* Sign In Link */}
          {!success && (
            <div className="mt-6 text-center">
              <p className="text-[var(--foreground-secondary)]">
                Already have an account?{' '}
                <Link href="/signin" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
                  Sign in here
                </Link>
              </p>
            </div>
          )}
        </div>

        {/* Back to Home */}
        <div className="text-center mt-6">
          <Link href="/" className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)] text-sm">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}