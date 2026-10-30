import { posterEl } from "./poster.js";
import { providerBadge, providerLine } from "./providers.js";

function runtimeText(min) {
  if (!min) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function showResult(film) {
  const title = document.getElementById("result-title");
  title.textContent = film.title;
  if (film.year) {
    const year = document.createElement("span");
    year.className = "year";
    year.textContent = film.year;
    title.append(year);
  }

  const meta = document.getElementById("result-meta");
  const parts = [film.rating ? `TMDB ${film.rating.toFixed(1)}` : "", runtimeText(film.runtime), (film.genres || []).join(", ")].filter(Boolean);
  meta.replaceChildren(
    ...parts.map((text) => {
      const span = document.createElement("span");
      span.textContent = text;
      return span;
    }),
  );
  meta.hidden = parts.length === 0;

  const overview = document.getElementById("result-overview");
  const more = document.getElementById("result-more");
  overview.textContent = film.overview || "";
  overview.hidden = !film.overview;
  overview.classList.add("is-clamped");
  more.hidden = true;
  more.textContent = "More";
  more.onclick = () => {
    const open = overview.classList.toggle("is-clamped");
    more.textContent = open ? "More" : "Less";
  };
  // only offer "More" when the clamp actually cuts text; needs layout, so wait a frame
  requestAnimationFrame(() => {
    more.hidden = overview.hidden || overview.scrollHeight <= overview.clientHeight + 1;
  });

  const line = providerLine(film.providers);
  const providers = document.getElementById("result-providers");
  providers.replaceChildren();
  providers.hidden = !line;
  if (line) {
    const label = document.createElement("strong");
    label.textContent = line.label;
    providers.append(label);
    const names = line.names.length ? line.names : [];
    for (const name of names) {
      const chip = document.createElement("span");
      chip.className = "chip-pill";
      const logo = providerBadge(name, film.providers);
      if (logo) chip.append(logo);
      chip.append(name);
      providers.append(chip);
    }
    if (film.providers.link) {
      providers.append(
        Object.assign(document.createElement("a"), {
          href: film.providers.link,
          target: "_blank",
          rel: "noopener noreferrer",
          textContent: names.length ? "More on TMDB" : "Check TMDB",
        }),
      );
    }
  }

  const backdrop = document.getElementById("result-backdrop");
  backdrop.style.backgroundImage = film.backdrop ? `url("${film.backdrop}")` : "";
  backdrop.hidden = !film.backdrop;

  document.getElementById("result-poster").replaceChildren(posterEl(film, { eager: true, sizes: "(max-width: 560px) 150px, 200px" }));
  document.getElementById("result-link").href = film.url;
}
