// Letterboxd-style dropdown: the label opens a slate card that covers it, "Any" first, a rule, then the choices.

let openMenu = null;

// choices: [[value, text], ...]. any: text of the "no filter" row, or null when one value must always be picked.
export function dropdown({ label, choices, value, any = null, prefix = "", onPick }) {
  const wrap = document.createElement("div");
  wrap.className = "dd";
  if (prefix) {
    const p = document.createElement("span");
    p.className = "dd-prefix";
    p.textContent = prefix;
    wrap.append(p);
  }
  const box = document.createElement("div");
  box.className = "dd-box";

  const current = choices.find(([v]) => String(v) === String(value));
  const text = current ? current[1] : label;
  const set = any !== null && current !== undefined;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "dd-trigger";
  trigger.classList.toggle("is-set", set);
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", `${prefix || label}: ${text}`);
  trigger.innerHTML = `<span></span><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.5l4 4 4-4"/></svg>`;
  trigger.firstChild.textContent = text;

  const menu = document.createElement("div");
  menu.className = "dd-menu";
  menu.hidden = true;
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", label);

  const head = document.createElement("button");
  head.type = "button";
  head.className = "dd-head";
  head.tabIndex = -1;
  head.setAttribute("aria-hidden", "true");
  head.innerHTML = `<span></span><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 7.5l4-4 4 4"/></svg>`;
  head.firstChild.textContent = label;
  menu.append(head);

  const items = [];
  const addItem = (val, name, selected) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dd-item";
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", String(selected));
    b.tabIndex = -1;
    b.textContent = name;
    b.addEventListener("click", () => {
      close();
      trigger.focus();
      onPick(val);
    });
    items.push(b);
    menu.append(b);
  };
  if (any !== null) {
    addItem(null, any, !set);
    const rule = document.createElement("hr");
    rule.className = "dd-rule";
    menu.append(rule);
  }
  for (const [val, name] of choices) addItem(val, name, current !== undefined && String(val) === String(value));

  const focusItem = (i) => items[(i + items.length) % items.length].focus();

  function onKey(e) {
    const i = items.indexOf(document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      trigger.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(i + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(items.length - 1);
    } else if (e.key === "Tab") close();
  }

  const onOutside = (e) => {
    if (!box.contains(e.target)) close();
  };

  function close() {
    if (openMenu !== close) return;
    openMenu = null;
    menu.hidden = true;
    box.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutside, true);
    menu.removeEventListener("keydown", onKey);
  }

  function show() {
    openMenu?.();
    openMenu = close;
    menu.hidden = false;
    box.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    menu.classList.remove("is-right");
    if (menu.getBoundingClientRect().right > document.documentElement.clientWidth - 8) menu.classList.add("is-right");
    document.addEventListener("pointerdown", onOutside, true);
    menu.addEventListener("keydown", onKey);
    (items.find((b) => b.getAttribute("aria-selected") === "true") || items[0])?.focus();
  }

  trigger.addEventListener("click", () => (menu.hidden ? show() : close()));
  head.addEventListener("click", () => {
    close();
    trigger.focus();
  });
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      show();
    }
  });

  box.append(trigger, menu);
  wrap.append(box);
  return wrap;
}
