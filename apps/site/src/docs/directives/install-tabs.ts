import type { ContainerDirectiveNode, MdastNode } from "./index";

const TAB_META = /(?:^|\s)tab=(?:"([^"]*)"|'([^']*)')/;

function element(
  tag: string,
  properties: Record<string, unknown>,
  children: MdastNode[],
): MdastNode {
  return { type: "paragraph", data: { hName: tag, hProperties: properties }, children };
}

function tabLabel(code: MdastNode): string | undefined {
  const meta = typeof code["meta"] === "string" ? code["meta"] : "";
  const match = TAB_META.exec(meta);
  return match?.[1] ?? match?.[2];
}

/**
 * Handler for `:::install-tabs`: each fenced code block inside, labelled with
 * `tab="..."` in its info string, becomes a tab panel. Without script every
 * panel stays a readable block under its label; the bundled client turns the
 * labels into pill tabs. A block without labelled code is left alone.
 * @param node - The `install-tabs` container directive.
 * @returns The wrapper node, or `undefined` when no code block is labelled.
 */
export function installTabs(node: ContainerDirectiveNode): MdastNode | undefined {
  const panels = node.children.flatMap((child) => {
    const label = child.type === "code" ? tabLabel(child) : undefined;
    return label === undefined ? [] : [{ label, code: { ...child, meta: "frame=none" } }];
  });
  if (panels.length === 0) return undefined;
  return element("div", { class: "emet-install-tabs", "data-install-tabs": "" }, [
    element("div", { class: "emet-install-tabs__list", role: "tablist", hidden: true }, []),
    ...panels.map(({ label, code }) =>
      element("div", { class: "emet-install-tabs__panel", "data-tab-label": label }, [
        element("p", { class: "emet-install-tabs__label" }, [{ type: "text", value: label }]),
        code,
      ]),
    ),
  ]);
}
