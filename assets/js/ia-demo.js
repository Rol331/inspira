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

  var ROOMS = {
    cocina: "kitchen",
    sala: "living room / dining room",
    dormitorio: "bedroom",
    bano: "bathroom",
    closet: "walk-in closet / wardrobe area",
    bar: "home bar / entertainment area"
  };
  var STYLES = {
    moderno: "modern contemporary style with clean lines, matte cabinetry, quartz countertops and warm LED accent lighting",
    nordico: "Scandinavian style with light oak wood, white surfaces, natural textiles and soft daylight",
    industrial: "industrial loft style with black metal details, dark wood, concrete textures and pendant lights",
    minimalista: "minimalist style with handleless furniture, neutral palette, hidden storage and uncluttered surfaces",
    calido: "warm natural style with walnut wood, beige and earth tones, linen fabrics and indirect warm lighting",
    lujo: "luxury contemporary style with marble, brass accents, glass display cabinets and layered lighting"
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
  function buildPrompt(room, style) {
    return "Redesign this " + ROOMS[room] + " interior photo in a " + STYLES[style] + ". " +
      "Keep exactly the same room architecture, camera angle, perspective, walls, windows, doors, ceiling height and proportions. " +
      "Replace furniture, custom-made cabinetry, finishes, materials, decor and lighting to create a professionally designed, " +
      "functional and realistic interior that could actually be built. Natural daylight, elegant natural colors, no oversaturation. " +
      "Do not add people, text, logos or watermarks. Output one photorealistic interior photograph.";
  }

  btn.addEventListener("click", function () {
    clearError();
    var room = ($('input[name="room"]:checked') || {}).value;
    var style = ($('input[name="style"]:checked') || {}).value;
    if (!original) return showError("Primero sube una foto de tu ambiente.");
    if (!room || !style) return showError("Elige el tipo de ambiente y un estilo.");
    if (typeof puter === "undefined") return showError("No se pudo cargar el servicio de IA. Revisa tu conexión y recarga la página.");

    btn.disabled = true;
    show("loading");
    loadingText.textContent = "Analizando tu espacio…";

    isInterior(original.dataUrl).then(function (ok) {
      if (!ok) throw { code: "not_interior" };
      loadingText.textContent = "Diseñando tu " + $('input[name="room"]:checked').dataset.label.toLowerCase() +
        " en estilo " + $('input[name="style"]:checked').dataset.label + "…";
      return puter.ai.txt2img(buildPrompt(room, style), {
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
      var styleLabel = $('input[name="style"]:checked').dataset.label;
      var roomLabel = $('input[name="room"]:checked').dataset.label;
      $("#ia-wa").href = "https://wa.me/51982219856?text=" + encodeURIComponent(
        "Hola Inspira 👋, probé el diseñador con IA de su web y me gustó la propuesta de " +
        roomLabel.toLowerCase() + " en estilo " + styleLabel + ". Quisiera solicitar una evaluación.");
      $(".ba__range").value = 50;
      $(".ba").style.setProperty("--pos", "50%");
      show("result");
      if (window.innerWidth < 992) document.querySelector(".ia-stage").scrollIntoView({ behavior: "smooth", block: "start" });
      if (typeof window.gtag === "function") window.gtag("event", "ia_design_generated", { room: room, style: style });
    }).catch(function (e) {
      show("placeholder");
      var code = (e && (e.code || (e.error && e.error.code))) || "";
      var text = String((e && (e.message || (e.error && e.error.message))) || "");
      if (code === "not_interior") showError("Esta demo solo funciona con fotos de ambientes interiores (cocina, sala, dormitorio, baño…). Prueba con otra foto.");
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
