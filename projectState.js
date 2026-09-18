const listeners = new Set();
let currentProject = localStorage.getItem('lfg-demo-project') || 'LFG';

export const getProject = () => currentProject;
export const setProject = (project) => {
  currentProject = String(project||'LFG');
  localStorage.setItem('lfg-demo-project', currentProject);
  listeners.forEach(fn => fn(currentProject));
};
export const ensureProjectAllowed = (allowedCodes=[]) => {
  const allowed=[...new Set((allowedCodes||[]).map(String).filter(Boolean))];
  if(!allowed.length) return currentProject;
  if(!allowed.includes(currentProject)) setProject(allowed[0]);
  return currentProject;
};
export const onProjectChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
