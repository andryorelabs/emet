### Requirement: The Website uses shadcn base-nova with React islands

Source: #988 S1

The Website vendors shadcn `base-nova` components with a pinned CLI, never hand-edits them and customises them in `.tsx` wrappers.

#### Scenario: A wrapper imports a vendored component

- **WHEN** a `.tsx` file imports `@/components/ui/button` and `@/lib/utils`
- **THEN** `bun run check` passes

### Requirement: Islands hydrate on interaction and only where used

Source: #988 S4

A `client:interaction` directive hydrates header islands on the first pointer, focus or key interaction, and `client:load` is never used.

#### Scenario: The header is untouched

- **WHEN** a page loads and the user has not interacted with the header
- **THEN** no header island script is requested

### Requirement: Header menus are dropdown-menu and sheet islands

Source: #988 S5

The theme menu and the language switcher are `dropdown-menu` islands, the mobile menu is a `sheet` island and only one header menu is open at a time.

#### Scenario: The user picks a theme

- **WHEN** the user picks dark in the theme menu
- **THEN** the page turns dark, the choice persists and the theme change event fires

#### Scenario: A menu opens inside the mobile sheet

- **WHEN** a control inside the open mobile sheet opens its own menu
- **THEN** the sheet stays open

### Requirement: Static controls render server-side

Source: #988 S7

The search button, the GitHub stars pill, the announcement pill and the 404 page render shadcn `data-slot` markup on the server with no island.

#### Scenario: The home page is built

- **WHEN** the home and 404 pages are built
- **THEN** those elements carry shadcn `data-slot` markup and no `astro-island` wraps them

### Requirement: Page actions and docs search use shadcn components

Source: #988 S8

Page actions are a `button-group` with a `dropdown-menu` island and the docs search dialog uses the shadcn `dialog` over Pagefind.

#### Scenario: The user copies the page markdown

- **WHEN** the user picks copy markdown in the page actions
- **THEN** the markdown is copied and the feedback shows

### Requirement: The home FAQ is an accordion island

Source: #988 S10

The FAQ is an `accordion` island hydrated when visible, with the first item open in the server HTML.

#### Scenario: The user opens a question

- **WHEN** the user opens a question
- **THEN** its answer shows

### Requirement: Install tabs render static tabs markup

Source: #988 S11

The install-tabs directive emits static `tabs` markup with a small client script and no island.

#### Scenario: The user picks a package manager

- **WHEN** the user picks a tab
- **THEN** the command switches and the choice persists

### Requirement: The production build is audited for islands and CSP

Source: #988 S12

`scripts/audit-dist.ts` fails when a page without an island references the React runtime or an inline script has no CSP hash.

#### Scenario: The audit runs on the build

- **WHEN** the audit runs on the production build
- **THEN** it reports no finding

### Requirement: A header menu announces its source element

Source: #1003 S2

`announceHeaderMenuOpen(id, source)` takes the opening menu's trigger element, and `onOtherHeaderMenuOpen` hands it to the listener, so the mobile sheet decides from the source and never from the focused element.

#### Scenario: A menu opened inside the sheet keeps the sheet open

- WHEN a theme or language menu opens from a control inside the mobile sheet
- THEN the sheet stays open

#### Scenario: A menu opened outside the sheet closes it

- WHEN a header menu outside the sheet announces it opened
- THEN the sheet closes

### Requirement: Website interactions are verified in a real browser

Source: #1003 S1

The e2e spec covers what happy-dom cannot open: the header menus, the mobile sheet, search, the page actions menu, install tabs, the FAQ, theme sync across tabs and the language list without script. A case that exposes a real bug is fixed in the code, never marked as an expected failure.

#### Scenario: Theme choice syncs across tabs

- WHEN a visitor picks Dark in one tab
- THEN a second tab of the same browser switches to the dark theme

#### Scenario: Install tabs without script

- WHEN the docs install page loads with JavaScript disabled
- THEN the first tab's panel is visible

#### Scenario: Popups do not animate under reduced motion

- WHEN the theme menu opens with `prefers-reduced-motion: reduce`
- THEN its content plays no animation

### Requirement: The Website tagline names a workflow for Claude Code and Codex

Source: #1012 S1

#### Scenario: The home renders in any locale

- **WHEN** the home renders in any locale
- **THEN** no tagline string contains the retired plugin tagline and the English strings carry the workflow tagline

### Requirement: The home stylesheet and tests are split per section

Source: #1012 S4

#### Scenario: The tests run after the split

