import { getProject } from './projectState.js';
import { getManagerFilters } from './managerState.js';
import { getActiveOwners, getActivityAnalytics, getAccount, getActivityDetail } from './crmState.js?v=20260917-multicontact1';
import { icon } from './icons.js';
import { formatDateTime, formatWorkspaceDateKey, formatWorkspaceWeekday } from './date.js';
import { esc } from './html.js';
import { canManage } from './authState.js';
import { currentOwner, visibleOwnerOptions } from './access.js';

const ownerOptions = (selected) => visibleOwnerOptions(getActiveOwners())
  .map(x => `<option value="${x.id}" ${selected===x.id?'selected':''}>${x.label}</option>`).join('');

const prettyDay = (value) => formatWorkspaceDateKey(value,{day:'2-digit',month:'short'});

const fullDay = (value) => `${formatWorkspaceWeekday(value,'long')}, ${formatWorkspaceDateKey(value,{day:'2-digit',month:'long',year:'numeric'})}`;

const metricLabel = (metric) => ({
  replied:'Replies', meeting_booked:'Meetings booked', message_sent:'Messages sent', connection_sent:'Connections sent', total:'All activity'
}[metric] || 'Activity');

const eventBadge = (type) => ({
  replied:'Reply', meeting_booked:'Meeting booked', message_sent:'Message sent', connection_sent:'Connection sent',
  connection_accepted:'Accepted', followup_sent:'Follow-up sent', followup_scheduled:'Follow-up due', meeting_scheduled:'Meeting scheduled',
  meeting_rescheduled:'Meeting rescheduled', meeting_done:'Meeting done', company_added:'Company added'
}[type] || type);

export const renderAnalyticsDayPanel = (project, owner, days, date) => {
  const analytics=getActivityAnalytics(project,{owner,days});
  const day=analytics.timeline.find(x=>x.date===date) || analytics.timeline[analytics.timeline.length-1];
  if(!day) return '<div class="empty-mini">No activity available.</div>';
  const events=[...day.events].sort((a,b)=>new Date(b.at)-new Date(a.at));
  return `<div class="analytics-day-head">
      <div><span class="manager-label">Selected day</span><h3>${esc(fullDay(day.date))}</h3><small class="selected-day-total">${day.reportedDaily?'Reported daily totals applied · reconstructed detail may differ':`${events.length} ${events.length===1?'activity':'activities'} recorded`}</small></div>
      <div class="day-score-row">
        <span><b>${day.replied}</b> replies</span><span><b>${day.meeting_booked}</b> meetings</span><span><b>${day.message_sent}</b> messages</span><span><b>${day.connection_sent}</b> connections sent</span><span><b>${day.connection_pending_current}</b> pending</span><span><b>${day.connection_accepted_current}</b> accepted now</span>
      </div>
    </div>
    <div class="selected-day-scroll" aria-label="Selected day activity">
      <div class="day-event-list">
        ${events.length ? events.map(a=>{const acc=getAccount(a.accountId);return `<div class="day-event-row">
          <div class="event-type-chip">${esc(eventBadge(a.type))}</div>
          <div><a href="#/company/${encodeURIComponent(a.companyId||a.company)}" class="cell-company">${esc(a.company)}</a><span>${esc(a.contact||'—')} · ${esc(a.owner)} · ${esc(acc.label)}</span>${getActivityDetail(a)?`<small class="activity-detail-snippet">${esc(getActivityDetail(a))}</small>`:''}</div>
          <time>${formatDateTime(a.at)}</time>
        </div>`;}).join('') : '<div class="empty-mini">Nothing was recorded on this day.</div>'}
      </div>
    </div>`;
};

