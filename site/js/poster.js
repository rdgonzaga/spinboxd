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

// TMDB serves the same poster at several widths; the grid never needs the big one
function sized(url, size) {
  return url.replace(/\/w\d+\//, `/${size}/`);
}

export function posterEl(film, { eager = false, size = "w185" } = {}) {
  const box = document.createElement("div");
  box.className = "poster";

  if (!film.poster) {
    box.classList.add("is-blank");
    box.append(...blank(film));
    return box;
  }

  const img = new Image();
  img.alt = film.title;
  img.decoding = "async";
  img.loading = eager ? "eager" : "lazy";
  img.src = sized(film.poster, size);
  img.addEventListener(
    "error",
    () => {
      box.classList.add("is-blank");
      box.replaceChildren(...blank(film));
    },
    { once: true },
  );
  box.append(img);
  return box;
}
