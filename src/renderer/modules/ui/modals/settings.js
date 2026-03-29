import {
  modalOverlay,
  modalWindow,
  settingsModal,
  settingsSidebar,
  settingsContent,
  settingsStatus,
  settingsTitle,
  settingsClose,

  simpleErrorModal,
  simpleErrorModalTitle,
  simpleErrorModalBody,
  simpleErrorModalOk
} from '../dom.js';

import { ensureDefaultSection, applyTranslations } from '../render/translations.js';

import { renderSectionsList } from '../render/sectionsList.js';
import { renderSectionContent } from '../render/sectionContent.js';

import { openFloatingDropdown, setToggleLabel } from '../dropdowns.js';
import { tooltipTitle, hideAllTooltips, detachTooltipsInside } from '../tooltips.js';
import { showOverlay, hideOverlay, detachEscHandler, blurPreviousOpener } from '../overlays.js';

import { data, app, lang, langs, setLang } from '../../app/state.js';
import { save, handleIncomingData, applyTheme } from '../../app/persistence.js';

import { openConfirmModal } from './confirm.js';
import { openSimpleErrorModal } from './error.js';

// -------------------------------------------- probably not stable
function getSemverLib() {
  try {
    const semver = (typeof require === 'function') ? require('semver') : (window && window.require ? window.require('semver') : null);
    if (semver && typeof semver.gt === 'function' && typeof semver.valid === 'function') return semver;
    return null;
  } catch (e) { return null; }
}

function normalizeSemverStr(ver) {
  if (!ver) return '';
  return String(ver).trim().replace(/^v/i, '');
}