- **WHEN** `bun run test` runs
- **THEN** the per-section style and test files pass and the built home CSS holds the same rules as before the split

### Requirement: The header and hero float over the painting

Source: #1012 S5

#### Scenario: The home loads on desktop

- **WHEN** the home loads at 1440×900
- **THEN** the white-ink header floats over the painting, the headline lines rise from a mask and the CTAs do not cover the golem

#### Scenario: The home loads on a phone

- **WHEN** the viewport is 390px wide
- **THEN** the headline never breaks inside a word

### Requirement: Painting effects degrade without WebGL

Source: #1012 S6, #1012 S7, #1012 S16, #1012 S17

#### Scenario: Reduced motion disables the effect

- **WHEN** reduced motion is set
- **THEN** the painting effect enable decision is false and the CSS Valley fallback shows

#### Scenario: WebGL is missing

- **WHEN** WebGL is unavailable
- **THEN** nothing is drawn, no error is thrown and the CSS fallback stays visible

### Requirement: Hero effects respond to the pointer

Source: #1012 S8

#### Scenario: The golem hotspot is clicked

- **WHEN** the golem hotspot is clicked
- **THEN** the bubble shows the next phrase and the eyes glow

### Requirement: How it works is a pinned runway that stacks on small screens

Source: #1012 S9, #1012 S10

#### Scenario: The runway is scrolled on desktop

- **WHEN** the page is scrolled through the How it works runway at 1440
- **THEN** the steps change at about 30% and 62% progress and the stage dither resolves

#### Scenario: The runway stacks

- **WHEN** the viewport is 390px or reduced motion is set
- **THEN** all three steps show stacked with final content

### Requirement: Showcase auto-flags until the viewer clicks

Source: #1012 S11

#### Scenario: The viewer scrolls without clicking

- **WHEN** scrolling through Showcase past about 74% without clicking
- **THEN** the flag turns on and the dusk painting appears

#### Scenario: The viewer clicks the switch

- **WHEN** the viewer clicks the switch
- **THEN** auto-flagging stops

### Requirement: Feature scenes are interactive and accessible

Source: #1012 S12

#### Scenario: The approval button is held

- **WHEN** the approval button is held for 0.9 s
- **THEN** the stamp appears and the status text updates

#### Scenario: The approval button is released early

- **WHEN** the approval button is released early
- **THEN** nothing is approved

### Requirement: Stats roll to their values

Source: #1012 S13

#### Scenario: Stats enters the viewport

- **WHEN** Stats enters the viewport
- **THEN** the numeric values roll to their final values and the MIT item stays static

### Requirement: About reveals the portrait with a pixel mosaic

Source: #1012 S14

#### Scenario: About enters the viewport

- **WHEN** About enters the viewport
- **THEN** the portrait resolves from a mosaic to the full image, or shows at once under reduced motion

### Requirement: The closing command can be copied

Source: #1012 S15

#### Scenario: The copy button is pressed

- **WHEN** the copy button of the closing command is pressed
- **THEN** the exact install command is on the clipboard and the button shows its done state

### Requirement: A companion golem answers fixed questions

Source: #1012 S18

#### Scenario: The companion is clicked

- **WHEN** the companion is clicked
- **THEN** a menu with four questions opens and Escape closes it returning focus

### Requirement: Home interactions are covered end to end

Source: #1012 S19

#### Scenario: The e2e suite runs

- **WHEN** `bun run --cwd apps/site test:e2e` runs
- **THEN** every home interaction passes with zero `securitypolicyviolation` events

### Requirement: The home header and hero match prototype v17

Source: #1071 S1, #1071 S2

The home header pills and the hero (release pill, lede, buttons) use the prototype v17 measurements, and the release pill uses the dark glass token.

#### Scenario: Header and hero measure like the prototype

- **WHEN** the home loads at 1440×900
- **THEN** each header pill has the prototype computed styles and the hero buttons measure 52px tall

### Requirement: Landing install links lead to the docs

Source: #1071 S3

The hero install button links to the localized install docs page, the hero docs button to the localized docs index, and the closing keeps only the command with its copy button.

#### Scenario: The Spanish home links to docs

- **WHEN** the Spanish home renders
- **THEN** the hero install href is `/es/docs/start/install/` and no landing link points to `#install`

### Requirement: Search works in production and degrades in dev

Source: #1071 S4

The search dialog shows results in a production build, stays inside the viewport and scrolls its results, and in `astro dev` states that search is only available in production builds.

#### Scenario: Search finds results in the built site

