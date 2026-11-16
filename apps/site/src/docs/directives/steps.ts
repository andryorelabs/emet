import type { ContainerDirectiveNode, MdastNode } from "./index";

/**
 * Handler for `:::steps`: the ordered list inside becomes an
 * `<ol class="emet-steps">`. A block without an ordered list is left alone.
 * @param node - The `steps` container directive.
 * @returns The `<ol>` node, or `undefined` when there is no ordered list.
 */
export function steps(node: ContainerDirectiveNode): MdastNode | undefined {
  const list = node.children.find((child) => child.type === "list" && child.ordered === true);
  if (!list) return undefined;
  return {
    type: "paragraph",
    data: { hName: "ol", hProperties: { class: "emet-steps" } },
    children: list.children ?? [],
  };
}