function compareSemverFallback(a, b) {
  a = normalizeSemverStr(a);
  b = normalizeSemverStr(b);
  if (a === b) return 0;
  const pa = a.split('.').map(s => parseInt(s.replace(/\D.*$/,''), 10) || 0);
  const pb = b.split('.').map(s => parseInt(s.replace(/\D.*$/,''), 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function compareVersions(a, b) {
  const semver = getSemverLib();
  const va = normalizeSemverStr(a);
  const vb = normalizeSemverStr(b);
  if (semver) {
    const sa = semver.valid(va) ? va : null;
    const sb = semver.valid(vb) ? vb : null;
    if (sa && sb) {
      if (semver.gt(sa, sb)) return 1;
      if (semver.lt(sa, sb)) return -1;
      return 0;
    }
  }
  return compareSemverFallback(va, vb);
}

function persistUpdateStatus(textHtml, stateClass) {
  data.settings = data.settings || {};
  data.settings.updateStatusText = String(textHtml || '');
  data.settings.updateStatusClass = stateClass || '';
  data.settings.latestUpdateCheck = Date.now();
  try {
    if (window.api && typeof window.api.saveData === 'function') {
      window.api.saveData(data).catch(()=>{});
    } else if (typeof save === 'function') {
      const maybe = save();
      if (maybe && typeof maybe.then === 'function') maybe.catch(()=>{});
    }
  } catch (e) { console.warn('persistUpdateStatus save failed', e); }
}

function setUpdateStatusUI(statusEl, textHtml, stateClass) {
  if (!statusEl) return;
  statusEl.innerHTML = textHtml || '';
  ['ok','available','recommended','muted'].forEach(c => statusEl.classList.remove(c));
  if (stateClass) statusEl.classList.add(stateClass);
  persistUpdateStatus(textHtml, stateClass);
}

function showNetworkNotification(message) {
  const existing = document.querySelector('.network-notification');
  if (existing) existing.remove();

  const container = document.getElementById('globalNotifications');
  if (!container) {
    console.warn('Global notifications container not found');
    return;
  }

  const notif = document.createElement('div');
  notif.className = 'restart-notification';

  const textEl = document.createElement('span');
  textEl.className = 'restart-text';
  textEl.textContent = message || 'Network error';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'restart-close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', (langs[lang] || langs['en']).close || 'Close');
  const closeIcon = document.createElement('img');
  closeIcon.className = 'restart-close-icon';
  closeIcon.src = '../assets/icons/cross.svg';
  closeBtn.prepend(closeIcon);

  notif.appendChild(textEl);
  notif.appendChild(closeBtn);
  container.appendChild(notif);

  requestAnimationFrame(() => notif.classList.add('visible'));

  closeBtn.onclick = (e) => {
    e.stopPropagation();
    notif.classList.add('hiding');
    setTimeout(() => { if (notif.parentNode) notif.parentNode.removeChild(notif); }, 300);
  };
}

async function checkForUpdatesAndUpdateUI(statusEl) {
  if (!statusEl) return;

  setUpdateStatusUI(statusEl, (langs[lang]||langs['en']).checkingForUpdates || 'Checking for updates...', 'muted');

  try {
    if (!(window.api && typeof window.api.fetchLatestRelease === 'function')) {
      setUpdateStatusUI(statusEl, (langs[lang]||langs['en']).couldNotCheck || 'Could not check for updates. Try again later.', 'muted');
      return;
    }

    const apiRes = await window.api.fetchLatestRelease();

    if (!apiRes) {
      setUpdateStatusUI(statusEl, (langs[lang]||langs['en']).couldNotCheck || 'Could not check for updates. Try again later.', 'muted');
      return;
    }

    if (!apiRes.ok) {
      if (apiRes.error === 'not_found') {
        const msg = (langs[lang]||langs['en']).noReleasesFound || 'No releases found.';
        setUpdateStatusUI(statusEl, msg, 'muted');
        return;
      }

      if (apiRes.error === 'network') {
        // showNetworkNotification((langs[lang]||langs['en']).noInternet || 'There may be no internet connection — cannot check for updates');
        setUpdateStatusUI(statusEl, (langs[lang]||langs['en']).couldNotCheck || 'Could not check for updates. Try again later.', 'muted');
        return;
      }
      setUpdateStatusUI(statusEl, (langs[lang]||langs['en']).couldNotCheck || 'Could not check for updates. Try again later.', 'muted');
      return;
    }

    const j = apiRes.json || {};
    const latestTag = String(j.tag_name || j.name || '');
    const latestUrl = j.html_url || (`https://github.com/k3fya/AppVault/releases${latestTag ? '/tag/' + encodeURIComponent(latestTag) : ''}`);
    const latestVer = normalizeSemverStr(latestTag);
    const currentVer = normalizeSemverStr((app && app.version) ? app.version : (data.settings && data.settings.version) || '');

    if (!latestVer) {
      const msg = (langs[lang]||langs['en']).noReleasesFound || 'No releases found.';
      setUpdateStatusUI(statusEl, msg, 'muted');
      return;
    }

    const cmp = compareVersions(latestVer, currentVer);
    if (cmp === 0) {
      const txt = (langs[lang]||langs['en']).latestInstalled || 'You have the latest version of the application';
      setUpdateStatusUI(statusEl, txt, 'ok');
    } else if (cmp > 0) {
      let majorDiff = 0;
      const semver = getSemverLib();
      if (semver && semver.valid(latestVer) && semver.valid(currentVer)) {
        try { majorDiff = semver.major(latestVer) - semver.major(currentVer); } catch(e){ majorDiff = 0; }
      } else {
        const lp = (latestVer||'0.0.0').split('.').map(n=>parseInt(n||'0',10) || 0);
        const cp = (currentVer||'0.0.0').split('.').map(n=>parseInt(n||'0',10) || 0);
        majorDiff = (lp[0]||0) - (cp[0]||0);
      }

      if (majorDiff >= 2) {
        const tpl = (langs[lang]||langs['en']).updateRecommended || 'Recommended update available — download it {0}';
        const link = `<a href="${latestUrl}" target="_blank" rel="noopener noreferrer">here</a>`;
        setUpdateStatusUI(statusEl, tpl.replace('{0}', link), 'recommended');
      } else {
        const tpl = (langs[lang]||langs['en']).updateAvailable || 'Update available — download it {0}';
        const link = `<a href="${latestUrl}" target="_blank" rel="noopener noreferrer">here</a>`;
        setUpdateStatusUI(statusEl, tpl.replace('{0}', link), 'available');
      }
    } else {
      const txt = (langs[lang]||langs['en']).latestInstalled || 'You have the latest version of the application';
      setUpdateStatusUI(statusEl, txt, 'ok');
    }

  } catch (err) {
    console.warn('unexpected error in checkForUpdatesAndUpdateUI:', err);
    setUpdateStatusUI(statusEl, (langs[lang]||langs['en']).couldNotCheck || 'Could not check for updates. Try again later.', 'muted');
  }
}

// -------------------------------------------- probably not stable

function showRestartNotification() {
  const existing = document.querySelector('.restart-notification');
  if (existing) {
    existing.remove();
  }

  const container = document.getElementById('globalNotifications');
  if (!container) {
    console.warn('Global notifications container not found');
    return;
  }

  const notif = document.createElement('div');
  notif.className = 'restart-notification';

  const textEl = document.createElement('span');
  textEl.className = 'restart-text';
  textEl.textContent = (langs[lang] || langs['en'])?.notifyMsg || 'Please restart the application to apply changes';

  const restartBtn = document.createElement('button');
  restartBtn.className = 'restart-btn';
  restartBtn.type = 'button';
  restartBtn.textContent = (langs[lang] || langs['en'])?.restartBtn || 'Restart';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'restart-close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', (langs[lang] || langs['en'])?.close || 'Close');

  const closeIcon = document.createElement('img');
  closeIcon.className = 'restart-close-icon';
  closeIcon.src = '../assets/icons/cross.svg';
  closeBtn.prepend(closeIcon);

  notif.appendChild(textEl);
  notif.appendChild(restartBtn);
  notif.appendChild(closeBtn);
  container.appendChild(notif);

  requestAnimationFrame(() => {
    notif.classList.add('visible');
  });

  restartBtn.onclick = async (e) => {
    e.stopPropagation();
    try {
      if (window.api && typeof window.api.restartApp === 'function') {
        await window.api.restartApp();
      } else {
        // fallback
        try {
          const { app } = require('electron').remote || require('@electron/remote');
          app.relaunch();
          app.exit(0);
        } catch (err) {
          console.error('Restart fallback failed', err);
          notif.classList.add('hiding');
          setTimeout(() => notif.remove(), 300);
        }
      }
    } catch (err) {
      console.error('Restart failed:', err);
      notif.classList.add('hiding');
      setTimeout(() => notif.remove(), 300);
    }
  };

  closeBtn.onclick = (e) => {
    e.stopPropagation();
    notif.classList.add('hiding');
    setTimeout(() => {
      if (notif.parentNode) notif.parentNode.removeChild(notif);
    }, 300);
  };
}

export function openSettingsModal() {
  if (!modalOverlay || !modalWindow || !settingsSidebar || !settingsContent) {
    console.warn('Settings modal elements missing');
    return;
  }

  function localizeSettingsModal() {
    const sidebarItems = settingsSidebar.querySelectorAll('.settings-sidebar-item');
    if (sidebarItems && sidebarItems.length >= 3) {
      const s0 = sidebarItems[0].querySelector('.sb-text');
      const s1 = sidebarItems[1].querySelector('.sb-text');
      const s2 = sidebarItems[2].querySelector('.sb-text');

      if (s0) s0.textContent = (langs[lang]||langs['en']).settingsMain || 'Main';
      if (s1) s1.textContent = (langs[lang]||langs['en']).appearance || 'Appearance';
      if (s2) s2.textContent = (langs[lang]||langs['en']).abtProgramTitle || 'About the app';
    }

    const statusTextEl = settingsStatus ? settingsStatus.querySelector('.status-text') : null;
    if (statusTextEl) statusTextEl.textContent = (langs[lang]||langs['en']).settingsSaved || 'Changes saved';
  }

  data.settings = data.settings || {};

  settingsContent.querySelectorAll('.settings-panel')?.forEach(n => n.remove());

  const panel_main = document.createElement('div');
  panel_main.className = 'settings-panel';
  panel_main.dataset.panel = 'main';
  panel_main.innerHTML = `
    <div class="panel-inner">
      <h3 class="panel-title">
        ${(langs[lang]||langs['en']).programLaunch || 'Program launch'}
      </h3>
      <div class="panel-row">
        <div class="panel-left">
          <div class="row-title">
            ${(langs[lang]||langs['en']).startWithSystemLabel || 'Start with system'}
          </div>
          <div class="row-desc">
            ${(langs[lang]||langs['en']).startWithSystemDesc || 'The application will start automatically when the system starts up'}
          </div>
        </div>
        <div class="panel-right">
          <input id="s_toggle_startWithSystem" type="checkbox" ${data.settings.startWithSystem ? 'checked' : ''} />
          <label for="s_toggle_startWithSystem" class="toggle"></label>
        </div>
      </div>
      
      <hr class="panel-sep" />

      <div class="panel-row">
        <div class="panel-left">
          <div class="row-title">
            ${(langs[lang]||langs['en']).trayOnCloseLabel || 'Minimize to tray on close'}
          </div>
          <div class="row-desc">
            ${(langs[lang]||langs['en']).trayOnCloseDesc || 'The application will continue to run in the system tray when the window is closed'}
          </div>
        </div>
        <div class="panel-right">
          <input id="s_toggle_trayOnClose" type="checkbox" ${data.settings.trayOnClose ? 'checked' : ''} />
          <label for="s_toggle_trayOnClose" class="toggle"></label>
        </div>
      </div>
    </div>
  `;

  const panel_discord = document.createElement('div');
  panel_discord.className = 'settings-panel';
  panel_discord.dataset.panel = 'discord';
  panel_discord.innerHTML = `
    <div class="panel-inner">
      <h3 class="panel-title">
        ${(langs[lang]||langs['en']).discordTitle || 'Discord status'}
      </h3>
      <div class="panel-row">
        <div class="panel-left">
          <div class="row-title">
            ${(langs[lang]||langs['en']).discordLabel || 'Displaying discord rich presence'}
          </div>
          <div class="row-desc">
            ${(langs[lang]||langs['en']).discordDesc || 'Allows the application to display discord rich presence on your profile'}
          </div>
        </div>
        <div class="panel-right">
          <input id="s_toggle_showDiscordStatus" type="checkbox" ${data.settings.showDiscordStatus ? 'checked' : ''} />
          <label for="s_toggle_showDiscordStatus" class="toggle"></label>
        </div>
      </div>
    </div>
  `;

  const panel_hotkey = document.createElement('div');
  panel_hotkey.className = 'settings-panel';
  panel_hotkey.dataset.panel = 'hotkey';
  panel_hotkey.innerHTML = `
    <div class="panel-inner">
      <h3 class="panel-title">
        ${(langs[lang]||langs['en']).hotkeyTitle || 'Quick Launch window'}
      </h3>
      <div class="panel-row">
        <div class="panel-left">
          <div class="row-title">
            ${(langs[lang]||langs['en']).hotkeyLabel || 'Show Quick Launch window'}
          </div>
          <div class="row-desc">
            ${(langs[lang]||langs['en']).hotkeyDesc || 'Key combination that will bring up the window'}
          </div>
        </div>
        <div class="panel-right hotkey-control">
          <div id="hotkeyInput" class="hotkey-input" tabindex="0" role="textbox" contenteditable="false"></div>

          <button id="hotkeyResetBtn" class="hotkey-reset-btn" type="button" aria-label="${(langs[lang]||langs['en']).hotkeyClear || 'Reset to default'}">
            <img src="../assets/icons/reset.svg" alt="Reset">
          </button>
        </div>
      </div>
    </div>
  `;
  if (!(data.settings && data.settings.trayOnClose)) {
    panel_hotkey.classList.add('settings-panel--hidden');
    panel_hotkey.setAttribute('aria-hidden', 'true');
  }

  const panel_data = document.createElement('div');
  panel_data.className = 'settings-panel';
  panel_data.dataset.panel = 'data';
  panel_data.innerHTML = `
    <div class="panel-inner">
      <h3 class="panel-title">
        ${(langs[lang]||langs['en']).dataTitle || 'Data'}
      </h3>
      <div class="panel-row plain">
        <div class="panel-left">
          <div class="row-title">
            ${(langs[lang]||langs['en']).backupsLabel || 'Backups and recovery'}
          </div>
          <div class="row-desc">
            ${(langs[lang]||langs['en']).backupsDesc || 'Export, import data, or perform a full reset'}
          </div>
          <div class="actions-group">
            <button id="btnExport" class="action-btn">
              <img src="../assets/icons/export.svg" alt="">
              ${(langs[lang]||langs['en']).exportData || 'Export'}
            </button>
            <button id="btnImport" class="action-btn">
              <img src="../assets/icons/import.svg" alt="">
              ${(langs[lang]||langs['en']).importData || 'Import'}
            </button>
            <button id="btnReset"  class="action-btn">
              <img src="../assets/icons/reset.svg" alt="">
              ${(langs[lang]||langs['en']).resetSections || 'Reset'}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  const panel_language = document.createElement('div');
  panel_language.className = 'settings-panel';
  panel_language.dataset.panel = 'appearance-language';
  panel_language.innerHTML = `
    <div class="panel-inner">
      <h3 class="panel-title">
        ${(langs[lang]||langs['en']).l10nTitle || 'Localization'}
      </h3>
      <div class="panel-row">
        <div class="panel-left">
          <div class="row-title">
            ${(langs[lang]||langs['en']).l10nLabel || 'Interface language'}
          </div>
          <div class="row-desc">
            ${(langs[lang]||langs['en']).l10nDesc || 'Select your preferred language for the program interface'}
          </div>
        </div>
        <div class="panel-right">
          <div id="langDropdown" class="lang-dropdown">
            <div class="dropdown-toggle" tabindex="0">
              <img src="../assets/icons/arrow.svg" class="dropdown-icon" aria-hidden="true" />
              <span class="dropdown-label"></span>
            </div>
            <div class="dropdown-menu" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const panel_theme = document.createElement('div');
  panel_theme.className = 'settings-panel';
  panel_theme.dataset.panel = 'appearance-theme';
  panel_theme.innerHTML = `
    <div class="panel-inner">
      <h3 class="panel-title">
        ${(langs[lang]||langs['en']).themeTitle || 'Interface theme'}
      </h3>
      <div class="panel-row">
        <div class="panel-left">
          <div class="row-title">
            ${(langs[lang]||langs['en']).themeLabel || 'Main theme'}
          </div>
          <div class="row-desc">
            ${(langs[lang]||langs['en']).themeDesc || 'Choose the main color scheme for AppVault'}
          </div>
        </div>
        <div class="panel-right">
          <div id="themeDropdown" class="theme-dropdown">
            <div class="dropdown-toggle" tabindex="0">
              <img src="../assets/icons/arrow.svg" class="dropdown-icon" aria-hidden="true" />
              <span class="dropdown-label"></span>
            </div>
            <div class="dropdown-menu" aria-hidden="true"></div>
          </div>
        </div>
      </div>

      <hr class="panel-sep" />

      <!-- Scale setting -->
      <div class="panel-row">
        <div class="panel-left">
          <div class="row-title">${(langs[lang]||langs['en']).scaleTitle || 'UI scale'}</div>
          <div class="row-desc">${(langs[lang]||langs['en']).scaleDesc || 'Adjust program interface scale'}</div>
        </div>
        <div class="panel-right">
          <div id="scaleDropdown" class="scale-dropdown">
            <div class="dropdown-toggle" tabindex="0">
              <img src="../assets/icons/arrow.svg" class="dropdown-icon" aria-hidden="true" />
              <span class="dropdown-label"></span>
            </div>
            <div class="dropdown-menu" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const panel_shortcuts = document.createElement('div');
  panel_shortcuts.className = 'settings-panel';
  panel_shortcuts.dataset.panel = 'appearance-shortcuts';
  panel_shortcuts.innerHTML = `
    <div class="panel-inner">
      <h3 class="panel-title">
        ${(langs[lang]||langs['en']).shortcutsTitle || 'Shortcut layout'}
      </h3>
      <div class="panel-row">
        <div class="panel-left">
          <div class="row-title">
            ${(langs[lang]||langs['en']).shortcutsLabel || 'Display mode'}
          </div>
          <div class="row-desc">
            ${(langs[lang]||langs['en']).shortcutsDesc || 'Choose how shortcuts are visually arranged'}
          </div>
        </div>
        <div class="panel-right">
          <div id="shortcutsDropdown" class="shortcuts-dropdown">
            <div class="dropdown-toggle" tabindex="0">
              <img src="../assets/icons/arrow.svg" class="dropdown-icon" aria-hidden="true" />
              <span class="dropdown-label"></span>
            </div>
            <div class="dropdown-menu" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const panel_sidebar_position = document.createElement('div');
  panel_sidebar_position.className = 'settings-panel';
  panel_sidebar_position.dataset.panel = 'appearance-sidebar';
  panel_sidebar_position.innerHTML = `
    <div class="panel-inner">
      <h3 class="panel-title">
        ${(langs[lang]||langs['en']).sidebarPositionTitle || 'Sidebar position'}
      </h3>
      <div class="panel-row">
        <div class="panel-left">
          <div class="row-title">
            ${(langs[lang]||langs['en']).sidebarPositionLabel || 'Position'}
          </div>
          <div class="row-desc">
            ${(langs[lang]||langs['en']).sidebarPositionDesc || 'Choose where the sidebar appears'}
          </div>
        </div>
        <div class="panel-right">
          <div id="sidebarPositionDropdown" class="sidebar-pos-dropdown">
            <div class="dropdown-toggle" tabindex="0">
              <img src="../assets/icons/arrow.svg" class="dropdown-icon" aria-hidden="true" />
              <span class="dropdown-label"></span>
            </div>
            <div class="dropdown-menu" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const panel_about = document.createElement('div');
  panel_about.className = 'settings-panel';
  panel_about.dataset.panel = 'about';
  panel_about.innerHTML = `
    <div class="panel-inner">
      <div class="about-header">
        <h3 class="panel-title">${(langs[lang]||langs['en']).aboutTitle || 'Application info'}</h3>
        <img src="../assets/avlogo.png" alt="${ (app && app.name) || 'AppVault' }" class="about-app-icon" />
      </div>

      <div class="about-grid" role="group" aria-label="${ (langs[lang]||langs['en']).abtProgramTitle || 'About the app' }">
        <div class="about-row">
          <div class="row-label">${(langs[lang]||langs['en']).appNameLabel || 'Application'}</div>
          <div class="row-value">${ (app && app.name) || 'AppVault' }</div>
        </div>

        <div class="about-row">
          <div class="row-label">${(langs[lang]||langs['en']).versionLabel || 'Version'}</div>
          <div class="row-value">${ (app && app.version) || '0.2.0' }</div>
        </div>

        <div class="about-row">
          <div class="row-label">${(langs[lang]||langs['en']).electronLabel || 'Electron'}</div>
          <div class="row-value">${ (app && app.electronVersion) || '26.0.0' }</div>
        </div>

        <div class="about-row">
          <div class="row-label">${(langs[lang]||langs['en']).websiteLabel || 'GitHub Repo'}</div>
          <div class="row-value">
            <a id="appRepoLink" class="app-info-link" href="${ (app && app.gitRepositoryLink) || 'https://github.com/k3fya/AppVault' }">
              ${ (app && app.gitRepositoryLink) || 'https://github.com/k3fya/AppVault' }
            </a>
          </div>
        </div>

        <div class="about-row">
          <div class="row-label">${(langs[lang]||langs['en']).supportLabel || 'Support'}</div>
          <div class="row-value">
            <a id="supportLink" class="app-info-link" href="${ (app && app.supportLink) || 'https://discord.gg/DDJvjdnJ8t' }">
              ${ (app && app.supportLink) || 'https://discord.gg/DDJvjdnJ8t' }
            </a>
          </div>
        </div>
      </div>
    </div>
  `;

  const panel_update = document.createElement('div');
  panel_update.className = 'settings-panel';
  panel_update.dataset.panel = 'update';
  panel_update.innerHTML = `
    <div class="panel-inner">
      <h3 class="panel-title">
        ${(langs[lang]||langs['en']).updatesTitle || 'Updates'}
      </h3>

      <div class="panel-row">
        <div class="panel-left">
          <div class="row-title">
            ${(langs[lang]||langs['en']).updatesLabel || 'Check for updates'}
          </div>
          <div class="row-desc">
            ${(langs[lang]||langs['en']).updatesDesc || 'Check for a new version of the app'}
          </div>
        </div>
        <div class="panel-right">
          <button id="btnCheckUpdates" class="action-btn" type="button">
            <img src="../assets/icons/check.svg" alt="">
            ${(langs[lang]||langs['en']).updatesCheck || 'Check'}
          </button>
        </div>
      </div>

      <hr class="panel-sep" />

      <div class="panel-row">
        <div class="panel-left" style="width:100%;">
          <div class="update-info-box" role="status" aria-live="polite">
            <div class="last-check" id="updLastCheck">
              ${(langs[lang]||langs['en']).updatesLastCheck || 'Last check: {date}'}
            </div>
            <div class="update-status" id="updStatus">
              ${(langs[lang]||langs['en']).latestInstalled || 'You have the latest version of the application'}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Append panels
  settingsContent.appendChild(panel_main);
  settingsContent.appendChild(panel_discord);
  settingsContent.appendChild(panel_hotkey);
  settingsContent.appendChild(panel_data);
  settingsContent.appendChild(panel_language);
  settingsContent.appendChild(panel_theme);
  settingsContent.appendChild(panel_shortcuts);
  settingsContent.appendChild(panel_sidebar_position);
  settingsContent.appendChild(panel_about);
  settingsContent.appendChild(panel_update);

  // ----------------- helper for last-check text -----------------
  function renderLastCheckText(ts) {
    const langObj = (typeof langs === 'object' && langs[lang]) ? langs[lang] : (langs && langs['en']) ? langs['en'] : null;
    const tpl = (langObj && langObj.updatesLastCheck) ? String(langObj.updatesLastCheck) : 'Last check: {date}';

    if (!ts) {
      const dateStrEmpty = '— — — — —';
      if (/\{ ?date ?\}/i.test(tpl)) return tpl.replace(/\{ ?date ?\}/ig, dateStrEmpty);
      if (/\{ ?0 ?\}/.test(tpl)) return tpl.replace(/\{ ?0 ?\}/g, dateStrEmpty);
      if (/%s/.test(tpl)) return tpl.replace(/%s/g, dateStrEmpty);
      return `${tpl} ${dateStrEmpty}`;
    }

    const d = (ts instanceof Date) ? ts : (isNaN(Number(ts)) ? new Date(String(ts)) : new Date(Number(ts)));
    if (!d || isNaN(d.getTime())) {
      const dateStrEmpty = '— — — — —';
      if (/\{ ?date ?\}/i.test(tpl)) return tpl.replace(/\{ ?date ?\}/ig, dateStrEmpty);
      if (/\{ ?0 ?\}/.test(tpl)) return tpl.replace(/\{ ?0 ?\}/g, dateStrEmpty);
      if (/%s/.test(tpl)) return tpl.replace(/%s/g, dateStrEmpty);
      return `${tpl} ${dateStrEmpty}`;
    }

    const pad2 = (n) => (n < 10 ? '0' + n : String(n));
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const dateISO = `${yyyy}-${mm}-${dd}`;

    const isEnglish = typeof lang === 'string' && /^en\b/i.test(lang);
    let dateStr;
    if (isEnglish) {
      const time12 = d.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const m = time12.match(/\s?(AM|PM)$/i);
      const ampm = m ? m[1].toUpperCase() : '';
      const timeNoAmPm = time12.replace(/\s?(AM|PM)$/i, '').trim();
      dateStr = `${dateISO}, ${timeNoAmPm}` + (ampm ? ` (${ampm})` : '');
    } else {
      const hh = pad2(d.getHours());
      const mi = pad2(d.getMinutes());
      const ss = pad2(d.getSeconds());
      dateStr = `${dateISO}, ${hh}:${mi}:${ss}`;
    }

    if (/\{ ?date ?\}/i.test(tpl)) return tpl.replace(/\{ ?date ?\}/ig, dateStr);
    if (/\{ ?0 ?\}/.test(tpl)) return tpl.replace(/\{ ?0 ?\}/g, dateStr);
    if (/%s/.test(tpl)) return tpl.replace(/%s/g, dateStr);

    return `${tpl} ${dateStr}`;
  }

  // ----------------- init update panel UI -----------------
  (function initUpdatePanelUI() {
    const btn = document.getElementById('btnCheckUpdates');
    const lastEl = document.getElementById('updLastCheck');
    const statusEl = document.getElementById('updStatus');

    const ts = data.settings && data.settings.latestUpdateCheck;
    if (lastEl) lastEl.textContent = renderLastCheckText(ts);
    if (statusEl) {
      statusEl.classList.add('update-status');
      const savedText = data.settings && data.settings.updateStatusText;
      const savedClass = data.settings && data.settings.updateStatusClass;
      if (savedText) {
        statusEl.innerHTML = savedText;
        if (savedClass) statusEl.classList.add(savedClass);
      } else {
        statusEl.textContent = (langs[lang]||langs['en']).latestInstalled || 'You have the latest version of the app';
      }
    }

    if (btn) {
      btn.onclick = async (ev) => {
        ev?.preventDefault();

        const now = Date.now();
        data.settings = data.settings || {};
        data.settings.latestUpdateCheck = now;

        try {
          if (typeof immediateSettingsSave === 'function') {
            await immediateSettingsSave();
          } else if (window.api && typeof window.api.saveData === 'function') {
            await window.api.saveData(data);
          } else if (typeof save === 'function') {
            const maybe = save();
            if (maybe && typeof maybe.then === 'function') await maybe;
          }
        } catch (e) {
          console.warn('Saving latestUpdateCheck failed', e);
        }

        if (lastEl) lastEl.textContent = renderLastCheckText(now);

        try {
          await checkForUpdatesAndUpdateUI(statusEl);
        } catch (e) {
          console.warn('checkForUpdatesAndUpdateUI failed', e);
        }
      };
    }
  })();

  Array.from(settingsContent.querySelectorAll('.settings-panel')).forEach(p => p.style.display = 'none');
  panel_main.style.display = 'block';
  panel_discord.style.display = 'block';
  if (data.settings && data.settings.trayOnClose) {
    panel_hotkey.style.display = 'block';
    panel_hotkey.removeAttribute('aria-hidden');
    panel_hotkey.classList.remove('settings-panel--disabled');
  } else {
    panel_hotkey.style.display = 'none';
    panel_hotkey.setAttribute('aria-hidden', 'true');
    panel_hotkey.classList.add('settings-panel--disabled');
  }
  panel_data.style.display = 'block';

  // reset sidebar active
  const sidebarItems = Array.from(settingsSidebar.querySelectorAll('.settings-sidebar-item'));
  sidebarItems.forEach(si => si.classList.remove('active'));
  const firstSide = sidebarItems[0];
  if (firstSide) firstSide.classList.add('active');

  // update header title & close
  settingsTitle.textContent = (langs[lang]||langs['en']).mainSettings || 'Main settings';
  settingsClose.onclick = closeSettingsModal;

  sidebarItems.forEach(item => {
    item.onclick = () => {
      sidebarItems.forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      const tab = item.dataset.tab;
      // hide all
      Array.from(settingsContent.querySelectorAll('.settings-panel')).forEach(p => p.style.display = 'none');
      if (tab === 'main') {
        panel_main.style.display = 'block';
        panel_discord.style.display = 'block';
        panel_hotkey.style.display = 'block';
        panel_data.style.display = 'block';
        settingsTitle.textContent = (langs[lang]||langs['en']).mainSettings || 'Main settings';
      } else if (tab === 'appearance') {
        panel_language.style.display = 'block';
        panel_theme.style.display = 'block';
        panel_shortcuts.style.display = 'block';
        panel_sidebar_position.style.display = 'block';
        settingsTitle.textContent = (langs[lang]||langs['en']).appearance || 'Appearance';
      } else if (tab === 'about') {
        panel_about.style.display = 'block';
        panel_update.style.display = 'block';
        settingsTitle.textContent = (langs[lang]||langs['en']).abtProgramTitle || 'About the app';
      }
    };
    item.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); } };
  });

  // ------------- Dropdowns & UI wiring -------------
  const langNamesFallback = { en: 'English', ru: 'Русский' };

  function getLangLabel(code) {
    try {
      if (typeof langs === 'object' && langs[code]) {
        return langs[code].nativeName || langs[code].name || langNamesFallback[code] || code;
      }
    } catch (e) {}
    return langNamesFallback[code] || code;
  }

  function currentLangCode() {
    return data.settings?.lang || lang || 'en';
  }

  async function immediateSettingsSave() {
    const statusEl = document.getElementById('settingsStatus') || settingsStatus;
    try {
      if (window.api && typeof window.api.saveData === 'function') {
        await window.api.saveData(data);
      } else if (typeof save === 'function') {
        const maybe = save();
        if (maybe && typeof maybe.then === 'function') await maybe;
      }

      if (statusEl) {
        statusEl.classList.add('visible');
        statusEl.hidden = false;
        clearTimeout(immediateSettingsSave._t);
        immediateSettingsSave._t = setTimeout(() => {
          statusEl.classList.remove('visible');
          setTimeout(()=>{ if (statusEl) statusEl.hidden = true; }, 350);
        }, 1000);
      }
    } catch (err) {
      console.warn('immediateSettingsSave failed', err);
    }
  }

  // ---------- Hotkey settings ----------
  (function initHotkeyControl() {
    const inputEl = document.getElementById('hotkeyInput');
    const resetBtn = document.getElementById('hotkeyResetBtn');
    if (!inputEl || !resetBtn) return;
    
    const resetBtnTooltip = (langs[lang] || langs['en']).hotkeyResetBtn || 'Reset key combination';
    resetBtn.setAttribute('aria-label', resetBtnTooltip);
    tooltipTitle(resetBtnTooltip)(resetBtn);

    const DEFAULT_HOTKEY = 'Super+Shift+D';
    let currentSequence = []; // ['Super','Shift','D']
    let isRecording = false;
    let tooltipEl = null;
    let _tooltipAutoHideTimer = null;
    let _lastAvailabilityCheckToken = 0;
    let _lastCheckAvailable = true;

    function keyToDisplay(key) {
      if (key === 'Super') return 'Win';
      if (key === 'Control') return 'Ctrl';
      if (key === ' ') return 'Space';
      return key;
    }

    function parseHotkey(str) {
      return str ? String(str).split('+') : [];
    }

    function comboToAccelerator(arr) {
      if (!Array.isArray(arr)) return '';
      return arr.join('+');
    }

    function comboToDisplay(arr) {
      if (!Array.isArray(arr)) return '';
      return arr.map(k => keyToDisplay(k)).join(' + ');
    }

    function isValidFinalKey(k) {
      if (!k) return false;
      if (k === ' ') return true;
      if (/^F([1-9]|1[0-2])$/.test(k)) return true;
      if (/^[A-Z0-9]$/.test(k)) return true;
      return false;
    }

    // tooltip helpers
    function showTooltip(message, target = inputEl, autoHideMs = 0) {
      if (_tooltipAutoHideTimer) { clearTimeout(_tooltipAutoHideTimer); _tooltipAutoHideTimer = null; }
      if (tooltipEl) { try { tooltipEl.remove(); } catch(e){} tooltipEl = null; }

      tooltipEl = document.createElement('div');
      tooltipEl.className = 'hotkey-tooltip';
      tooltipEl.textContent = message;
      document.body.appendChild(tooltipEl);

      const tooltipRect = tooltipEl.getBoundingClientRect();
      const targetRect = (target && target.getBoundingClientRect) ? target.getBoundingClientRect() : { left: 8, top: 8, width: 0 };

      const left = Math.max(
        8,
        targetRect.left + targetRect.width / 2 - tooltipRect.width / 2
      );
      const top = Math.max(8, targetRect.top - tooltipRect.height - 8);

      tooltipEl.style.left = left + 'px';
      tooltipEl.style.top = top + 'px';

      requestAnimationFrame(() => {
        tooltipEl.style.opacity = '1';
        tooltipEl.style.transform = 'scale(1)';
      });

      if (autoHideMs && autoHideMs > 0) {
        _tooltipAutoHideTimer = setTimeout(() => { _tooltipAutoHideTimer = null; hideTooltip(); }, autoHideMs);
      }
    }

    function hideTooltip() {
      if (_tooltipAutoHideTimer) { clearTimeout(_tooltipAutoHideTimer); _tooltipAutoHideTimer = null; }
      if (!tooltipEl) return;
      tooltipEl.style.opacity = '0';
      tooltipEl.style.transform = 'scale(0.98)';
      const onTransitionEnd = function (ev) {
        if (ev.target !== tooltipEl) return;
        tooltipEl.removeEventListener('transitionend', onTransitionEnd);
        try { tooltipEl.remove(); } catch (e) {}
        tooltipEl = null;
      };
      tooltipEl.addEventListener('transitionend', onTransitionEnd);
      setTimeout(() => { if (tooltipEl) { try { tooltipEl.remove(); } catch(e){} tooltipEl = null; } }, 700);
    }

    document.addEventListener('app:hotkeyPanelHidden', () => {
      if (isRecording) {
        stopRecording();
        try { hideTooltip(); } catch (e) { /* ignore */ }
        currentSequence = parseHotkey((data.settings && data.settings.hotkey) || DEFAULT_HOTKEY);
        renderDisplay();
      }
    });

    function renderDisplay() {
      inputEl.innerHTML = '';
      if (!currentSequence || currentSequence.length < 3 || !isValidFinalKey(currentSequence[2])) {
        inputEl.classList.add('placeholder');
        inputEl.setAttribute('data-placeholder', (langs[lang] || langs['en']).hotkeyPlaceholderWin || 'Press Win key');
      } else {
        inputEl.classList.remove('placeholder');
        inputEl.removeAttribute('data-placeholder');
      }

      if (!currentSequence) currentSequence = [];
      currentSequence = currentSequence.slice(0, 3);

      currentSequence.forEach(key => {
        const k = document.createElement('span');
        k.className = 'key';
        k.textContent = keyToDisplay(key);
        inputEl.appendChild(k);
      });
    }

    async function checkAcceleratorAvailability(arr) {
      const token = ++_lastAvailabilityCheckToken;
      const accel = comboToAccelerator(arr);
      if (!accel) {
        _lastCheckAvailable = false;
        return { available: false, error: 'invalid' };
      }

      try {
        if (!window.api || typeof window.api.testHotkey !== 'function') {
          _lastCheckAvailable = true;
          return { available: true };
        }
        const res = await window.api.testHotkey(accel); // { available: true/false, error? }
        if (token !== _lastAvailabilityCheckToken) {
          return { available: false, stale: true };
        }
        _lastCheckAvailable = !!(res && res.available);
        return res || { available: false };
      } catch (e) {
        _lastCheckAvailable = false;
        return { available: false, error: String(e) };
      }
    }

    async function saveHotkey() {
      if (!(currentSequence && currentSequence.length === 3 && isValidFinalKey(currentSequence[2]))) {
        return;
      }

      const check = await checkAcceleratorAvailability(currentSequence);
      if (!check || !check.available) {
        const msg = (langs && (langs[lang]||langs['en']) && (langs[lang]||langs['en']).hotkeyTaken) ?
                      (langs[lang]||langs['en']).hotkeyTaken :
                      'This hotkey is already taken';
        showTooltip(msg, inputEl, 2000);
        return;
      }

      const accel = comboToAccelerator(currentSequence);
      data.settings = data.settings || {};
      data.settings.hotkey = accel;
      try {
        if (typeof immediateSettingsSave === 'function') await immediateSettingsSave();
        else if (window.api && typeof window.api.saveData === 'function') await window.api.saveData(data);
      } catch (e) {
        console.warn('Hotkey save failed', e);
      }

      const displayCombo = comboToDisplay(currentSequence);
      const savedMsgTemplate = (langs && (langs[lang]||langs['en']) && (langs[lang]||langs['en']).hotkeySavedMsg)
        ? (langs[lang]||langs['en']).hotkeySavedMsg.replace('{hotkey}', displayCombo)
        : `Saved: ${displayCombo}`;

      showTooltip(savedMsgTemplate, inputEl, 1500);
      stopRecording();
    }

    function startRecording() {
      if (isRecording) return;
      isRecording = true;
      currentSequence = ['Super', 'Shift'];
      renderDisplay();
      inputEl.classList.add('recording');
      inputEl.focus();
      showTooltip((langs[lang] || langs['en']).hotkeyPlaceholderFinal || 'Press any key (A–Z, 0–9, F1–F12)', inputEl);
      document.addEventListener('keydown', onKeyDown, true);
    }

    function stopRecording() {
      if (!isRecording) return;
      isRecording = false;
      inputEl.classList.remove('recording');
      document.removeEventListener('keydown', onKeyDown, true);
    }

    // -- main onKeyDown --
    async function onKeyDown(ev) {
      if (!isRecording) return;
      ev.preventDefault();
      ev.stopPropagation();

      if (ev.key === 'Backspace') {
        if (currentSequence.length >= 3) {
          currentSequence = currentSequence.slice(0, 2);
          renderDisplay();
          showTooltip((langs[lang] || langs['en']).hotkeyPlaceholderFinal || 'Press any key (A–Z, 0–9, F1–F12)', inputEl);
        } else {
          currentSequence = ['Super', 'Shift'];
          renderDisplay();
          showTooltip((langs[lang] || langs['en']).hotkeyPlaceholderFinal || 'Press any key (A–Z, 0–9, F1–F12)', inputEl);
        }
        return;
      }

      if (ev.key === 'Enter') {
        if (currentSequence && currentSequence.length === 3 && isValidFinalKey(currentSequence[2])) {
          await saveHotkey();
        } else {
          // ignore Enter
        }
        return;
      }

      let mainKey = null;
      const code = ev.code || '';

      if (/^Key[A-Z]$/.test(code)) mainKey = code.slice(3);
      else if (/^Digit[0-9]$/.test(code)) mainKey = code.slice(5);
      else if (/^F([1-9]|1[0-2])$/.test(code)) mainKey = code.match(/^F([1-9]|1[0-2])$/)[0];
      else if (code === 'Space' || ev.key === ' ') mainKey = ' ';

      if (!mainKey && ev.key && ev.key.length === 1) {
        const ch = ev.key.toUpperCase();
        if (/^[A-Z0-9]$/.test(ch)) mainKey = ch;
      }

      if (!mainKey) {
        showTooltip((langs[lang] || langs['en']).hotkeyInvalidFinal || 'Unsupported key. Use A–Z, 0–9 or F1–F12.', inputEl);
        return;
      }

      currentSequence = [ 'Super', 'Shift', mainKey ];
      renderDisplay();

      showTooltip((langs[lang] || langs['en']).hotkeyChecking || 'Checking availability...', inputEl);
      const check = await checkAcceleratorAvailability(currentSequence);

      if (check && check.available) {
        showTooltip((langs[lang] || langs['en']).hotkeyPressEnter || 'Press Enter to save', inputEl);
      } else {
        const msg = (langs && (langs[lang]||langs['en']) && (langs[lang]||langs['en']).hotkeyTaken) ?
                      (langs[lang]||langs['en']).hotkeyTaken :
                      'This hotkey is already taken';
        showTooltip(msg, inputEl, 2500);
      }
    }

    try {
      // parse expected format like 'Super+Shift+D'
      currentSequence = parseHotkey((data.settings && data.settings.hotkey) || DEFAULT_HOTKEY);
    } catch (e) {
      currentSequence = parseHotkey(DEFAULT_HOTKEY);
    }
    currentSequence = currentSequence.slice(0, 3);
    renderDisplay();

    // UI events
    inputEl.addEventListener('click', (ev) => { ev.stopPropagation(); startRecording(); });

    resetBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      data.settings = data.settings || {};
      data.settings.hotkey = DEFAULT_HOTKEY;
      currentSequence = parseHotkey(DEFAULT_HOTKEY);
      renderDisplay();
      try {
        if (typeof immediateSettingsSave === 'function') immediateSettingsSave();
        else if (window.api && typeof window.api.saveData === 'function') window.api.saveData(data);
      } catch (e) { console.warn('Hotkey reset save failed', e); }
    });

    document.addEventListener('click', (ev) => {
      if (!inputEl.contains(ev.target) && ev.target !== resetBtn) {
        if (isRecording) {
          stopRecording();
          hideTooltip();
          currentSequence = parseHotkey((data.settings && data.settings.hotkey) || DEFAULT_HOTKEY);
          renderDisplay();
        }
      }
    });
  })();

  // ---------- Language dropdown ----------
  (function initLangDropdown() {
    const root = document.getElementById('langDropdown');
    if (!root) return;
    const toggle = root.querySelector('.dropdown-toggle') || root;

    setToggleLabel(root, getLangLabel(currentLangCode()));

    function buildAndOpen() {
      const available = Object.keys((typeof langs === 'object' && langs) ? langs : { en: {} });
      openFloatingDropdown(root, (menu) => {
        available.forEach(code => {
          const label = getLangLabel(code);
          const btn = document.createElement('button');
          btn.className = 'context-item';
          btn.type = 'button';
          btn.textContent = label;
          btn.tabIndex = 0;
          const isSelected = (code === currentLangCode());
          if (isSelected) {
            btn.setAttribute('aria-selected', 'true');
            btn.classList.add('selected');
          }
          btn.onclick = (ev) => {
            ev.stopPropagation();
            if (code === currentLangCode()) return;
            data.settings = data.settings || {};
            data.settings.lang = code;
            setLang(code);

            setToggleLabel(root, label);

            try { ensureDefaultSection() } catch(e) {}
            try { if (typeof applyTranslations === 'function') applyTranslations(true); } catch(e) {}
            try { immediateSettingsSave && immediateSettingsSave(); } catch(e) {}
            try { save && save(); } catch(e) {}
            try { renderSectionsList(); renderSectionContent(); } catch(e) {}

            try { closeSettingsModal && closeSettingsModal(); } catch(e) {}
          };
          menu.appendChild(btn);
        });
      }, { small: true });
    }

    toggle.onclick = (ev) => { ev.stopPropagation(); buildAndOpen(); };
  })();

  // ---------- Theme dropdown ----------
  (function initThemeDropdown() {
    const root = document.getElementById('themeDropdown');
    if (!root) return;
    const toggle = root.querySelector('.dropdown-toggle') || root;

    const themeLabels = {
      dark: (langs && langs[lang] && (langs[lang].themeDark || langs[lang].theme_dark)) || 'Dark',
      light: (langs && langs[lang] && (langs[lang].themeLight || langs[lang].theme_light)) || 'Light'
    };

    let current = (data && data.settings && data.settings.theme) || 'dark';
    setToggleLabel(root, themeLabels[current] || current);

    function buildAndOpen() {
      openFloatingDropdown(root, (menu) => {
        Object.keys(themeLabels).forEach(k => {
          const label = themeLabels[k];
          const btn = document.createElement('button');
          btn.className = 'context-item';
          btn.type = 'button';
          btn.textContent = label;
          const isSelected = (k === current);
          if (isSelected) { btn.setAttribute('aria-selected', 'true'); btn.classList.add('selected'); }
          btn.onclick = (ev) => {
            ev.stopPropagation();
            if (k === current) return;
            current = k;
            data.settings = data.settings || {};
            data.settings.theme = k;
            setToggleLabel(root, label);
            try { if (typeof applyTheme === 'function') applyTheme(k); } catch(e) {}
            try { immediateSettingsSave && immediateSettingsSave(); } catch(e) {}
            document.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { source: 'settings:theme' } }));
          };
          menu.appendChild(btn);
        });
      }, { small: true });
    }

    toggle.onclick = (ev) => { ev.stopPropagation(); buildAndOpen(); };
  })();

  // ---------- Scale dropdown ----------
  (function initScaleDropdown() {
    const root = document.getElementById('scaleDropdown');
    if (!root) return;
    const toggle = root.querySelector('.dropdown-toggle') || root;

    const scaleOptions = [
      { label: '100%', value: '1.00' },
      { label: '110%', value: '1.10' },
      { label: '125%', value: '1.25' },
      { label: '150%', value: '1.50' }
    ];
    let current = String((data && data.settings && data.settings.scale) || '1.00');
    const currentLabel = (scaleOptions.find(s => s.value === current) || scaleOptions[0]).label;
    setToggleLabel(root, currentLabel);

    function buildAndOpen() {
      openFloatingDropdown(root, (menu) => {
        scaleOptions.forEach(opt => {
          const btn = document.createElement('button');
          btn.className = 'context-item';
          btn.type = 'button';
          btn.textContent = opt.label;
          const isSelected = (opt.value === current);
          if (isSelected) { btn.setAttribute('aria-selected', 'true'); btn.classList.add('selected'); }
          btn.onclick = (ev) => {
            ev.stopPropagation();
            if (opt.value === current) return;
            current = opt.value;
            data.settings = data.settings || {};
            data.settings.scale = current;
            setToggleLabel(root, opt.label);
            try {
              const f = Number(current) || 1.0;
              if (window.api && typeof window.api.setZoom === 'function') {
                window.api.setZoom(f);
              } else {
                document.body.style.zoom = String(f);
              }
            } catch (e) { console.warn('set zoom failed', e); }
            try { immediateSettingsSave && immediateSettingsSave(); } catch(e) {}
            document.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { source: 'settings:scale' } }));
          };
          menu.appendChild(btn);
        });
      }, { small: true });
    }

    toggle.onclick = (ev) => { ev.stopPropagation(); buildAndOpen(); };
  })();

  // ---------- Shortcuts dropdown ----------
  (function initShortcutsDropdown() {
    const root = document.getElementById('shortcutsDropdown');
    if (!root) return;
    const toggle = root.querySelector('.dropdown-toggle') || root;

    function currentMode() {
      return (data.settings && data.settings.shortcutsLayout) ? data.settings.shortcutsLayout : 'grid';
    }
    function labelFor(mode) {
      if (mode === 'list') return (langs[lang] && (langs[lang].shortcutsList)) || 'List';
      return (langs[lang] && (langs[lang].shortcutsGrid)) || 'Grid';
    }

    setToggleLabel(root, labelFor(currentMode()));

    function buildAndOpen() {
      openFloatingDropdown(root, (menu) => {
        const opts = [
          { id: 'grid', label: labelFor('grid') },
          { id: 'list', label: labelFor('list') }
        ];
        opts.forEach(opt => {
          const btn = document.createElement('button');
          btn.className = 'context-item';
          btn.type = 'button';
          btn.textContent = opt.label;
          if (opt.id === currentMode()) {
            btn.classList.add('selected');
            btn.setAttribute('aria-selected', 'true');
          }
          btn.onclick = (ev) => {
            ev.stopPropagation();
            if (opt.id === currentMode()) return;
            data.settings = data.settings || {};
            data.settings.shortcutsLayout = opt.id;
            try { save && save(); } catch (e) { /* ignore */ }
            setToggleLabel(root, opt.label);
            document.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { source: 'settings:shortcutsLayout' } }));
          };
          menu.appendChild(btn);
        });
      }, { small: true });
    }

    toggle.onclick = (ev) => { ev.stopPropagation(); buildAndOpen(); };
  })();

  // ---------- Sidebar position dropdown ----------
  (function initSidebarPositionDropdown() {
    const root = document.getElementById('sidebarPositionDropdown');
    if (!root) return;
    const toggle = root.querySelector('.dropdown-toggle') || root;

    const options = [
      { value: 'left',  label: (langs[lang] || langs['en']).sidebarLeft  || 'Left' },
      { value: 'right', label: (langs[lang] || langs['en']).sidebarRight || 'Right' }
    ];

    let current = (data.settings && data.settings.sidebarPosition) || 'left';
    const currentLabel = options.find(opt => opt.value === current)?.label || 'Left';
    setToggleLabel(root, currentLabel);

    function buildAndOpen() {
      openFloatingDropdown(root, (menu) => {
        options.forEach(opt => {
          const btn = document.createElement('button');
          btn.className = 'context-item';
          btn.type = 'button';
          btn.textContent = opt.label;
          if (opt.value === current) {
            btn.classList.add('selected');
            btn.setAttribute('aria-selected', 'true');
          }
          btn.onclick = (ev) => {
            ev.stopPropagation();
            if (opt.value === current) return;
            current = opt.value;
            data.settings = data.settings || {};
            data.settings.sidebarPosition = current;
            setToggleLabel(root, opt.label);

            const container = document.querySelector('.container');
            if (container) {
              container.classList.toggle('sidebar-right', current === 'right');
            }

            try { immediateSettingsSave(); } catch (e) { console.warn(e); }
            document.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { source: 'settings:sidebarPosition' } }));
          };
          menu.appendChild(btn);
        });
      }, { small: true });
    }

    toggle.onclick = (ev) => { ev.stopPropagation(); buildAndOpen(); };
  })();

  // ---------- Wire toggles with immediateSettingsSave ----------
  const tStart = document.getElementById('s_toggle_startWithSystem');
  const tTray  = document.getElementById('s_toggle_trayOnClose');
  const tDiscord = document.getElementById('s_toggle_showDiscordStatus');

  if (tStart) tStart.addEventListener('change', () => {
    data.settings.startWithSystem = !!tStart.checked;
    immediateSettingsSave();
  });
  if (tTray) tTray.addEventListener('change', () => {
    const enabled = !!tTray.checked;
    data.settings.trayOnClose = enabled;
    immediateSettingsSave();

    const ph = settingsContent.querySelector('[data-panel="hotkey"]');
    if (!ph) return;

    if (enabled) {
      ph.classList.remove('settings-panel--hidden');
      ph.removeAttribute('aria-hidden');
      ph.classList.remove('settings-panel--disabled');
      ph.style.display = 'block';
    } else {
      ph.classList.add('settings-panel--hidden');
      ph.setAttribute('aria-hidden', 'true');
      ph.classList.add('settings-panel--disabled');
      ph.style.display = 'none';

      document.dispatchEvent(new CustomEvent('app:hotkeyPanelHidden'));
    }
  });
  if (tDiscord) tDiscord.addEventListener('change', () => {
    const wasEnabled = data.settings.showDiscordStatus;
    const nowEnabled = tDiscord.checked;

    data.settings.showDiscordStatus = nowEnabled;
    immediateSettingsSave();

    if (!wasEnabled && nowEnabled) {
      showRestartNotification();
    }
  });

  // ---------- Data actions ----------
  const bExport = document.getElementById('btnExport');
  const bImport = document.getElementById('btnImport');
  const bReset  = document.getElementById('btnReset');

  if (bExport) bExport.onclick = async () => {
    try {
      const res = await window.api.exportData();

      if (res && res.ok && res.path) {
        const title = (langs[lang]||langs['en']).success || 'Success';
        const shortMsg = (langs[lang]||langs['en']).exportedTo || 'Successfully exported to ';

        if (simpleErrorModalTitle) simpleErrorModalTitle.textContent = title;
        if (simpleErrorModalBody) {
          simpleErrorModalBody.innerHTML = `
            <div class="success-message-box">
              <p>
                ${shortMsg}
                <a href="#" id="openExportFolderLink" class="action-link">
                  ${(langs[lang]||langs['en']).openInFolder || 'Downloads'}
                </a>
              </p>
            </div>
          `;

          const link = document.getElementById('openExportFolderLink');
          if (link) {
            link.onclick = (ev) => {
              ev.preventDefault();
              window.api.revealFile(res.path);
            };
          }
        }

        simpleErrorModal.classList.remove('hidden');
        requestAnimationFrame(() => simpleErrorModal.classList.add('visible'));

        function closeSimpleModal() {
          simpleErrorModal.classList.remove('visible');
          simpleErrorModal.removeEventListener('click', onOverlayClick);
          document.removeEventListener('keydown', onKeyDown);
          const onEnd = function (ev) {
            if (ev.target !== simpleErrorModal) return;
            simpleErrorModal.classList.add('hidden');
            simpleErrorModal.removeEventListener('transitionend', onEnd);
          };
          simpleErrorModal.addEventListener('transitionend', onEnd);
        }

        const onOverlayClick = (ev) => {
          if (ev.target === simpleErrorModal) closeSimpleModal();
        };
        const onKeyDown = (ev) => {
          if (ev.key === 'Escape') closeSimpleModal();
        };

        simpleErrorModal.addEventListener('click', onOverlayClick);
        document.addEventListener('keydown', onKeyDown);

        if (simpleErrorModalOk) {
          simpleErrorModalOk.onclick = (ev) => { ev.preventDefault && ev.preventDefault(); closeSimpleModal(); };
          try { simpleErrorModalOk.focus(); } catch(e) {}
        }
      } else {
        openSimpleErrorModal((res && res.error) ? res.error : ((langs[lang]||langs['en']).exportFailed || 'Export failed'));
      }
    } catch (err) {
      console.error('Export handler error', err);
      openSimpleErrorModal((err && err.message) ? err.message : ((langs[lang]||langs['en']).exportFailed || 'Export failed'));
    }
  };

  if (bImport) bImport.onclick = async () => {
    try {
      const r = await window.api.importData();
      if (r && r.ok) {
        const incoming = await window.api.getData();
        handleIncomingData && handleIncomingData(incoming);
        try { if (typeof applyTheme === 'function') applyTheme(data.settings.theme || 'dark'); } catch(e) {}
        if (window.api && typeof window.api.setZoom === 'function') {
          const scaleValue = Number(data.settings.scale) || 1.0;
          window.api.setZoom(scaleValue);
        }
        try { closeSettingsModal && closeSettingsModal(); } catch(e) {}
        openSimpleErrorModal(
          (langs[lang]||langs['en']).importSuccess || 'Import completed successfully',
          (langs[lang]||langs['en']).success || 'Success',
          'success'
        );
        document.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { source: 'settings:import' } }));
      } else if (r && r.cancelled) {
        // no-op
      } else {
        openSimpleErrorModal((r && r.error) || (langs[lang]||langs['en']).importFailed || 'Import failed');
      }
    } catch (err) {
      console.error('Import failed', err);
      openSimpleErrorModal((err && err.message) || (langs[lang]||langs['en']).importFailed || 'Import failed');
    }
  };

  if (bReset) bReset.onclick = async () => {
    openConfirmModal(async () => {
      const rr = await window.api.resetSections();
      if (rr && rr.ok) {
        const incoming = await window.api.getData();
        handleIncomingData && handleIncomingData(incoming);
        openSimpleErrorModal(
          (langs[lang]||langs['en']).resetSuccess || 'The sections were successfully reset',
          (langs[lang]||langs['en']).success || 'Success',
          'success'
        );
        document.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { source: 'settings:reset' } }));
      } else {
        openSimpleErrorModal((rr && rr.error) || 'Reset failed');
      }
    }, (langs[lang]||langs['en']).confirmResetSections || 'Reset sections to default? This will remove all custom shortcuts.');
  };

  // --- show overlay and wire closing handlers ---
  try { hideAllTooltips(); } catch(e) {}
  localizeSettingsModal();

  // Use local showOverlay (we imported showOverlay) to show the overlay
  showOverlay(modalOverlay);

  // click-outside handling (mousedown tracking)
  let isMouseDownInside = false;
  modalOverlay.addEventListener('mousedown', (e) => {
    isMouseDownInside = (e.target !== modalOverlay);
  });
  function __overlayClose(e) {
    if (e.target === modalOverlay && !isMouseDownInside) {
      modalOverlay.removeEventListener('click', __overlayClose);
      if (modalOverlay._mousedownHandler) modalOverlay.removeEventListener('mousedown', modalOverlay._mousedownHandler);
      modalOverlay._mousedownHandler = null;
      closeSettingsModal();
    }
    isMouseDownInside = false;
  }
  modalOverlay._mousedownHandler = (e) => {
    isMouseDownInside = (e.target !== modalOverlay);
  };
  modalOverlay.addEventListener('mousedown', modalOverlay._mousedownHandler);
  modalOverlay.addEventListener('click', __overlayClose);

  function escHandler(e) {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', escHandler);
      closeSettingsModal();
    }
  }
  document.addEventListener('keydown', escHandler);
}

export function closeSettingsModal() {
  try { detachTooltipsInside(settingsModal); } catch (e) {}

  try {
    if (modalOverlay && modalOverlay._mousedownHandler) {
      modalOverlay.removeEventListener('mousedown', modalOverlay._mousedownHandler);
      modalOverlay._mousedownHandler = null;
    }
    try { modalOverlay.removeEventListener('click', () => {}); } catch (e) {}
  } catch (e) {}

  try { 
    if (typeof window.clearModalErrors === 'function') window.clearModalErrors(settingsModal);
  } catch (e) {}

  if (settingsModal && settingsModal._enterHandler) {
    try { document.removeEventListener('keydown', settingsModal._enterHandler); } catch (e) {}
    settingsModal._enterHandler = null;
  }

  try { detachEscHandler(settingsModal); } catch (e) {}
  try { blurPreviousOpener(settingsModal); } catch (e) {}
  try { hideOverlay(modalOverlay); } catch (e) {}
}