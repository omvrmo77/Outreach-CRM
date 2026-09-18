import { getProject } from './projectState.js?v=20260918-major4';
import { getFollowupRecords } from './crmState.js?v=20260918-major4';
import { esc } from './html.js';
import { currentOwner } from './access.js';
import { isManagerAccount } from './authState.js?v=20260918-major4';
import { formatDateTime, getWorkspaceDateKey } from './date.js?v=20260918-gmt4-1';

const followupState = (record, now=new Date()) => {
  if(!record.scheduledFor || record.sent) return null;
  const due=new Date(record.scheduledFor);
  if(Number.isNaN(due.getTime())) return null;
  const today=getWorkspaceDateKey(now);
  const bucket=due<now?'Overdue':getWorkspaceDateKey(due)===today?'Due today':'Upcoming';
  return {record,due,bucket};
};

export const followupsPage=()=>{
  const p=getProject();
  const owner=isManagerAccount()?'ALL':currentOwner();
  const rows=getFollowupRecords(p,{owner}).map(record=>followupState(record)).filter(Boolean).sort((a,b)=>a.due-b.due);
  const overdue=rows.filter(x=>x.bucket==='Overdue').length;
  const dueToday=rows.filter(x=>x.bucket==='Due today').length;
  const upcoming=rows.filter(x=>x.bucket==='Upcoming').length;
  return `<main class="page"><div class="page-header"><div><div class="page-kicker">${p} / Follow-ups</div><h1 class="page-title">Follow-ups</h1><p class="page-subtitle">Each contact's scheduled next action stays independent until that exact follow-up is recorded.</p></div></div>
    <section class="connection-summary grid grid-3">
      <div class="mini-stat card"><span>Overdue</span><strong>${overdue}</strong><small>Needs attention</small></div>
      <div class="mini-stat card"><span>Due today</span><strong>${dueToday}</strong><small>GMT-04 business day</small></div>
      <div class="mini-stat card"><span>Upcoming</span><strong>${upcoming}</strong><small>Scheduled</small></div>
    </section>
    <div class="table-wrap data-list-frame"><table><thead><tr><th>Company</th><th>Contact</th><th>Owner</th><th>Due</th><th>Priority</th><th>Context</th></tr></thead><tbody>${rows.length?rows.map(({record:r,bucket})=>`<tr><td><a class="cell-company" href="#/company/${encodeURIComponent(r.companyId||r.company)}">${esc(r.company)}</a></td><td>${esc(r.contact)}</td><td>${esc(r.owner)}</td><td class="cell-muted">${formatDateTime(r.scheduledFor)}</td><td><span class="status ${bucket==='Overdue'?'reject':bucket==='Due today'?'followup':''}">${esc(bucket)}</span></td><td class="cell-muted">${esc(r.scheduled?.detail||'—')}</td></tr>`).join(''):'<tr><td colspan="6" class="cell-muted">No follow-ups are currently scheduled.</td></tr>'}</tbody></table></div></main>`;
};