- **WHEN** the built site is previewed at 1440×900 and 390×844 and Ctrl K and `review` are typed
- **THEN** results show and the dialog bounding box is within the viewport

### Requirement: Header menus do not lock page scroll

Source: #1071 S5

Opening the theme, language or page-actions menu leaves `html` and `body` overflow and width unchanged, and `html` reserves a stable scrollbar gutter.

#### Scenario: The theme menu opens

- **WHEN** the theme menu opens
- **THEN** `body` overflow stays `visible` and the header pills do not move

### Requirement: Home code blocks use the shadcn code-block

Source: #1071 S6

Home code blocks use the vendored shadcn `code-block` through a wrapper, wrap long lines and copy the exact command.

#### Scenario: The install command fits

- **WHEN** the Install step renders at 1440×900 and 390×844
- **THEN** the install command is fully visible, `scrollWidth <= clientWidth` and copy puts that exact string on the clipboard

### Requirement: Watch it land is one five-line panel that fits the viewport

Source: #1071 S7

The How it works panel shows the five prototype lines and the pinned column fits inside the viewport.

#### Scenario: Step 3 fits

- **WHEN** step 3 is active at 1440×900 and 1366×768
- **THEN** the last line's bottom is above the viewport bottom

### Requirement: The bento fills the content width

Source: #1071 S8

The bento spans the content width with the prototype column spans and a single column under 760px.

#### Scenario: Bento edges align

- **WHEN** the home loads at 1980×1080
- **THEN** the bento's right edge equals the stats section's right edge and the Approval and Review cards have equal height

### Requirement: Extra features are compact docs-linked cards

Source: #1071 S9

The five extra features are compact cards with a title and a code line, each linking to an existing localized docs page.

#### Scenario: Cards link to docs

- **WHEN** the home renders in any locale
- **THEN** there are 5 cards and each href resolves to a published docs page

### Requirement: The About eyes animate

Source: #1071 S10

After the pixel reveal the eyes canvas is displayed, aligned and blinking.

#### Scenario: Eyes blink after the reveal

- **WHEN** the reveal finishes with motion allowed and `pointer: fine`
- **THEN** the eyes canvas display is not `none` and it blinks within 8s

### Requirement: The footer matches prototype v17

Source: #1071 S11

The footer has the brand and tagline left, Product and Trust grouped right, and a one-row legal bar with no double border on docs pages.

#### Scenario: Legal items share a row

- **WHEN** the footer renders at 1980 wide
- **THEN** the three legal items share one row and the column headings are uppercase

### Requirement: Visual regressions are guarded by the parity harness and e2e

Source: #1071 S12

The parity harness captures a footer section and clips the same inner box on both sides, and `apps/site/design/report.md` records the user-chosen deviations.

#### Scenario: Harness covers the footer

- **WHEN** `bun run --cwd apps/site parity` runs on the built site
- **THEN** it captures a footer pair for the prototype and the site

### Requirement: The How it works painting shows the merge as light in the water

Source: #1089 S1, #1089 S2, #1089 S3

#### Scenario: The streams are drawn from the painting geometry

- **WHEN** the home is built
- **THEN** the overlay paths come from the painting stream points and carry no white diagram lines, pills or flow dots

#### Scenario: The light follows the three stages

- **WHEN** the runway moves from step 1 to step 3 on desktop
- **THEN** the streams light up from source to waterfall, the river and bloom follow, and a spark loops along each stream

### Requirement: The merge overlay uses outline chips and a solid green Merged badge

Source: #1089 S4, #1089 S5

#### Scenario: The tickets are marked by chips

- **WHEN** the overlay shows the sample tickets
- **THEN** each ticket is an outline chip with a source dot, inside the 360px crop of the painting, and colours do not follow the theme

#### Scenario: The spec merges

- **WHEN** the runway reaches the last step
- **THEN** a solid dark green Merged badge with the localized label appears below the falls

### Requirement: The merge overlay is static without motion or on small screens

Source: #1089 S6

#### Scenario: Reduced motion or a narrow viewport

- **WHEN** reduced motion is set or the viewport is 1000px wide or less
- **THEN** the overlay shows its final lit state with no transition or animation

### Requirement: Website dependencies track Latest

Source: #1093 S4

The Website's dependencies, including Astro, Starlight and the nginx image digest, are at Latest and the site builds and behaves unchanged.

#### Scenario: Checks run after a site dependency bump

- **WHEN** `bun run check` and `bun run test` run
- **THEN** they pass and the site's e2e suite passes in CI
