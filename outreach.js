import { getProject } from './projectState.js';
import { getOutreachRows, getAccount, getActiveOwners } from './crmState.js?v=20260917-toastconn1';
import { formatDateTime } from './date.js';
import { icon } from './icons.js';
import { esc } from './html.js';
import { filterOwnedRows, visibleOwnerOptions, isPersonalOutreachView } from './access.js';
import { isManagerAccount, canManage } from './authState.js';

export const outreachPage = () => {
  const p=getProject();
  const rows=filterOwnedRows(getOutreachRows(p));
  const owners=visibleOwnerOptions(getActiveOwners());
  return `<main class="page">
    <div class="page-header">
      <div><div class="page-kicker">${p} / Outreach</div><h1 class="page-title">Outreach activity</h1></div>
      ${isManagerAccount()?'':`<a class="button primary" href="#/add-company">${icon('plus')} Add company</a>`}
    </div>

    <div class="section-head outreach-tools">
      <div class="search-box">${icon('search')}<input id="outreach-search" placeholder="Search company or contact…"></div>
      <div class="filter-row">
        ${canManage()?`<select id="outreach-owner-filter" class="simple-select">${owners.map(o=>`<option value="${o.id}">${o.label}</option>`).join('')}</select>`:''}
        <select id="outreach-status-filter" class="simple-select"><option value="ALL">All statuses</option><option>Connection Pending</option><option>Accepted</option><option>Message Sent</option><option>Follow-Up Sent</option><option>Follow-Up Needed</option><option>Replied</option><option>Meeting Booked</option><option>Meeting Scheduled</option><option>Meeting Done</option></select>
      </div>
    </div>

    <div class="table-wrap data-list-frame"><table><thead><tr><th>Company</th><th>Contact</th><th>Owner</th><th>Account</th><th>Current status</th><th>Last activity</th><th>Next step</th></tr></thead><tbody id="outreach-body">
      ${rows.length ? rows.map(r=>{const a=getAccount(r.accountId);return `<tr data-outreach-row data-owner="${esc(r.owner)}" data-status="${esc(r.status)}"><td><a class="cell-company" href="#/company/${encodeURIComponent(r.id||r.companyId||r.company)}">${esc(r.company)}</a></td><td>${esc(r.contact)}</td><td>${esc(r.owner)}</td><td><span class="account-badge">${esc(a.label)}</span></td><td><span class="status">${esc(r.status)}</span></td><td><strong class="activity-cell-title">${esc(r.lastActivity)}</strong><span class="activity-cell-date">${formatDateTime(r.lastActivityAt)}</span>${r.lastActivityDetail?`<span class="activity-detail-snippet">${esc(r.lastActivityDetail)}</span>`:''}</td><td class="cell-muted">${esc(r.nextStep)}</td></tr>`;}).join('') : '<tr><td colspan="7" class="cell-muted">No outreach activity yet.</td></tr>'}
    </tbody></table></div>
  </main>`;
};
