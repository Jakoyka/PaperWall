import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  FluentProvider,
  Toaster,
  Toast,
  ToastTitle,
  useToastController,
  useId,
} from '@fluentui/react-components';
import { AddSquare24Regular } from '@fluentui/react-icons';
import { StateProvider, useAppState, makeId } from './state.jsx';
import { ActionsContext } from './actions.js';
import { useT } from './i18n/index.js';
import { fluentThemes, effectiveTheme } from './theme.js';
import { tabPage } from './tabs.js';
import TitleBar from './components/TitleBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import PreviewDialog from './components/PreviewDialog.jsx';
import EmptyState from './components/EmptyState.jsx';
import PageHeader from './components/PageHeader.jsx';
import { NameDialog, ConfirmDialog } from './components/Dialogs.jsx';
import LibraryPage from './pages/LibraryPage.jsx';
import CustomPage from './pages/CustomPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import api from './api.js';

export default function App() {
  return (
    <StateProvider>
      <Themed />
    </StateProvider>
  );
}

// Applies the chosen theme: colours for the page (data-theme), for the Fluent parts, and for the window itself.
function Themed() {
  const { state, ready } = useAppState();
  const theme = effectiveTheme(state.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (ready) api.applyTheme(theme);
  }, [theme, ready]);

  return (
    <FluentProvider theme={fluentThemes[theme]} style={{ height: '100%', background: 'transparent' }}>
      <Shell />
    </FluentProvider>
  );
}

