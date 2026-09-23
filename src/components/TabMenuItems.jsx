import React from 'react';
import { MenuDivider, MenuItem } from '@fluentui/react-components';
import { ArrowDown20Regular, ArrowSync20Regular, ArrowUp20Regular, Delete20Regular, Rename20Regular } from '@fluentui/react-icons';
import { useActions } from '../actions.js';
import { useT } from '../i18n/index.js';

// The rescan / rename / move / delete entries for a tab you created. Goes inside a <MenuList>.
export default function TabMenuItems({ tab }) {
  const t = useT();
  const actions = useActions();
  return (
    <>
      <MenuItem icon={<ArrowSync20Regular />} onClick={() => actions.rescanTab(tab)}>{t('tab.rescan')}</MenuItem>
      <MenuDivider />
      <MenuItem icon={<Rename20Regular />} onClick={() => actions.renameTab(tab)}>{t('tab.rename')}</MenuItem>
      <MenuItem icon={<ArrowUp20Regular />} onClick={() => actions.moveTab(tab.id, -1)}>{t('tab.moveUp')}</MenuItem>
      <MenuItem icon={<ArrowDown20Regular />} onClick={() => actions.moveTab(tab.id, 1)}>{t('tab.moveDown')}</MenuItem>
      <MenuDivider />
      <MenuItem icon={<Delete20Regular />} onClick={() => actions.deleteTab(tab)}>{t('tab.delete')}</MenuItem>
    </>
  );
}
