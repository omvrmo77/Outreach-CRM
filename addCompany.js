import { getProject } from './projectState.js';
import { icon } from './icons.js';
import { getAccounts, getSelectedAccount } from './crmState.js?v=20260917-toastconn1';
import { toLocalDateInputValue, getDeviceTimeValue, getDeviceTimeZone, getWorkspaceDateKey, formatWorkspaceDateKey, timeParts12h, hourOptions12h, minuteOptions, periodOptions } from './date.js';

export const addCompanyPage = () => {
  const p = getProject();
  const selectedAccount=getSelectedAccount(p);
  const accountOptions=getAccounts().map(a=>`<option value="${a.id}" ${a.id===selectedAccount?'selected':''}>${a.label}</option>`).join('');
  const now=new Date();
  const nowParts=timeParts12h(getDeviceTimeValue(now));
  return `<main class="page">
    <div class="page-header">
      <div><div class="page-kicker">${p} / Add company</div><h1 class="page-title">Add company</h1></div>
    </div>

    <section class="quick-entry-grid">
      <div class="card card-pad paste-card">
        <div class="section-head"><div><h3 class="section-title">Paste outreach details</h3></div></div>
        <textarea id="company-paste" class="block-paste" placeholder="Contact Name: ...\nTitle: ...\nCompany: ...\nProject Summary: ...\nOutreach Message: ..."></textarea>
        <div class="entry-actions"><button class="button primary" id="parse-company">${icon('spark')} Read details</button><button class="button ghost" id="clear-company">Clear</button></div>
      </div>

      <div class="card card-pad preview-card">
        <div class="section-head"><div><h3 class="section-title">Review</h3></div></div>
        <div class="duplicate-banner neutral" id="connection-match-banner">${icon('connections')} Waiting for company details.</div>
        <label class="same-name-contact-confirm hidden" id="same-name-contact-confirm"><input type="checkbox" id="force-new-contact"> <span>This is a different person who happens to have the same name and role.</span></label>
        <div class="parsed-fields" id="company-parsed-fields"><div class="empty-mini">Paste the details and press <strong>Read details</strong>.</div></div>

        <div class="field hidden" id="company-account-wrap"><label>Account used</label><select id="company-account">${accountOptions}</select><small class="field-help">A matching pending connection will select its account automatically.</small></div>

        <div class="initial-message-panel hidden" id="initial-message-panel">
          <div class="required-message-head"><strong>First message sent</strong><small>A company is saved only together with the first outreach message you actually sent.</small></div>
          <div class="message-actual-time">
            <div class="field"><label>Message sent date</label><input id="initial-message-date" type="date" value="${toLocalDateInputValue(now)}"></div>
            <div class="field"><label>Message sent time</label><div class="time-part-picker"><select id="initial-message-hour">${hourOptions12h(nowParts.hour)}</select><span class="time-colon">:</span><select id="initial-message-minute">${minuteOptions(nowParts.minute)}</select><select id="initial-message-period">${periodOptions(nowParts.period)}</select></div></div>
          </div>
          <div class="local-time-help">Your device time: <strong>${getDeviceTimeZone()}</strong>. The exact timestamp is always preserved.</div>
          <div class="field workday-field"><label>Count toward workday</label><input id="initial-message-workday" type="date" value="${getWorkspaceDateKey(now)}"><small>The reporting day only. This never changes the real message timestamp.</small></div>
          <div class="field"><label>Message sent</label><textarea id="initial-message-body" placeholder="Paste the exact message that was sent." required></textarea><small class="field-help">Required. This becomes the first message in the relationship timeline.</small></div>
        </div>

        <button class="button primary full-button" id="save-company" disabled>${icon('plus')} Add company + message</button>
      </div>
    </section>
    <div id="company-toast" class="toast">Company added</div>
  </main>`;
};
