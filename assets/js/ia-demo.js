/* =========================================================
   Demo "Diseña tu espacio con IA" — Puter.js + Gemini
   Solo para demostración: Puter cobra a la cuenta del visitante
   (inicia sesión en Puter la primera vez). Para producción, mover
   la llamada a un backend propio (Cloudflare Worker / Firebase AI Logic).
   ========================================================= */
(function () {
  "use strict";

  var MODEL = "gemini-nano-banana-2.1";
  var MAX_SIDE = 1536;

  // Parámetros definidos por Inspira (ver "Parametros para IA INSPIRA ESTUDIO.pdf")
  var ROOMS = {
    cocina: "kitchen",
    sala: "living room",
    comedor: "dining room",
    bano: "bathroom"
  };
  var STYLES = {
    moderno: "modern style with straight, clean lines",
    nordico: "Nordic / Scandinavian style with light woods and white",
    industrial: "industrial style with black metal and concrete-like textures",
    minimalista: "minimalist style with handleless furniture and uncluttered surfaces",
    calido: "warm natural style with earth tones and organic textures",
    lujo: "luxury contemporary style with strongly veined surfaces and metallic touches",
    clasico: "modern classic / neoclassical style with subtle moldings"
  };
  var COLORS = {
    claros: "light and luminous tones (white, pearl, bone white)",
    neutros: "warm neutral tones (beige, sand, taupe)",
    oscuros: "dark contrast (anthracite, graphite gray, black)",
    tierra: "earth tones (mocha, caramel, soft terracotta)",
    acentos: "color accents (olive green, petrol blue)"
  };
  var FINISHES = {
    melamina: "smooth matte anti-fingerprint melamine",
    "madera-clara": "light textured wood (oak or ash type)",
    "madera-oscura": "dark textured wood (walnut or wengue type)",
    gloss: "high-gloss finish with vertical grooved / slatted fronts"
  };
  var FORMATS = {
    cerrada: "a closed kitchen (enclosed by walls, separate from other rooms)",
    abierta: "an open American-style kitchen integrated with the adjacent living/dining area"
  };
  var LAYOUTS = {
    lineal: "single-wall linear layout",
    paralelo: "parallel / galley layout with two facing runs",
    ele: "L-shaped layout",
    u: "U-shaped layout",
    g: "G-shaped layout (U-shape plus a partial fourth run)",
    isla: "layout with a central island",
    peninsula: "layout with a peninsula"
  };
  var MATERIALS = {
    cuarzo: "pure white or Calacatta-type quartz",
    granito: "dark granite or natural stone",
    marmol: "marble with pronounced veining",
    microcemento: "microcement / polished concrete",
    sinterizada: "sintered stone"
  };
  var FOCAL = {
    campana: "a decorative statement range hood",
    backsplash: "an impactful backsplash (hydraulic tiles, zellige, herringbone or a continuous stone slab)",
    "isla-contraste": "a contrasting central island with a waterfall countertop or a cabinet finish different from the perimeter",
    vitrina: "a breakfast cabinet or illuminated glass display cabinet",
    lamparas: "large-format pendant lamps over the island or peninsula",
    farmhouse: "a farmhouse sink area by the window with brass/copper designer faucet and exposed apron front",
    estanteria: "an accent wall or open shelving"
  };

  var $ = function (s) { return document.querySelector(s); };
  var fileInput = $("#ia-file"), upload = $(".ia-upload"), preview = $("#ia-preview");
  var btn = $("#ia-generate"), msg = $(".ia-msg");
  var stage = { placeholder: $(".ia-placeholder"), loading: $(".ia-loading"), result: $(".ia-result") };
  var loadingText = $("#ia-loading-text");
  var original = null; // { dataUrl, w, h }

  function showError(text) { msg.textContent = text; msg.className = "ia-msg is-error"; }
  function clearError() { msg.className = "ia-msg"; msg.textContent = ""; }
  function show(name) {
    Object.keys(stage).forEach(function (k) { stage[k].hidden = k !== name; });
  }

  // Reduce la foto en el navegador (menos peso, menos costo, respuesta más rápida)
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(new Error("Sube una imagen JPG, PNG o WebP."));
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ dataUrl: c.toDataURL("image/jpeg", 0.88), w: c.width, h: c.height });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("No pudimos leer la imagen. Prueba con otra foto.")); };
      img.src = url;
    });
  }

  function closestRatio(w, h) {
    var opts = [[1, 1], [4, 3], [3, 4], [3, 2], [2, 3], [16, 9], [9, 16]];
    var r = w / h, best = opts[0];
    opts.forEach(function (o) { if (Math.abs(o[0] / o[1] - r) < Math.abs(best[0] / best[1] - r)) best = o; });
    return { w: best[0], h: best[1] };
  }

  function handleFile(file) {
    clearError();
    loadImage(file).then(function (data) {
      original = data;
      preview.src = data.dataUrl;
      upload.classList.add("has-image");
      $(".ia-upload__empty").hidden = true;
      preview.hidden = false;
      $(".ia-upload__change").hidden = false;
    }).catch(function (e) { showError(e.message); });
  }

  fileInput.addEventListener("change", function () { handleFile(fileInput.files[0]); });
  ["dragenter", "dragover"].forEach(function (ev) {
    upload.addEventListener(ev, function (e) { e.preventDefault(); upload.classList.add("is-drag"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    upload.addEventListener(ev, function (e) { e.preventDefault(); upload.classList.remove("is-drag"); });
  });
  upload.addEventListener("drop", function (e) { if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });

  // Campos condicionales: mostrar opciones de cocina solo cuando se selecciona cocina
  var cocinaBlocks = document.querySelectorAll(".ia-cocina-only");
  var roomRadios = document.querySelectorAll('input[name="room"]');
  function updateCocinaFields() {
    var sel = $('input[name="room"]:checked');
    var show = sel && sel.value === "cocina";
    for (var ci = 0; ci < cocinaBlocks.length; ci++) cocinaBlocks[ci].hidden = !show;
  }
  for (var ri = 0; ri < roomRadios.length; ri++) roomRadios[ri].addEventListener("change", updateCocinaFields);
  updateCocinaFields();

  // Paso 1: verificar que la foto sea un ambiente interior
  function isInterior(dataUrl) {
    var q = "Look at this image. Answer with a single word, YES or NO: is it a photo of an indoor room or " +
      "interior space of a home or business (kitchen, living room, dining room, bedroom, bathroom, closet, office, " +
      "empty room under construction)? Answer NO for selfies or photos focused on people, exteriors, facades, " +
      "landscapes, documents, screenshots, animals or isolated objects.";
    return puter.ai.chat(q, dataUrl).then(function (res) {
      var text = String((res && res.message && res.message.content) || res || "").trim().toUpperCase();
      return !/^NO\b/.test(text); // si la respuesta es ambigua, dejamos continuar (es una demo)
    }).catch(function () { return true; });
  }

  // Paso 2: rediseñar con Gemini (prompt cerrado: solo interiorismo)
  function sel(name) {
    var el = $('input[name="' + name + '"]:checked');
    return el ? { value: el.value, label: el.dataset.label } : { value: "", label: "" };
  }

  function buildPrompt(o) {
    var p = "Redesign this " + ROOMS[o.room] + " interior photo in a " + STYLES[o.style] + ". " +
      "Color palette: " + COLORS[o.color] + ". " +
      "Furniture and cabinetry finish: " + FINISHES[o.finish] + ". ";
    if (o.room === "cocina") {
      p += "Make it " + FORMATS[o.format] + ", with cabinetry arranged in a " + LAYOUTS[o.layout] +
        " that fits within the existing walls. Countertops and work surfaces in " + MATERIALS[o.material] + ". ";
      if (FOCAL[o.focal]) p += "Make " + FOCAL[o.focal] + " the focal point of the design. ";
    }
    return p + "Keep exactly the same room architecture, camera angle, perspective, windows, doors, ceiling height and proportions. " +
      "Replace furniture, custom-made cabinetry, finishes, decor and lighting to create a professionally designed, " +
      "functional and realistic interior that could actually be built. Natural daylight, realistic and elegant color rendering, no oversaturation. " +
      "Respect the requested materials exactly: do not change materials just to fit the color palette; apply the palette through paint, textiles and accessories instead. " +
      "Do not add people, text, logos or watermarks. Output one photorealistic interior photograph.";
  }

  // Resumen en español para WhatsApp
  function summary(o) {
    var lines = ["• Ambiente: " + o.labels.room, "• Estilo: " + o.labels.style, "• Gama de color: " + o.labels.color, "• Acabado: " + o.labels.finish];
    if (o.room === "cocina") {
      lines.push("• Formato: " + o.labels.format, "• Distribución: " + o.labels.layout, "• Mesada: " + o.labels.material);
      if (FOCAL[o.focal]) lines.push("• Elemento protagónico: " + o.labels.focal);
    }
    return lines.join("\n");
  }

  btn.addEventListener("click", function () {
    clearError();
    var o = { labels: {} };
    ["room", "style", "color", "finish", "format", "layout", "material", "focal"].forEach(function (k) {
      var v = sel(k); o[k] = v.value; o.labels[k] = v.label;
    });
    var room = o.room, style = o.style;
    if (!original) return showError("Primero sube una foto de tu ambiente.");
    if (!room || !style) return showError("Elige el tipo de ambiente y un estilo.");
    if (typeof puter === "undefined") return showError("No se pudo cargar el servicio de IA. Revisa tu conexión y recarga la página.");

    btn.disabled = true;
    show("loading");
    loadingText.textContent = "Analizando tu espacio…";

    isInterior(original.dataUrl).then(function (ok) {
      if (!ok) throw { code: "not_interior" };
      loadingText.textContent = "Diseñando tu " + o.labels.room.toLowerCase() + " en estilo " + o.labels.style +
        ", paleta " + o.labels.color.toLowerCase() + "…";
      return puter.ai.txt2img(buildPrompt(o), {
        model: MODEL,
        input_image: original.dataUrl,
        input_image_mime_type: "image/jpeg",
        ratio: closestRatio(original.w, original.h),
        quality: "1K"
      });
    }).then(function (img) {
      $("#ia-before").src = original.dataUrl;
      $("#ia-after").src = img.src;
      $("#ia-download").dataset.src = img.src;
      $("#ia-wa").href = "https://wa.me/51982219856?text=" + encodeURIComponent(
        "Hola Inspira 👋, probé el diseñador con IA de su web y me gustó esta propuesta:\n\n" +
        summary(o) + "\n\nQuisiera solicitar una evaluación.");
      $(".ba__range").value = 50;
      $(".ba").style.setProperty("--pos", "50%");
      show("result");
      if (window.innerWidth < 992) document.querySelector(".ia-stage").scrollIntoView({ behavior: "smooth", block: "start" });
      if (typeof window.gtag === "function") window.gtag("event", "ia_design_generated", { room: room, style: style, color: o.color, finish: o.finish });
    }).catch(function (e) {
      show("placeholder");
      var code = (e && (e.code || (e.error && e.error.code))) || "";
      var text = String((e && (e.message || (e.error && e.error.message))) || "");
      if (code === "not_interior") showError("Esta demo solo funciona con fotos de ambientes interiores (cocina, sala, comedor o baño). Prueba con otra foto.");
      else if (/moderation|flagged/i.test(code + text)) showError("La imagen no pudo procesarse por los filtros de contenido. Prueba con otra foto de tu ambiente.");
      else if (/insufficient|funds|402/i.test(code + text)) showError("La cuenta de Puter no tiene saldo suficiente para generar la imagen.");
      else showError("No pudimos generar el diseño en este momento. Inténtalo nuevamente en unos segundos.");
      if (window.console) console.error(e);
    }).then(function () { btn.disabled = false; });
  });

  // Descargar resultado
  $("#ia-download").addEventListener("click", function () {
    var src = this.dataset.src;
    fetch(src).then(function (r) { return r.blob(); }).then(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "inspira-diseno-ia.png";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }).catch(function () { window.open(src, "_blank", "noopener"); });
  });

  $("#ia-again").addEventListener("click", function () {
    show("placeholder");
    document.querySelector(".ia-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
