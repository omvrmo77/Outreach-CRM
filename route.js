export const safeDecodeRouteComponent = (value='') => {
  try {
    return { ok:true, value:decodeURIComponent(String(value)) };
  } catch {
    return { ok:false, value:'' };
  }
};
