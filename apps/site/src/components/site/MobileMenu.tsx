import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import { refreshStarCounts } from "./github-stars";
import { announceHeaderMenuOpen, onOtherHeaderMenuOpen } from "./header-menu-events";
import { initHeaderMenus } from "./header-menus";
import { initThemeSelects } from "./theme-menu";

const MENU_ID = "mobile-menu";

/**
 * The star count of the GitHub link as the build baked it in.
 */
interface MobileMenuStars {
  readonly count: string | null;
  readonly tooltip: string | null;
  readonly template: string;
}

/**
 * One navigation link of the mobile menu.
 */
export interface MobileMenuLink {
  readonly href: string;
  readonly label: string;
  readonly current: boolean;
  readonly external: boolean;
  readonly stars?: MobileMenuStars | undefined;
}

/**
 * The localized strings of the mobile menu.
 */
interface MobileMenuLabels {
  readonly menu: string;
  readonly navigation: string;
  readonly newTab: string;
}

/**
 * Props of the mobile menu island.
 */
export interface MobileMenuProps {
  readonly links: readonly MobileMenuLink[];
  readonly locale: string;
  readonly labels: MobileMenuLabels;
  readonly children?: ReactNode;
}

/**
 * Measures the distance from the top of the viewport to the bottom of the
 * header that holds the trigger, so the sheet opens right under it.
 * @param trigger - The menu button.
 * @returns The header's bottom edge in pixels, or 0 outside a header.
 */
function headerBottom(trigger: HTMLElement | null): number {
  const header = trigger?.closest(".site-header");
  return header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0;
}

/**
 * Wires the server-rendered language and theme controls once they mount in
 * the sheet, and refreshes the GitHub star count shown in it.
 * @param node - The controls container, or null when it unmounts.
 */
function wireControls(node: HTMLDivElement | null): void {
  if (node === null) return;
  initHeaderMenus(node);
  initThemeSelects(node);
  void refreshStarCounts(node.ownerDocument);
}

/**
 * Mobile menu of the home and flow headers: a trigger that opens a sheet under
 * the header with the navigation links, then the slotted language and theme
 * controls. Escape and outside clicks close it and focus returns to the
 * trigger; only one header menu is open at a time.
 */
export function MobileMenu({ links, locale, labels, children }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const changeOpen = useCallback((next: boolean) => {
    if (next) {
      document.documentElement.style.setProperty(
        "--menu-top",
        `${headerBottom(triggerRef.current)}px`,
      );
      announceHeaderMenuOpen(MENU_ID);
    }
    setOpen(next);
  }, []);

  useEffect(
    () =>
      onOtherHeaderMenuOpen(MENU_ID, () => {
        setOpen(false);
      }),
    [],
  );

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger
        ref={triggerRef}
        type="button"
        data-menu-button=""
        aria-label={labels.menu}
        aria-controls="mobile-menu-panel"
      >
        <svg data-menu-icon="open" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <svg data-menu-icon="close" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </SheetTrigger>
      <SheetContent side="top" showCloseButton={false} id="mobile-menu-panel" data-menu-panel="">
        <SheetTitle className="sr-only">{labels.menu}</SheetTitle>
        <nav aria-label={labels.navigation}>
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              aria-current={link.current ? "page" : undefined}
              {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              onClick={() => {
                setOpen(false);
              }}
            >
              {link.stars ? (
                <span
                  lang={locale}
                  title={link.stars.tooltip ?? undefined}
                  data-github-stars-link=""
                  data-stars-template={link.stars.template}
                >
                  <span>{link.label}</span>
                  <Badge variant="ghost" data-github-stars="" hidden={link.stars.count === null}>
                    {link.stars.count ?? ""}
                  </Badge>
                </span>
              ) : (
                link.label
              )}
              {link.external && <span className="sr-only">{labels.newTab}</span>}
            </a>
          ))}
        </nav>
        <div data-menu-controls="" ref={wireControls}>
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
