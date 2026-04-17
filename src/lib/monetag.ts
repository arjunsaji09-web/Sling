/**
 * Monetag Configuration
 * 
 * If the link is not working (e.g. ERR_CONNECTION_REFUSED), 
 * update the MONETAG_DIRECT_LINK here.
 * 
 * Common domains include: omg1.com, omg2.com, ..., omg10.com
 * or other dynamic domains from your Monetag dashboard.
 */
export const MONETAG_DIRECT_LINK = "https://omg10.com/4/10885845";

export const checkAdBlock = async (): Promise<boolean> => {
  try {
    const response = await fetch(MONETAG_DIRECT_LINK, { mode: 'no-cors' });
    return false; // Connection was successful (or at least not refused)
  } catch (err) {
    return true; // Connection refused likely by adblocker
  }
};

export const openMonetagLink = async () => {
  const isBlocked = await checkAdBlock();
  if (isBlocked) {
    // We can't use alert/confirm in iframe, so we'll rely on the UI to handle this.
    // For now, still try to open, but the components should ideally check this.
  }
  window.open(MONETAG_DIRECT_LINK, '_blank', 'noopener,noreferrer');
};
