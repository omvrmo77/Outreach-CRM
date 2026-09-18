import { canManage, getCurrentUser, isOutreachAccount } from './authState.js?v=20260918-major4';

export const currentOwner = () => {
  const user = getCurrentUser();
  return user?.ownerName || user?.displayName || 'Omar';
};

export const hasManagementAccess = () => canManage();
export const isPersonalOutreachView = () => isOutreachAccount();

export const filterOwnedRows = (rows = []) => {
  if (!isOutreachAccount()) return rows;
  const owner = currentOwner();
  return rows.filter(row => row?.owner === owner || row?.c?.owner === owner);
};

export const visibleOwnerOptions = (owners = []) => {
  if (canManage()) return owners;
  const owner = currentOwner();
  return owners.filter(item => item.id === owner);
};

export const ownerForManagerFilter = (requested = 'ALL') => {
  if (canManage()) return requested;
  return currentOwner();
};
