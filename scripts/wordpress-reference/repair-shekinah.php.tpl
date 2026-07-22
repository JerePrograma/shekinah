<?php
if (!defined('ABSPATH')) {
    fwrite(STDERR, "WordPress no está cargado.\n");
    exit(2);
}

function shekinah_env(string $name, string $default = ''): string
{
    $value = getenv($name);
    return is_string($value) && $value !== '' ? $value : $default;
}

function shekinah_upsert_template_part(string $slug, string $title, string $content, string $area): int
{
    $existing = get_posts([
        'name' => $slug,
        'post_type' => 'wp_template_part',
        'post_status' => ['publish', 'draft', 'auto-draft'],
        'numberposts' => 1,
        'suppress_filters' => false,
    ]);
    $post = [
        'ID' => $existing ? (int) $existing[0]->ID : 0,
        'post_type' => 'wp_template_part',
        'post_status' => 'publish',
        'post_name' => $slug,
        'post_title' => $title,
        'post_content' => $content,
    ];
    $id = wp_insert_post($post, true);
    if (is_wp_error($id)) {
        throw new RuntimeException($id->get_error_message());
    }
    wp_set_object_terms((int) $id, get_stylesheet(), 'wp_theme', false);
    wp_set_object_terms((int) $id, $area, 'wp_template_part_area', false);
    return (int) $id;
}

function shekinah_bind_navigation(array $blocks, int $navigationId, int &$count): array
{
    foreach ($blocks as &$block) {
        if (($block['blockName'] ?? '') === 'core/navigation') {
            $block['attrs'] = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];
            $block['attrs']['ref'] = $navigationId;
            $count++;
        }
        if (!empty($block['innerBlocks'])) {
            $block['innerBlocks'] = shekinah_bind_navigation(
                $block['innerBlocks'],
                $navigationId,
                $count
            );
        }
    }
    unset($block);
    return $blocks;
}

$siteName = shekinah_env('SHEKINAH_SITE_NAME', 'Shekinah');
$tagline = shekinah_env('SHEKINAH_SITE_TAGLINE', 'Herbolario & tienda gourmet');
$email = sanitize_email(shekinah_env('SHEKINAH_CONTACT_EMAIL'));
$sourceUrl = esc_url_raw(shekinah_env('SHEKINAH_SOURCE_URL'));
if ($email === '' || $sourceUrl === '') {
    throw new RuntimeException('Faltan SHEKINAH_CONTACT_EMAIL o SHEKINAH_SOURCE_URL.');
}

$front = get_page_by_path('inicio', OBJECT, 'page');
$blog = get_page_by_path('blog', OBJECT, 'page');
if (!$front || !$blog) {
    throw new RuntimeException('No se encontraron las páginas publicadas inicio y blog.');
}

update_option('home', untrailingslashit($sourceUrl));
update_option('siteurl', untrailingslashit($sourceUrl));
update_option('blogname', $siteName);
update_option('blogdescription', $tagline);
update_option('show_on_front', 'page');
update_option('page_on_front', (int) $front->ID);
update_option('page_for_posts', (int) $blog->ID);

$hello = get_page_by_path('hello-world', OBJECT, 'post');
if ($hello && $hello->post_status === 'publish') {
    $result = wp_update_post(['ID' => (int) $hello->ID, 'post_status' => 'draft'], true);
    if (is_wp_error($result)) throw new RuntimeException($result->get_error_message());
}

$links = [
    ['Inicio', '/'],
    ['Nosotros', '/nosotros/'],
    ['Tienda', '/tienda/'],
    ['Blog', '/blog/'],
    ['Recetas', '/recetas/'],
];
$navigationContent = '';
foreach ($links as [$label, $route]) {
    $attributes = [
        'label' => $label,
        'url' => home_url($route),
        'kind' => 'custom',
        'isTopLevelLink' => true,
    ];
    $navigationContent .= '<!-- wp:navigation-link ' .
        wp_json_encode($attributes, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) .
        ' /-->' . "\n";
}

$navigationPosts = get_posts([
    'post_type' => 'wp_navigation',
    'post_status' => ['publish', 'draft'],
    'numberposts' => 1,
    'orderby' => 'ID',
    'order' => 'ASC',
]);
$navigationId = wp_insert_post([
    'ID' => $navigationPosts ? (int) $navigationPosts[0]->ID : 0,
    'post_type' => 'wp_navigation',
    'post_status' => 'publish',
    'post_name' => 'navegacion-shekinah',
    'post_title' => 'Navegación Shekinah',
    'post_content' => $navigationContent,
], true);
if (is_wp_error($navigationId)) throw new RuntimeException($navigationId->get_error_message());
$navigationId = (int) $navigationId;

