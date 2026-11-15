import { loadLocalizedCatalog } from "../docs/catalog";
import { renderMarkdownTwin } from "../docs/markdown-twin";

interface TwinProps {
  markdown: string;
}

/**
 * One Markdown twin per published page and locale.
 * @returns The static paths, keyed by Starlight entry id.
 */
export function getStaticPaths(): { params: { slug: string }; props: TwinProps }[] {
  return loadLocalizedCatalog().map((page) => ({
    params: { slug: page.id },
    props: { markdown: renderMarkdownTwin(page) },
  }));
}

/**
 * A page's Markdown twin.
 * @param context - The route context carrying the rendered twin.
 * @param context.props - The static props.
 * @returns The `text/markdown` response.
 */
export function GET({ props }: { props: TwinProps }): Response {
  return new Response(props.markdown, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
