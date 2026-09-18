import { getProject } from './projectState.js?v=20260918-major4';
import { getManagerFilters } from './managerState.js';
import { rangeLabels } from './uiConfig.js';
import { metricCard } from './metricCard.js';
import { icon } from './icons.js';
import { getActiveOwners, getDashboardMetrics, getWeeklyActivity, getFilteredActivities, getCompanies, getAccount, getActivityDetail } from './crmState.js?v=20260918-major4';
import { formatDateTime, formatCompactDateTime } from './date.js?v=20260918-gmt4-1';
import { esc } from './html.js';
import { getCurrentUser, canManage, isManagerAccount } from './authState.js?v=20260918-major4';
import { currentOwner, visibleOwnerOptions } from './access.js';

const ownerOptions = (selected) => visibleOwnerOptions(getActiveOwners())
  .map(x => `<option value="${x.id}" ${selected===x.id?'selected':''}>${x.label}</option>`).join('');

const periodLabelFor = (filters) => filters.range === 'CUSTOM' && filters.day
  ? filters.day
  : rangeLabels[filters.range] || 'Last 7 days';

const activityIcon = (type) => ({
  connection_sent:'connections', connection_accepted:'check', message_sent:'message', replied:'message',
  meeting_booked:'meetings', meeting_scheduled:'calendar', meeting_rescheduled:'calendar', meeting_done:'check',
  followup_sent:'followups', company_added:'companies'
}[type] || 'clock');

