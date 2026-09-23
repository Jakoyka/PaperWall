import React from 'react';
import { ImageMultiple24Regular } from '@fluentui/react-icons';
import PageHeader from '../components/PageHeader.jsx';
import WallpaperRow from '../components/WallpaperRow.jsx';
import EmptyState from '../components/EmptyState.jsx';

// Search results: one row per matching category.
export default function LibraryPage({ title, groups, emptyTitle }) {
  return (
    <div className="page">
      <PageHeader title={title} />
      <div className="page-scroll">
        {groups.length === 0 ? (
          <EmptyState icon={<ImageMultiple24Regular />} title={emptyTitle} />
        ) : (
          groups.map((g) => <WallpaperRow key={g.key || g.name} title={g.name} items={g.items} />)
        )}
      </div>
    </div>
  );
}
