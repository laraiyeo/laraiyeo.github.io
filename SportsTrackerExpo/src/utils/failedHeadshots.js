const failedSet = new Set();

export const isFailedHeadshot = (idOrUrl) => {
  if (!idOrUrl) return false;
  return failedSet.has(String(idOrUrl));
};

export const markFailedHeadshot = (idOrUrl) => {
  if (!idOrUrl) return;
  try {
    failedSet.add(String(idOrUrl));
  } catch (e) {}
};

export const clearFailedHeadshot = (idOrUrl) => {
  if (!idOrUrl) return;
  failedSet.delete(String(idOrUrl));
};

export const clearAllFailedHeadshots = () => failedSet.clear();
