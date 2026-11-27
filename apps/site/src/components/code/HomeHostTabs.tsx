import type { ReactElement } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { HomeCodeBlock, type HomeCodeBlockProps } from "./HomeCodeBlock";

/** One host of a {@link HomeHostTabs}: its tab label and the command to run there. */
interface HomeHostTab {
  readonly label: string;
  readonly code: string;
}

/** Props of {@link HomeHostTabs}. */
export interface HomeHostTabsProps {
  readonly tabs: readonly HomeHostTab[];
  readonly strings: HomeCodeBlockProps["strings"];
}

/**
 * The host switch of prototype v17: one tab per host, each holding the command
 * for that host in a {@link HomeCodeBlock}. The first tab shows without script.
 */
export function HomeHostTabs({ tabs, strings }: HomeHostTabsProps): ReactElement {
  const first = tabs[0];
  return (
    <Tabs defaultValue={first?.label} data-home-host-tabs="">
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.label} value={tab.label}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.label} value={tab.label}>
          <HomeCodeBlock code={tab.code} lang="bash" strings={strings} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
