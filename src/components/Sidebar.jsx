import React, { forwardRef } from 'react';
import { Menu, MenuList, MenuPopover, MenuTrigger } from '@fluentui/react-components';
import {
  Navigation20Regular,
  AddSquare20Regular,
  Collections20Regular,
  Settings20Regular,
} from '@fluentui/react-icons';
import { useAppState } from '../state.jsx';
import { useActions } from '../actions.js';
import { useT } from '../i18n/index.js';
import { tabPage } from '../tabs.js';
import TabMenuItems from './TabMenuItems.jsx';

// One row in the sidebar. (forwardRef so the right-click menu can attach to it.)
const NavButton = forwardRef(function NavButton({ label, icon, active, collapsed, className = '', ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={`nav-item${active ? ' active' : ''} ${className}`}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      {...rest}
    >
      <span className="nav-indicator" />
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
    </button>
  );
});

export default function Sidebar({ page, onNavigate }) {
  const { state, dispatch } = useAppState();
  const actions = useActions();
  const t = useT();
  const collapsed = state.sidebarCollapsed;
  const common = { collapsed };

  return (
    <nav className="sidebar">
      <button
        className="nav-item nav-toggle"
        aria-label={t('nav.toggle')}
        onClick={() => dispatch({ type: 'set', key: 'sidebarCollapsed', value: !collapsed })}
      >
        <span className="nav-icon"><Navigation20Regular /></span>
      </button>

      <div className="nav-list">
        {state.tabs.map((tab) => (
          // right-click a tab to rename, move or delete it
          <Menu key={tab.id} openOnContext>
            <MenuTrigger disableButtonEnhancement>
              <NavButton {...common} label={tab.name} icon={<Collections20Regular />}
                active={page === tabPage(tab.id)} onClick={() => onNavigate(tabPage(tab.id))} />
            </MenuTrigger>
            <MenuPopover>
              <MenuList><TabMenuItems tab={tab} /></MenuList>
            </MenuPopover>
          </Menu>
        ))}

        <NavButton {...common} className="nav-new" label={t('nav.newTab')} icon={<AddSquare20Regular />}
          onClick={actions.newTab} />
      </div>

      <div className="nav-bottom">
        <NavButton {...common} label={t('nav.settings')} icon={<Settings20Regular />}
          active={page === 'settings'} onClick={() => onNavigate('settings')} />
      </div>
    </nav>
  );
}
