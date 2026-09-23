import React, { useCallback, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  MeasuringStrategy,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
  rectIntersection,
  closestCenter,
  getFirstCollision,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Button,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  MenuDivider,
  Spinner,
} from '@fluentui/react-components';
import {
  Add20Regular,
  FolderZip20Regular,
  Folder20Regular,
  MoreHorizontal20Regular,
  ImageAdd20Regular,
  Rename20Regular,
  ArrowUp20Regular,
  ArrowDown20Regular,
  Delete20Regular,
  Collections24Regular,
} from '@fluentui/react-icons';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Tile, { TileImage } from '../components/Tile.jsx';
import TabMenuItems from '../components/TabMenuItems.jsx';
import { NameDialog, ConfirmDialog } from '../components/Dialogs.jsx';
import { useAppState } from '../state.jsx';
import { useActions } from '../actions.js';
import { useT } from '../i18n/index.js';
import useDragScroll from '../useDragScroll.js';
import api from '../api.js';

// How long you have to hold a wallpaper before it "picks up" for re-ordering (milliseconds).
// Dragging sooner than this scrolls the row instead. Make it smaller for a quicker pick-up.
const HOLD_TO_DRAG_MS = 200;

const catOfItem = (cats, uid) => cats.find((c) => c.items.some((i) => i.uid === uid));

