import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { CodeBlock, CodeBlockContent, CodeBlockLine } from "@/components/ui/code-block";
import { useHighlightedCode } from "@/hooks/use-highlighted-code";
import { copyWithFeedback, FEEDBACK_MS } from "@/lib/copy-feedback";

/** The localized labels of the copy button. */
interface HomeCodeBlockStrings {
  readonly copy: string;
  readonly copied: string;
}

/** Props of {@link HomeCodeBlock}. */
export interface HomeCodeBlockProps {
  /** The exact text shown and put on the clipboard. */
  readonly code: string;
  /** `bash` is highlighted with shiki on the client; `text` stays plain. */
  readonly lang: "bash" | "text";
  /** Shows a muted, unselectable `$` before each line; it is never copied. */
  readonly prompt?: boolean;
  readonly strings: HomeCodeBlockStrings;
}

/**
 * A home page code block: the vendored shadcn `code-block` with shiki highlighting
 * on the client, long lines wrapped instead of scrolled, and an always visible,
 * localized copy button. The server renders the plain lines, so the text reads
 * without JavaScript.
 */
export function HomeCodeBlock({
  code,
  lang,
  prompt = false,
  strings,
}: HomeCodeBlockProps): ReactElement {
  const lines = useHighlightedCode(code, lang);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  async function copy(): Promise<void> {
    const result = await copyWithFeedback(code);
    if (result !== "copied") return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
    }, FEEDBACK_MS);
  }

  return (
    <CodeBlock data-home-code="" className="flex-row items-start">
      <CodeBlockContent wrap className="flex-1 overflow-visible">
        {lines.map((line, index) => (
          <CodeBlockLine key={index}>
            {prompt && (
              <span aria-hidden="true" className="text-muted-foreground select-none">
                ${" "}
              </span>
            )}
            {line}
          </CodeBlockLine>
        ))}
      </CodeBlockContent>
      <div className="shrink-0 p-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-home-code-copy=""
          data-copied={copied || undefined}
          aria-label={copied ? strings.copied : strings.copy}
          onClick={() => {
            void copy();
          }}
        >
          {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
        </Button>
        <span aria-live="polite" className="sr-only">
          {copied ? strings.copied : ""}
        </span>
      </div>
    </CodeBlock>
  );
}
