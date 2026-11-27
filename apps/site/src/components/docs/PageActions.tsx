import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { copyWithFeedback, FEEDBACK_MS } from "@/lib/copy-feedback";
import { cn } from "@/lib/utils";

import type { PageActionsStrings } from "../../docs/page-actions-strings";

/**
 * The slice of a keyboard event the arrow-key shortcut reads.
 */
export interface KeyboardEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * The slice of an event target the arrow-key shortcut reads.
 */
export interface EventTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

/**
 * Where "Open in" sends the visitor.
 */
export type OpenInTarget = "chatgpt" | "claude";

/**
 * A previous or next docs page.
 */
export interface PageLink {
  href: string;
  label: string;
}

/**
 * Props of the page actions island.
 */
export interface PageActionsProps {
  markdownUrl: string;
  pageUrl: string;
  labels: PageActionsStrings;
  prev?: PageLink | undefined;
  next?: PageLink | undefined;
}

type CopyState = "idle" | "copied" | "failed";

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const EDITABLE_SELECTOR =
  "input, textarea, select, [contenteditable], [role=tab], [role=tablist], [role=menu], [role=menuitem], dialog, pre";
const CHATGPT_PATH =
  "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z";
const CLAUDE_PATH =
  "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z";
const MARKDOWN_PATH =
  "M22.27 19.385H1.73A1.73 1.73 0 010 17.655V6.345a1.73 1.73 0 011.73-1.73h20.54A1.73 1.73 0 0124 6.345v11.308a1.73 1.73 0 01-1.73 1.731zM5.769 15.923v-4.5l2.308 2.885 2.307-2.885v4.5h2.308V8.078h-2.308l-2.307 2.885-2.308-2.885H3.46v7.847zM21.232 12h-2.309V8.077h-2.307V12h-2.308l3.461 4.039z";

/**
 * The prompt Open in ChatGPT and Open in Claude carry. Always English.
 * @param pageUrl - Absolute URL of the docs page.
 * @returns The prompt text.
 */
export function buildOpenInPrompt(pageUrl: string): string {
  return `I'm looking at this emet documentation: ${pageUrl}. Help me understand how to use it. Be ready to explain concepts, give examples, or help debug based on it.`;
}

/**
 * The URL that opens an assistant with the docs prompt prefilled.
 * @param target - The assistant.
 * @param pageUrl - Absolute URL of the docs page.
 * @returns The assistant URL with the encoded prompt as `q`.
 */
export function buildOpenInUrl(target: OpenInTarget, pageUrl: string): string {
  const base = target === "claude" ? "https://claude.ai/new" : "https://chatgpt.com/";
  return `${base}?q=${encodeURIComponent(buildOpenInPrompt(pageUrl))}`;
}

/**
 * Whether an event target is a text field, select or contenteditable region.
 * @param target - The event target.
 * @returns True when typing there must keep the arrow keys.
 */
function isEditableTarget(target: EventTargetLike): boolean {
  if (target.isContentEditable === true) {
    return true;
  }
  if (target.tagName !== undefined && EDITABLE_TAGS.has(target.tagName.toUpperCase())) {
    return true;
  }
  return target.closest?.(EDITABLE_SELECTOR) != null;
}

/**
 * Whether an arrow key should move between docs pages.
 * @param event - The keydown event.
 * @param target - The event's target.
 * @returns True for a bare left or right arrow outside editable elements.
 */
export function shouldHandleArrowKey(event: KeyboardEventLike, target: EventTargetLike): boolean {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return false;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return false;
  }
  return !isEditableTarget(target);
}

/**
 * Fetches the Markdown twin and copies it. Where the browser supports
 * `ClipboardItem`, the pending fetch goes to the clipboard as is, so the write
 * still runs inside the click's user activation.
 * @param markdownUrl - URL of the Markdown twin.
 * @returns `copied` or `failed`.
 */
