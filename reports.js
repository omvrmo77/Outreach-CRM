import { getProject } from './projectState.js?v=20260918-major4';
import { getManagerFilters } from './managerState.js';
import { metricCard } from './metricCard.js';
import { rangeLabels } from './uiConfig.js';
import { getActiveOwners, getDashboardMetrics, getFilteredActivities, getAccount, getActivityDetail, getActivityAnalytics, getBackendProfiles } from './crmState.js?v=20260918-major4';
import { getManagementOverview, getNeedsAttention, getAccountPerformance, getWeeklyReview, buildWeeklyReportText } from './managementInsights.js';
import { formatDateTime, formatWorkspaceDateKey, formatWorkspaceWeekday, getWorkspaceDateKey } from './date.js?v=20260918-gmt4-1';
import { esc } from './html.js';
import { canManage, getCurrentUser } from './authState.js?v=20260918-major4';
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
  const monthlyProfiles=getBackendProfiles().filter(x=>x.approval_status==='approved'&&x.is_active!==false);
  const monthlyProducts=Array.isArray(user?.productCodes)?user.productCodes:[];
  const monthlyDefault=getWorkspaceDateKey(new Date()).slice(0,7);
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

    <section class="card card-pad monthly-report-builder">
      <div class="section-head monthly-report-head">
        <div><div class="page-kicker">Department reporting</div><h3 class="section-title">Monthly report</h3><p class="section-copy">Build one report across every product the selected person worked on, or narrow it to one product. The default scope is all products you are allowed to view.</p></div>
      </div>
      <div class="monthly-report-controls">
        <div class="field"><label for="monthly-report-month">Month</label><input id="monthly-report-month" type="month" value="${monthlyDefault}"></div>
        <div class="field"><label for="monthly-report-owner">Team member</label><select id="monthly-report-owner"><option value="">All team</option>${monthlyProfiles.map(x=>`<option value="${esc(x.id)}" data-products="${esc((x.product_codes||[]).join(','))}" ${x.id===user?.id?'selected':''}>${esc(x.full_name||x.username||x.email||'Team member')}</option>`).join('')}</select></div>
        <div class="field"><label for="monthly-report-product">Product scope</label><select id="monthly-report-product"><option value="ALL">All products</option>${monthlyProducts.map(code=>`<option value="${esc(code)}">${esc(code)}</option>`).join('')}</select></div>
        <div class="monthly-report-actions"><button class="button primary" id="view-monthly-report">View monthly report</button><button class="button" id="download-monthly-report" disabled>Download CSV</button><button class="button" id="print-monthly-report" disabled>Print / Save PDF</button></div>
      </div>
      <div id="monthly-report-status" class="section-meta">Choose the month, person and product scope, then open the report.</div>
      <div id="monthly-report-result"></div>
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


const reportEventLabel=(type='')=>({
  connection_sent:'Connection sent',connection_accepted:'Connection accepted',company_added:'Company added',contact_added:'Contact added',
  message_sent:'Message sent',reply_received:'Reply received',follow_up_sent:'Follow-up sent',follow_up_scheduled:'Follow-up scheduled',
  meeting_booked:'Meeting booked',meeting_scheduled:'Meeting scheduled',meeting_rescheduled:'Meeting rescheduled',meeting_done:'Meeting done',note_added:'Note added'
}[type]||String(type||'Activity').replaceAll('_',' '));
const reportDetail=(a={})=>a.message_text||a.reply_text||a.note||'';
const reportPreview=(value='')=>String(value||'').replace(/\s+/g,' ').trim().slice(0,120);

