import { canManage } from './authState.js';

const lockedSelect = (label, value, note='Configured when the backend is connected.') => `<div class="field"><label>${label}</label><select disabled aria-disabled="true"><option>${value}</option></select><small class="field-help">${note}</small></div>`;

export const settingsPage=()=>`<main class="page">
  <div class="page-header"><div><div class="page-kicker">System</div><h1 class="page-title">Settings</h1></div></div>
  <div class="grid grid-2">
    <div class="card card-pad"><div class="section-head"><h3 class="section-title">Workspace defaults</h3></div><div class="form-grid">
      ${lockedSelect('Default workspace','LFG')}
      ${lockedSelect('Default owner','Omar')}
      ${lockedSelect('Company duplicate warning','Enabled')}
      ${lockedSelect('Workspace Timezone','GMT-04 — Fixed UTC−04:00','Authoritative fixed timezone for shared CRM business dates, reports, meetings and follow-ups. It does not change with daylight saving time.')}
    </div></div>
    <div class="card card-pad"><div class="section-head"><h3 class="section-title">Activity preferences</h3></div><div class="form-grid">
      ${lockedSelect('Time display','12-hour (AM / PM)','Fixed for this frontend build.')}
      ${lockedSelect('Delete confirmation','Required','Fixed for this frontend build.')}
      ${lockedSelect('History','Keep all changes and corrections','History is always preserved in this frontend build.')}
    </div></div>
  </div>
  ${canManage()?`<section class="card card-pad settings-export-card"><div><h3 class="section-title">Data portability</h3><p class="section-meta">Export the complete frontend CRM state so the data is never trapped in one system.</p></div><button class="button primary" id="export-crm-data">Export CRM data</button></section>`:''}
</main>`;
