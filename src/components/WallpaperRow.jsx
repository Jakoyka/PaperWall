import React, { useRef } from 'react';
import Tile from './Tile.jsx';
import useDragScroll from '../useDragScroll.js';

// A title (e.g. "Tahoe") and a row of wallpapers you can drag sideways.
export default function WallpaperRow({ title, items }) {
  const scrollRef = useRef(null);
  useDragScroll(scrollRef);
  return (
    <section className="row">
      <h2 className="row-title">{title}</h2>
      <div className="row-scroll" ref={scrollRef}>
        {items.map((item) => (
          <Tile key={item.uid || item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