$headerSource = '';
$existingHeaders = get_posts([
    'name' => 'header',
    'post_type' => 'wp_template_part',
    'post_status' => ['publish', 'draft'],
    'numberposts' => 1,
    'suppress_filters' => false,
]);
if ($existingHeaders) {
    $headerSource = (string) $existingHeaders[0]->post_content;
} else {
    $headerFile = get_theme_file_path('parts/header.html');
    if (is_file($headerFile)) $headerSource = (string) file_get_contents($headerFile);
}

$navigationBlocks = 0;
if ($headerSource !== '') {
    $headerBlocks = shekinah_bind_navigation(parse_blocks($headerSource), $navigationId, $navigationBlocks);
    $headerContent = serialize_blocks($headerBlocks);
} else {
    $headerContent = '';
}
if ($navigationBlocks === 0) {
    $navigationAttributes = wp_json_encode([
        'ref' => $navigationId,
        'overlayMenu' => 'mobile',
        'layout' => ['type' => 'flex', 'justifyContent' => 'right'],
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $headerContent = <<<HTML
<!-- wp:group {"tagName":"header","align":"full","className":"site-header","backgroundColor":"color-1","layout":{"type":"constrained"}} -->
<header class="wp-block-group alignfull site-header has-color-1-background-color has-background">
<!-- wp:group {"align":"wide","layout":{"type":"flex","flexWrap":"nowrap","justifyContent":"space-between"}} -->
<div class="wp-block-group alignwide"><!-- wp:site-title {"level":0} /-->
<!-- wp:navigation {$navigationAttributes} /--></div>
<!-- /wp:group -->
</header>
<!-- /wp:group -->
HTML;
}
$headerId = shekinah_upsert_template_part('header', 'Header', $headerContent, 'header');

$footerNavigationAttributes = wp_json_encode([
    'ref' => $navigationId,
    'overlayMenu' => 'never',
    'layout' => ['type' => 'flex', 'orientation' => 'vertical'],
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
$mailto = esc_url('mailto:' . $email);
$emailHtml = esc_html($email);
$siteNameHtml = esc_html($siteName);
$taglineHtml = esc_html($tagline);
$year = esc_html(wp_date('Y'));
$footerContent = <<<HTML
<!-- wp:group {"tagName":"footer","align":"full","className":"site-footer","style":{"spacing":{"padding":{"top":"var:preset|spacing|60","bottom":"var:preset|spacing|60"}}},"backgroundColor":"color-2","textColor":"light","layout":{"type":"constrained"}} -->
<footer class="wp-block-group alignfull site-footer has-light-color has-color-2-background-color has-text-color has-background" style="padding-top:var(--wp--preset--spacing--60);padding-bottom:var(--wp--preset--spacing--60)">
<!-- wp:columns {"align":"wide"} -->
<div class="wp-block-columns alignwide">
<!-- wp:column -->
<div class="wp-block-column"><!-- wp:heading {"level":3,"textColor":"light"} -->
<h3 class="wp-block-heading has-light-color has-text-color">{$siteNameHtml}</h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"textColor":"light"} -->
<p class="has-light-color has-text-color">{$taglineHtml}</p>
<!-- /wp:paragraph --></div>
<!-- /wp:column -->
<!-- wp:column -->
<div class="wp-block-column"><!-- wp:heading {"level":3,"textColor":"light"} -->
<h3 class="wp-block-heading has-light-color has-text-color">Menú</h3>
<!-- /wp:heading -->
<!-- wp:navigation {$footerNavigationAttributes} /--></div>
<!-- /wp:column -->
<!-- wp:column -->
<div class="wp-block-column"><!-- wp:heading {"level":3,"textColor":"light"} -->
<h3 class="wp-block-heading has-light-color has-text-color">Contacto</h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"textColor":"light"} -->
<p class="has-light-color has-text-color"><a href="{$mailto}">{$emailHtml}</a></p>
<!-- /wp:paragraph --></div>
<!-- /wp:column -->
</div>
<!-- /wp:columns -->
<!-- wp:paragraph {"align":"center","textColor":"light"} -->
<p class="has-text-align-center has-light-color has-text-color">© {$year} {$siteNameHtml}. Todos los derechos reservados.</p>
<!-- /wp:paragraph -->
</footer>
<!-- /wp:group -->
HTML;
$footerId = shekinah_upsert_template_part('footer', 'Footer', $footerContent, 'footer');

flush_rewrite_rules(false);
wp_cache_flush();

echo wp_json_encode([
    'result' => 'success',
    'display_name' => get_option('blogname'),
    'front_page_id' => (int) get_option('page_on_front'),
    'posts_page_id' => (int) get_option('page_for_posts'),
    'navigation_id' => $navigationId,
    'header_id' => $headerId,
    'footer_id' => $footerId,
    'hello_world_status' => $hello ? get_post_status($hello) : 'not-found',
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
