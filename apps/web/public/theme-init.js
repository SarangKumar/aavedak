(function () {
  try {
    var k = "aavedak-theme";
    var m = null;
    try {
      m = localStorage.getItem(k);
    } catch {
      /* ignore */
    }
    if (m !== "light" && m !== "dark" && m !== "system") {
      var c = document.cookie.match(/(?:^|; )aavedak-theme=([^;]+)/);
      m = c ? decodeURIComponent(c[1]) : "system";
    }
    if (m !== "light" && m !== "dark" && m !== "system") m = "system";
    var d =
      m === "dark" || (m === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var r = document.documentElement;
    r.classList.toggle("dark", d);
    r.style.colorScheme = d ? "dark" : "light";
    r.dataset.theme = m;
    try {
      localStorage.setItem(k, m);
    } catch {
      /* ignore */
    }
    document.cookie = k + "=" + m + "; Path=/; Max-Age=31536000; SameSite=Lax";
  } catch {
    /* ignore */
  }
})();
