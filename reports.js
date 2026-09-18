import { getProject } from './projectState.js';
import { getManagerFilters } from './managerState.js';
import { metricCard } from './metricCard.js';
import { rangeLabels } from './uiConfig.js';
import { getActiveOwners, getDashboardMetrics, getFilteredActivities, getAccount, getActivityDetail, getActivityAnalytics } from './crmState.js?v=20260918-registry1';
import { getManagementOverview, getNeedsAttention, getAccountPerformance, getWeeklyReview, buildWeeklyReportText } from './managementInsights.js';
import { formatDateTime, formatWorkspaceDateKey, formatWorkspaceWeekday } from './date.js?v=20260918-gmt4-1';
import { esc } from './html.js';
import { canManage, getCurrentUser } from './authState.js';
import { currentOwner, visibleOwnerOptions } from './access.js';

const periodBlock = (title, metrics) => `<div class="management-period card">
  <div class="management-period-head"><span>${title}</span><strong>${metrics.meetings} meetings</strong></div>
  <div class="management-period-grid">
    <div><span>Accepted</span><strong>${metrics.accepted}</strong></div>
    <div><span>Messages</span><strong>${metrics.messages}</strong></div>
    <div><span>Replies</span><strong>${metrics.replies}</strong></div>
    <div><span>Meetings</span><strong>${metrics.meetings}</strong></div>
  </div>
</div>`;

