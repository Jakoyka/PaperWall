import React, { useState } from 'react';
import {
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  MenuDivider,
  MenuGroup,
  MenuGroupHeader,
} from '@fluentui/react-components';
import {
  ImageOff24Regular,
  Image20Regular,
  FolderOpen20Regular,
  Add20Regular,
  Delete20Regular,
} from '@fluentui/react-icons';
import { useAppState } from '../state.jsx';
import { useActions } from '../actions.js';
import { useT } from '../i18n/index.js';
import api from '../api.js';

export function TileImage({ item }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="tile-missing">
        <ImageOff24Regular />
      </div>
    );
  }
  return (
    <img
      src={api.thumbUrl(item.id)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

// One wallpaper thumbnail. Click = preview, right-click = menu.
// `removeFrom` ({ tabId, catId, uid }) is only passed on tabs you can edit (Custom and your own tabs).
export default function Tile({ item, interactive = true, removeFrom = null }) {
  const t = useT();
  const { state } = useAppState();
  const actions = useActions();
  const tabsWithCategories = state.tabs.filter((tab) => tab.categories.length > 0);

  const keyProps = interactive
    ? { tabIndex: 0, role: 'button', 'aria-label': item.name, onKeyDown: (e) => { if (e.key === 'Enter') actions.open(item); } }
    : {};

  return (
    <Menu openOnContext>
      <MenuTrigger disableButtonEnhancement>
        <div className="tile" onClick={() => actions.open(item)} {...keyProps}>
          <TileImage key={item.id} item={item} />
        </div>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuItem icon={<Image20Regular />} onClick={() => actions.setWallpaper(item)}>
            {t('wall.set')}
          </MenuItem>
          <MenuItem icon={<FolderOpen20Regular />} onClick={() => actions.reveal(item)}>
            {t('wall.reveal')}
          </MenuItem>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <MenuItem icon={<Add20Regular />}>{t('wall.addTo')}</MenuItem>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {tabsWithCategories.length === 0 && <MenuItem disabled>{t('wall.noCats')}</MenuItem>}
                {tabsWithCategories.map((tab) => (
                  <MenuGroup key={tab.id}>
                    {state.tabs.length > 1 && <MenuGroupHeader>{tab.name}</MenuGroupHeader>}
                    {tab.categories.map((c) => (
                      <MenuItem key={c.id} onClick={() => actions.addToCategory(item, tab.id, c.id)}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </MenuGroup>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
          {removeFrom && (
            <>
              <MenuDivider />
              <MenuItem
                icon={<Delete20Regular />}
                onClick={() => actions.removeFromCategory(removeFrom.tabId, removeFrom.catId, removeFrom.uid)}
              >
                {t('wall.remove')}
              </MenuItem>
            </>
          )}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}
