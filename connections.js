import { getProject } from './projectState.js';
import { accounts, getSelectedAccount, getConnections, getAccount, getCompanies, getHistoricalConnectionPaging } from './crmState.js?v=20260917-multicontact1';
import { icon } from './icons.js';
import { formatDateTime, formatDeviceDateTime, toLocalDateInputValue, getDeviceTimeValue, getDeviceTimeZone, getWorkspaceDateKey, timeParts12h, hourOptions12h, minuteOptions, periodOptions } from './date.js?v=20260918-gmt4-1';
import { esc } from './html.js';
import { filterOwnedRows } from './access.js';
import { isManagerAccount } from './authState.js';

const accountCard = (a, selected) => `<button class="account-choice ${selected===a.id?'selected':''}" data-account-select="${a.id}">
  <span class="account-platform">${a.platform}</span><strong>${esc(a.owner)}</strong><small>${selected===a.id?'Selected':'Use this account'}</small>
</button>`;

const rowActions = (r, readOnly=false) => {
  if(r.historicalOnly) return `<span class="cell-muted">Historical</span>`;
  if(readOnly) return `<a class="mini-action" href="#/company/${encodeURIComponent(r.companyId||r.company)}">Open</a>`;
  const a=getAccount(r.accountId);
  if(a.platform==='X') return `<a class="mini-action" href="#/company/${encodeURIComponent(r.companyId||r.company)}">Open activity</a>`;
  if(r.status==='Pending') return `<span class="cell-muted">Waiting</span>`;
  if(r.status==='Accepted') return `<a class="mini-action" href="#/add-company">Add company</a>`;
  return `<a class="mini-action" href="#/company/${encodeURIComponent(r.companyId||r.company)}">Open activity</a>`;
};

