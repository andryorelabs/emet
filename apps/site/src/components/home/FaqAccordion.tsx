import type { ReactElement } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * One question and its answer; backticks in the answer mark inline code.
 */
export interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

/**
 * Props of the `FaqAccordion` island.
 */
export interface FaqAccordionProps {
  readonly items: readonly FaqItem[];
  readonly heading: string;
  readonly more: string;
  readonly href: string;
}

/**
 * Splits an answer on backticks so the commands and flags inside it render as code.
 * @param text - An answer that marks code with backticks.
 * @returns The segments in order, each flagged as code or prose.
 */
export function segments(text: string): { text: string; code: boolean }[] {
  return text.split("`").map((part, index) => ({ text: part, code: index % 2 === 1 }));
}

/**
 * The home FAQ: a heading column and a body column with an accordion with the first question open and a link
 * to the troubleshooting page. Closed answers stay in the markup so they remain
 * readable before hydration and to search engines.
 * @param props - The questions, the heading, the link label and the link target.
 * @returns The FAQ section.
 */
export function FaqAccordion({ items, heading, more, href }: FaqAccordionProps): ReactElement {
  return (
    <section data-faq aria-labelledby="faq-title">
      <h2 id="faq-title" data-reveal="heading">
        <span data-reveal-line>{heading}</span>
      </h2>
      <div data-faq-body>
        <Accordion data-faq-list multiple defaultValue={["faq-0"]}>
          {items.map((item, index) => (
            <AccordionItem
              key={item.question}
              value={`faq-${index}`}
              data-faq-item
              data-reveal="item"
            >
              <AccordionTrigger data-faq-trigger>{item.question}</AccordionTrigger>
              <AccordionContent keepMounted data-faq-answer>
                <p>
                  {segments(item.answer).map((part, partIndex) =>
                    part.code ? (
                      <code key={partIndex}>{part.text}</code>
                    ) : (
                      <span key={partIndex}>{part.text}</span>
                    ),
                  )}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <a data-faq-more href={href}>
          {more}
        </a>
      </div>
    </section>
  );
}
