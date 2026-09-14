import { icon } from './icons.js';
import { getProject } from './projectState.js';
import { getCurrentUser, isOutreachAccount } from './authState.js';

export const topbar = () => {
  const project = getProject();
  const user = getCurrentUser() || { displayName: 'Omar', initials: 'OM', roleLabel:'Outreach Lead' };
  return `<header class="topbar">
    <div class="topbar-left">
      <div class="project-switcher" aria-label="Workspace switcher">
        <button class="project-pill ${project==='LFG'?'active':''}" data-project="LFG">LFG</button>
        <button class="project-pill ${project==='O1'?'active':''}" data-project="O1">O1</button>
      </div>
      <div class="topbar-context"><strong>${project === 'LFG' ? 'General Outreach' : 'O1 Outreach'}</strong><span>${user.roleLabel}</span></div>
    </div>
    <div class="topbar-right">
      <div class="search-box">${icon('search')}<input id="global-company-search" placeholder="Search company or contact…" autocomplete="off" /></div>
      <a class="icon-button" href="${isOutreachAccount() ? '#/followups' : '#/reports'}" aria-label="Open attention items" title="Open attention items">${icon('bell')}</a>
      <button class="icon-button" data-logout aria-label="Sign out" title="Sign out">${icon('lock')}</button>
      <a class="avatar avatar-link" href="#/profile" title="Open ${user.displayName} account">${user.initials}</a>
    </div>
  </header>`;
};
