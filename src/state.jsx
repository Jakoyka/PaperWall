import React, { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react';
import api from './api.js';

// Saved data layout:
//   tabs: [ { id, name, categories: [ { id, name, folders: [path], items: [ { uid, id, path, name } ] } ] } ]
// `folders` = folders the category was filled from (used by "Rescan").
const DEFAULT_STATE = {
  version: 3,
  theme: api.initialTheme || 'dark', // the theme the window opened in (chosen by the main process)
  language: 'system',
  sidebarCollapsed: false,
  tabs: [],
};

export const makeId = (prefix) =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
const toEntry = (item) => ({ uid: makeId('w'), id: item.id, path: item.path, name: item.name });

function cleanCategory(c) {
  return {
    id: c?.id || makeId('cat'),
    name: String(c?.name ?? ''),
    folders: (Array.isArray(c?.folders) ? c.folders : []).filter((f) => typeof f === 'string'),
    items: (Array.isArray(c?.items) ? c.items : [])
      .filter((i) => i && i.path && i.id)
      .map((i) => ({ uid: i.uid || makeId('w'), id: i.id, path: i.path, name: i.name || '' })),
  };
}

// Also upgrades older saves: the old built-in "Custom" tab (and the very first save format,
// a plain `categories` list) become a normal tab called "Custom", or disappear if they were empty.
function cleanTabs(saved) {
  const tabs = Array.isArray(saved.tabs)
    ? saved.tabs.map((t) => ({
        id: t?.id || makeId('tab'),
        name: String(t?.name ?? ''),
        categories: (Array.isArray(t?.categories) ? t.categories : []).map(cleanCategory),
      }))
    : [];
  const legacy = Array.isArray(saved.categories) ? saved.categories.map(cleanCategory) : [];
  if (legacy.length && !tabs.some((t) => t.id === 'custom')) tabs.unshift({ id: 'custom', name: '', categories: legacy });
  return tabs
    .filter((t) => !(t.id === 'custom' && !t.name.trim() && t.categories.length === 0))
    .map((t) => (t.id === 'custom' && !t.name.trim() ? { ...t, name: 'Custom' } : t));
}

const inTab = (state, tabId, change) => ({
  ...state,
  tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, categories: change(t.categories) } : t)),
});

function reducer(state, a) {
  switch (a.type) {
    case 'hydrate': {
      const { categories: _old, ...rest } = a.state || {};
      const theme = ['dark', 'light', 'clear'].includes(rest.theme) ? rest.theme : 'dark';
      return { ...DEFAULT_STATE, ...rest, theme, version: 3, tabs: cleanTabs(a.state || {}) };
    }
    case 'set':
      return { ...state, [a.key]: a.value };

    // ----- tabs
    case 'addTab':
      return { ...state, tabs: [...state.tabs, { id: a.id, name: a.name, categories: [] }] };
    case 'renameTab':
      return { ...state, tabs: state.tabs.map((t) => (t.id === a.id ? { ...t, name: a.name } : t)) };
    case 'deleteTab':
      return { ...state, tabs: state.tabs.filter((t) => t.id !== a.id) };
    case 'moveTab': {
      const list = [...state.tabs];
      const from = list.findIndex((t) => t.id === a.id);
      const to = from + a.dir;
      if (from < 0 || to < 0 || to >= list.length) return state;
      [list[from], list[to]] = [list[to], list[from]];
      return { ...state, tabs: list };
    }

    // ----- categories (inside a tab)
    case 'addCategory':
      return inTab(state, a.tabId, (cats) => [
        ...cats,
        { id: makeId('cat'), name: a.name, folders: a.folder ? [a.folder] : [], items: (a.items || []).map(toEntry) },
      ]);
    case 'renameCategory':
      return inTab(state, a.tabId, (cats) => cats.map((c) => (c.id === a.id ? { ...c, name: a.name } : c)));
    case 'deleteCategory':
      return inTab(state, a.tabId, (cats) => cats.filter((c) => c.id !== a.id));
    case 'moveCategory':
      return inTab(state, a.tabId, (cats) => {
        const list = [...cats];
        const from = list.findIndex((c) => c.id === a.id);
        const to = from + a.dir;
        if (from < 0 || to < 0 || to >= list.length) return cats;
        [list[from], list[to]] = [list[to], list[from]];
        return list;
      });
    case 'setCategories':
      return inTab(state, a.tabId, () => a.categories);

    // ----- wallpapers inside a category
    case 'addItems':
      return inTab(state, a.tabId, (cats) =>
        cats.map((c) => {
          if (c.id !== a.catId) return c;
          const have = new Set(c.items.map((i) => i.id));
          const fresh = (a.items || []).filter((i) => !have.has(i.id)).map(toEntry);
          const folders = a.folder && !(c.folders || []).includes(a.folder) ? [...(c.folders || []), a.folder] : c.folders || [];
          return { ...c, folders, items: [...c.items, ...fresh] };
        }),
      );
    // result of "Rescan": drop files that were deleted, add new files found in the linked folders
    case 'applyRescan':
      return inTab(state, a.tabId, (cats) =>
        cats.map((c) => {
          const r = a.results.find((x) => x.id === c.id);
          if (!r) return c;
          const gone = new Set(r.missing);
          const kept = c.items.filter((i) => !gone.has(i.path));
          const have = new Set(kept.map((i) => i.id));
          const fresh = r.found.filter((i) => !have.has(i.id)).map(toEntry);
          return { ...c, items: [...kept, ...fresh] };
        }),
      );
    case 'removeItem':
      return inTab(state, a.tabId, (cats) =>
        cats.map((c) => (c.id === a.catId ? { ...c, items: c.items.filter((i) => i.uid !== a.uid) } : c)),
      );
    default:
      return state;
  }
}

const StateContext = createContext(null);
export const useAppState = () => useContext(StateContext);

export function StateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const latest = useRef(state);
  latest.current = state;

  // Load saved settings + tabs once, on launch.
  useEffect(() => {
    api.loadState().then((saved) => {
      if (saved) dispatch({ type: 'hydrate', state: saved });
      readyRef.current = true;
      setReady(true);
    });
  }, []);

  // Save shortly after every change...
  useEffect(() => {
    if (!ready) return undefined;
    const timer = setTimeout(() => api.saveState(state), 250);
    return () => clearTimeout(timer);
  }, [state, ready]);

  // ...and once more, on request, right before the window actually closes. Tauri's `invoke`
  // has no synchronous equivalent to Electron's `sendSync`, so instead of a `beforeunload`
  // handler, the Rust side intercepts the close, asks us (via this event) to flush, and only
  // then lets the window close — see the `on_window_event` block in src-tauri/src/lib.rs.
  useEffect(() => {
    const unlistenPromise = api.onFlushAndClose(async () => {
      if (readyRef.current) {
        try { await api.saveState(latest.current); } catch { /* best effort */ }
      }
      api.confirmClose();
    });
    return () => { unlistenPromise.then((unlisten) => unlisten()); };
  }, []);

  return <StateContext.Provider value={{ state, dispatch, ready }}>{children}</StateContext.Provider>;
}