async function copyMarkdown(markdownUrl: string): Promise<"copied" | "failed"> {
  try {
    const request = fetch(markdownUrl).then((response) => {
      if (!response.ok) {
        throw new Error(`Twin request failed with ${String(response.status)}`);
      }
      return response.text();
    });
    if (typeof ClipboardItem === "undefined" || typeof navigator.clipboard.write !== "function") {
      return await copyWithFeedback(await request);
    }
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": request.then((text) => new Blob([text], { type: "text/plain" })),
      }),
    ]);
    return "copied";
  } catch {
    return "failed";
  }
}

/**
 * A decorative brand glyph drawn inline in the current colour.
 * @param props - The SVG path data.
 * @returns The icon.
 */
export function BrandIcon({ path }: { path: string }): ReactElement {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
    >
      <path d={path} />
    </svg>
  );
}

function StepLink({
  link,
  direction,
  label,
}: {
  link: PageLink | undefined;
  direction: "prev" | "next";
  label: string;
}): ReactElement {
  const Icon = direction === "prev" ? ChevronLeftIcon : ChevronRightIcon;
  const className = buttonVariants({ variant: "outline", size: "icon-lg" });
  if (link === undefined) {
    return (
      <span
        className={cn(className, "pointer-events-none opacity-40")}
        role="link"
        aria-disabled="true"
        aria-label={label}
      >
        <Icon aria-hidden="true" />
      </span>
    );
  }
  return (
    <a
      className={className}
      href={link.href}
      rel={direction}
      aria-label={label}
      title={link.label}
      data-step={direction}
    >
      <Icon aria-hidden="true" />
    </a>
  );
}

/**
 * The docs title row's actions: a Copy Page split button whose menu views the
 * Markdown twin or opens the page in ChatGPT or Claude, and previous/next
 * buttons that the left and right arrow keys also follow.
 * @param props - The twin and page URLs, the labels, and the neighbouring pages.
 * @returns The page actions row.
 */
export function PageActions({
  markdownUrl,
  pageUrl,
  labels,
  prev,
  next,
}: PageActionsProps): ReactElement {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nextHref = next?.href;
  const prevHref = prev?.href;

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    const result = await copyMarkdown(markdownUrl);
    setState(result);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setState("idle");
    }, FEEDBACK_MS);
  }, [markdownUrl]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        !shouldHandleArrowKey(event, event.target instanceof Element ? event.target : {})
      ) {
        return;
      }
      const href = event.key === "ArrowRight" ? nextHref : prevHref;
      if (href !== undefined) {
        globalThis.location.assign(href);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [nextHref, prevHref]);

  const feedback = state === "copied" ? labels.copied : state === "failed" ? labels.copyFailed : "";

  return (
    <div className="mt-3 mb-1 flex flex-wrap items-center gap-2" data-page-actions="">
      <ButtonGroup>
        <Button
          variant="outline"
          size="lg"
          data-page-copy=""
          data-state={state === "idle" ? undefined : state}
          onClick={() => {
            void copy();
          }}
        >
          <CopyIcon aria-hidden="true" />
          <span>{feedback === "" ? labels.copyPage : feedback}</span>
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="icon-lg" aria-label={labels.moreActions} />}
          >
            <ChevronDownIcon aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-55">
            <DropdownMenuItem
              render={<a href={markdownUrl} target="_blank" rel="noopener noreferrer" />}
            >
              <BrandIcon path={MARKDOWN_PATH} />
              {labels.viewAsMarkdown}
            </DropdownMenuItem>
            <DropdownMenuItem
              render={
                <a
                  href={buildOpenInUrl("chatgpt", pageUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <BrandIcon path={CHATGPT_PATH} />
              {labels.openInChatGpt}
            </DropdownMenuItem>
            <DropdownMenuItem
              render={
                <a
                  href={buildOpenInUrl("claude", pageUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <BrandIcon path={CLAUDE_PATH} />
              {labels.openInClaude}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      <p className="sr-only" role="status" aria-live="polite">
        {feedback}
      </p>
      <nav className="ms-auto inline-flex gap-2" aria-label={labels.pagination}>
        <StepLink link={prev} direction="prev" label={labels.previousPage} />
        <StepLink link={next} direction="next" label={labels.nextPage} />
      </nav>
    </div>
  );
}
