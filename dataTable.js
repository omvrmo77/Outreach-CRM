import { getAccount } from './crmState.js?v=20260917-multicontact1';
import { esc } from './html.js';

export const statusClass = (s='') => {
  const v=s.toLowerCase();
  if(v.includes('meeting')) return 'meeting';
  if(v.includes('replied') || v.includes('accepted')) return 'replied';
  if(v.includes('follow')) return 'followup';
  if(v.includes('reject')) return 'reject';
  if(v.includes('sent')) return 'sent';
  return '';
};

export const companiesTable = (rows) => `
<div class="table-wrap data-list-frame"><table>
  <thead><tr><th>Company</th><th>Contact</th><th>Role</th><th>Status</th><th>Owner</th><th>Account</th></tr></thead>
  <tbody>${rows.length ? rows.map(r => {
    const account=getAccount(r.accountId);
    return `<tr data-company-row>
      <td><a class="cell-company" href="#/company/${encodeURIComponent(r.id||r.companyId||r.company)}">${esc(r.company)}</a></td>
      <td>${esc(r.contact)}</td><td class="cell-muted">${esc(r.role)}</td>
      <td><span class="status ${statusClass(r.status)}">${esc(r.status)}</span></td>
      <td>${esc(r.owner)}</td><td><span class="account-badge">${esc(account.label)}</span></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="cell-muted">No companies yet.</td></tr>'}</tbody>
</table></div>`;
