function blank(film) {
  const title = document.createElement("span");
  title.className = "poster-title";
  title.textContent = film.title;
  const nodes = [title];
  if (film.year) {
    const year = document.createElement("span");
    year.className = "poster-year";
    year.textContent = film.year;
    nodes.push(year);
  }
  return nodes;
}

// TMDB serves the same poster at several widths; srcset lets a phone take the one that
// fits its tile instead of the big one. w500 is the cap: w780 on a 3x phone is all bytes, no visible gain
const WIDTHS = [92, 154, 185, 342, 500];

function sized(url, width) {
  return url.replace(/\/w\d+\//, `/w${width}/`);
}

// sizes: how wide the poster is drawn, in the <img sizes> syntax
export function posterEl(film, { eager = false, sizes = "150px" } = {}) {
  const box = document.createElement("div");
  box.className = "poster";

  if (!film.poster) {
    box.classList.add("is-blank");
    box.append(...blank(film));
    return box;
  }

  // the title sits under the image, so a poster still loading reads as the film, not a grey box
  box.classList.add("is-loading");
  const img = new Image();
  img.alt = film.title;
  img.decoding = "async";
  img.loading = eager ? "eager" : "lazy";
  img.sizes = sizes;
  img.srcset = WIDTHS.map((w) => `${sized(film.poster, w)} ${w}w`).join(", ");
  img.src = sized(film.poster, 342);
  img.addEventListener("load", () => box.classList.remove("is-loading"), { once: true });
  img.addEventListener(
    "error",
    () => {
      box.classList.remove("is-loading");
      box.classList.add("is-blank");
      img.remove();
    },
    { once: true },
  );
  box.append(...blank(film), img);
  if (img.complete && img.naturalWidth) box.classList.remove("is-loading");
  return box;
}
