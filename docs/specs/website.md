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
