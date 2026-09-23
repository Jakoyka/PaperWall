import React, { useEffect, useState } from 'react';
import {
  Dropdown,
  Option,
  Link,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@fluentui/react-components';
import PageHeader from '../components/PageHeader.jsx';
import { useAppState } from '../state.jsx';
import { useT, LANGUAGES } from '../i18n/index.js';
import { useActions } from '../actions.js';
import { effectiveTheme } from '../theme.js';
import { PROFILE } from '../config.js';
import avatar from '../assets/avatar.png';
import api from '../api.js';

function ExternalLink({ href, children }) {
  return (
    <Link href={href} onClick={(e) => { e.preventDefault(); api.openExternal(href); }}>
      {children}
    </Link>
  );
}

export default function SettingsPage() {
  const t = useT();
  const actions = useActions();
  const { state, dispatch } = useAppState();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [info, setInfo] = useState(null);

  useEffect(() => { api.getInfo().then(setInfo); }, []);

  // "Email" and "Support" copy the address from src/config.js to the clipboard
  const copyEmail = async (e) => {
    e.preventDefault();
    const address = PROFILE.email.replace(/^mailto:/i, '');
    await api.copyText(address);
    actions.toast(t('toast.emailCopied', { email: address }), 'success');
  };

  const clearOk = !!api.clearSupported;
  const themeValue = effectiveTheme(state.theme);
  const themeLabel = {
    dark: t('settings.themeDark'),
    light: t('settings.themeLight'),
    clear: t('settings.themeClear'),
  }[themeValue];
  const clearLabel = clearOk
    ? t('settings.themeClear')
    : `${t('settings.themeClear')} (${t('settings.themeClearUnsupported')})`;
  const languageLabel =
    state.language === 'system'
      ? t('settings.languageSystem')
      : LANGUAGES.find((l) => l.code === state.language)?.label ?? t('settings.languageSystem');

  return (
    <div className="page settings">
      <PageHeader title={t('settings.title')} />

      <div className="page-scroll">
      <div className="settings-body">
        <div className="profile">
          <img className="avatar" src={avatar} alt="" draggable={false} />
          <div>
            <div className="profile-name">{PROFILE.name}</div>
            <div className="profile-role">{PROFILE.role}</div>
          </div>
        </div>

        <h3 className="settings-heading">{t('settings.contact')}</h3>
        <div className="link-list">
          <ExternalLink href={PROFILE.instagram}>{t('settings.instagram')}</ExternalLink>
          <ExternalLink href={PROFILE.github}>{t('settings.github')}</ExternalLink>
          <Link href="#" onClick={copyEmail}>{t('settings.email')}</Link>
        </div>

        <h3 className="settings-label">{t('settings.theme')}</h3>
        <Dropdown
          className="pw-dropdown"
          appearance="filled-darker"
          value={themeLabel}
          selectedOptions={[themeValue]}
          onOptionSelect={(_e, data) => dispatch({ type: 'set', key: 'theme', value: data.optionValue })}
        >
          <Option value="dark" text={t('settings.themeDark')}>{t('settings.themeDark')}</Option>
          <Option value="light" text={t('settings.themeLight')}>{t('settings.themeLight')}</Option>
          {/* Clear = see-through glass. Needs Windows 11 22H2 or newer. */}
          <Option value="clear" disabled={!clearOk} text={clearLabel}>{clearLabel}</Option>
        </Dropdown>

        <h3 className="settings-label">{t('settings.language')}</h3>
        <Dropdown
          className="pw-dropdown"
          appearance="filled-darker"
          value={languageLabel}
          selectedOptions={[state.language]}
          onOptionSelect={(_e, data) => dispatch({ type: 'set', key: 'language', value: data.optionValue })}
        >
          <Option value="system" text={t('settings.languageSystem')}>{t('settings.languageSystem')}</Option>
          {LANGUAGES.map((l) => (
            <Option key={l.code} value={l.code} text={l.label}>{l.label}</Option>
          ))}
        </Dropdown>
      </div>

      <div className="settings-footer">
        <Link as="button" onClick={() => setAboutOpen(true)}>{t('settings.about')}</Link>
        <Link href="#" onClick={copyEmail}>{t('settings.support')}</Link>
      </div>
      </div>

      <Dialog open={aboutOpen} onOpenChange={(_e, d) => setAboutOpen(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('about.title')}</DialogTitle>
            <DialogContent>
              <p className="about-text">{t('about.body')}</p>
              <p className="about-text dim">{t('about.version', { v: info?.version ?? '' })}</p>
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={() => setAboutOpen(false)}>{t('about.close')}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
