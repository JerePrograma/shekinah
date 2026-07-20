function decodeEntities(value) {
  const entities = new Map([
    ['&amp;', '&'],
    ['&lt;', '<'],
    ['&gt;', '>'],
    ['&quot;', '"'],
    ['&apos;', "'"],
  ]);

  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, '$1')
    .replace(/&(amp|lt|gt|quot|apos);/gu, (entity) => entities.get(entity) ?? entity)
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function escapeTag(tag) {
  return tag.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function extractXmlTag(fragment, tag) {
  const match = fragment.match(
    new RegExp(`<${escapeTag(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeTag(tag)}>`, 'u'),
  );
  return match ? decodeEntities(match[1].trim()) : '';
}

export function parseWxr(xml) {
  const channel = xml.match(/<channel>([\s\S]*?)<\/channel>/u)?.[1] ?? '';
  const items = [...channel.matchAll(/<item>([\s\S]*?)<\/item>/gu)].map((match) => {
    const fragment = match[1];
    const categories = [...fragment.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gu)].map(
      (category) => decodeEntities(category[1].trim()),
    );
    const meta = [...fragment.matchAll(/<wp:postmeta>([\s\S]*?)<\/wp:postmeta>/gu)].map(
      (metaMatch) => ({
        key: extractXmlTag(metaMatch[1], 'wp:meta_key'),
        value: extractXmlTag(metaMatch[1], 'wp:meta_value'),
      }),
    );

    return {
      id: Number(extractXmlTag(fragment, 'wp:post_id')),
      title: extractXmlTag(fragment, 'title'),
      link: extractXmlTag(fragment, 'link'),
      creator: extractXmlTag(fragment, 'dc:creator'),
      content: extractXmlTag(fragment, 'content:encoded'),
      excerpt: extractXmlTag(fragment, 'excerpt:encoded'),
      date: extractXmlTag(fragment, 'wp:post_date'),
      modified: extractXmlTag(fragment, 'wp:post_modified'),
      slug: extractXmlTag(fragment, 'wp:post_name'),
      status: extractXmlTag(fragment, 'wp:status'),
      parent: Number(extractXmlTag(fragment, 'wp:post_parent') || 0),
      type: extractXmlTag(fragment, 'wp:post_type'),
      attachmentUrl: extractXmlTag(fragment, 'wp:attachment_url'),
      categories,
      meta,
    };
  });

  return {
    title: extractXmlTag(channel, 'title'),
    link: extractXmlTag(channel, 'link'),
    description: extractXmlTag(channel, 'description'),
    language: extractXmlTag(channel, 'language'),
    wxrVersion: extractXmlTag(channel, 'wp:wxr_version'),
    baseSiteUrl: extractXmlTag(channel, 'wp:base_site_url'),
    items,
  };
}
