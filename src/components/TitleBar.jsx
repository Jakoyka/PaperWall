import React, { useEffect, useState } from 'react';
import { Input, Button } from '@fluentui/react-components';
import { Search20Regular, Dismiss16Regular } from '@fluentui/react-icons';
import {
  Subtract20Regular,
  Square20Regular,
  SquareMultiple20Regular,
  Dismiss20Regular,
} from '@fluentui/react-icons';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { APP } from '../config.js';
import { useT } from '../i18n/index.js';
import icon from '../assets/icon.png';

// Electron drew the OS min/max/close buttons itself via `titleBarOverlay` while we supplied
// only the rest of the bar. Tauri has no Windows equivalent of that overlay, so with
// `decorations: false` (src-tauri/src/lib.rs) these three buttons — and the window-dragging
// behaviour of the bar itself — are entirely our own now. See "Creating a Custom Titlebar" at
// https://v2.tauri.app/learn/window-customization/ for the pattern this follows.
function WindowControls() {
  const t = useT();
  const [maximized, setMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    let unlisten;
    appWindow.isMaximized().then(setMaximized);
    appWindow.onResized(() => { appWindow.isMaximized().then(setMaximized); }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, [appWindow]);

  return (
    <div className="titlebar-controls">
      <button className="titlebar-btn" aria-label={t('window.minimize')} onClick={() => appWindow.minimize()}>
        <Subtract20Regular />
      </button>
      <button className="titlebar-btn" aria-label={t('window.maximize')} onClick={() => appWindow.toggleMaximize()}>
        {maximized ? <SquareMultiple20Regular /> : <Square20Regular />}
      </button>
      <button className="titlebar-btn titlebar-btn-close" aria-label={t('window.close')} onClick={() => appWindow.close()}>
        <Dismiss20Regular />
      </button>
    </div>
  );
}

export default function TitleBar({ query, setQuery, searchRef }) {
  const t = useT();
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <img className="app-icon" src={icon} alt="" draggable={false} />
        <span className="app-name">{APP.name}</span>
        {APP.stage && <span className="app-stage">{APP.stage}</span>}
      </div>

      {/* Centered in the window; its width follows the window size (see .titlebar-search in styles.css) */}
      <div className="titlebar-search">
        <Input
          ref={searchRef}
          appearance="filled-darker"
          size="medium"
          style={{ width: '100%' }}
          placeholder={t('search.placeholder')}
          value={query}
          contentBefore={<Search20Regular />}
          contentAfter={
            query ? (
              <Button
                appearance="transparent"
                size="small"
                icon={<Dismiss16Regular />}
                aria-label={t('search.clear')}
                onClick={() => { setQuery(''); searchRef.current?.focus(); }}
              />
            ) : null
          }
          onChange={(_e, data) => setQuery(data.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
        />
      </div>

      <WindowControls />
    </header>
  );
}
