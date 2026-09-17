import { getProject } from './projectState.js';
import { getCurrentUser } from './authState.js';
import { getHistoricalReference, getCompany, getActivities } from './crmState.js?v=20260917-multicontact1';
import { esc } from './html.js';
import { formatDateTime } from './date.js';

export const profilePage = () => {
  const project=getProject();
  const user=getCurrentUser() || {displayName:'Omar',initials:'OM',role:'admin',roleLabel:'Outreach Lead',ownerName:'Omar'};
  const owner=user.ownerName || user.displayName;
  const activities=getActivities(project).filter(x=>user.role==='manager' ? true : x.owner===owner);
  const last=activities[0];

  let body='';
  if(user.role==='admin'){
    const historical=getHistoricalReference(project);
    const clickable=historical.companies.map(name=>({name,row:getCompany(project,name)}));
    body=`<section class="card card-pad account-history-card">
      <div class="section-head"><div><h3 class="section-title">Historical spreadsheet reference</h3></div></div>
      <div class="historical-account-metrics">
        <div><span>Companies</span><strong>${historical.summary.companies}</strong></div>
        <div><span>Outreach rows</span><strong>${historical.summary.outreach}</strong></div>
        <div><span>Connection rows</span><strong>${historical.summary.connections}</strong></div>
      </div>
      <div class="historical-directory-head"><div><strong>Historical company directory</strong></div></div>
      <div class="historical-company-grid">
        ${clickable.map(({name,row})=>row
          ? `<a href="#/company/${encodeURIComponent(row.id||name)}" class="historical-company-link"><strong>${esc(name)}</strong><span>Open company →</span></a>`
          : `<div class="historical-company-link muted-history"><strong>${esc(name)}</strong><span>Historical reference</span></div>`).join('')}
      </div>
    </section>`;
  } else if(user.role==='manager'){
    body=`<section class="grid grid-2 profile-access-grid">
      <a class="card card-pad profile-access-card" href="#/reports"><span class="manager-label">Management</span><h3>Reports</h3><p>Daily activity, weekly performance, account performance and attention items.</p></a>
      <a class="card card-pad profile-access-card" href="#/team"><span class="manager-label">Management</span><h3>Team</h3><p>Compare outreach team activity and open individual reports.</p></a>
    </section>`;
  } else {
    body=`<section class="card card-pad profile-access-card"><span class="manager-label">Workspace access</span><h3>Outreach workspace</h3><p>Your account is focused on your own connections, companies, outreach, follow-ups and meetings. The Master List remains shared for duplicate protection.</p></section>`;
  }

  return `<main class="page">
    <div class="page-header"><div><div class="page-kicker">My account / ${project}</div><h1 class="page-title">${esc(user.displayName)}.</h1></div></div>
    <section class="profile-account-hero card card-pad">
      <div class="profile-large-avatar">${esc(user.initials)}</div>
      <div><span class="manager-label">Current user</span><h2>${esc(user.displayName)}</h2><p>${esc(user.roleLabel)}</p></div>
      <div class="profile-last-activity"><span>Latest recorded activity</span><strong>${last?esc(last.label):'No activity yet'}</strong><small>${last?formatDateTime(last.at):'—'}</small></div>
    </section>
    ${body}
  </main>`;
};
