import { getProject } from './projectState.js';
import { getCurrentUser, isManagerAccount } from './authState.js';
import { getTodayAgenda, getAccount } from './crmState.js?v=20260917-multicontact1';
import { currentOwner } from './access.js';
import { formatDateTime, getWorkspaceDateKey, getWorkspaceHour, formatWorkspaceDateKey, formatWorkspaceWeekday } from './date.js?v=20260918-gmt4-1';
import { esc } from './html.js';
import { icon } from './icons.js';

const greeting = () => {
  const h=getWorkspaceHour();
  return h<12?'Good morning':h<18?'Good afternoon':'Good evening';
};

const companyRoute=(item)=>encodeURIComponent(item.companyId||item.company);
const agendaItem=(item)=>`<a class="agenda-item" href="#/company/${companyRoute(item)}"><div class="agenda-icon">${icon(item.type==='reply_waiting'?'message':item.type==='follow_up_overdue'?'followups':item.type==='booked_no_schedule'?'meetings':'clock')}</div><div class="agenda-copy"><strong>${esc(item.company)}</strong><span>${esc(item.reason)}</span><small>${esc(item.contact||'')} ${item.at?`· ${formatDateTime(item.at)}`:''}</small></div>${icon('arrow')}</a>`;

export const homePage=()=>{
  const project=getProject();
  const user=getCurrentUser();
  const owner=isManagerAccount()?'ALL':currentOwner();
  const agenda=getTodayAgenda(project,owner);
  const attention=agenda.needsAttention.slice(0,6);
  const recent=agenda.recent.slice(0,7);
  const headline=isManagerAccount()?'Today across outreach':'Your agenda for today';
  const todayKey=getWorkspaceDateKey();
  return `<main class="page home-page">
    <div class="home-hero">
      <div><div class="page-kicker">${project} / Today</div><h1>${greeting()}, ${esc(user?.displayName||'there')}.</h1><p>${isManagerAccount()?'Here is what needs attention across the outreach team.':'Here is what needs your attention before you start outreach.'}</p></div>
      <div class="home-date"><span>${formatWorkspaceWeekday(todayKey,'long')}</span><strong>${formatWorkspaceDateKey(todayKey,{month:'long',day:'numeric',year:'numeric'})}</strong><small>GMT-04 workspace time</small></div>
    </div>

    <section class="home-priority-grid">
      <div class="card card-pad home-agenda-card">
        <div class="section-head"><div><h3 class="section-title">${headline}</h3><div class="section-meta">Replies, follow-ups, meetings and pending actions</div></div><a class="button ghost" href="#/followups">Open queue ${icon('arrow')}</a></div>
        <div class="agenda-list">${attention.length?attention.map(agendaItem).join(''):'<div class="empty-mini">Nothing urgent right now.</div>'}</div>
      </div>
      <div class="home-side-stack">
        <div class="card card-pad home-mini-card"><span>Needs attention</span><strong>${agenda.needsAttention.length}</strong><small>Open items right now</small></div>
        <div class="card card-pad home-mini-card"><span>Follow-ups today</span><strong>${agenda.followups.length}</strong><small>GMT-04 business day</small></div>
        <div class="card card-pad home-mini-card"><span>Meetings today</span><strong>${agenda.meetings.length}</strong><small>GMT-04 business day</small></div>
      </div>
    </section>

    <section class="grid grid-2 home-lower-grid">
      <div class="card card-pad">
        <div class="section-head"><div><h3 class="section-title">Today’s scheduled work</h3></div></div>
        <div class="agenda-list compact">${[...agenda.followups,...agenda.meetings].sort((a,b)=>new Date(a.scheduledFor)-new Date(b.scheduledFor)).slice(0,8).map(a=>`<a class="agenda-item" href="#/company/${encodeURIComponent(a.companyId||a.company)}"><div class="agenda-icon">${icon(a.type==='followup_scheduled'?'followups':'meetings')}</div><div class="agenda-copy"><strong>${esc(a.company)}</strong><span>${a.type==='followup_scheduled'?'Follow-up':'Meeting'} · ${esc(a.contact||'—')}</span><small>${formatDateTime(a.scheduledFor)}</small></div>${icon('arrow')}</a>`).join('')||'<div class="empty-mini">No scheduled follow-ups or meetings today.</div>'}</div>
      </div>
      <div class="card card-pad recent-home-card">
        <div class="section-head"><div><h3 class="section-title">Recent updates</h3></div><a class="button ghost" href="#/dashboard">Dashboard ${icon('arrow')}</a></div>
        <div class="recent-home-list">${recent.map(a=>{const ac=getAccount(a.accountId);return `<a href="#/company/${encodeURIComponent(a.companyId||a.company)}" class="recent-home-row"><div><strong>${esc(a.company)} · ${esc(a.label)}</strong><span>${esc(a.actor||a.owner)} · ${esc(ac.label)}${a.contact?` · ${esc(a.contact)}`:''}</span></div><time>${formatDateTime(a.at)}</time></a>`;}).join('')||'<div class="empty-mini">No recent activity yet.</div>'}</div>
      </div>
    </section>

    <section class="home-quick-actions">
      ${isManagerAccount()?`<a class="button primary" href="#/reports">Open reports</a><a class="button" href="#/team">Team view</a><a class="button" href="#/activity-analytics">Performance explorer</a>`:`<a class="button primary" href="#/connections">Add connections</a><a class="button" href="#/add-company">Add company</a><a class="button" href="#/outreach">Open outreach</a>`}
    </section>
  </main>`;
};
