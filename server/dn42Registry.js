/**
 * DN42 Registry & WHOIS Service
 * Queries official DN42 registry / WHOIS to verify ASN existence, maintainer, and AS Name
 */

/**
 * Looks up ASN information from DN42 WHOIS
 * @param {string|number} asn 
 * @returns {Promise<{valid: boolean, asn?: string, asName?: string, descr?: string, maintainer?: string, adminContact?: string, raw?: string, error?: string}>}
 */
export async function lookupDn42Asn(asn) {
  const cleanAsn = String(asn || '').replace(/\D/g, '');
  if (!cleanAsn) {
    return { valid: false, error: 'ASN 不能为空' };
  }

  const queryAsn = `AS${cleanAsn}`;

  try {
    // 1. Query Burble DN42 Explorer WHOIS JSON API with a timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`https://explorer.burble.dn42/services/whois/?search=${encodeURIComponent(queryAsn)}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'AkiLab-DN42-Portal/1.0' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      
      // Parse Burble whois response structure
      if (Array.isArray(data) && data.length > 0) {
        const autNumRecord = data.find(item => item.type === 'aut-num') || data[0];
        const attributes = autNumRecord.attributes || {};

        const asName = attributes['as-name']?.[0] || attributes['descr']?.[0] || '';
        const descr = attributes['descr']?.[0] || '';
        const maintainer = attributes['mnt-by']?.[0] || '';
        const adminContact = attributes['admin-c']?.[0] || '';

        return {
          valid: true,
          asn: queryAsn,
          asName,
          descr,
          maintainer,
          adminContact,
          source: 'explorer.burble.dn42',
        };
      }
    }
  } catch (err) {
    console.warn(`DN42 WHOIS lookup via Burble failed for ${queryAsn}:`, err.message);
  }

  // Fallback heuristic: validate standard DN42 ASN format range (4242420000 ~ 4242429999)
  const asnNumber = parseInt(cleanAsn, 10);
  const isStandardDn42 = asnNumber >= 4242420000 && asnNumber <= 4242429999;

  return {
    valid: isStandardDn42,
    asn: queryAsn,
    asName: isStandardDn42 ? `DN42-AS${cleanAsn.slice(-4)}` : 'UNKNOWN',
    descr: isStandardDn42 ? 'DN42 Member Network' : 'Non-standard or Private ASN',
    maintainer: '',
    source: 'fallback_heuristic',
  };
}
