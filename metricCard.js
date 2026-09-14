import { icon } from './icons.js';
export const metricCard = ({label,value,foot='Live workspace',change='',ic='companies'}) => `
<div class="card card-pad metric-card">
  <div>
    <div class="metric-top"><div class="metric-label">${label}</div><div class="metric-icon">${icon(ic)}</div></div>
    <div class="metric-value">${value.toLocaleString()}</div>
  </div>
  <div class="metric-foot">${change ? `<span class="metric-change">${change}</span>` : ''}<span>${foot}</span></div>
</div>`;
