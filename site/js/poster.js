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

export function posterEl(film, { eager = false } = {}) {
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
  img.src = film.poster;
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