export const renderMonthlyReport=(report={})=>{
  const metrics=report.metrics||{};
  const companies=report.companies||{};
  const direction=report.direction_breakdown||{};
  const products=Array.isArray(report.product_breakdown)?report.product_breakdown:[];
  const activities=Array.isArray(report.activities)?report.activities:[];
  const productLabel=(report.product_codes||[]).join(' + ')||'All allowed products';
  const activityRows=activities.map(a=>{
    const detail=reportDetail(a);
    return `<tr><td>${esc(a.workday_date||'—')}</td><td>${esc(a.product_code||'—')}</td><td>${esc(reportEventLabel(a.event_type))}</td><td>${esc(a.company||'—')}</td><td>${esc(a.contact||'—')}</td><td>${esc(a.account||'—')}</td><td>${detail?`<details class="monthly-detail"><summary>${esc(reportPreview(detail)||'View details')}</summary><div>${esc(detail)}</div></details>`:'—'}</td></tr>`;
  }).join('');
  return `<div class="monthly-report-output">
    <div class="monthly-report-title"><div><span>Monthly department report</span><h2>${esc(report.owner_name||'All team')}</h2><small>${esc(report.start_date||'')} to ${esc(report.end_date||'')} · ${esc(productLabel)} · GMT-04</small></div><div class="monthly-report-badge">${activities.length} activities</div></div>
    <div class="monthly-metric-grid">
      <div><span>Connections sent</span><strong>${Number(metrics.connections_sent||0)}</strong></div><div><span>Accepted</span><strong>${Number(metrics.connections_accepted||0)}</strong></div>
      <div><span>Messages sent</span><strong>${Number(metrics.messages_sent||0)}</strong></div><div><span>Replies</span><strong>${Number(metrics.replies||0)}</strong></div>
      <div><span>Follow-ups</span><strong>${Number(metrics.followups_sent||0)}</strong></div><div><span>Meetings booked</span><strong>${Number(metrics.meetings_booked||0)}</strong></div>
      <div><span>Companies touched</span><strong>${Number(companies.touched||0)}</strong></div><div><span>Companies replied</span><strong>${Number(companies.replied||0)}</strong></div>
    </div>
    <div class="monthly-direction-grid"><div><span>Inbound relationships</span><strong>${Number(direction.inbound||0)}</strong></div><div><span>Outbound relationships</span><strong>${Number(direction.outbound||0)}</strong></div><div><span>Older / unspecified</span><strong>${Number(direction.unspecified||0)}</strong></div></div>
    <div class="monthly-product-breakdown"><h3>Product breakdown</h3>${products.length?products.map(x=>`<div class="monthly-product-row"><strong>${esc(x.code)}</strong><span>${Number(x.connections_sent||0)} connections</span><span>${Number(x.messages_sent||0)} messages</span><span>${Number(x.replies||0)} replies</span><span>${Number(x.meetings_booked||0)} meetings</span></div>`).join(''):'<div class="empty-mini">No product activity in this month.</div>'}</div>
    <div class="monthly-activity-section"><div class="section-head"><div><h3 class="section-title">Complete activity detail</h3><div class="section-meta">Every recorded activity returned for this month and scope.</div></div></div><div class="monthly-table-wrap"><table class="monthly-activity-table"><thead><tr><th>Workday</th><th>Product</th><th>Activity</th><th>Company</th><th>Contact</th><th>Account</th><th>Details</th></tr></thead><tbody>${activityRows||'<tr><td colspan="7">No activity recorded.</td></tr>'}</tbody></table></div></div>
    <p class="monthly-history-note">${esc(report.historical_note||'')}</p>
  </div>`;
};