export const connectionsPage = () => {
  const p=getProject();
  const readOnly=isManagerAccount();
  const selected=getSelectedAccount(p);
  const selectedAccount=getAccount(selected);
  const now=new Date();
  const nowParts=timeParts12h(getDeviceTimeValue(now));
  const rows=readOnly?getConnections(p):filterOwnedRows(getConnections(p));
  const knownContacts=getCompanies(p).flatMap(company=>(company.contacts||[]).map(contact=>({company,contact})))
    .sort((a,b)=>a.company.company.localeCompare(b.company.company)||a.contact.name.localeCompare(b.contact.name)||String(a.contact.role||'').localeCompare(String(b.contact.role||'')));
  const knownContactOptions=knownContacts.map(({company,contact})=>`<option value="${esc(contact.id)}" data-company-id="${esc(company.id)}" data-person-name="${esc(contact.name)}" data-company-name="${esc(company.company)}">${esc(company.company)} — ${esc(contact.name)}${contact.role?` — ${esc(contact.role)}`:''}</option>`).join('');
  const pending=rows.filter(x=>x.status==='Pending').length;
  const messaged=rows.filter(x=>x.status==='Message Sent').length;
  const historicalPaging=getHistoricalConnectionPaging(p);

  return `<main class="page">
    <div class="page-header"><div><div class="page-kicker">${p} / Connections</div><h1 class="page-title">Connections</h1></div><div class="header-actions"><button class="button" id="copy-pending-connections">${icon('copy')} Copy pending</button></div></div>

    ${readOnly?'':`<section class="card card-pad connection-entry-card">
      <div class="section-head"><div><h3 class="section-title">Choose account once</h3><div class="section-meta">Everything you add below uses this account until you switch it.</div></div></div>
      <div class="account-choices">${accounts.map(a=>accountCard(a,selected)).join('')}</div>
      <div class="connection-actual-time">
        <div class="field"><label>${selectedAccount.platform==='LinkedIn'?'Connections sent date':'Message sent date'}</label><input id="connection-date" type="date" value="${toLocalDateInputValue(now)}"></div>
        <div class="field"><label>${selectedAccount.platform==='LinkedIn'?'Connections sent time':'Message sent time'}</label><div class="time-part-picker"><select id="connection-hour">${hourOptions12h(nowParts.hour)}</select><span class="time-colon">:</span><select id="connection-minute">${minuteOptions(nowParts.minute)}</select><select id="connection-period">${periodOptions(nowParts.period)}</select></div></div>
        <small>Enter the time shown on this device (${getDeviceTimeZone()}). The exact timestamp is preserved.</small>
        <div class="field workday-field"><label>Count toward workday</label><input id="connection-workday" type="date" value="${getWorkspaceDateKey(now)}"><small>Use the previous day when you are finishing that work after midnight.</small></div>
      </div>
      <div class="field connection-known-contact-field">
        <label>Existing CRM contact <span class="cell-muted">(recommended when already saved)</span></label>
        <select id="connection-known-contact"><option value="">New / not saved in CRM yet</option>${knownContactOptions}</select>
        <small>Choose the exact saved contact when available. You can add a different person at the same company after confirming the warning; the exact same person is still blocked as a duplicate.</small>
      </div>
      ${selectedAccount.platform==='LinkedIn'?`<div class="connection-entry-grid">
        <div>
          <div class="quick-connection-head"><div><h3 class="section-title">Quick add</h3></div></div>
          <form id="quick-connection-form" class="quick-connection-form">
            <div class="field"><label>Person name</label><input id="connection-name" autocomplete="off" placeholder="Full name" required></div>
            <div class="field"><label>Company</label><input id="connection-company" autocomplete="off" placeholder="Company name" required></div>
            <button class="button primary connection-add-button" type="submit">${icon('plus')} Add</button>
          </form>
        </div>
        <div class="bulk-connection-panel">
          <div class="quick-connection-head"><div><h3 class="section-title">Bulk add</h3><div class="section-meta">One person per line: <strong>Name | Company</strong></div></div></div>
          <textarea id="bulk-connections" class="bulk-connections-input" placeholder="Full Name | Company Name\nFull Name | Company Name\nFull Name | Company Name"></textarea>
          <div class="bulk-actions"><button class="button primary" id="add-bulk-connections" type="button">Add all connections</button><span id="bulk-connection-result" class="section-meta"></span></div>
        </div>
      </div>`:`<div class="quick-connection-head"><div><h3 class="section-title">Add X outreach</h3><div class="section-meta">X does not use the LinkedIn connection stage.</div></div></div>
      <form id="quick-connection-form" class="quick-connection-form with-message">
        <div class="field"><label>Person name</label><input id="connection-name" autocomplete="off" placeholder="Full name" required></div>
        <div class="field"><label>Company</label><input id="connection-company" autocomplete="off" placeholder="Company name" required></div>
        <div class="field connection-message-field"><label>Message sent</label><textarea id="connection-message" placeholder="Paste the exact X message you sent." required></textarea></div>
        <button class="button primary connection-add-button" type="submit">${icon('plus')} Add</button>
      </form>`}
      <div class="selected-account-line">Using <strong>${esc(selectedAccount.label)}</strong></div>
    </section>`}

    <section class="connection-summary grid grid-2">
      <div class="mini-stat card"><span>Pending</span><strong>${pending}</strong><small>Waiting for acceptance</small></div>
      <div class="mini-stat card"><span>Messaged</span><strong>${messaged}</strong><small>Accepted is inferred when the first LinkedIn message is recorded</small></div>
    </section>

    <div class="section-head connections-table-head"><div><h3 class="section-title">Connection list</h3><div class="section-meta">When a matching LinkedIn message is recorded, a pending connection is automatically counted as accepted. Times below use this device (${getDeviceTimeZone()}); reports are grouped by GMT-04 business time.</div></div><div class="connection-tabs"><button class="connection-tab active" data-connection-filter="ALL">All</button><button class="connection-tab" data-connection-filter="Pending">Pending</button><button class="connection-tab" data-connection-filter="Message Sent">Messaged</button></div></div>

    <div class="table-wrap data-list-frame"><table><thead><tr><th>Person</th><th>Company</th><th>Account</th><th>Owner</th><th>Sent / Added</th><th>Accepted</th><th>Status</th><th></th></tr></thead><tbody id="connections-body">
      ${rows.length ? rows.map(r=>{const a=r.historicalOnly?null:getAccount(r.accountId);return `<tr data-connection-row data-status="${esc(r.status)}"><td class="cell-company"><strong>${esc(r.name)}</strong>${r.contactRole?`<small class="cell-muted">${esc(r.contactRole)}</small>`:''}</td><td>${esc(r.company)}</td><td>${r.historicalOnly?'<span class="cell-muted">—</span>':`<span class="account-badge">${esc(a.label)}</span>`}</td><td>${r.historicalOnly?'<span class="cell-muted">—</span>':esc(r.owner)}</td><td class="cell-muted">${r.historicalOnly?'Date not in source':formatDeviceDateTime(r.sentAt)}</td><td class="cell-muted">${r.historicalOnly?'—':(r.acceptedAt?formatDeviceDateTime(r.acceptedAt):'—')}</td><td><span class="status ${r.status==='Accepted'?'replied':r.status==='Message Sent'?'sent':''}">${esc(r.status)}</span></td><td class="table-action-cell">${rowActions(r,readOnly)}</td></tr>`;}).join('') : '<tr><td colspan="8" class="cell-muted">No connections yet.</td></tr>'}
    </tbody></table></div>
    ${historicalPaging.total?`<div class="historical-connection-loader"><span class="section-meta">Historical archive: ${historicalPaging.loaded.toLocaleString()} / ${historicalPaging.total.toLocaleString()} loaded</span>${historicalPaging.loaded<historicalPaging.total?`<button class="button" id="load-more-historical-connections" type="button">Load 50 more historical rows</button>`:''}</div>`:''}
    <div id="connection-toast" class="toast">Saved</div>
  </main>`;
};