export const dashboardPage = () => {
  const project = getProject();
  const filters = getManagerFilters();
  const user = getCurrentUser();
  const allowedOwners = visibleOwnerOptions(getActiveOwners());
  const fallbackOwner = canManage() ? 'ALL' : currentOwner();
  const owner = allowedOwners.some(x=>x.id===filters.owner) ? filters.owner : fallbackOwner;
  const activeFilters = { ...filters, owner };
  const m = getDashboardMetrics(project, activeFilters);
  const weekly = getWeeklyActivity(project, owner);
  const activities = getFilteredActivities(project, activeFilters).slice(0, 6);
  const companies = getCompanies(project);
  const recentRefs = [...new Set(activities.map(x=>x.companyId||x.company))].slice(0, 5);
  const recentCompanies = recentRefs.map(ref=>companies.find(c=>c.id===ref||c.company===ref)).filter(Boolean);
  const periodLabel = periodLabelFor(filters);
  const ownerLabel = owner === 'ALL' ? 'All team' : owner;

  return `<main class="page">
    <div class="page-header dashboard-hero">
      <div>
        <div class="page-kicker">${project} / Operations</div>
        <h1 class="page-title">Outreach command center.</h1>
        
      </div>
      ${isManagerAccount() ? `<div class="header-actions"><a class="button primary" href="#/reports">${icon('reports')} Open reports</a><a class="button" href="#/team">${icon('team')} Team</a></div>` : `<div class="header-actions"><a class="button" href="#/connections">${icon('connections')} Add connections</a><a class="button primary" href="#/add-company">${icon('plus')} Add company</a></div>`}
    </div>

    <section class="manager-strip card">
      <div class="manager-block"><span class="manager-label">Team member</span>${canManage()?`<select id="owner-filter" class="manager-select">${ownerOptions(owner)}</select>`:`<div class="fixed-owner">${esc(currentOwner())}</div>`}</div>
      <div class="manager-block range-block"><span class="manager-label">Activity period</span><div class="range-pills">
        ${['TODAY','7D','30D','CUSTOM'].map(r=>`<button class="range-pill ${filters.range===r?'active':''}" data-range="${r}">${rangeLabels[r]}</button>`).join('')}
      </div></div>
      <div class="manager-block custom-date ${filters.range==='CUSTOM'?'show':''}"><span class="manager-label">Day</span><input id="day-filter" type="date" value="${filters.day}"></div>
      <div class="manager-context"><span>Viewing</span><strong>${ownerLabel}</strong><small>${periodLabel}</small></div>
    </section>

    <section class="grid grid-5 funnel-metrics">
      ${metricCard({label:'Pending connections',value:m.pending,foot:`Current open invitations · ${ownerLabel}`,ic:'clock'})}
      ${metricCard({label:'Accepted',value:m.accepted,foot:`Accepted during ${periodLabel.toLowerCase()}`,ic:'check'})}
      ${metricCard({label:'Messages sent',value:m.messages,foot:`Sent during ${periodLabel.toLowerCase()}`,ic:'outreach'})}
      ${metricCard({label:'Replies',value:m.replies,foot:`Received during ${periodLabel.toLowerCase()}`,ic:'message'})}
      ${metricCard({label:'Meetings booked',value:m.meetings,foot:`Booked during ${periodLabel.toLowerCase()}`,ic:'meetings'})}
    </section>

    <section class="grid grid-3" style="margin-top:16px">
      <div class="card card-pad span-2">
        <div class="section-head"><div><h3 class="section-title">Outreach funnel</h3><div class="section-meta">${ownerLabel} · ${periodLabel}</div></div><a class="button ghost" href="#/outreach">Open outreach ${icon('arrow')}</a></div>
        <div class="pipeline dashboard-pipeline">
          <div class="pipeline-stage"><span>Pending now</span><strong>${m.pending}</strong><div class="pipeline-line"></div></div>
          <div class="pipeline-stage"><span>Accepted</span><strong>${m.accepted}</strong><div class="pipeline-line"></div></div>
          <div class="pipeline-stage"><span>Messages</span><strong>${m.messages}</strong><div class="pipeline-line"></div></div>
          <div class="pipeline-stage"><span>Replies</span><strong>${m.replies}</strong><div class="pipeline-line"></div></div>
          <div class="pipeline-stage"><span>Meetings</span><strong>${m.meetings}</strong><div class="pipeline-line"></div></div>
        </div>
      </div>
      <a class="card card-pad weekly-activity-card" href="#/activity-analytics" aria-label="Open full activity analytics">
        <div class="section-head"><div><h3 class="section-title">Weekly activity</h3><div class="section-meta">Connections + messages · ${ownerLabel}</div></div><span class="analytics-open-link">Explore ${icon('arrow')}</span></div>
        <div class="bar-chart">${weekly.bars.map((v,i)=>`<div class="bar-item" title="${weekly.counts[i]} actions"><div class="bar" style="height:${v}%"></div><span>${weekly.labels[i]}</span></div>`).join('')}</div>
        <div class="weekly-card-foot">Click to open the full date-by-date performance explorer.</div>
      </a>
    </section>

    <section class="grid grid-3" style="margin-top:16px">
      <div class="span-2">
        <div class="section-head"><div><h3 class="section-title">Recently active companies</h3><div class="section-meta">Open a company to see the full relationship timeline</div></div><a href="#/companies" class="button ghost">All companies ${icon('arrow')}</a></div>
        <div class="table-wrap"><table class="compact-table"><thead><tr><th>Company</th><th>Owner</th><th>Status</th><th>Last activity</th></tr></thead><tbody>
          ${recentCompanies.length ? recentCompanies.map(c=>{
            const latest=activities.find(a=>a.companyId?a.companyId===c.id:a.company===c.company);
            return `<tr><td><a class="cell-company" href="#/company/${encodeURIComponent(c.id||c.company)}">${esc(c.company)}</a></td><td>${esc(c.owner)}</td><td><span class="status">${esc(c.status)}</span></td><td class="cell-muted">${latest?`${esc(latest.label)} · ${formatDateTime(latest.at)}`:'No new activity'}</td></tr>`;
          }).join('') : '<tr><td colspan="4" class="cell-muted">No activity in this period.</td></tr>'}
        </tbody></table></div>
      </div>
      <div class="card card-pad">
        <div class="section-head"><div><h3 class="section-title">Recent activity</h3></div></div>
        <div class="activity-list">${activities.length ? activities.map(a=>{
          const account=getAccount(a.accountId);
          const detail=getActivityDetail(a);
          return `<a class="activity-item activity-item-link" href="#/company/${encodeURIComponent(a.companyId||a.company)}"><div class="activity-dot">${icon(activityIcon(a.type))}</div><div class="activity-copy"><strong>${esc(a.company)} · ${esc(a.label)}</strong><span>${a.actor&&a.actor!==a.owner?`${esc(a.actor)} · for ${esc(a.owner)} · `:`${esc(a.owner)} · `}${esc(account.label)}</span>${detail?`<small class="activity-detail-snippet">${esc(detail)}</small>`:''}</div><div class="activity-time">${formatCompactDateTime(a.at)}</div></a>`;
        }).join('') : '<div class="empty-mini">No activity for this filter.</div>'}</div>
      </div>
    </section>


  </main>`;
};