function Shell() {
  const { state, dispatch, ready } = useAppState();
  const t = useT();

  const [page, setPage] = useState(null); // null = first tab | 'settings' | 'tab:<id>'
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState(null);
  const [tabDialog, setTabDialog] = useState(null); // create / rename a tab
  const [tabDelete, setTabDelete] = useState(null);
  const searchRef = useRef(null);

  const toasterId = useId('toaster');
  const { dispatchToast } = useToastController(toasterId);

  // Ctrl+F jumps to the search box.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Which page is showing: the one you picked, or your first tab (or the welcome screen if there are none).
  const firstTab = state.tabs[0];
  let current = page ?? (firstTab ? tabPage(firstTab.id) : 'welcome');
  if (current.startsWith('tab:') && !state.tabs.some((x) => tabPage(x.id) === current)) {
    current = firstTab ? tabPage(firstTab.id) : 'welcome'; // that tab no longer exists
  }

  const actions = useMemo(() => {
    const toast = (message, intent = 'info') =>
      dispatchToast(<Toast><ToastTitle>{message}</ToastTitle></Toast>, { intent });
    return {
      toast,
      open: setPreview,
      reveal: (item) => api.reveal(item.id),
      setWallpaper: async (item) => {
        const res = await api.setWallpaper(item.id);
        if (res.ok) toast(t('toast.set'), 'success');
        else toast(t('toast.setFail', { e: res.error }), 'error');
      },
      addToCategory: (item, tabId, catId) => dispatch({ type: 'addItems', tabId, catId, items: [item] }),
      removeFromCategory: (tabId, catId, uid) => dispatch({ type: 'removeItem', tabId, catId, uid }),
      newTab: () => setTabDialog({ mode: 'create', value: t('tab.defaultName') }),
      renameTab: (tab) => setTabDialog({ mode: 'rename', id: tab.id, value: tab.name }),
      deleteTab: (tab) => setTabDelete(tab),
      moveTab: (id, dir) => dispatch({ type: 'moveTab', id, dir }),

      // Re-read the folders this tab's categories came from: add new images, drop deleted ones.
      rescanTab: async (tab) => {
        const results = await api.rescan(
          tab.categories.map((c) => ({ id: c.id, folders: c.folders || [], paths: c.items.map((i) => i.path) })),
        );
        let added = 0;
        let removed = 0;
        for (const r of results) {
          const cat = tab.categories.find((c) => c.id === r.id);
          if (!cat) continue;
          const gone = new Set(r.missing);
          const kept = new Set(cat.items.filter((i) => !gone.has(i.path)).map((i) => i.id));
          removed += cat.items.length - kept.size;
          added += new Set(r.found.filter((i) => !kept.has(i.id)).map((i) => i.id)).size;
        }
        dispatch({ type: 'applyRescan', tabId: tab.id, results });
        toast(added || removed ? t('toast.rescan', { added, removed }) : t('toast.rescanNone'), 'success');
      },
    };
  }, [dispatchToast, dispatch, t]);

  // Search across the categories of every tab.
  const searchGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const groups = [];
    state.tabs.forEach((tab) =>
      tab.categories.forEach((c) => {
        const name = `${tab.name} · ${c.name}`;
        const hits = name.toLowerCase().includes(q) ? c.items : c.items.filter((i) => i.name.toLowerCase().includes(q));
        if (hits.length) groups.push({ key: c.id, name, items: hits });
      }),
    );
    return groups;
  }, [query, state.tabs]);

  const navigate = (id) => {
    setQuery('');
    setPage(id);
  };

  let content = null;
  if (ready) {
    if (searchGroups) {
      content = (
        <LibraryPage
          key="search"
          title={t('search.title')}
          groups={searchGroups}
          emptyTitle={t('search.none', { q: query.trim() })}
        />
      );
    } else if (current === 'settings') {
      content = <SettingsPage key="settings" />;
    } else if (current.startsWith('tab:')) {
      const tabId = current.slice(4);
      content = <CustomPage key={tabId} tabId={tabId} />;
    } else {
      content = (
        <div className="page" key="welcome">
          <PageHeader title="PaperWall" />
          <div className="page-scroll">
            <EmptyState icon={<AddSquare24Regular />} title={t('welcome.title')}>
              {t('welcome.body')}
              <div style={{ marginTop: 16 }}>
                <Button appearance="primary" onClick={actions.newTab}>{t('nav.newTab')}</Button>
              </div>
            </EmptyState>
          </div>
        </div>
      );
    }
  }

  return (
    <ActionsContext.Provider value={actions}>
      <div className="shell">
        <TitleBar query={query} setQuery={setQuery} searchRef={searchRef} />
        <div className={`body${state.sidebarCollapsed ? ' collapsed' : ''}`}>
          <Sidebar page={current} onNavigate={navigate} />
          <main className="content">{content}</main>
        </div>
        <PreviewDialog item={preview} onClose={() => setPreview(null)} />

        <NameDialog
          open={!!tabDialog}
          title={tabDialog?.mode === 'rename' ? t('tab.rename') : t('nav.newTab')}
          label={t('tab.nameLabel')}
          initial={tabDialog?.value ?? ''}
          confirmLabel={tabDialog?.mode === 'rename' ? t('custom.save') : t('custom.create')}
          onClose={() => setTabDialog(null)}
          onSubmit={(name) => {
            if (tabDialog.mode === 'rename') {
              dispatch({ type: 'renameTab', id: tabDialog.id, name });
            } else {
              const id = makeId('tab');
              dispatch({ type: 'addTab', id, name });
              setQuery('');
              setPage(tabPage(id)); // jump straight into the new tab
            }
            setTabDialog(null);
          }}
        />
        <ConfirmDialog
          open={!!tabDelete}
          title={t('tab.deleteTitle', { name: tabDelete?.name ?? '' })}
          body={t('tab.deleteBody')}
          confirmLabel={t('tab.delete')}
          onClose={() => setTabDelete(null)}
          onConfirm={() => {
            if (current === tabPage(tabDelete.id)) setPage(null);
            dispatch({ type: 'deleteTab', id: tabDelete.id });
            setTabDelete(null);
          }}
        />
        <Toaster toasterId={toasterId} position="bottom-end" />
      </div>
    </ActionsContext.Provider>
  );
}
