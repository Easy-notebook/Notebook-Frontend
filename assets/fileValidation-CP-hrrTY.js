function o(s) {
  if (!s || s.trim().length === 0) return !1;
  const t = ['.tmp', '.lock', '.swp', '~', '.bak'],
    n = s.toLowerCase();
  return !(
    t.some((e) => n.endsWith(e)) ||
    s.length > 200 ||
    ['<', '>', '|', '\0', '', '', '', '', ''].some((e) => s.includes(e))
  );
}
function i(s, t) {
  return (
    (t == null ? void 0 : t.startsWith('.')) ||
    (t == null ? void 0 : t.includes('__pycache__')) ||
    (t == null ? void 0 : t.includes('.git')) ||
    (s == null ? void 0 : s.startsWith('cells/'))
  );
}
function u(s) {
  if (!s) return !1;
  const t = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp'],
    n = s.toLowerCase();
  return (
    t.some((r) => n.includes(r)) ||
    s.includes('Screenshot') ||
    s.includes('Image') ||
    s.includes('photo')
  );
}
function a(s) {
  return !s || s.startsWith('assets/') || s === 'assets'
    ? !1
    : [
        /^\./,
        /~$/,
        /\.tmp$/i,
        /\.lock$/i,
        /\.swp$/i,
        /\.bak$/i,
        /__pycache__/,
        /\.git/,
        /node_modules/,
        /\.DS_Store/,
        /Thumbs\.db/i,
      ].some((n) => n.test(s));
}
function c(s, t, n) {
  return o(s)
    ? i(s, t)
      ? {
          isValid: !1,
          reason: 'System file or cell fragment',
          suggestion: 'These files should not appear as tabs',
        }
      : a(s)
        ? {
            isValid: !1,
            reason: 'System or temporary file',
            suggestion: 'These files should not be opened as tabs',
          }
        : u(s) && (!n || n.trim().length === 0)
          ? {
              isValid: !1,
              reason: 'Potentially missing image file',
              suggestion: 'File may not exist on server',
            }
          : { isValid: !0 }
    : { isValid: !1, reason: 'Invalid file path', suggestion: 'Check file path format' };
}
export {
  u as isPotentialMissingImage,
  a as isSystemOrTempFile,
  o as isValidFilePath,
  i as shouldFilterFromTabs,
  c as validateFileForTab,
};
