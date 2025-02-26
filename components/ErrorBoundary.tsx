'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', {
      error,
      errorInfo,
      timestamp: new Date().toISOString()
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-lg w-full">
            <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
              Something went wrong
            </h2>
            <div className="text-gray-600 dark:text-gray-300 mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
} 