export const reportsPage=()=>{
  const p=getProject(), filters=getManagerFilters();
  const user=getCurrentUser();
  const validOwners=visibleOwnerOptions(getActiveOwners());
  const fallback=canManage()?'ALL':currentOwner();
  const ownerKey=validOwners.some(x=>x.id===filters.owner)?filters.owner:fallback;
  const active={...filters,owner:ownerKey};
  const m=getDashboardMetrics(p,active);
  const activities=getFilteredActivities(p,active);
  const period=filters.range==='CUSTOM'&&filters.day?filters.day:(rangeLabels[filters.range]||'Last 7 days');
  const ownerLabel=ownerKey==='ALL'?'All team':ownerKey;
  const totalTouches=m.messages+m.replies+m.meetings+m.accepted;
  const replyRate=m.messages?Math.round(m.replies/m.messages*100):0;
  const meetingRate=m.replies?Math.round(m.meetings/m.replies*100):0;

  const weekly=getActivityAnalytics(p,{owner:ownerKey,days:7});
  const weeklyMax=Math.max(1,...weekly.timeline.map(d=>d.total));
  const weeklyCards=weekly.timeline.map(day=>{
    const weekday=formatWorkspaceWeekday(day.date,'short');
    const dateLabel=formatWorkspaceDateKey(day.date,{month:'short',day:'numeric'});
    const width=Math.max(4,Math.round(day.total/weeklyMax*100));
    return `<button class="weekly-day-card" data-report-day="${day.date}" title="Open ${dateLabel}">
      <div class="weekly-date"><span>${weekday}</span><strong>${dateLabel}</strong></div>
      <div class="weekly-total-bar"><i style="width:${width}%"></i></div>
      <div class="weekly-day-metrics">
        <div><span>Connections</span><strong>${day.connection_sent}</strong></div>
        <div><span>Messages</span><strong>${day.message_sent}</strong></div>
        <div><span>Replies</span><strong>${day.replied}</strong></div>
        <div><span>Meetings</span><strong>${day.meeting_booked}</strong></div>
      </div>
    </button>`;
  }).join('');

  const overview=getManagementOverview(p,ownerKey);
  const attention=getNeedsAttention(p,ownerKey);
  const accountPerformance=getAccountPerformance(p,active);
  const review=getWeeklyReview(p,ownerKey);
  const weeklyReport=buildWeeklyReportText(p,ownerKey,review);
  const bestLabel=review.best?.date ? `${formatWorkspaceWeekday(review.best.date,'short')}, ${formatWorkspaceDateKey(review.best.date,{month:'short',day:'numeric'})}` : '—';
  const weakLabel=review.weakest?.date ? `${formatWorkspaceWeekday(review.weakest.date,'short')}, ${formatWorkspaceDateKey(review.weakest.date,{month:'short',day:'numeric'})}` : '—';

  return `<main class="page">
    <div class="page-header"><div><div class="page-kicker">${p} / Reports</div><h1 class="page-title">Reports</h1></div><div class="header-actions"><a class="button" href="#/team">Team</a><a class="button primary" href="#/activity-analytics">Full activity</a></div></div>

    <section class="card card-pad report-accuracy-note" role="note">
      <strong>Historical data note</strong>
      <p>Historical reporting is reconstructed from daily reports and LinkedIn history, so some figures may not be 100% accurate. When a submitted daily report exists for a date, its reported totals are used for that day.</p>
    </section>

    <section class="manager-strip card report-filter-strip">
      <div class="manager-block"><span class="manager-label">Team member</span><select id="owner-filter" class="manager-select">${validOwners.map(x=>`<option value="${x.id}" ${ownerKey===x.id?'selected':''}>${x.label}</option>`).join('')}</select></div>
      <div class="manager-block range-block"><span class="manager-label">Report period</span><div class="range-pills">${['TODAY','7D','30D','CUSTOM'].map(r=>`<button class="range-pill ${filters.range===r?'active':''}" data-range="${r}">${rangeLabels[r]}</button>`).join('')}</div></div>
      <div class="manager-block custom-date ${filters.range==='CUSTOM'?'show':''}"><span class="manager-label">Day</span><input id="day-filter" type="date" value="${filters.day}"></div>
      <div class="manager-context"><span>Owner</span><strong>${ownerLabel}</strong><small>${period}</small></div>
    </section>

    <section class="management-section">
      <div class="section-head"><div><h3 class="section-title">Management overview</h3></div></div>
      <div class="management-periods">
        ${periodBlock('Today',overview.today)}
        ${periodBlock('Last 7 days',overview.week)}
        ${periodBlock('Last 30 days',overview.month)}
      </div>
    </section>

    <div class="grid grid-5 report-primary-metrics">
      ${metricCard({label:'Pending now',value:m.pending,foot:`${ownerLabel}`,ic:'clock'})}
      ${metricCard({label:'Accepted',value:m.accepted,foot:period,ic:'check'})}
      ${metricCard({label:'Messages',value:m.messages,foot:period,ic:'outreach'})}
      ${metricCard({label:'Replies',value:m.replies,foot:period,ic:'message'})}
      ${metricCard({label:'Meetings',value:m.meetings,foot:period,ic:'meetings'})}
    </div>

    <section class="card card-pad weekly-report-card">
      <div class="weekly-report-head">
        <div><h3 class="section-title">Weekly activity</h3><div class="section-meta">${ownerLabel} · Last 7 days</div></div>
        <div class="weekly-report-actions"><a class="button" href="#/activity-analytics">Open performance calendar</a></div>
      </div>
      <div class="weekly-activity-grid">${weeklyCards}</div>
    </section>

    <section class="management-two-col">
      <div class="card card-pad attention-card">
        <div class="section-head"><div><h3 class="section-title">Needs attention</h3><div class="section-meta">Open items that may need a next step</div></div><span class="attention-count">${attention.length}</span></div>
        <div class="attention-list">${attention.length?attention.map(item=>`<a class="attention-row" href="#/company/${encodeURIComponent(item.companyId||item.company)}"><div><strong>${esc(item.company)}</strong><span>${esc(item.contact||'—')} · ${esc(item.owner)}</span></div><div><b>${esc(item.reason)}</b><small>${esc(item.action)}</small></div></a>`).join(''):'<div class="empty-mini">Nothing is currently flagged.</div>'}</div>
      </div>

      <div class="card card-pad weekly-review-card">
        <div class="section-head"><div><h3 class="section-title">Weekly review</h3><div class="section-meta">${ownerLabel}</div></div><button class="button" id="copy-weekly-report">Copy weekly report</button></div>
        <div class="weekly-review-grid">
          <div><span>Total activity</span><strong>${review.total}</strong></div>
          <div><span>Reply rate</span><strong>${review.replyRate}%</strong></div>
          <div><span>Meeting / reply</span><strong>${review.meetingRate}%</strong></div>
          <div><span>Best day</span><strong>${esc(bestLabel)}</strong><small>${review.best?.total||0} actions</small></div>
          <div><span>Lowest day</span><strong>${esc(weakLabel)}</strong><small>${review.weakest?.total||0} actions</small></div>
          <div><span>Meetings booked</span><strong>${review.meetings}</strong></div>
        </div>
        <div class="weekly-company-sets">
          <div><span>Companies that replied</span><strong>${review.replyCompanies.length}</strong><p>${review.replyCompanies.slice(0,6).map(esc).join(' · ')||'—'}</p></div>
          <div><span>Companies that booked</span><strong>${review.meetingCompanies.length}</strong><p>${review.meetingCompanies.slice(0,6).map(esc).join(' · ')||'—'}</p></div>
        </div>
        <textarea id="weekly-report-copy-source" class="visually-hidden">${esc(weeklyReport)}</textarea>
      </div>
    </section>

    <section class="card card-pad account-performance-card">
      <div class="section-head"><div><h3 class="section-title">Account performance</h3><div class="section-meta">${ownerLabel} · ${period}</div></div></div>
      <div class="account-performance-grid">${accountPerformance.map(a=>`<div class="account-performance-row"><div><span>${esc(a.platform)}</span><strong>${esc(a.owner)}</strong></div><div><span>Connections</span><strong>${a.connections}</strong></div><div><span>Messages</span><strong>${a.messages}</strong></div><div><span>Replies</span><strong>${a.replies}</strong></div><div><span>Meetings</span><strong>${a.meetings}</strong></div><div><span>Reply rate</span><strong>${a.replyRate}%</strong></div></div>`).join('')}</div>
    </section>

    <section class="grid grid-3" style="margin-top:16px">
      <div class="card card-pad">
        <div class="section-head"><div><h3 class="section-title">Conversion snapshot</h3><div class="section-meta">${ownerLabel} · ${period}</div></div></div>
        <div class="report-rates"><div><span>Total tracked touches</span><strong>${totalTouches}</strong></div><div><span>Reply rate</span><strong>${replyRate}%</strong></div><div><span>Meeting / reply</span><strong>${meetingRate}%</strong></div></div>
      </div>
      <div class="card card-pad span-2">
        <div class="section-head"><div><h3 class="section-title">Activity log</h3></div></div>
        <div class="report-activity-list">${activities.length?activities.slice(0,40).map(a=>{const acc=getAccount(a.accountId);const detail=getActivityDetail(a);const actor=a.actor&&a.actor!==a.owner?` · Recorded by ${esc(a.actor)}`:'';return `<a class="report-activity-row report-activity-link" href="#/company/${encodeURIComponent(a.companyId||a.company)}"><div><strong>${esc(a.company)}</strong><span>${esc(a.label)}</span>${detail?`<small class="activity-detail-snippet">${esc(detail)}</small>`:''}</div><div><span>Owner</span><strong>${esc(a.owner)}</strong><small>${actor}</small></div><div><span>Account</span><strong>${esc(acc.label)}</strong></div><time>${formatDateTime(a.at)}</time></a>`;}).join(''):'<div class="empty-mini">No activity in this period.</div>'}</div>
      </div>
    </section>
    <div id="report-toast" class="toast">Copied</div>
  </main>`;
};