// ---------------------------------------------------------------------------
// One wallpaper that can be picked up and moved
// ---------------------------------------------------------------------------
function SortableTile({ entry, tabId, catId }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.uid });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="sortable-tile" {...attributes} {...listeners}>
      <Tile item={entry} interactive={false} removeFrom={{ tabId, catId, uid: entry.uid }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One category = a title, a "..." menu and a row of wallpapers
// ---------------------------------------------------------------------------
function CategoryRow({ tabId, cat, onAction, dragging }) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id: cat.id });
  const scrollRef = useRef(null);
  useDragScroll(scrollRef, !dragging);

  return (
    <section className="row">
      <div className="row-head">
        <h2 className="row-title">{cat.name}</h2>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button appearance="subtle" size="small" icon={<MoreHorizontal20Regular />} aria-label={t('custom.more')} />
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem icon={<ImageAdd20Regular />} onClick={() => onAction('addImages', cat)}>{t('custom.addImages')}</MenuItem>
              <MenuItem icon={<Folder20Regular />} onClick={() => onAction('addFolder', cat)}>{t('custom.addFolder')}</MenuItem>
              <MenuItem icon={<FolderZip20Regular />} onClick={() => onAction('addZip', cat)}>{t('custom.addZip')}</MenuItem>
              <MenuDivider />
              <MenuItem icon={<Rename20Regular />} onClick={() => onAction('rename', cat)}>{t('custom.rename')}</MenuItem>
              <MenuItem icon={<ArrowUp20Regular />} onClick={() => onAction('up', cat)}>{t('custom.moveUp')}</MenuItem>
              <MenuItem icon={<ArrowDown20Regular />} onClick={() => onAction('down', cat)}>{t('custom.moveDown')}</MenuItem>
              <MenuDivider />
              <MenuItem icon={<Delete20Regular />} onClick={() => onAction('delete', cat)}>{t('custom.delete')}</MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>

      <SortableContext id={cat.id} items={cat.items.map((i) => i.uid)} strategy={horizontalListSortingStrategy}>
        <div
          ref={(el) => { setNodeRef(el); scrollRef.current = el; }}
          className={`row-scroll${isOver ? ' drop-over' : ''}`}
        >
          {cat.items.length === 0 && <div className="row-empty">{t('custom.emptyRow')}</div>}
          {cat.items.map((entry) => (
            <SortableTile key={entry.uid} entry={entry} tabId={tabId} catId={cat.id} />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The page (used by the built-in Custom tab and by every tab you create)
// ---------------------------------------------------------------------------
export default function CustomPage({ tabId }) {
  const t = useT();
  const { state, dispatch } = useAppState();
  const actions = useActions();

  const tab = state.tabs.find((x) => x.id === tabId);

  const [working, setWorking] = useState(null); // temporary copy of the categories while dragging
  const [activeUid, setActiveUid] = useState(null);
  const [nameDialog, setNameDialog] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const lastOver = useRef(null);

  const cats = working ?? tab?.categories ?? [];
  const activeItem = activeUid ? cats.flatMap((c) => c.items).find((i) => i.uid === activeUid) : null;

  const sensors = useSensors(
    // hold for a moment to pick a wallpaper up; a quick drag scrolls the row instead
    useSensor(PointerSensor, { activationConstraint: { delay: HOLD_TO_DRAG_MS, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Decides which tile / row the dragged wallpaper is currently over.
  const collisionDetection = useCallback(
    (args) => {
      const pointer = pointerWithin(args);
      const hits = pointer.length > 0 ? pointer : rectIntersection(args);
      let overId = getFirstCollision(hits, 'id');
      if (overId != null) {
        const cat = cats.find((c) => c.id === overId);
        if (cat && cat.items.length > 0) {
          const ids = new Set(cat.items.map((i) => i.uid));
          const inner = closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter((d) => ids.has(d.id)),
          });
          overId = inner[0]?.id ?? overId;
        }
        lastOver.current = overId;
        return [{ id: overId }];
      }
      return lastOver.current ? [{ id: lastOver.current }] : [];
    },
    [cats],
  );

  if (!tab) return null;

  const onDragStart = ({ active }) => {
    setActiveUid(active.id);
    setWorking(tab.categories);
  };

  // While dragging over another row, move the wallpaper into it so the tiles make room.
  const onDragOver = ({ active, over }) => {
    if (!over) return;
    const activeRect = active.rect.current.translated;
    setWorking((prev) => {
      if (!prev) return prev;
      const from = catOfItem(prev, active.id);
      const overIsRow = prev.some((c) => c.id === over.id);
      const to = overIsRow ? prev.find((c) => c.id === over.id) : catOfItem(prev, over.id);
      if (!from || !to || from.id === to.id) return prev;

      const item = from.items.find((i) => i.uid === active.id);
      let index = to.items.length;
      if (!overIsRow) {
        const overIndex = to.items.findIndex((i) => i.uid === over.id);
        const activeCenter = activeRect ? activeRect.left + activeRect.width / 2 : 0;
        const overCenter = over.rect.left + over.rect.width / 2;
        index = overIndex + (activeRect && activeCenter > overCenter ? 1 : 0);
      }
      return prev.map((c) => {
        if (c.id === from.id) return { ...c, items: c.items.filter((i) => i.uid !== active.id) };
        if (c.id === to.id) {
          const items = [...c.items];
          items.splice(index, 0, item);
          return { ...c, items };
        }
        return c;
      });
    });
  };

  const onDragEnd = ({ active, over }) => {
    let next = working ?? tab.categories;
    if (over) {
      const from = catOfItem(next, active.id);
      const overIsRow = next.some((c) => c.id === over.id);
      const to = overIsRow ? null : catOfItem(next, over.id);
      if (from && to && from.id === to.id) {
        const oldIndex = from.items.findIndex((i) => i.uid === active.id);
        const newIndex = from.items.findIndex((i) => i.uid === over.id);
        if (oldIndex !== newIndex && newIndex >= 0) {
          next = next.map((c) => (c.id === from.id ? { ...c, items: arrayMove(c.items, oldIndex, newIndex) } : c));
        }
      }
    }
    dispatch({ type: 'setCategories', tabId, categories: next });
    setWorking(null);
    setActiveUid(null);
    lastOver.current = null;
  };

  const onDragCancel = () => {
    setWorking(null);
    setActiveUid(null);
    lastOver.current = null;
  };

  // Adding wallpapers from files / folders / ZIPs.
  const runImport = async (picker, catId) => {
    setBusy(true);
    try {
      const result = await picker();
      if (!result) return; // dialog cancelled
      if (result.error) return actions.toast(result.error, 'error');
      if (!result.items.length) return actions.toast(t('custom.noImages'), 'warning');
      if (catId) dispatch({ type: 'addItems', tabId, catId, items: result.items, folder: result.folder });
      else dispatch({ type: 'addCategory', tabId, name: result.name || t('custom.defaultName'), items: result.items, folder: result.folder });
    } finally {
      setBusy(false);
    }
  };

  const onAction = (kind, cat) => {
    if (kind === 'addImages') return runImport(api.pickImages, cat.id);
    if (kind === 'addFolder') return runImport(api.pickFolder, cat.id);
    if (kind === 'addZip') return runImport(api.pickZip, cat.id);
    if (kind === 'rename') return setNameDialog({ mode: 'rename', id: cat.id, value: cat.name });
    if (kind === 'up') return dispatch({ type: 'moveCategory', tabId, id: cat.id, dir: -1 });
    if (kind === 'down') return dispatch({ type: 'moveCategory', tabId, id: cat.id, dir: 1 });
    if (kind === 'delete') return setDeleting(cat);
    return undefined;
  };

  const renaming = nameDialog?.mode === 'rename';

  return (
    <div className="page">
      <PageHeader title={tab.name}>
        {busy && <Spinner size="tiny" />}
        <Button appearance="primary" icon={<Add20Regular />} onClick={() => setNameDialog({ mode: 'create', value: t('custom.defaultName') })}>
          {t('custom.new')}
        </Button>
        <Button appearance="secondary" icon={<FolderZip20Regular />} disabled={busy} onClick={() => runImport(api.pickZip, null)}>
          {t('custom.importZip')}
        </Button>
        <Button appearance="secondary" icon={<Folder20Regular />} disabled={busy} onClick={() => runImport(api.pickFolder, null)}>
          {t('custom.importFolder')}
        </Button>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button appearance="subtle" icon={<MoreHorizontal20Regular />} aria-label={t('tab.options')} />
          </MenuTrigger>
          <MenuPopover>
            <MenuList><TabMenuItems tab={tab} /></MenuList>
          </MenuPopover>
        </Menu>
      </PageHeader>

      <div className="page-scroll">
      {cats.length === 0 ? (
        <EmptyState icon={<Collections24Regular />} title={t('custom.emptyTitle')}>
          {t('custom.emptyBody')}
        </EmptyState>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          {cats.map((cat) => (
            <CategoryRow key={cat.id} tabId={tabId} cat={cat} onAction={onAction} dragging={activeUid != null} />
          ))}
          <DragOverlay>
            {activeItem ? (
              <div className="tile tile-overlay">
                <TileImage item={activeItem} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
      </div>

      <NameDialog
        open={!!nameDialog}
        title={renaming ? t('custom.rename') : t('custom.new')}
        label={t('custom.nameLabel')}
        initial={nameDialog?.value ?? ''}
        confirmLabel={renaming ? t('custom.save') : t('custom.create')}
        onClose={() => setNameDialog(null)}
        onSubmit={(name) => {
          if (renaming) dispatch({ type: 'renameCategory', tabId, id: nameDialog.id, name });
          else dispatch({ type: 'addCategory', tabId, name, items: [] });
          setNameDialog(null);
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title={t('custom.deleteTitle', { name: deleting?.name ?? '' })}
        body={t('custom.deleteBody')}
        confirmLabel={t('custom.delete')}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          dispatch({ type: 'deleteCategory', tabId, id: deleting.id });
          setDeleting(null);
        }}
      />
    </div>
  );
}
