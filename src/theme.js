import { webDarkTheme, webLightTheme } from '@fluentui/react-components';
import api from './api.js';

// Colours for the pop-ups, menus, drop-downs and buttons (the Fluent UI parts).
// The rest of the look (backgrounds, sidebar, text...) is in styles.css: search for  data-theme.

const dark = {
  ...webDarkTheme,
  // menus, drop-downs and dialogs
  colorNeutralBackground1: '#2c2c2c',
  colorNeutralBackground1Hover: '#363636',
  colorNeutralBackground1Pressed: '#303030',
  colorNeutralBackground1Selected: '#363636',
  // filled inputs and drop-downs (search box, Theme / Language)
  colorNeutralBackground3: '#2b2b2b',
  colorNeutralBackground3Hover: '#333333',
  colorNeutralBackground3Pressed: '#2e2e2e',

  // accent (Windows 11 dark-mode blue)
  colorBrandBackground: '#60cdff',
  colorBrandBackgroundHover: '#7ad6ff',
  colorBrandBackgroundPressed: '#4bbdf0',
  colorNeutralForegroundOnBrand: '#000000',
  colorCompoundBrandStroke: '#60cdff',
  colorCompoundBrandStrokeHover: '#7ad6ff',
  colorCompoundBrandStrokePressed: '#4bbdf0',
  colorCompoundBrandBackground: '#60cdff',
  colorBrandForegroundLink: '#99ebff',
  colorBrandForegroundLinkHover: '#b8f1ff',
  colorBrandForegroundLinkPressed: '#7edcf5',
  colorBrandForeground1: '#60cdff',
  colorBrandForeground2: '#60cdff',
};

const light = {
  ...webLightTheme,
  colorNeutralBackground1: '#ffffff',
  colorNeutralBackground1Hover: '#f0f0f0',
  colorNeutralBackground1Pressed: '#e8e8e8',
  colorNeutralBackground1Selected: '#f0f0f0',
  colorNeutralBackground3: '#e6e6e6',
  colorNeutralBackground3Hover: '#dcdcdc',
  colorNeutralBackground3Pressed: '#d4d4d4',

  // accent (Windows 11 light-mode blue)
  colorBrandBackground: '#005fb8',
  colorBrandBackgroundHover: '#1a70c1',
  colorBrandBackgroundPressed: '#0b57a5',
  colorNeutralForegroundOnBrand: '#ffffff',
  colorCompoundBrandStroke: '#005fb8',
  colorCompoundBrandStrokeHover: '#1a70c1',
  colorCompoundBrandStrokePressed: '#0b57a5',
  colorCompoundBrandBackground: '#005fb8',
  colorBrandForegroundLink: '#005fb8',
  colorBrandForegroundLinkHover: '#0b57a5',
  colorBrandForegroundLinkPressed: '#094a8c',
  colorBrandForeground1: '#005fb8',
  colorBrandForeground2: '#005fb8',
};

// Clear = the dark colours, but pop-ups (preview, About, menus, drop-downs, notifications,
// buttons) are see-through glass too. What sits behind them (blur / darker tint) is in styles.css.
const clear = {
  ...dark,
  colorNeutralBackground1: 'rgba(255, 255, 255, 0.10)',
  colorNeutralBackground1Hover: 'rgba(255, 255, 255, 0.16)',
  colorNeutralBackground1Pressed: 'rgba(255, 255, 255, 0.12)',
  colorNeutralBackground1Selected: 'rgba(255, 255, 255, 0.16)',
  colorNeutralBackground3: 'rgba(255, 255, 255, 0.10)',
  colorNeutralBackground3Hover: 'rgba(255, 255, 255, 0.14)',
  colorNeutralBackground3Pressed: 'rgba(255, 255, 255, 0.08)',
  colorBackgroundOverlay: 'rgba(0, 0, 0, 0)', // no dimming behind pop-ups
};

export const fluentThemes = { dark, light, clear };

// "clear" only works where the window can be see-through (Windows 11 22H2+); otherwise use dark.
export const effectiveTheme = (name) => {
  if (name === 'clear') return api.clearSupported ? 'clear' : 'dark';
  return name === 'light' ? 'light' : 'dark';
};