const csvCell=(value)=>`"${String(value??'').replaceAll('"','""').replace(/\r?\n/g,' ')}"`;
export const monthlyReportCsv=(report={})=>{
  const rows=[];
  rows.push(['Monthly Department Report']);
  rows.push(['Team member',report.owner_name||'All team']);
  rows.push(['Period',`${report.start_date||''} to ${report.end_date||''}`]);
  rows.push(['Products',(report.product_codes||[]).join(' + ')||'All allowed products']);
  rows.push(['Timezone','GMT-04']);
  rows.push([]);
  const m=report.metrics||{}, c=report.companies||{}, d=report.direction_breakdown||{};
  rows.push(['Metric','Value']);
  rows.push(['Connections sent',m.connections_sent||0],['Connections accepted',m.connections_accepted||0],['Messages sent',m.messages_sent||0],['Replies',m.replies||0],['Follow-ups sent',m.followups_sent||0],['Meetings booked',m.meetings_booked||0],['Companies researched',m.companies_researched||0],['Meetings qualified',m.meetings_qualified||0],['Companies touched',c.touched||0],['Companies replied',c.replied||0],['Companies booked',c.booked||0],['Inbound relationships',d.inbound||0],['Outbound relationships',d.outbound||0],['Older / unspecified direction',d.unspecified||0]);
  rows.push([]); rows.push(['Product','Connections sent','Accepted','Messages','Replies','Follow-ups','Meetings']);
  (report.product_breakdown||[]).forEach(x=>rows.push([x.code,x.connections_sent||0,x.connections_accepted||0,x.messages_sent||0,x.replies||0,x.followups_sent||0,x.meetings_booked||0]));
  rows.push([]); rows.push(['Workday','Exact timestamp','Product','Activity','Company','Contact','Account','Owner','Actor','Details']);
  (report.activities||[]).forEach(a=>rows.push([a.workday_date||'',a.occurred_at||'',a.product_code||'',reportEventLabel(a.event_type),a.company||'',a.contact||'',a.account||'',a.owner||'',a.actor||'',reportDetail(a)]));
  return rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
};

export const monthlyReportPrintHtml=(report={})=>`<!doctype html><html><head><meta charset="utf-8"><title>Monthly Report · ${esc(report.owner_name||'All team')}</title><style>body{font-family:Arial,sans-serif;color:#111;padding:28px}h1{margin:0 0 6px}small{color:#555}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:22px 0}.metrics div,.products div{border:1px solid #ddd;padding:10px;border-radius:8px}.metrics span{display:block;font-size:11px;text-transform:uppercase;color:#666}.metrics strong{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:18px;font-size:11px}th,td{border:1px solid #ddd;padding:6px;vertical-align:top;text-align:left}th{background:#f4f4f4}pre{white-space:pre-wrap;margin:0;font-family:Arial,sans-serif}.products{display:grid;gap:8px;margin:12px 0}@media print{body{padding:0}}</style></head><body><h1>Monthly Department Report</h1><h2>${esc(report.owner_name||'All team')}</h2><small>${esc(report.start_date||'')} to ${esc(report.end_date||'')} · ${(report.product_codes||[]).map(esc).join(' + ')||'All allowed products'} · GMT-04</small><div class="metrics">${Object.entries(report.metrics||{}).map(([k,v])=>`<div><span>${esc(k.replaceAll('_',' '))}</span><strong>${Number(v||0)}</strong></div>`).join('')}${Object.entries(report.companies||{}).map(([k,v])=>`<div><span>companies ${esc(k.replaceAll('_',' '))}</span><strong>${Number(v||0)}</strong></div>`).join('')}</div><h3>Relationship direction</h3><div class="products"><div><strong>Inbound</strong> · ${Number(report.direction_breakdown?.inbound||0)}</div><div><strong>Outbound</strong> · ${Number(report.direction_breakdown?.outbound||0)}</div><div><strong>Older / unspecified</strong> · ${Number(report.direction_breakdown?.unspecified||0)}</div></div><h3>Product breakdown</h3><div class="products">${(report.product_breakdown||[]).map(x=>`<div><strong>${esc(x.code)}</strong> · ${Number(x.connections_sent||0)} connections · ${Number(x.messages_sent||0)} messages · ${Number(x.replies||0)} replies · ${Number(x.meetings_booked||0)} meetings</div>`).join('')}</div><h3>Complete activity detail</h3><table><thead><tr><th>Workday</th><th>Product</th><th>Activity</th><th>Company</th><th>Contact</th><th>Account</th><th>Details</th></tr></thead><tbody>${(report.activities||[]).map(a=>`<tr><td>${esc(a.workday_date||'')}</td><td>${esc(a.product_code||'')}</td><td>${esc(reportEventLabel(a.event_type))}</td><td>${esc(a.company||'')}</td><td>${esc(a.contact||'')}</td><td>${esc(a.account||'')}</td><td><pre>${esc(reportDetail(a))}</pre></td></tr>`).join('')}</tbody></table></body></html>`;
