import React from 'react';

// Big page title + thin divider. Stays at the top while the page scrolls.
export default function PageHeader({ title, children }) {
  return (
    <div className="page-header">
      <div className="page-title-row">
        <h1 className="page-title">{title}</h1>
        <div className="page-actions no-drag">{children}</div>
      </div>
      <div className="page-divider" />
    </div>
  );
}
