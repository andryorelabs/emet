import { useEffect, useId, useRef, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALES, LOCALE_NAMES, localePath, type Locale } from "@/i18n/locales";

import { announceHeaderMenuOpen, onOtherHeaderMenuOpen } from "./header-menu-events";

interface LanguageMenuProps {
  locale: Locale;
  currentPath: string;
  labels: { label: string };
}

/**
 * The header's language pill and menu: one link per locale with its native
 * name and its code, landing on the same page in that locale.
 * @param props - The component props.
 * @param props.locale - The current locale.
 * @param props.currentPath - The current page's English path.
 * @param props.labels - The translated strings, `label` names the menu.
 * @returns The menu trigger and its content.
 */
export function LanguageMenu({ locale, currentPath, labels }: LanguageMenuProps) {
  const menuId = `language-${useId()}`;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(
    () =>
      onOtherHeaderMenuOpen(menuId, () => {
        setOpen(false);
      }),
    [menuId],
  );

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(next) => {
        if (next && triggerRef.current) announceHeaderMenuOpen(menuId, triggerRef.current);
        setOpen(next);
      }}
    >
      <DropdownMenuTrigger
        ref={triggerRef}
        data-menu="lang-trigger"
        aria-label={`${labels.label}: ${LOCALE_NAMES[locale]}`}
      >
        <span>{LOCALE_NAMES[locale]}</span>
        <span data-menu="lang-caret" aria-hidden="true">
          ▾
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        data-menu="lang-menu"
        aria-label={labels.label}
      >
        {LOCALES.map((target) => (
          <DropdownMenuItem
            key={target}
            data-menu="lang-item"
            render={
              <a
                href={localePath(target, currentPath)}
                hrefLang={target}
                lang={target}
                aria-current={target === locale ? "true" : undefined}
              />
            }
          >
            <span>{LOCALE_NAMES[target]}</span>
            <span data-menu="lang-code" lang="en">
              {target}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
