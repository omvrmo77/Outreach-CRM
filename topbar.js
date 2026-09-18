import { icon } from './icons.js';
import { getProject } from './projectState.js?v=20260918-major4';
import { getCurrentUser, isOutreachAccount } from './authState.js?v=20260918-major4';

export const topbar = () => {
  const project = getProject();
  const user = getCurrentUser() || { displayName: 'Omar', initials: 'OM', roleLabel:'Outreach Lead', productCodes:['LFG','O1'] };
  const allowed=Array.isArray(user.productCodes)&&user.productCodes.length?user.productCodes:['LFG','O1'];
  const labels={LFG:'LFG',O1:'O1'};
  const projectButtons=allowed.map(code=>`<button class="project-pill ${project===code?'active':''}" data-project="${code}">${labels[code]||code}</button>`).join('');
  return `<header class="topbar">
    <div class="topbar-left">
      <div class="project-switcher" aria-label="Workspace switcher">${projectButtons}</div>
      <div class="topbar-context"><strong>${project === 'LFG' ? 'General Outreach' : `${project} Outreach`}</strong><span>${user.roleLabel}</span></div>
    </div>
    <div class="topbar-right">
      <div class="search-box">${icon('search')}<input id="global-company-search" placeholder="Search company or contact…" autocomplete="off" /></div>
      <a class="icon-button" href="${isOutreachAccount() ? '#/followups' : '#/reports'}" aria-label="Open attention items" title="Open attention items">${icon('bell')}</a>
      <button class="icon-button" data-logout aria-label="Sign out" title="Sign out">${icon('lock')}</button>
      <a class="avatar avatar-link" href="#/profile" title="Open ${user.displayName} account">${user.initials}</a>
    </div>
  </header>`;
};
