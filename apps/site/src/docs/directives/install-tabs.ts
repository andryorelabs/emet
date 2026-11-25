import type { ContainerDirectiveNode, MdastNode } from "./index";

/** Class lists of the base-nova `tabs` parts, as `src/components/ui/tabs.tsx` renders them. */
const TABS_CLASS = "group/tabs flex gap-2 data-horizontal:flex-col";
const TABS_LIST_CLASS =
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 bg-muted";
export const TABS_TRIGGER_CLASS =
  "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground";
const TABS_CONTENT_CLASS = "flex-1 text-sm outline-none";

const TAB_META = /(?:^|\s)tab=(?:"([^"]*)"|'([^']*)')/;

function element(
  tag: string,
  properties: Record<string, unknown>,
  children: MdastNode[],
): MdastNode {
  return { type: "paragraph", data: { hName: tag, hProperties: properties }, children };
}

function tabLabel(code: MdastNode): string | undefined {
  const meta = typeof code.meta === "string" ? code.meta : "";
  const match = TAB_META.exec(meta);
  return match?.[1] ?? match?.[2];
}

/**
 * Handler for `:::install-tabs`: each fenced code block inside, labelled with
 * `tab="..."` in its info string, becomes a tab panel. Without script every
 * panel stays a readable block under its label; the bundled client turns the
 * labels into base-nova `tabs` triggers. A block without labelled code is left alone.
 * @param node - The `install-tabs` container directive.
 * @returns The wrapper node, or `undefined` when no code block is labelled.
 */
export function installTabs(node: ContainerDirectiveNode): MdastNode | undefined {
  const panels = node.children.flatMap((child) => {
    const label = child.type === "code" ? tabLabel(child) : undefined;
    return label === undefined ? [] : [{ label, code: { ...child, meta: "frame=none" } }];
  });
  if (panels.length === 0) return undefined;
  return element(
    "div",
    {
      class: `${TABS_CLASS} emet-install-tabs`,
      "data-slot": "tabs",
      "data-orientation": "horizontal",
      "data-install-tabs": "",
    },
    [
      element(
        "div",
        {
          class: `${TABS_LIST_CLASS} emet-install-tabs__list`,
          "data-slot": "tabs-list",
          "data-variant": "default",
          role: "tablist",
          hidden: true,
        },
        [],
      ),
      ...panels.map(({ label, code }) =>
        element(
          "div",
          {
            class: `${TABS_CONTENT_CLASS} emet-install-tabs__panel`,
            "data-slot": "tabs-content",
            "data-tab-label": label,
          },
          [
            element("p", { class: "emet-install-tabs__label" }, [{ type: "text", value: label }]),
            code,
          ],
        ),
      ),
    ],
  );
}
