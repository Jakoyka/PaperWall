import React from 'react';

// If something in the app crashes, show what happened instead of an empty screen.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="fatal">
        <h1>Something went wrong</h1>
        <p>Take a screenshot of this screen and send it over.</p>
        <pre>{String(error?.stack || error)}</pre>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}
