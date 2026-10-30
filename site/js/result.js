import { posterEl } from "./poster.js";

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

  document.getElementById("result-poster").replaceChildren(posterEl(film, { eager: true }));
  document.getElementById("result-link").href = film.url;
}
