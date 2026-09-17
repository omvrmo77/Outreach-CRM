import { getProject } from './projectState.js';
import { getNoRepeatCompanies } from './crmState.js?v=20260917-multicontact1';
import { icon } from './icons.js';

export const masterListPage = () => {
  const p = getProject();
  const companies = getNoRepeatCompanies(p);
  return `<main class="page master-list-page">
    <div class="page-header">
      <div><div class="page-kicker">${p} / No-repeat source</div><h1 class="page-title">Master company list</h1><p class="page-subtitle">Protect new outreach from repeats without pasting the entire CRM into every research prompt.</p></div>
    </div>

    <section class="card card-pad batch-check-card">
      <div class="batch-check-head">
        <div><span class="metric-label">Batch duplicate checker</span><h2>Paste a discovery batch. Check it against the CRM.</h2><p>Paste company names one per line, <strong>Company | Contact</strong>, or the normal ChatGPT batch format with <strong>Company Name:</strong> and <strong>Contact Person:</strong>. The check runs against the shared ${p} no-repeat data.</p></div>
        <div class="batch-check-badge">Up to 100</div>
      </div>
      <textarea id="batch-check-input" class="batch-check-input" rows="10" placeholder="Company Name: Example One\nContact Person: Jane Smith\n\nCompany Name: Example Two\nContact Person: John Lee\n\nOr simply:\nExample Three\nExample Four"></textarea>
      <div class="batch-check-actions">
        <button class="button primary" id="check-company-batch">${icon('search')} Check batch</button>
        <button class="button" id="clear-company-batch">Clear</button>
        <span class="field-help" id="batch-check-help">Checks duplicates only. “Clear” means not found in the CRM/no-repeat history; it does not mean the company is automatically a qualified lead.</span>
      </div>
      <div id="batch-check-results" class="batch-check-results" aria-live="polite"></div>
    </section>

    <section class="card card-pad master-copy-card">
      <div class="master-copy-main">
        <div class="master-copy-icon">${icon('copy')}</div>
        <div>
          <span class="metric-label">Companies protected from repetition</span>
          <strong>${companies.length}</strong>
          <p>Keep this for the first ChatGPT research prompt when useful. For later 10-company batches, use the Batch Duplicate Checker above instead of re-copying the entire list.</p>
        </div>
      </div>
      <button class="button primary master-copy-button" id="copy-master-list">${icon('copy')} Copy all companies</button>
    </section>

    <textarea id="master-copy-source" class="visually-hidden" aria-hidden="true" tabindex="-1"></textarea>
    <div class="toast" id="copy-toast">Master list copied</div>
  </main>`;
};
