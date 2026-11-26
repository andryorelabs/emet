/**
 * Odometer of the stats band: each numeric value (`data-n`) is rebuilt as
 * columns of the digits 0 to 9 that roll to the value once the band scrolls
 * into view, and a top bar grows on every item. The value text stays in the
 * DOM as the accessible name, so without script, or with reduced motion, the
 * final state is the plain HTML. The rolling itself is CSS: this module only
 * builds the columns, sets per-column CSSOM properties and flips data
 * attributes (no inline style attributes, so the CSP holds).
 */

const VIEW_THRESHOLD = 0.3;
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** The decimal digits of a non-negative whole number, most significant first. */
export function odometerDigits(value: number): number[] {
  return Array.from(String(Math.trunc(Math.abs(value))), Number);
}

function buildColumn(digit: number, order: number): HTMLElement {
  const column = document.createElement("span");
  column.className = "odo-digit";
  column.style.setProperty("--digit", String(digit));
  column.style.setProperty("--order", String(order));
  const roll = document.createElement("span");
  roll.className = "odo-roll";
  for (const face of DIGITS) {
    const cell = document.createElement("span");
    cell.textContent = String(face);
    roll.append(cell);
  }
  column.append(roll);
  return column;
}

function buildOdometer(stat: HTMLElement, value: number, order: number): void {
  const target = stat.querySelector(".stat-value");
  if (!target) return;
  const odometer = document.createElement("span");
  odometer.className = "odo";
  odometer.setAttribute("aria-hidden", "true");
  odometer.append(...odometerDigits(value).map((digit) => buildColumn(digit, order)));
  target.querySelector(".stat-text")?.classList.add("sr-only");
  target.append(odometer);
  stat.dataset.odo = "";
}

/** Arms every item of the band and rolls them when the band first enters the viewport. */
export function initOdometer(root: HTMLElement): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const stats = Array.from(root.querySelectorAll<HTMLElement>(".stat"));
  stats.forEach((stat, order) => {
    stat.style.setProperty("--order", String(order));
    const value = Number(stat.dataset.n);
    if (stat.dataset.n !== undefined && Number.isInteger(value) && value >= 0) {
      buildOdometer(stat, value, order);
    }
  });
  root.dataset.armed = "";

  const roll = (): void => {
    for (const stat of stats) stat.dataset.rolled = "";
  };
  if (typeof IntersectionObserver === "undefined") {
    roll();
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      roll();
    },
    { threshold: VIEW_THRESHOLD },
  );
  observer.observe(root);
}
