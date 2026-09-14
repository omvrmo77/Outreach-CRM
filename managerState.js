let owner = 'ALL';
let range = '7D';
let day = '';

export const getManagerFilters = () => ({ owner, range, day });
export const setOwner = (value) => { owner = value || 'ALL'; };
export const setRange = (value) => { range = value || '7D'; };
export const setDay = (value) => { day = value || ''; };
