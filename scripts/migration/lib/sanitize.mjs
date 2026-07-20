const LEGACY_HOST_PATTERN = /https?:\/\/chocolate-chimpanzee-908881\.hostingersite\.com/giu;

export function sanitizeRecoveredHtml(input) {
  return input
    .replace(/<!--\s*wp:[\s\S]*?-->/gu, '')
    .replace(/<!--\s*\/wp:[\s\S]*?-->/gu, '')
    .replace(/<script\b[\s\S]*?<\/script>/giu, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/giu, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*')/giu, '')
    .replace(LEGACY_HOST_PATTERN, '')
    .replace(/\/wp-content\/uploads\/\d{4}\/\d{2}\//gu, '/images/')
    .replace(/href=(["'])\/wp-admin\/[\s\S]*?\1/giu, 'href="#"')
    .replace(/<br\s*><\/br>/giu, '<br>')
    .trim();
}

export function stripTags(input) {
  return input
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}
