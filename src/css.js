// Converts a CSS text string ("background:#fff;font-size:12px") into a React
// inline-style object with camelCase keys, so the original inline styles can
// be reused almost verbatim as template literals: style={css(`...`)}
export function css(str) {
  if (!str) return undefined;
  const obj = {};
  String(str).split(';').forEach((rule) => {
    const idx = rule.indexOf(':');
    if (idx === -1) return;
    const prop = rule.slice(0, idx).trim();
    const val = rule.slice(idx + 1).trim();
    if (!prop || !val) return;
    const camel = prop.startsWith('--')
      ? prop
      : prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    obj[camel] = val;
  });
  return obj;
}
