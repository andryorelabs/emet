import { steps } from "./steps";

/** A node of the markdown tree a directive handler reads or returns. */
export interface MdastNode {
  type: string;
  children?: MdastNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
  [key: string]: unknown;
}

/** A container directive (`:::name`) as the markdown parser hands it over. */
export interface ContainerDirectiveNode extends MdastNode {
  type: "containerDirective";
  name: string;
  children: MdastNode[];
}

/**
 * Turns a container directive into the node that replaces it. Returning
 * `undefined` leaves the directive for the next plugin.
 */
export type DirectiveHandler = (node: ContainerDirectiveNode) => MdastNode | undefined;

const handlers = new Map<string, DirectiveHandler>();

/**
 * Registers the handler for a container directive name.
 * @param name - The directive name, as written after `:::`.
 * @param handler - Builds the replacement node.
 */
export function registerDirective(name: string, handler: DirectiveHandler): void {
  handlers.set(name, handler);
}

registerDirective("steps", steps);

/**
 * Markdown plugin that applies the registered docs directives. A directive
 * without a handler is left untouched, so Starlight's own directives (asides)
 * and its restoration of unknown ones still run.
 */
export const remarkEmetDirectives = {
  name: "emet-directives",
  containerDirective(node: ContainerDirectiveNode): MdastNode | undefined {
    return handlers.get(node.name)?.(node);
  },
};

/** The slice of Astro's `astro:config:setup` options the integration reads. */
interface ConfigSetupOptions {
  config: { markdown?: { processor?: { options?: { mdastPlugins?: unknown[] } } } };
}

/**
 * Astro integration that adds {@link remarkEmetDirectives} to the Markdown
 * processor. Listed before Starlight so it runs before Starlight's
 * restoration of unclaimed directives.
 * @returns The integration.
 */
export function emetDirectives(): {
  name: string;
  hooks: { "astro:config:setup": (options: ConfigSetupOptions) => void };
} {
  return {
    name: "emet-directives",
    hooks: {
      "astro:config:setup": ({ config }) => {
        const mdastPlugins = config.markdown?.processor?.options?.mdastPlugins;
        if (!mdastPlugins) {
          throw new Error("emet-directives needs the Satteri Markdown processor.");
        }
        mdastPlugins.push(remarkEmetDirectives);
      },
    },
  };
}
