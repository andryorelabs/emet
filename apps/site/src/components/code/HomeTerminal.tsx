import { useSyncExternalStore, type ReactElement } from "react";

import { AnimatedSpan, Terminal, TypingAnimation } from "@/components/ui/terminal";
import { cn } from "@/lib/utils";

/** One line of a {@link HomeTerminal}: a typed command or a printed output line. */
export interface HomeTerminalLine {
  readonly text: string;
  /** A `command` is typed character by character; an `output` line fades in. */
  readonly kind: "command" | "output";
  /** Renders the line in the muted text colour. */
  readonly muted?: boolean;
}

/** Props of {@link HomeTerminal}. */
export interface HomeTerminalProps {
  readonly lines: readonly HomeTerminalLine[];
  /** Waits until the terminal scrolls into view before typing; `true` by default. */
  readonly startOnView?: boolean;
  /** Milliseconds per typed character; 20 by default, as in prototype v17. */
  readonly typingMs?: number;
  readonly className?: string;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

function motionAllowed(): boolean {
  return !window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** The server and the hydration pass render the final state, so the markup needs no inline style. */
function motionAllowedOnServer(): boolean {
  return false;
}

/**
 * Wraps long lines instead of scrolling them and mutes the lines that ask for it.
 * The vendored terminal owns its own classes, so these reach it from the outside.
 */
const FRAME_CLASS_NAME =
  "[&_[data-muted]]:text-muted-foreground [&_[data-terminal-line]]:wrap-break-word [&_[data-terminal-line]]:whitespace-pre-wrap [&_code]:overflow-visible";

/**
 * A typed terminal on the home page: the vendored `@magicui/terminal`, with long
 * lines wrapped instead of scrolled. The server, hydration and reduced motion
 * render every line in its final state as plain text; with motion allowed the
 * client swaps in the typing sequence.
 */
export function HomeTerminal({
  lines,
  startOnView = true,
  typingMs = 20,
  className,
}: HomeTerminalProps): ReactElement {
  const animate = useSyncExternalStore(
    subscribeToMotionPreference,
    motionAllowed,
    motionAllowedOnServer,
  );
  const frameClassName = cn(FRAME_CLASS_NAME, className);

  if (!animate) {
    return (
      <div data-terminal-static="" className={frameClassName}>
        <Terminal sequence={false} className="max-h-none max-w-none">
          {lines.map((line, index) => (
            <span
              key={index}
              data-terminal-line=""
              data-muted={line.muted === true || undefined}
              className="grid text-sm font-normal tracking-tight"
            >
              {line.text}
            </span>
          ))}
        </Terminal>
      </div>
    );
  }

  return (
    <div data-terminal-animated="" className={frameClassName}>
      <Terminal startOnView={startOnView} className="max-h-none max-w-none">
        {lines.map((line, index) =>
          line.kind === "command" ? (
            <TypingAnimation
              key={index}
              data-terminal-line=""
              data-muted={line.muted === true || undefined}
              duration={typingMs}
            >
              {line.text}
            </TypingAnimation>
          ) : (
            <AnimatedSpan
              key={index}
              data-terminal-line=""
              data-muted={line.muted === true || undefined}
            >
              {line.text}
            </AnimatedSpan>
          ),
        )}
      </Terminal>
    </div>
  );
}
