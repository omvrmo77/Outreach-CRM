import { icon } from './icons.js';
import { getCurrentUser, canManage, isManagerAccount, isOutreachAccount } from './authState.js';

const allItems = [
  ['home','Home','home'],
  ['dashboard','Dashboard','dashboard'],
  ['companies','Companies','companies'],
  ['outreach','Outreach','outreach'],
  ['connections','Connections','connections'],
  ['followups','Follow-ups','followups'],
  ['meetings','Meetings','meetings'],
  ['master','Master List','shield'],
  ['reports','Reports','reports'],
  ['team','Team','team'],
];

export const sidebar = (route) => {
  const user = getCurrentUser() || { role:'admin', roleLabel:'Outreach Lead' };
  const items = isOutreachAccount()
    ? allItems.filter(([r]) => !['reports','team'].includes(r))
    : allItems;
  const showQuickActions = !isManagerAccount();
  const showSettings = canManage();

  return `<aside class="sidebar">
    <div class="brand">
      <img class="brand-mark" src="./lfg-logo.png" alt="LFG" />
      <div class="brand-copy"><strong>Outreach CRM</strong><span>Laissez-Faire Group</span></div>
    </div>
    <div class="sidebar-role-chip">${user.roleLabel}</div>
    ${showQuickActions ? `<div class="sidebar-quick-actions">
      <a class="sidebar-add" href="#/add-company" aria-label="Add company">${icon('plus')}<span>Add company</span></a>
      <a class="sidebar-secondary-add" href="#/connections" aria-label="Add connections">${icon('connections')}<span>Add connections</span></a>
    </div>` : ''}
    <nav class="sidebar-nav">
      ${items.map(([r,label,ic]) => `<a class="nav-item ${route===r?'active':''}" href="#/${r}" aria-label="${label}">${icon(ic)}<span>${label}</span></a>`).join('')}
    </nav>
    <div class="sidebar-bottom">
      ${showSettings ? `<a class="nav-item ${route==='settings'?'active':''}" href="#/settings" aria-label="Settings">${icon('settings')}<span>Settings</span></a>` : ''}
      <button class="nav-item nav-button" data-logout aria-label="Lock workspace">${icon('lock')}<span>Lock workspace</span></button>
    </div>
  </aside>`;
};
