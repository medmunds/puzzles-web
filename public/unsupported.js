// Extract query string 'f' params using es5 only
// biome-ignore lint/complexity/useArrowFunction: es5 target
(function () {
  function redirectHome() {
    try {
      window.location.href = "/";
    } catch {}
  }

  var origin = window.location.origin || "";
  if (
    document.referrer &&
    origin &&
    document.referrer.slice(0, origin.length) !== origin
  ) {
    return redirectHome();
  }

  var qs = window.location.search || "";
  if (!qs) {
    return redirectHome();
  }

  function safeDecode(s) {
    try {
      return decodeURIComponent(s.replace(/\+/g, " "));
    } catch {
      return "";
    }
  }

  var features = [];
  var raw = qs.charAt(0) === "?" ? qs.slice(1) : qs;
  var i, pairs, part, eq, key, val;
  if (raw) {
    pairs = raw.split("&");
    for (i = 0; i < pairs.length; i++) {
      part = pairs[i];
      if (!part) continue;
      eq = part.indexOf("=");
      if (eq > 0) {
        key = safeDecode(part.slice(0, eq));
        val = safeDecode(part.slice(eq + 1));
        if (key === "f" && val) {
          features.push(val);
        }
      }
    }
  }

  if (!features.length) {
    return redirectHome();
  }

  // Populate the <ul id="missing">
  var ul = document.getElementById("missing");
  if (!ul) return;

  var li;
  for (i = 0; i < features.length; i++) {
    li = document.createElement("li");
    li.appendChild(document.createTextNode(features[i]));
    ul.appendChild(li);
  }
})();
