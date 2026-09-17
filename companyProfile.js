import { getProject } from './projectState.js';
import { getCompany, getActivities, getAccount, getAccounts, getChangeHistory, getCompanyContacts } from './crmState.js';
import { icon } from './icons.js';
import { formatDateTime, formatDeviceDateTime, getDeviceTimeValue, getDeviceDateKey, getDeviceTimeZone, getWorkspaceDateKey, formatWorkspaceDateKey, addWorkspaceDays, timeParts12h, hourOptions12h, minuteOptions, periodOptions } from './date.js';
import { esc } from './html.js';
import { getCurrentUser, isOutreachAccount, isManagerAccount } from './authState.js';

const eventIcon = (type) => ({
  connection_sent:'connections', connection_accepted:'check', message_sent:'message', followup_sent:'followups', followup_scheduled:'followups',
  replied:'message', meeting_booked:'meetings', meeting_scheduled:'calendar', meeting_rescheduled:'calendar', meeting_done:'check', company_added:'companies', contact_added:'user', note_added:'message'
}[type] || 'clock');

const editableTypes = new Set(['note_added','message_sent','followup_sent','followup_scheduled','replied','meeting_booked','meeting_scheduled','meeting_rescheduled','meeting_done']);
const actionButton = (type,label,primary=false) => `<button class="company-action ${primary?'primary-action':''}" data-company-action="${type}">${icon(eventIcon(type))}<span>${label}</span></button>`;
const nowTimeValue = () => getDeviceTimeValue(new Date());

const expandableDetail = (label,text,{secondary=false}={}) => {
  const value=String(text||'');
  const preview=value.replace(/\s+/g,' ').trim();
  const shortPreview=preview.length>150?`${preview.slice(0,147)}…`:preview;
  return `<details class="timeline-detail timeline-expandable ${secondary?'secondary':''}"><summary><span>${esc(label||'Details')}</span><strong>${esc(shortPreview||'Open full text')}</strong><em>View full</em></summary><p>${esc(value)}</p></details>`;
};

const detailBlock = (a) => {
  const blocks=[];
  const shouldExpand=['message_sent','followup_sent','replied'].includes(a.type);
  if(a.detail){
    blocks.push(shouldExpand?expandableDetail(a.detailLabel||'Details',a.detail):`<div class="timeline-detail"><span>${esc(a.detailLabel||'Details')}</span><p>${esc(a.detail)}</p></div>`);
  }
  if(a.secondaryDetail) blocks.push(expandableDetail(a.secondaryLabel||'Response / next move',a.secondaryDetail,{secondary:true}));
  if(a.note && !a.detail) blocks.push(`<div class="timeline-detail"><span>Note</span><p>${esc(a.note)}</p></div>`);
  return blocks.join('');
};

