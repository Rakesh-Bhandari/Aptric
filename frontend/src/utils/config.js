// ============================================================
//  SINGLE SOURCE OF TRUTH — Change this ONE value to switch
//  between local dev and production deployment.
// ============================================================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://aptric.vercel.app';

export default API_BASE_URL;