export const activityAnalyticsPage = () => {
  const project=getProject();
  const manager=getManagerFilters();
  const allowed=visibleOwnerOptions(getActiveOwners());
  const fallback=canManage()?'ALL':currentOwner();
  const owner=allowed.some(x=>x.id===manager.owner)?manager.owner:fallback;
  const days=[7,30,60,90].includes(Number(localStorage.getItem('lfg-crm-analytics-days'))) ? Number(localStorage.getItem('lfg-crm-analytics-days')) : 30;
  const analytics=getActivityAnalytics(project,{owner,days});
  const lastDay=analytics.timeline[analytics.timeline.length-1]?.date || '';
  const bestReply=analytics.bestReplyDay;
  const bestMeeting=analytics.bestMeetingDay;
  const maxReplies=Math.max(1,...analytics.timeline.map(x=>x.replied));

  return `<main class="page analytics-page">
    <div class="page-header">
      <div>
        <div class="page-kicker">${project} / Performance intelligence</div>
        <h1 class="page-title">Activity & conversion explorer.</h1>
        <p class="page-subtitle">Replies, meetings, messages and connections by day.</p>
      </div>
      <div class="header-actions"><a class="button" href="#/dashboard">${icon('arrow')} Dashboard</a><button class="button primary" id="copy-analysis-brief">Copy analysis brief</button></div>
    </div>

    <section class="card card-pad report-accuracy-note" role="note">
      <strong>Historical data note</strong>
      <p>Historical reporting is reconstructed from submitted daily reports and LinkedIn history, so some figures may not be 100% accurate.</p>
    </section>

    <section class="analytics-controls card">
      <div class="manager-block"><span class="manager-label">Team member</span>${canManage()?`<select id="analytics-owner" class="manager-select">${ownerOptions(owner)}</select>`:`<div class="fixed-owner">${esc(currentOwner())}</div>`}</div>
      <div class="manager-block"><span class="manager-label">Timeline</span><select id="analytics-days" class="manager-select"><option value="7" ${days===7?'selected':''}>Last 7 days</option><option value="30" ${days===30?'selected':''}>Last 30 days</option><option value="60" ${days===60?'selected':''}>Last 60 days</option><option value="90" ${days===90?'selected':''}>Last 90 days</option></select></div>
      <div class="analytics-metric-switch" role="group" aria-label="Chart metric">
        <button class="metric-switch active" data-analytics-metric="replied">Replies</button>
        <button class="metric-switch" data-analytics-metric="meeting_booked">Meetings</button>
        <button class="metric-switch" data-analytics-metric="message_sent">Messages</button>
        <button class="metric-switch" data-analytics-metric="connection_sent">Connections</button>
        <button class="metric-switch" data-analytics-metric="total">All activity</button>
      </div>
    </section>

    <section class="grid grid-4 analytics-highlights">
      <div class="card intelligence-card"><span>Best reply day</span><strong>${bestReply&&bestReply.replied?prettyDay(bestReply.date):'No replies yet'}</strong><small>${bestReply?.replied||0} replies</small></div>
      <div class="card intelligence-card"><span>Best meeting day</span><strong>${bestMeeting&&bestMeeting.meeting_booked?prettyDay(bestMeeting.date):'No meetings yet'}</strong><small>${bestMeeting?.meeting_booked||0} booked</small></div>
      <div class="card intelligence-card"><span>Companies that replied</span><strong>${analytics.replyCompanies.length}</strong><small>Open them below and compare patterns</small></div>
      <div class="card intelligence-card"><span>Companies that booked</span><strong>${analytics.meetingCompanies.length}</strong><small>High-signal conversion set</small></div>
    </section>

    <section class="card card-pad analytics-chart-card">
      <div class="section-head">
        <div><h3 class="section-title">Daily performance calendar</h3><div class="section-meta">Click a day to open its activity.</div></div>
        <div class="chart-legend"><span class="legend-reply">Replies</span><span class="legend-meeting">Meeting signal</span></div>
      </div>
      <div class="analytics-chart-scroll" id="analytics-chart-scroll">
        <div class="analytics-chart" id="analytics-chart">
          ${analytics.timeline.map(day=>{
            const h=Math.max(4,Math.round(day.replied/maxReplies*100));
            const weekday=formatWorkspaceWeekday(day.date,'short').slice(0,2);
            const dayNum=day.date.slice(-2);
            return `<button class="analytics-day-column ${day.date===lastDay?'selected':''}" data-analytics-day="${day.date}" data-replied="${day.replied}" data-meeting_booked="${day.meeting_booked}" data-message_sent="${day.message_sent}" data-connection_sent="${day.connection_sent}" data-total="${day.total}" title="${day.date} · ${day.replied} replies · ${day.meeting_booked} meetings">
              <div class="analytics-day-count">${day.replied||''}</div>
              <div class="analytics-bar-track"><div class="analytics-bar" style="height:${h}%"></div>${day.meeting_booked?'<i class="meeting-signal"></i>':''}</div>
              <span class="analytics-weekday">${weekday}</span><strong>${dayNum}</strong>
            </button>`;
          }).join('')}
        </div>
      </div>
      <div class="chart-readout"><span>Current lens:</span><strong id="analytics-current-metric">Replies</strong></div>
    </section>

    <section class="grid grid-3 analytics-learning-section">
      <div class="span-2 card card-pad" id="analytics-day-panel">${renderAnalyticsDayPanel(project,owner,days,lastDay)}</div>
      <div class="card card-pad learn-set-card">
        <div class="section-head"><div><h3 class="section-title">Conversion companies</h3></div></div>
        <div class="learning-set">
          <div class="learning-set-head"><strong>Reply set <span class="set-count">${analytics.replyCompanies.length}</span></strong><button class="mini-action" data-copy-company-set="replied">Copy</button></div>
          <div class="learning-set-scroll">${analytics.replyCompanyRecords.length?analytics.replyCompanyRecords.map(c=>`<a href="#/company/${encodeURIComponent(c.id||c.name)}">${esc(c.name)}</a>`).join(''):'<span class="empty-mini">No reply companies yet.</span>'}</div>
        </div>
        <div class="learning-set">
          <div class="learning-set-head"><strong>Meeting set <span class="set-count">${analytics.meetingCompanies.length}</span></strong><button class="mini-action" data-copy-company-set="meeting_booked">Copy</button></div>
          <div class="learning-set-scroll">${analytics.meetingCompanyRecords.length?analytics.meetingCompanyRecords.map(c=>`<a href="#/company/${encodeURIComponent(c.id||c.name)}">${esc(c.name)}</a>`).join(''):'<span class="empty-mini">No meeting companies yet.</span>'}</div>
        </div>
      </div>
    </section>
    <div id="analytics-toast" class="toast">Copied</div>
  </main>`;
};
