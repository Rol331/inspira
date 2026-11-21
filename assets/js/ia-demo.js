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
  // Hoy solo "cocina" está activa en el formulario (meta 80 % cocinas). Los demás
  // espacios ya tienen su prompt listo: basta con agregar su opción en el HTML.
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
      var photoStep = stepWith("#ia-file");
      if (photoStep) {
        refreshValue(photoStep);
        photoStep.classList.add("is-done");
        setTimeout(function () { nextStep(photoStep); }, 450);
      }
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

  // Campos condicionales: cada bloque declara en data-rooms a qué espacios aplica
  // (sin data-rooms = todos). Para sumar un espacio: agregar su opción "room" en el HTML,
  // su prompt en ROOMS y marcar con data-rooms los bloques que le correspondan.
  var roomRadios = document.querySelectorAll('input[name="room"]');
  var roomPicker = $("[data-room-picker]");
  function updateRoomFields() {
    var room = ($('input[name="room"]:checked') || {}).value;
    document.querySelectorAll("[data-rooms]").forEach(function (el) {
      el.hidden = el.getAttribute("data-rooms").split(" ").indexOf(room) < 0;
    });
    // con un solo espacio disponible, el selector no aporta: se oculta
    if (roomPicker) roomPicker.hidden = roomRadios.length < 2;
    // numeración de pasos visibles
    var n = 0;
    document.querySelectorAll(".ia-panel > .ia-block").forEach(function (b) {
      var num = b.querySelector(".ia-num");
      if (num && !b.hidden) num.textContent = ++n + " · ";
    });
  }
  roomRadios.forEach(function (r) { r.addEventListener("change", updateRoomFields); });

  /* ---------- Acordeón de pasos ----------
     Cada .ia-block del panel se convierte en un paso plegable: el primero empieza
     abierto y, al completar uno (subir la foto o elegir una opción), se cierra y se
     abre el siguiente visible. La cabecera muestra lo elegido y un check. */
  var CHEV = '<svg class="ia-acc__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var steps = Array.prototype.slice.call(document.querySelectorAll(".ia-panel > .ia-block"));

  steps.forEach(function (b, i) {
    var title = b.querySelector(".ia-step");
    var head = document.createElement("button");
    head.type = "button";
    head.className = "ia-acc__head";
    head.id = "ia-acc-h" + i;
    head.setAttribute("aria-controls", "ia-acc-b" + i);
    head.appendChild(title);
    head.insertAdjacentHTML("beforeend", '<span class="ia-acc__value"></span><span class="ia-acc__check" aria-hidden="true">✓</span>' + CHEV);

    var body = document.createElement("div");
    body.className = "ia-acc__body";
    body.id = "ia-acc-b" + i;
    body.setAttribute("role", "region");
    body.setAttribute("aria-labelledby", head.id);
    var inner = document.createElement("div");
    inner.className = "ia-acc__inner";
    var pad = document.createElement("div");
    pad.className = "ia-acc__pad";
    while (b.firstChild) pad.appendChild(b.firstChild);
    inner.appendChild(pad);
    body.appendChild(inner);

    b.classList.add("ia-acc");
    b.appendChild(head);
    b.appendChild(body);
    head.addEventListener("click", function () { b.classList.contains("is-open") ? closeStep(b) : openStep(b); });

    // elegir una opción completa el paso y avanza al siguiente
    function complete() {
      refreshValue(b);
      b.classList.add("is-done");
      setTimeout(function () { nextStep(b); }, 280);
    }
    b.addEventListener("change", function (e) { if (e.target.type === "radio") complete(); });
    // tocar la opción que ya venía marcada (no dispara "change") también confirma el paso
    var wasChecked = false;
    b.addEventListener("pointerdown", function (e) {
      var label = e.target.closest("label");
      var input = label && label.querySelector("input[type=radio]");
      wasChecked = !!(input && input.checked);
    });
    b.addEventListener("click", function (e) {
      if (wasChecked && e.target.type === "radio") { wasChecked = false; complete(); }
    });
    refreshValue(b);
  });

  function refreshValue(b) {
    var v = b.querySelector(".ia-acc__value");
    var checked = b.querySelector("input[type=radio]:checked");
    if (checked) v.textContent = checked.dataset.label;
    else if (b.contains(fileInput)) v.textContent = original ? "Foto cargada" : "Pendiente";
  }
  function setOpen(b, open) {
    b.classList.toggle("is-open", open);
    b.querySelector(".ia-acc__head").setAttribute("aria-expanded", String(open));
    var body = b.querySelector(".ia-acc__body");
    if (open) body.removeAttribute("inert"); else body.setAttribute("inert", "");
  }
  function openStep(b, scroll) {
    steps.forEach(function (s) { setOpen(s, s === b); });
    if (scroll) {
      var r = b.getBoundingClientRect();
      if (r.top < 80 || r.top > window.innerHeight * 0.6) b.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  function closeStep(b) { setOpen(b, false); }
  function nextStep(b) {
    var visible = steps.filter(function (s) { return !s.hidden; });
    var next = visible[visible.indexOf(b) + 1];
    if (next) openStep(next, true);
    else { closeStep(b); btn.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }
  function stepWith(selector) {
    return steps.filter(function (s) { return s.querySelector(selector); })[0];
  }

  updateRoomFields();
  var firstStep = steps.filter(function (s) { return !s.hidden; })[0];
  steps.forEach(function (s) { setOpen(s, s === firstStep); });

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
    var p = "Redesign the " + ROOMS[o.room] + " in the first image (a real interior photo) in a " + STYLES[o.style] + ". " +
      "Color palette: " + COLORS[o.color] + ". " +
      "Furniture and cabinetry finish: " + FINISHES[o.finish] + ". ";
    if (o.room === "cocina") {
      p += "Make it " + FORMATS[o.format] + ", with cabinetry arranged in a " + LAYOUTS[o.layout] +
        " that fits within the existing walls. Countertops and work surfaces in " + MATERIALS[o.material] + ". ";
      if (o.layoutRef) p += "The second image is only a top-view floor plan diagram of the desired kitchen layout " +
        "(position of sink, cooktop and fridge forming the work triangle). Follow that arrangement, adapted to the room in the photo, " +
        "but do not draw the diagram, lines or symbols in the result. ";
      if (FOCAL[o.focal]) p += "Make " + FOCAL[o.focal] + " the focal point of the design. ";
    }
    return p + "Keep exactly the same room architecture, camera angle, perspective, windows, doors, ceiling height and proportions. " +
      "Replace furniture, custom-made cabinetry, finishes, decor and lighting to create a professionally designed, " +
      "functional and realistic interior that could actually be built. Natural daylight, realistic and elegant color rendering, no oversaturation. " +
      "Respect the requested materials exactly: do not change materials just to fit the color palette; apply the palette through paint, textiles and accessories instead. " +
      "Do not add people, text, logos or watermarks. Output one photorealistic interior photograph.";
  }

  // Esquema de distribución (del PDF de parámetros) como imagen de referencia para la IA.
  // Se convierte a JPEG sobre fondo blanco para enviarlo como data URI junto a la foto.
  function layoutReference(o) {
    if (o.room !== "cocina" || !o.layout) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        resolve(c.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = function () { resolve(null); }; // sin esquema, se usa solo la descripción en texto
      img.src = "assets/img/layouts/" + o.layout + ".webp";
    });
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
    if (!original) {
      openStep(stepWith("#ia-file"), true);
      return showError("Primero sube una foto de tu cocina.");
    }
    if (!room || !style) return showError("Elige el tipo de ambiente y un estilo.");
    if (typeof puter === "undefined") return showError("No se pudo cargar el servicio de IA. Revisa tu conexión y recarga la página.");

    btn.disabled = true;
    show("loading");
    loadingText.textContent = "Analizando tu espacio…";

    isInterior(original.dataUrl).then(function (ok) {
      if (!ok) throw { code: "not_interior" };
      loadingText.textContent = "Diseñando tu " + o.labels.room.toLowerCase() + " en estilo " + o.labels.style +
        ", paleta " + o.labels.color.toLowerCase() + "…";
      return layoutReference(o).then(function (ref) {
        o.layoutRef = !!ref;
        return puter.ai.txt2img(buildPrompt(o), {
          model: MODEL,
          input_images: ref ? [original.dataUrl, ref] : [original.dataUrl],
          input_image_mime_type: "image/jpeg",
          ratio: closestRatio(original.w, original.h),
          quality: "1K"
        });
      });
    }).then(function (img) {
      loadingText.textContent = "Preparando tu propuesta…";
      return watermark(img.src);
    }).then(function (marked) {
      $("#ia-before").src = original.dataUrl;
      $("#ia-after").src = marked;
      $("#ia-download").dataset.src = marked;
      $("#ia-wa").href = "https://wa.me/51982219856?text=" + encodeURIComponent(
        "Hola Inspira 👋, probé el diseñador con IA de su web y me gustó esta propuesta:\n\n" +
        summary(o) + "\n\nQuisiera solicitar una evaluación.");
      $(".ba__range").value = 50;
      $(".ba").style.setProperty("--pos", "50%");
      show("result");
      document.querySelector(".ia-stage").scrollIntoView({ behavior: "smooth", block: "start" });
      if (typeof window.gtag === "function") window.gtag("event", "ia_design_generated", { room: room, style: style, color: o.color, finish: o.finish });
    }).catch(function (e) {
      show("placeholder");
      var code = (e && (e.code || (e.error && e.error.code))) || "";
      var text = String((e && (e.message || (e.error && e.error.message))) || "");
      if (code === "not_interior") showError("Esta demo funciona con fotos de cocinas o ambientes interiores. Prueba con otra foto.");
      else if (code === "watermark") showError("No pudimos preparar la vista previa de tu propuesta. Inténtalo nuevamente.");
      else if (/moderation|flagged/i.test(code + text)) showError("La imagen no pudo procesarse por los filtros de contenido. Prueba con otra foto de tu ambiente.");
      else if (/insufficient|funds|402/i.test(code + text)) showError("La cuenta de Puter no tiene saldo suficiente para generar la imagen.");
      else showError("No pudimos generar el diseño en este momento. Inténtalo nuevamente en unos segundos.");
      if (window.console) console.error(e);
    }).then(function () { btn.disabled = false; });
  });

  /* ---------- Protección de la propuesta (informe 2.5) ----------
     - Vista previa en resolución media (máx. 1024 px) con marca de agua de Inspira.
     - La descarga es esa misma imagen marcada; la versión limpia nunca se muestra.
     - Clic derecho, arrastre y "guardar imagen" (pulsación larga en iOS) bloqueados.
     Una captura de pantalla no se puede impedir desde una web: por eso la marca de agua. */
  var PREVIEW_MAX = 1024;

  function watermark(src) {
    // fetch → blob → objectURL evita "ensuciar" el canvas con una imagen de otro dominio
    return Promise.all([
      fetch(src).then(function (r) { return r.blob(); }),
      document.fonts && document.fonts.load ? document.fonts.load("800 40px Montserrat").catch(function () {}) : null
    ]).then(function (res) {
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(res[0]);
        var img = new Image();
        img.onload = function () {
          var k = Math.min(1, PREVIEW_MAX / Math.max(img.naturalWidth, img.naturalHeight));
          var c = document.createElement("canvas");
          var w = c.width = Math.round(img.naturalWidth * k);
          var h = c.height = Math.round(img.naturalHeight * k);
          var ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);

          // trama diagonal discreta en toda la imagen
          var fs = Math.round(w / 16);
          ctx.save();
          ctx.translate(w / 2, h / 2);
          ctx.rotate(-Math.PI / 7);
          ctx.font = "800 " + fs + "px Montserrat, Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(255,255,255,.16)";
          ctx.strokeStyle = "rgba(0,0,0,.06)";
          ctx.lineWidth = Math.max(1, fs / 30);
          for (var y = -h; y <= h; y += fs * 3) {
            for (var x = -w; x <= w; x += fs * 6) {
              var off = (y / (fs * 3)) % 2 ? fs * 3 : 0;
              ctx.fillText("INSPIRA", x + off, y);
              ctx.strokeText("INSPIRA", x + off, y);
            }
          }
          ctx.restore();

          // sello con el logo en la esquina inferior derecha
          var lf = Math.round(w / 22), pad = Math.round(lf * .55);
          var subFont = "500 " + Math.round(lf * .36) + "px Montserrat, Arial, sans-serif";
          ctx.font = subFont;
          var sw = ctx.measureText("Estudio de interiorismo").width;
          ctx.font = "800 " + lf + "px Montserrat, Arial, sans-serif";
          var tw = ctx.measureText("Inspira").width;
          var bw = Math.max(tw, sw) + pad * 2, bh = lf * 1.75 + pad;
          var bx = w - bw - pad, by = h - bh - pad;
          ctx.fillStyle = "rgba(255,255,255,.88)";
          if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, lf * .3); ctx.fill(); } else ctx.fillRect(bx, by, bw, bh);
          var g = ctx.createLinearGradient(bx + pad, 0, bx + pad + tw, 0);
          g.addColorStop(0, "#0a63f0"); g.addColorStop(.55, "#0f8f95"); g.addColorStop(1, "#2bbd16");
          ctx.fillStyle = g;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillText("Inspira", bx + pad, by + pad * .6);
          ctx.fillStyle = "#151515";
          ctx.font = subFont;
          ctx.fillText("Estudio de interiorismo", bx + pad, by + pad * .6 + lf * 1.12);

          try { resolve(c.toDataURL("image/jpeg", 0.86)); } catch (e) { reject({ code: "watermark" }); }
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject({ code: "watermark" }); };
        img.src = url;
      });
    }).catch(function (e) { throw (e && e.code) ? e : { code: "watermark" }; });
  }

  var protect = $(".ia-protect");
  ["contextmenu", "dragstart"].forEach(function (ev) {
    protect.addEventListener(ev, function (e) { if (e.target.tagName === "IMG") e.preventDefault(); });
  });

  // Descargar: siempre la versión con marca de agua
  $("#ia-download").addEventListener("click", function () {
    var a = document.createElement("a");
    a.href = this.dataset.src;
    a.download = "inspira-propuesta-ia.jpg";
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  // "Probar otro estilo": vuelve al paso Estilo con el resto de elecciones intactas
  $("#ia-again").addEventListener("click", function () {
    show("placeholder");
    var styleStep = stepWith('input[name="style"]');
    if (styleStep) { openStep(styleStep); styleStep.scrollIntoView({ behavior: "smooth", block: "start" }); }
  });
})();
