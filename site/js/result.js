import { posterEl } from "./poster.js";
import { providerLine } from "./providers.js";

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
  const parts = [runtimeText(film.runtime), (film.genres || []).join(", ")].filter(Boolean);
  meta.replaceChildren(
    ...parts.map((text) => {
      const span = document.createElement("span");
      span.textContent = text;
      return span;
    }),
  );
  meta.hidden = parts.length === 0;

  const rating = document.getElementById("result-rating");
  rating.textContent = film.rating ? `TMDB ${film.rating.toFixed(1)}` : "";
  rating.hidden = !film.rating;

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
    label.textContent = line.names.length ? `${line.label}: ` : line.label;
    const text = line.names.join(", ");
    const tail = film.providers.link
      ? Object.assign(document.createElement("a"), {
          href: film.providers.link,
          target: "_blank",
          rel: "noopener noreferrer",
          textContent: text || "Check TMDB",
        })
      : document.createTextNode(text);
    providers.append(label, tail);
  }

  document.getElementById("result-poster").replaceChildren(posterEl(film, { eager: true }));
  document.getElementById("result-link").href = film.url;
}
