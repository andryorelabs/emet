import { useCallback, useEffect, useRef, useState } from "react";

import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Kbd } from "@/components/ui/kbd";

import {
  applySearchRequest,
  classifySearchState,
  moveSearchFocus,
  SEARCH_PENDING_ATTRIBUTE,
  SEARCH_REQUEST_EVENT,
  type SearchRequestMode,
  type SearchState,
} from "../../docs/search-markup";

const ROOT_SELECTOR = "[data-docs-search]";
const SOURCE_SELECTOR = ".docs-search .search-container";
const INPUT_SELECTOR = ".pagefind-ui__search-input";
const LINK_SELECTOR = ".pagefind-ui__result-link";
const TRIGGER_SELECTOR = "[data-search-trigger]";

/**
 * The localized strings the dialog shows around Pagefind's own output.
 */
export interface DocsSearchStrings {
  label: string;
  cancel: string;
  token: string;
  searching: string;
  noResults: string;
  footerPrivacy: string;
  footerKeys: string;
  escapeKey: string;
  unavailable: string;
}

/**
 * The props of the docs search dialog.
 */
export interface DocsSearchProps {
  strings: DocsSearchStrings;
  standalone?: boolean;
}

/**
 * Lists the keyboard stops of the dialog: the query field, then every result link.
 * @param frame - The element that holds Pagefind's output.
 * @returns The stops in reading order.
 */
function listStops(frame: HTMLElement): HTMLElement[] {
  const input = frame.querySelector<HTMLElement>(INPUT_SELECTOR);
  const links = [...frame.querySelectorAll<HTMLElement>(LINK_SELECTOR)];
  return input ? [input, ...links] : links;
}

/**
 * Handles Enter on the query field and the arrow keys across the stops.
 * @param event - The `keydown` that reached the dialog.
 * @param frame - The element that holds Pagefind's output.
 */
function handleFrameKeys(event: React.KeyboardEvent, frame: HTMLElement): void {
  const input = frame.querySelector<HTMLElement>(INPUT_SELECTOR);
  const links = frame.querySelectorAll<HTMLElement>(LINK_SELECTOR);
  if (event.key === "Enter" && event.target === input && links[0]) {
    event.preventDefault();
    links[0].click();
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const stops = listStops(frame);
  const current = stops.findIndex((stop) => stop === document.activeElement);
  const next = stops[moveSearchFocus(current, stops.length, event.key === "ArrowDown" ? 1 : -1)];
  event.preventDefault();
  next?.focus();
  next?.scrollIntoView({ block: "nearest" });
}

/**
 * Moves Pagefind's container into the dialog while it is open, returns it
 * afterwards, and reports which state its output is in.
 * @param strings - The localized messages Pagefind's output is compared with.
 * @returns A ref for the element that receives the container, the state and
 * the text a screen reader announces.
 */
function usePagefindHost(strings: DocsSearchStrings): {
  hostRef: React.RefObject<HTMLDivElement | null>;
  state: SearchState;
  announcement: string;
} {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<SearchState>("idle");
  const [announcement, setAnnouncement] = useState("");
  const { token, searching, noResults, unavailable } = strings;

  useEffect(() => {
    const host = hostRef.current;
    const source = document.querySelector<HTMLElement>(SOURCE_SELECTOR);
    if (!host) return undefined;
    if (!source) {
      setState("unavailable");
      setAnnouncement(unavailable);
      return undefined;
    }
    const home = source.parentElement;
    host.append(source);
    const update = (): void => {
      const message = source.querySelector(".pagefind-ui__message")?.textContent ?? "";
      const hasResults = source.querySelector(".pagefind-ui__result") !== null;
      const next = classifySearchState({ message, hasResults }, { token, searching, noResults });
      setState(next);
      setAnnouncement(next === "idle" ? "" : message.trim());
    };
    const observer = new MutationObserver(update);
    observer.observe(source, { childList: true, subtree: true, characterData: true });
    update();
    return () => {
      observer.disconnect();
      home?.append(source);
    };
  }, [token, searching, noResults, unavailable]);

  return { hostRef, state, announcement };
}

/**
 * The dialog's content: the query field and results Pagefind draws, the Esc
 * hint, the live status and the footer.
 * @param props - The strings and the callback that closes the dialog.
 * @returns The content element.
 */
function SearchBody({
  strings,
  onNavigate,
}: {
  strings: DocsSearchStrings;
  onNavigate: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const { hostRef, state, announcement } = usePagefindHost(strings);

  return (
    <div
      ref={frameRef}
      data-search-part="frame"
      data-search-state={state}
      onKeyDown={(event) => {
        if (frameRef.current) handleFrameKeys(event, frameRef.current);
      }}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("a")) onNavigate();
      }}
    >
      <DialogClose data-search-part="cancel">{strings.cancel}</DialogClose>
      <div ref={hostRef} data-search-part="host" />
      {state === "unavailable" ? (
        <Empty data-search-part="unavailable">
          <EmptyHeader>
            <EmptyDescription>{strings.unavailable}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      <Kbd data-search-part="esc" aria-hidden="true">
        {strings.escapeKey}
      </Kbd>
      <p data-search-part="status" role="status" aria-live="polite">
        {announcement}
      </p>
      <div data-search-part="footer">
        <p data-search-part="footer-privacy">{strings.footerPrivacy}</p>
        <p data-search-part="footer-keys">{strings.footerKeys}</p>
      </div>
    </div>
  );
}

/**
 * The docs search dialog on shadcn `Dialog`. Starlight's `Search` still loads
 * Pagefind and renders its container out of sight; this dialog adopts that
 * container while open. The page script sends open and toggle requests as
 * {@link SEARCH_REQUEST_EVENT} on the search root.
 * @param props - The strings and whether the page is the standalone home page.
 * @returns The dialog.
 */
export function DocsSearch({ strings, standalone = false }: DocsSearchProps) {
  const [open, setOpen] = useState(false);

  const request = useCallback((mode: SearchRequestMode) => {
    setOpen((current) => applySearchRequest(current, mode));
  }, []);

  useEffect(() => {
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root) return undefined;
    const onRequest = (event: Event): void => {
      root.removeAttribute(SEARCH_PENDING_ATTRIBUTE);
      request(event instanceof CustomEvent && event.detail === "toggle" ? "toggle" : "open");
    };
    const pending = root.getAttribute(SEARCH_PENDING_ATTRIBUTE);
    if (pending) {
      root.removeAttribute(SEARCH_PENDING_ATTRIBUTE);
      request(pending === "toggle" ? "toggle" : "open");
    }
    root.addEventListener(SEARCH_REQUEST_EVENT, onRequest);
    return () => {
      root.removeEventListener(SEARCH_REQUEST_EVENT, onRequest);
    };
  }, [request]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        data-search-part="dialog"
        showCloseButton={false}
        data-standalone={standalone ? "" : undefined}
        initialFocus={() => document.querySelector<HTMLElement>(INPUT_SELECTOR)}
        finalFocus={() => document.querySelector<HTMLElement>(TRIGGER_SELECTOR) ?? true}
      >
        <DialogTitle className="sr-only">{strings.label}</DialogTitle>
        <SearchBody
          strings={strings}
          onNavigate={() => {
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