export const companyProfilePage = (name,{invalidRoute=false}={}) => {
  const p=getProject();
  if(invalidRoute || !name) return `<main class="page"><div class="empty-state"><h3>Invalid company link</h3><p>The company URL is malformed.</p><a class="button primary" href="#/companies">Back to companies</a></div></main>`;
  const row=getCompany(p,name);
  const user=getCurrentUser();
  if(!row) return `<main class="page"><div class="empty-state"><h3>Company not found</h3><a class="button primary" href="#/companies">Back to companies</a></div></main>`;
  if(isOutreachAccount() && row.owner !== user?.ownerName) return `<main class="page"><div class="empty-state"><h3>Not available in your workspace</h3><p>This company is owned by another outreach team member.</p><a class="button primary" href="#/companies">Back to your companies</a></div></main>`;

  const activities=getActivities(p,row.id);
  const chronological=[...activities].reverse();
  const first=chronological[0];
  const last=activities[0];
  const contacts=getCompanyContacts(row);
  const primary=contacts.find(c=>c.id===row.primaryContactId)||contacts[0]||null;
  const account=getAccount(primary?.accountId||row.accountId);
  const now=new Date();
  const today=getDeviceDateKey(now);
  const activityTime=timeParts12h(getDeviceTimeValue(now));
  const meetingTime=timeParts12h('10:00');
  const managerView=isManagerAccount();
  const changes=getChangeHistory(p,row.id).slice(0,8);
  const canMutate=!managerView;
  const canDeleteCompany=row.local && canMutate;
  const accountOptions=getAccounts().map(a=>`<option value="${esc(a.id)}">${esc(a.label)}</option>`).join('');
  const contactOptions=contacts.map(c=>`<option value="${esc(c.id)}" data-account-id="${esc(c.accountId||'')}">${esc(c.name)}${c.role?` · ${esc(c.role)}`:''}</option>`).join('');

  return `<main class="page">
    <div class="page-header company-profile-head">
      <div>
        <div class="page-kicker">${p} / Company relationship</div>
        <h1 class="company-title">${esc(row.company)}</h1>
        <div class="company-meta"><span>${esc(primary?.name||'—')}</span><span>${esc(primary?.role||'—')}</span><span>Owner: ${esc(row.owner)}</span><span>${esc(account.label)}</span></div>
      </div>
      <div class="header-actions">${canMutate?'<button class="button" id="undo-last-action">Undo last action</button>':''}<a class="button" href="#/outreach">${icon('arrow')} Outreach</a>${canDeleteCompany?'<button class="button danger-soft" id="delete-local-company">Delete company</button>':''}</div>
    </div>

    <section class="relationship-summary grid grid-5">
      <div class="summary-stat card"><span>Current status</span><strong>${esc(row.status||'—')}</strong></div>
      <div class="summary-stat card"><span>First activity</span><strong>${first?formatDeviceDateTime(first.at):'Date unavailable'}</strong><small>${first?`Local · Chicago ${formatDateTime(first.at)}`:''}</small></div>
      <div class="summary-stat card"><span>Last activity</span><strong>${last?formatDeviceDateTime(last.at):'Date unavailable'}</strong><small>${last?`Local · Chicago ${formatDateTime(last.at)}`:''}</small></div>
      <div class="summary-stat card"><span>Owner</span><strong>${esc(row.owner)}</strong></div>
      <div class="summary-stat card"><span>Contacts involved</span><strong>${contacts.length}</strong></div>
    </section>

    <section class="grid grid-3 company-workspace">
      <div class="span-2">
        <div class="card card-pad">
          <div class="section-head"><div><h3 class="section-title">Relationship timeline</h3></div></div>
          <div class="relationship-timeline">
            ${chronological.length ? chronological.map((a,i)=>{const acc=getAccount(a.accountId);return `<div class="timeline-event" data-activity-id="${esc(a.id)}"><div class="timeline-rail"><div class="timeline-node">${icon(eventIcon(a.type))}</div>${i<chronological.length-1?'<div class="timeline-line"></div>':''}</div><div class="timeline-content"><div class="timeline-top"><strong>${esc(a.label)}</strong><div class="timeline-event-controls"><time>${formatDeviceDateTime(a.at)}<small>Local · Chicago ${formatDateTime(a.at)}</small></time>${canMutate&&editableTypes.has(a.type)?`<button class="timeline-edit" data-edit-activity="${esc(a.id)}" title="Edit activity">Edit</button>`:''}${canMutate&&a.type!=='company_added'&&a.type!=='contact_added'?`<button class="timeline-delete" data-delete-activity="${esc(a.id)}" title="Delete activity">Delete</button>`:''}</div></div>${a.workdayDate&&a.workdayDate!==getWorkspaceDateKey(a.at)?`<div class="timeline-workday">Counted toward workday: <strong>${esc(formatWorkspaceDateKey(a.workdayDate,{weekday:'short'}))}</strong></div>`:''}<div class="timeline-meta">Owner: ${esc(a.owner)} · ${esc(acc.label)}${a.contact?` · ${esc(a.contact)}`:''}${a.actor&&a.actor!==a.owner?` · Recorded by ${esc(a.actor)}`:''}</div>${a.previousScheduledFor?`<div class="scheduled-event previous">Previous meeting time: <strong>${formatDeviceDateTime(a.previousScheduledFor)}</strong><small>Local · Chicago ${formatDateTime(a.previousScheduledFor)}</small></div>`:''}${a.scheduledFor?`<div class="scheduled-event">${a.type==='followup_scheduled'?'Follow-up':'Meeting'}: <strong>${formatDeviceDateTime(a.scheduledFor)}</strong><small>Local · Chicago ${formatDateTime(a.scheduledFor)}</small></div>`:''}${detailBlock(a)}</div></div>`;}).join('') : '<div class="empty-mini">No activity has been recorded yet.</div>'}
          </div>
        </div>
      </div>

      <div class="profile-stack">
        ${canMutate?`<div class="card card-pad quick-action-card">
          <div class="section-head"><div><h3 class="section-title">Add activity</h3></div></div>
          <div class="company-action-grid">
            ${actionButton('note_added','Add note')}${actionButton('message_sent','Message sent',true)}${actionButton('followup_sent','Follow-up sent')}${actionButton('followup_scheduled','Set follow-up')}${actionButton('replied','They replied')}${actionButton('meeting_booked','Meeting booked')}${actionButton('meeting_scheduled','Schedule meeting')}${actionButton('meeting_rescheduled','Reschedule meeting')}${actionButton('meeting_done','Meeting done')}
          </div>
        </div>`:''}

        <div class="card card-pad">
          <div class="section-head"><h3 class="section-title">Company details</h3></div>
          <div class="info-list single-column">
            <div class="info-item"><span>Contacts</span><div class="contact-detail-list">${contacts.length?contacts.map(c=>`<div class="contact-detail-row"><strong>${esc(c.name)}</strong><small>${esc(c.role||'Role not set')} · ${esc(getAccount(c.accountId).label)}</small></div>`).join(''):'<strong>—</strong>'}</div></div>
            <div class="info-item"><span>Next step</span><strong>${esc(row.nextStep||'Review relationship')}</strong></div>
            ${row.website?`<div class="info-item"><span>Website</span><strong>${esc(row.website)}</strong></div>`:''}
            ${row.targetCategory?`<div class="info-item"><span>Target category</span><strong>${esc(row.targetCategory)}</strong></div>`:''}
            ${row.priority?`<div class="info-item"><span>Priority</span><strong>${esc(row.priority)}</strong></div>`:''}
            <div class="info-item"><span>Project summary</span><strong>${esc(row.projectSummary||row.whyThisContact||'—')}</strong></div>
            <div class="info-item"><span>LFG / O1 angle</span><strong>${esc(row.angle||'—')}</strong></div>
            ${row.desiredOutcome?`<div class="info-item"><span>Desired outcome</span><strong>${esc(row.desiredOutcome)}</strong></div>`:''}
            ${row.telegramUsername?`<div class="info-item"><span>Telegram</span><strong>${esc(row.telegramUsername)}</strong></div>`:''}
            ${row.groupChat?`<div class="info-item"><span>Group chat</span><strong>${esc(row.groupChat)}</strong></div>`:''}
          </div>
        </div>
        <div class="card card-pad change-history-card">
          <div class="section-head"><div><h3 class="section-title">Corrections & changes</h3><div class="section-meta">Edits, deletions and archived relationships remain traceable.</div></div></div>
          <div class="change-history-list">${changes.length?changes.map(ch=>`<div class="change-history-row"><strong>${esc(ch.operation==='delete'?'Activity deleted':ch.operation==='archive_relationship'?'Relationship archived':'Activity edited')}</strong><span>${esc(ch.actor)} · ${formatDateTime(ch.at)}</span></div>`).join(''):'<div class="empty-mini">No corrections recorded.</div>'}</div>
        </div>
      </div>
    </section>

    ${canMutate?`<div class="action-modal" id="activity-action-modal" aria-hidden="true">
      <div class="action-modal-backdrop" data-close-action-modal></div>
      <div class="action-modal-card card activity-detail-modal">
        <div class="section-head"><div><h3 class="section-title" id="activity-modal-title">Add activity</h3></div><button class="icon-button" data-close-action-modal aria-label="Close activity form">×</button></div>
        <form id="activity-action-form">
          <input type="hidden" id="activity-action-type" value="message_sent"><input type="hidden" id="activity-edit-id" value="">
          ${contacts.length>1?`<div class="activity-identity-grid"><div class="field"><label>Contact</label><select id="activity-contact">${contactOptions}</select></div><div class="field"><label>Account used</label><select id="activity-account">${accountOptions}</select></div></div>`:`<input type="hidden" id="activity-contact" value="${esc(primary?.id||'')}"><div class="field"><label>Account used</label><select id="activity-account">${accountOptions}</select></div>`}
          <div class="field hidden" id="activity-target-wrap"><label id="activity-target-label">Record to update</label><select id="activity-target-id"></select><small id="activity-target-help">Choose the exact open record.</small></div>
          <div class="meeting-date-grid activity-date-time-grid">
            <div class="field"><label>Activity date</label><input id="activity-date" type="date" value="${today}" required></div>
            <div class="field"><label>Activity time</label><div class="time-part-picker"><select id="activity-hour" aria-label="Activity hour">${hourOptions12h(activityTime.hour)}</select><span class="time-colon">:</span><select id="activity-minute" aria-label="Activity minute">${minuteOptions(activityTime.minute)}</select><select id="activity-period" aria-label="Activity AM or PM">${periodOptions(activityTime.period)}</select></div></div>
          </div>
          <div class="local-time-help">Enter the time shown on this device: <strong>${getDeviceTimeZone()}</strong>. The exact timestamp is always preserved.</div>
          <div class="field workday-field"><label>Count toward workday</label><input id="activity-workday" type="date" value="${getWorkspaceDateKey(now)}"><small>This controls reporting only. It can be the Chicago activity date or the immediately previous day.</small></div>
          <div class="field" id="activity-detail-wrap"><label id="activity-detail-label">Details</label><textarea id="activity-detail" placeholder=""></textarea></div>
          <div class="field hidden" id="activity-secondary-wrap"><label id="activity-secondary-label">Response / next move</label><textarea id="activity-secondary" placeholder=""></textarea></div>
          <div id="activity-meeting-fields" class="hidden"><div class="field-label-row"><span id="activity-meeting-label">Meeting date & time</span></div><div class="meeting-date-grid"><div class="field"><label>Scheduled date</label><input id="activity-meeting-date" type="date" value="${addWorkspaceDays(today,1)}"></div><div class="field"><label>Scheduled time</label><div class="time-part-picker"><select id="activity-meeting-hour" aria-label="Meeting hour">${hourOptions12h(meetingTime.hour)}</select><span class="time-colon">:</span><select id="activity-meeting-minute" aria-label="Meeting minute">${minuteOptions(meetingTime.minute)}</select><select id="activity-meeting-period" aria-label="Meeting AM or PM">${periodOptions(meetingTime.period)}</select></div></div></div></div>
          <div class="modal-actions"><button type="button" class="button" data-close-action-modal>Cancel</button><button class="button primary" type="submit">Save activity</button></div>
        </form>
      </div>
    </div>`:''}
    <div id="profile-toast" class="toast">Activity saved</div>
  </main>`;
};
