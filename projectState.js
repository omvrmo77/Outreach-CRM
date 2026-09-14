const listeners = new Set();
let currentProject = localStorage.getItem('lfg-demo-project') || 'LFG';

export const getProject = () => currentProject;
export const setProject = (project) => {
  currentProject = project;
  localStorage.setItem('lfg-demo-project', project);
  listeners.forEach(fn => fn(project));
};
export const onProjectChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
