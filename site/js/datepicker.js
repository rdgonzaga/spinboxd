// Calendar popover for the watched date. One open at a time; closes on Esc, outside click or pick.

import { dropdown } from "./dropdown.js";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const FIRST_YEAR = 2000;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const monthIndex = (d) => d.getFullYear() * 12 + d.getMonth();

let open = null;

export function closeDatePicker() {
  open?.close();
}

// anchor: the element the card hangs off. value: Date or null. max: latest pickable Date.
// onPick(date) gets noon local time on the chosen day.
export function openDatePicker(anchor, { value, max, label = "Pick a date", onPick }) {
  closeDatePicker();
  const today = startOfDay(max);
  const selected = value ? startOfDay(value) : null;
  let view = new Date((selected || today).getFullYear(), (selected || today).getMonth(), 1);
  let focused = selected && selected <= today ? selected : today;

  const card = document.createElement("div");
  card.className = "datepicker";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", label);

  const prev = navButton("‹", "Previous month");
  const next = navButton("›", "Next month");
  // same slate dropdown as the filter bar, rebuilt on every render so it shows the current month
  const month = document.createElement("div");
  month.className = "dp-month";
  const last = monthIndex(today);
  const months = [];
  for (let m = last; m >= FIRST_YEAR * 12; m--) {
    months.push([m, new Date(Math.floor(m / 12), m % 12, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })]);
  }
  const head = document.createElement("div");
  head.className = "dp-head";
  head.append(prev, month, next);

  const weekdays = document.createElement("div");
  weekdays.className = "dp-weekdays";
  weekdays.setAttribute("aria-hidden", "true");
  for (const w of WEEKDAYS) {
    const s = document.createElement("span");
    s.textContent = w;
    weekdays.append(s);
  }

  const days = document.createElement("div");
  days.className = "dp-days";
  days.setAttribute("role", "grid");
  card.append(head, weekdays, days);

  function navButton(text, name) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dp-nav";
    b.textContent = text;
    b.setAttribute("aria-label", name);
    return b;
  }

  function render() {
    const m = monthIndex(view);
    month.replaceChildren(
      dropdown({
        label: "Month",
        choices: months,
        value: m,
        onPick: (picked) => {
          shiftMonth(picked - monthIndex(view));
          month.querySelector(".dd-trigger").focus();
        },
      }),
    );
    prev.disabled = m <= FIRST_YEAR * 12;
    next.disabled = m >= last;
    const lead = (view.getDay() + 6) % 7; // Monday first
    const start = addDays(view, -lead);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const day = addDays(start, i);
      if (i >= 35 && day.getMonth() !== view.getMonth()) break;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dp-day";
      b.textContent = day.getDate();
      b.dataset.time = String(day.getTime());
      b.setAttribute("aria-label", day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
      b.tabIndex = sameDay(day, focused) ? 0 : -1;
      if (day.getMonth() !== view.getMonth()) b.classList.add("is-outside");
      if (selected && sameDay(day, selected)) {
        b.classList.add("is-selected");
        b.setAttribute("aria-pressed", "true");
      }
      if (sameDay(day, today)) b.classList.add("is-today");
      b.disabled = day > today;
      cells.push(b);
    }
    days.replaceChildren(...cells);
  }

  function show(date, { focus = true } = {}) {
    focused = date;
    view = new Date(date.getFullYear(), date.getMonth(), 1);
    render();
    if (focus) days.querySelector('[tabindex="0"]')?.focus();
  }

  function shiftMonth(delta) {
    const target = Math.min(last, Math.max(FIRST_YEAR * 12, monthIndex(view) + delta));
    const y = Math.floor(target / 12);
    const mo = target % 12;
    const lastDay = new Date(y, mo + 1, 0).getDate();
    const day = new Date(y, mo, Math.min(focused.getDate(), lastDay));
    show(day > today ? today : day, { focus: false });
  }

  prev.addEventListener("click", () => shiftMonth(-1));
  next.addEventListener("click", () => shiftMonth(1));

  days.addEventListener("click", (e) => {
    const b = e.target.closest(".dp-day");
    if (!b || b.disabled) return;
    const d = new Date(Number(b.dataset.time));
    close();
    onPick(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12));
  });

  days.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    let target = null;
    if (step) target = addDays(focused, step);
    else if (e.key === "Home") target = addDays(focused, -((focused.getDay() + 6) % 7));
    else if (e.key === "End") target = addDays(focused, 6 - ((focused.getDay() + 6) % 7));
    else if (e.key === "PageUp" || e.key === "PageDown") {
      const dir = e.key === "PageUp" ? -1 : 1;
      target = new Date(focused.getFullYear(), focused.getMonth() + dir, Math.min(focused.getDate(), new Date(focused.getFullYear(), focused.getMonth() + dir + 1, 0).getDate()));
    }
    if (!target) return;
    e.preventDefault();
    if (target > today) target = today;
    if (target.getFullYear() < FIRST_YEAR) return;
    show(target);
  });

  function onKey(e) {
    // an open month menu handles its own keys; Esc there closes the menu, not the calendar
    if (e.target.closest?.(".dd-menu")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      anchor.focus();
    } else if (e.key === "Tab") {
      // keep focus inside the card
      const items = [...card.querySelectorAll("button:not(:disabled):not([tabindex='-1'])")];
      const first = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function onOutside(e) {
    if (!card.contains(e.target) && !anchor.contains(e.target)) close();
  }

  function place() {
    const gap = 6;
    const r = anchor.getBoundingClientRect();
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    const below = r.bottom + gap;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - gap) : below;
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  function close() {
    if (open?.card !== card) return;
    open = null;
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    card.remove();
  }

  render();
  document.body.append(card);
  place();
  open = { card, close };
  document.addEventListener("pointerdown", onOutside, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);
  days.querySelector('[tabindex="0"]')?.focus();
}
