import { getProject } from './projectState.js';
import { getMeetingRecords, getAccount } from './crmState.js?v=20260917-accountuuid1';
import { formatDateTime } from './date.js';
import { esc } from './html.js';
import { currentOwner } from './access.js';
import { isManagerAccount } from './authState.js';

export const meetingsPage=()=>{
  const p=getProject();
  const owner=isManagerAccount()?'ALL':currentOwner();
  const rows=getMeetingRecords(p,{owner});
  return `<main class="page"><div class="page-header"><div><div class="page-kicker">${p} / Meetings</div><h1 class="page-title">Meetings</h1><p class="page-subtitle">Each booked meeting keeps its own identity, schedule, contact and completion state.</p></div></div>
  <div class="table-wrap data-list-frame"><table><thead><tr><th>Company</th><th>Contact</th><th>Owner</th><th>Account</th><th>Booked on</th><th>Meeting date</th><th>Status</th></tr></thead><tbody>${rows.length?rows.map(r=>{const acc=getAccount(r.accountId);return `<tr><td><a class="cell-company" href="#/company/${encodeURIComponent(r.companyId||r.company)}">${esc(r.company)}</a></td><td>${esc(r.contact)}</td><td>${esc(r.owner)}</td><td><span class="account-badge">${esc(acc.label)}</span></td><td class="cell-muted">${r.booked?formatDateTime(r.booked.at):'—'}</td><td class="cell-muted">${r.scheduledFor?formatDateTime(r.scheduledFor):'—'}</td><td><span class="status ${r.done?'replied':'meeting'}">${esc(r.status)}</span></td></tr>`;}).join(''):'<tr><td colspan="7" class="cell-muted">No meetings recorded yet.</td></tr>'}</tbody></table></div></main>`;
};
