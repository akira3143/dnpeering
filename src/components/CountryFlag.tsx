import React, { useState } from 'react';

interface CountryFlagProps {
  flag?: string;
  country?: string;
  code?: string;
  className?: string;
}

/**
 * 跨平台通用国旗渲染组件：
 * Windows 系统自带的 Segoe UI Emoji 字体由于微软历史政策限制，无法渲染彩色国旗 Emoji（会降级显示为英文字母）。
 * 本组件通过解析 Emoji 码点或节点国家代号，直接拉取高精度矢量 SVG 国旗，确保在 Windows/macOS/Linux/Android 等所有终端上完美一致呈现。
 */
export const CountryFlag: React.FC<CountryFlagProps> = ({
  flag = '',
  country = '',
  code = '',
  className = 'w-5 h-3.5 object-cover rounded-sm shadow-sm',
}) => {
  const [hasError, setHasError] = useState(false);

  // 1. 尝试从 2 位国家缩写 (例如 "JP", "SG", "US", "DE") 或 Emoji 码点提取
  let isoCode: string | null = null;
  if (flag) {
    const trimmed = flag.trim();
    if (/^[A-Za-z]{2}$/.test(trimmed)) {
      isoCode = trimmed.toLowerCase();
    } else {
      const chars = [...trimmed];
      if (chars.length === 2) {
        const c1 = chars[0].codePointAt(0);
        const c2 = chars[1].codePointAt(0);
        if (c1 && c2 && c1 >= 0x1F1E6 && c1 <= 0x1F1FF && c2 >= 0x1F1E6 && c2 <= 0x1F1FF) {
          isoCode = (String.fromCharCode(c1 - 0x1F1E6 + 65) + String.fromCharCode(c2 - 0x1F1E6 + 65)).toLowerCase();
        }
      }
    }
  }

  // 2. 若无法提取，尝试从节点代号前缀匹配 (例如 JP-7 -> jp, HK-1 -> hk, US-LA1 -> us, DE-FRA -> de, SG-1 -> sg)
  if (!isoCode && code) {
    const prefixMatch = code.match(/^[A-Za-z]{2}/);
    if (prefixMatch) {
      isoCode = prefixMatch[0].toLowerCase();
    }
  }

  // 3. 兜底常见国家全名映射
  if (!isoCode && country) {
    const map: Record<string, string> = {
      japan: 'jp',
      'hong kong': 'hk',
      'united states': 'us',
      usa: 'us',
      singapore: 'sg',
      germany: 'de',
      'united kingdom': 'gb',
      uk: 'gb',
      france: 'fr',
      netherlands: 'nl',
      australia: 'au',
      canada: 'ca',
      china: 'cn',
      taiwan: 'tw',
      korea: 'kr',
      'south korea': 'kr',
      finland: 'fi',
      sweden: 'se',
      switzerland: 'ch',
      russia: 'ru',
      brazil: 'br',
      india: 'in',
    };
    isoCode = map[country.toLowerCase()] || null;
  }

  if (!isoCode || hasError) {
    return (
      <span className="select-none font-mono text-xs font-bold text-slate-300">
        {flag || code?.slice(0, 2) || '🌐'}
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/${isoCode}.svg`}
      alt={country || code || flag}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
};
