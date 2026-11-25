import { useEffect, useId, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { en } from "@/i18n/ui/en";

import { announceHeaderMenuOpen, onOtherHeaderMenuOpen } from "./header-menu-events";
import { parseThemeChoice, readStoredTheme, saveTheme, type ThemeChoice } from "./theme-storage";

interface ThemeMenuProps {
  labels: typeof en.theme;
}

const SUN_PATH =
  "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4";
const MOON_PATH = "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z";
const SYSTEM_PATH = "M8 20h8M12 16v4";

function ChoiceIcon({ choice }: { choice: ThemeChoice }) {
  return (
    <svg data-icon={choice} viewBox="0 0 24 24" aria-hidden="true">
      {choice === "light" && (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d={SUN_PATH} />
        </>
      )}
      {choice === "dark" && <path d={MOON_PATH} />}
      {choice === "system" && (
        <>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d={SYSTEM_PATH} />
        </>
      )}
    </svg>
  );
}

/**
 * The header's theme selector: an icon button showing the stored choice and a
 * menu of three radio rows (Light, Dark, System). Choosing stores the value and
 * tells the init script through `THEME_CHANGE_EVENT`.
 * @param props - The component props.
 * @param props.labels - The translated theme strings.
 * @returns The menu trigger and its content.
 */
export function ThemeMenu({ labels }: ThemeMenuProps) {
  const menuId = `theme-${useId()}`;
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const choices = [
    { value: "light", label: labels.light },
    { value: "dark", label: labels.dark },
    { value: "system", label: labels.system },
  ] as const;

  useEffect(() => {
    setChoice(readStoredTheme());
    return onOtherHeaderMenuOpen(menuId, () => {
      setOpen(false);
    });
  }, [menuId]);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setChoice(readStoredTheme());
          announceHeaderMenuOpen(menuId);
        }
        setOpen(next);
      }}
    >
      <DropdownMenuTrigger data-menu="theme-button" aria-label={labels.label}>
        <ChoiceIcon choice="light" />
        <ChoiceIcon choice="dark" />
        <ChoiceIcon choice="system" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        data-menu="theme-menu"
        aria-label={labels.label}
      >
        <DropdownMenuRadioGroup
          value={choice}
          onValueChange={(value) => {
            const next = parseThemeChoice(value);
            if (next === undefined) return;
            saveTheme(next);
            setChoice(next);
          }}
        >
          {choices.map((item) => (
            <DropdownMenuRadioItem
              key={item.value}
              value={item.value}
              data-menu="theme-item"
              closeOnClick
            >
              <ChoiceIcon choice={item.value} />
              <span>{item.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
