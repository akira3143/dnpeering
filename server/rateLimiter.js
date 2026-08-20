/**
 * In-Memory Sliding Window Rate Limiter for Anti-Spam Protection
 */

const ipRequests = new Map();
const asnRequests = new Map();

// Configuration
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes window
const MAX_REQUESTS_PER_WINDOW = 2; // Max 2 requests per window
const MIN_INTERVAL_MS = 30 * 1000; // Minimum 30 seconds between requests

// Periodic cleanup of stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of ipRequests.entries()) {
    const valid = timestamps.filter(t => now - t < WINDOW_MS);
    if (valid.length === 0) ipRequests.delete(key);
    else ipRequests.set(key, valid);
  }
  for (const [key, timestamps] of asnRequests.entries()) {
    const valid = timestamps.filter(t => now - t < WINDOW_MS);
    if (valid.length === 0) asnRequests.delete(key);
    else asnRequests.set(key, valid);
  }
}, 10 * 60 * 1000);

/**
 * Checks if a request from an IP and ASN is allowed
 * @param {string} ip - Client IP address
 * @param {string|number} asn - Client ASN
 * @returns {{allowed: boolean, message?: string, retryAfter?: number}}
 */
export function checkRateLimit(ip, asn) {
  const now = Date.now();
  const cleanIp = String(ip || 'unknown').trim();
  const cleanAsn = String(asn || 'unknown').replace(/^AS/i, '').trim();

  // 1. Check IP rate limit
  if (cleanIp && cleanIp !== 'unknown') {
    const history = (ipRequests.get(cleanIp) || []).filter(t => now - t < WINDOW_MS);
    
    // Check minimum interval
    if (history.length > 0) {
      const lastTime = history[history.length - 1];
      const elapsed = now - lastTime;
      if (elapsed < MIN_INTERVAL_MS) {
        const retryAfter = Math.ceil((MIN_INTERVAL_MS - elapsed) / 1000);
        return {
          allowed: false,
          message: `提交过于频繁，请等待 ${retryAfter} 秒后再试。`,
          retryAfter,
        };
      }
    }

    // Check max requests in window
    if (history.length >= MAX_REQUESTS_PER_WINDOW) {
      const oldest = history[0];
      const retryAfter = Math.ceil((WINDOW_MS - (now - oldest)) / 1000);
      return {
        allowed: false,
        message: `您在短时间内提交申请过于频繁，请等待 ${retryAfter} 秒后再试。`,
        retryAfter,
      };
    }
  }

  // 2. Check ASN rate limit
  if (cleanAsn && cleanAsn !== 'unknown') {
    const history = (asnRequests.get(cleanAsn) || []).filter(t => now - t < WINDOW_MS);
    
    if (history.length > 0) {
      const lastTime = history[history.length - 1];
      const elapsed = now - lastTime;
      if (elapsed < MIN_INTERVAL_MS) {
        const retryAfter = Math.ceil((MIN_INTERVAL_MS - elapsed) / 1000);
        return {
          allowed: false,
          message: `该 ASN (${cleanAsn}) 刚刚已提交过申请，请等待 ${retryAfter} 秒后再试。`,
          retryAfter,
        };
      }
    }

    if (history.length >= MAX_REQUESTS_PER_WINDOW) {
      const oldest = history[0];
      const retryAfter = Math.ceil((WINDOW_MS - (now - oldest)) / 1000);
      return {
        allowed: false,
        message: `ASN (${cleanAsn}) 近期提交次数已达上限，请等待 ${retryAfter} 秒后再试。`,
        retryAfter,
      };
    }
  }

  return { allowed: true };
}

/**
 * Records a successful submission
 * @param {string} ip 
 * @param {string|number} asn 
 */
export function recordSubmission(ip, asn) {
  const now = Date.now();
  const cleanIp = String(ip || 'unknown').trim();
  const cleanAsn = String(asn || 'unknown').replace(/^AS/i, '').trim();

  if (cleanIp) {
    const history = (ipRequests.get(cleanIp) || []).filter(t => now - t < WINDOW_MS);
    history.push(now);
    ipRequests.set(cleanIp, history);
  }

  if (cleanAsn) {
    const history = (asnRequests.get(cleanAsn) || []).filter(t => now - t < WINDOW_MS);
    history.push(now);
    asnRequests.set(cleanAsn, history);
  }
}
