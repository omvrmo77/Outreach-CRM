import { getProject } from './projectState.js';
import { getCompanies } from './crmState.js';
import { companiesTable } from './dataTable.js';
import { icon } from './icons.js';
import { filterOwnedRows, isPersonalOutreachView } from './access.js';
import { isManagerAccount } from './authState.js';

export const companiesPage = () => {
  const p=getProject();
  const rows=[...filterOwnedRows(getCompanies(p))].sort((a,b)=>new Date(b.addedAt||b.createdAt||0)-new Date(a.addedAt||a.createdAt||0));
  const initialQuery=sessionStorage.getItem('lfg-crm-company-search')||'';
  return `<main class="page">
    <div class="page-header"><div><div class="page-kicker">${p} / Companies</div><h1 class="page-title">Companies</h1></div>${isManagerAccount()?'':`<a class="button primary" href="#/add-company">${icon('plus')} Add company</a>`}</div>
    <div class="section-head"><div class="search-box">${icon('search')}<input id="company-search" value="${initialQuery.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}" placeholder="Search company, contact or owner…"></div><div class="section-meta">${rows.length} companies${isPersonalOutreachView()?' · Your pipeline':''}</div></div>
    <div id="companies-table">${companiesTable(rows)}</div>
  </main>`;
};
