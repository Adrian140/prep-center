import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Keep diagnostics in console for fast triage without crashing the whole dashboard.
    console.error('UI crash caught by ErrorBoundary:', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-semibold">Something went wrong while rendering this section.</div>
          <button
            onClick={this.handleRetry}
            className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs text-red-700"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
