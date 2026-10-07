/* =========================================================
   Inspira · Estudio de Interiorismo — interacciones
   Vanilla JS, sin dependencias.
   ========================================================= */
(function () {
  "use strict";

  var WA_NUMBER = "51982219856";
  var WA_DEFAULT_MSG = "Hola Inspira 👋, quiero contarles sobre mi proyecto y solicitar una evaluación.";

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  function waLink(msg) {
    return "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(msg || WA_DEFAULT_MSG);
  }

  // GA4: los eventos solo se envían si gtag está cargado (ver <head>)
  function track(name, params) {
    if (typeof window.gtag === "function") window.gtag("event", name, params || {});
  }

  /* ---------- Enlaces de WhatsApp ---------- */
  $$("[data-wa]").forEach(function (el) {
    var msg = el.getAttribute("data-wa") || WA_DEFAULT_MSG;
    el.setAttribute("href", waLink(msg));
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener");
    el.addEventListener("click", function () {
      track("whatsapp_click", { location: el.getAttribute("data-wa-loc") || "general", page: location.pathname });
    });
  });

  /* ---------- Header: sombra al hacer scroll ---------- */
  var header = $(".header");
  function onScroll() { if (header) header.classList.toggle("is-scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Menú móvil ---------- */
  var burger = $(".burger");
  var mobileNav = $(".mobile-nav");
  function setNav(open) {
    if (!burger || !mobileNav) return;
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    mobileNav.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
  }
  if (burger) {
    burger.addEventListener("click", function () { setNav(burger.getAttribute("aria-expanded") !== "true"); });
    $$("a", mobileNav).forEach(function (a) { a.addEventListener("click", function () { setNav(false); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setNav(false); });
    window.addEventListener("resize", function () { if (window.innerWidth >= 992) setNav(false); });
  }

  /* ---------- Hero slider ---------- */
  var hero = $(".hero");
  if (hero) {
    var slides = $$(".hero__slide", hero);
    var dots = $$(".hero__dot", hero);
    var DURATION = 6000;
    var current = 0, timer = null;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    hero.style.setProperty("--slide-ms", DURATION + "ms");

    var go = function (i) {
      current = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) {
        var on = k === current;
        s.classList.toggle("is-active", on);
        s.setAttribute("aria-hidden", String(!on));
        // carga diferida de las imágenes de slides no visibles
        var img = $("img[data-src]", s);
        if (on && img) { img.src = img.getAttribute("data-src"); img.removeAttribute("data-src"); }
      });
      dots.forEach(function (d, k) {
        d.classList.remove("is-active");
        void d.offsetWidth; // reinicia animación de la barra
        d.classList.toggle("is-active", k === current);
        d.setAttribute("aria-current", k === current ? "true" : "false");
      });
    };
    var play = function () { if (reduce) return; stop(); timer = setInterval(function () { go(current + 1); }, DURATION); };
    var stop = function () { clearInterval(timer); };

    dots.forEach(function (d, k) { d.addEventListener("click", function () { go(k); play(); }); });
    var prev = $(".hero__arrow--prev", hero), next = $(".hero__arrow--next", hero);
    if (prev) prev.addEventListener("click", function () { go(current - 1); play(); });
    if (next) next.addEventListener("click", function () { go(current + 1); play(); });

    // swipe táctil
    var x0 = null;
    hero.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    hero.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) { go(current + (dx < 0 ? 1 : -1)); play(); }
      x0 = null;
    });
    document.addEventListener("visibilitychange", function () { document.hidden ? stop() : play(); });

    go(0); play();
    // tras la carga inicial, precarga el resto de slides para que el fundido sea limpio
    window.addEventListener("load", function () {
      $$("img[data-src]", hero).forEach(function (img) { img.src = img.getAttribute("data-src"); img.removeAttribute("data-src"); });
    });
  }

  /* ---------- Pasos interactivos ---------- */
  var stepsWrap = $("[data-steps]");
  if (stepsWrap) {
    var steps = $$(".step", stepsWrap);
    var bar = $(".steps-progress span", stepsWrap);
    var detail = $("[data-step-detail]", stepsWrap);
    var stepTimer = null;
    var setStep = function (i) {
      steps.forEach(function (s, k) {
        s.classList.toggle("is-active", k === i);
        s.setAttribute("aria-selected", String(k === i));
      });
      if (bar) bar.style.width = ((i + 1) / steps.length) * 100 + "%";
      if (detail) detail.innerHTML = steps[i].getAttribute("data-detail");
    };
    var autoSteps = function () {
      clearInterval(stepTimer);
      var i = 0;
      stepTimer = setInterval(function () { i = (i + 1) % steps.length; setStep(i); }, 4500);
    };
    steps.forEach(function (s, k) {
      s.addEventListener("click", function () { clearInterval(stepTimer); setStep(k); });
    });
    setStep(0);
    if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      var started = false;
      new IntersectionObserver(function (entries, obs) {
        if (entries[0].isIntersecting && !started) { started = true; autoSteps(); obs.disconnect(); }
      }, { threshold: .4 }).observe(stepsWrap);
    }
  }

  /* ---------- Galería filtrable ---------- */
  var gallery = $("[data-gallery]");
  if (gallery) {
    var items = $$(".gallery__item", gallery);
    var filters = $$(".filter");
    var empty = $(".gallery-empty");
    var ba = $("[data-ba-section]");

    var applyFilter = function (cat) {
      var shown = 0;
      filters.forEach(function (f) {
        var on = f.getAttribute("data-filter") === cat;
        f.classList.toggle("is-active", on);
        f.setAttribute("aria-pressed", String(on));
      });
      items.forEach(function (it) {
        var cats = (it.getAttribute("data-cat") || "").split(" ");
        var show = cat === "todos" || cats.indexOf(cat) > -1;
        it.classList.toggle("is-hidden", !show);
        if (show) shown++;
      });
      if (ba) ba.hidden = !(cat === "todos" || cat === "antes-despues");
      if (empty) empty.hidden = shown > 0 || cat === "antes-despues";
      gallery.hidden = shown === 0;
    };
    filters.forEach(function (f) {
      f.addEventListener("click", function () {
        var cat = f.getAttribute("data-filter");
        applyFilter(cat);
        history.replaceState(null, "", cat === "todos" ? location.pathname : "#" + cat);
      });
    });
    var initial = location.hash.replace("#", "");
    applyFilter(filters.some(function (f) { return f.getAttribute("data-filter") === initial; }) ? initial : "todos");

    /* Lightbox */
    var lb = $(".lightbox");
    if (lb) {
      var lbImg = $(".lightbox__img", lb), lbCap = $(".lightbox__cap", lb);
      var idx = 0, lastFocus = null;
      var visible = function () { return items.filter(function (i) { return !i.classList.contains("is-hidden"); }); };
      var show = function (i) {
        var list = visible();
        idx = (i + list.length) % list.length;
        var it = list[idx], img = $("img", it);
        lbImg.src = it.getAttribute("data-full");
        lbImg.alt = img.alt;
        lbCap.innerHTML = $("figcaption", it).innerHTML;
      };
      var open = function (it) {
        lastFocus = document.activeElement;
        show(visible().indexOf(it));
        lb.classList.add("is-open");
        document.body.style.overflow = "hidden";
        $(".lightbox__close", lb).focus();
      };
      var close = function () {
        lb.classList.remove("is-open");
        document.body.style.overflow = "";
        if (lastFocus) lastFocus.focus();
      };
      items.forEach(function (it) { it.addEventListener("click", function () { open(it); }); });
      $(".lightbox__close", lb).addEventListener("click", close);
      $(".lightbox__prev", lb).addEventListener("click", function () { show(idx - 1); });
      $(".lightbox__next", lb).addEventListener("click", function () { show(idx + 1); });
      lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
      document.addEventListener("keydown", function (e) {
        if (!lb.classList.contains("is-open")) return;
        if (e.key === "Escape") close();
        if (e.key === "ArrowLeft") show(idx - 1);
        if (e.key === "ArrowRight") show(idx + 1);
      });
      var lx = null;
      lb.addEventListener("touchstart", function (e) { lx = e.touches[0].clientX; }, { passive: true });
      lb.addEventListener("touchend", function (e) {
        if (lx === null) return;
        var dx = e.changedTouches[0].clientX - lx;
        if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
        lx = null;
      });
    }
  }

  /* ---------- Antes / Después (slider táctil) ---------- */
  $$(".ba").forEach(function (el) {
    var range = $(".ba__range", el);
    var update = function () { el.style.setProperty("--pos", range.value + "%"); };
    range.addEventListener("input", update);
    update();
  });

  /* ---------- Formulario de diagnóstico ---------- */
  var form = $("#lead-form");
  if (form) {
    var MAX_BYTES = 10 * 1024 * 1024;
    var fileInput = $("#adjuntos", form);
    var fileList = $(".file-list", form);
    var dropzone = $(".dropzone", form);

    var setError = function (name, msg) {
      var field = $('[data-field="' + name + '"]', form);
      if (!field) return;
      field.classList.toggle("has-error", !!msg);
      var err = $(".field__error", field);
      if (err && msg) err.textContent = msg;
    };

    var describeFiles = function () {
      var files = Array.prototype.slice.call(fileInput.files || []);
      var total = files.reduce(function (a, f) { return a + f.size; }, 0);
      fileList.textContent = files.length
        ? files.map(function (f) { return f.name; }).join(", ") + " · " + (total / 1048576).toFixed(1) + " MB"
        : "";
      setError("adjuntos", total > MAX_BYTES ? "Los archivos superan los 10 MB permitidos." : "");
      return total <= MAX_BYTES;
    };
    if (fileInput) {
      fileInput.addEventListener("change", describeFiles);
      ["dragenter", "dragover"].forEach(function (ev) {
        dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add("is-drag"); });
      });
      ["dragleave", "drop"].forEach(function (ev) {
        dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove("is-drag"); });
      });
      dropzone.addEventListener("drop", function (e) {
        if (e.dataTransfer && e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; describeFiles(); }
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var nombre = (data.get("nombre") || "").trim();
      var whatsapp = (data.get("whatsapp") || "").replace(/[^\d+]/g, "");
      var distrito = (data.get("distrito") || "").trim();
      var ambiente = data.get("ambiente");
      var ok = true;

      setError("nombre", nombre.length < 2 ? "Ingresa tu nombre." : ""); if (nombre.length < 2) ok = false;
      var phoneOk = /^(\+?51)?9\d{8}$/.test(whatsapp);
      setError("whatsapp", phoneOk ? "" : "Ingresa un celular válido (9 dígitos, empieza con 9)."); if (!phoneOk) ok = false;
      setError("distrito", distrito ? "" : "Indica tu ciudad o distrito."); if (!distrito) ok = false;
      setError("ambiente", ambiente ? "" : "Selecciona un tipo de ambiente."); if (!ambiente) ok = false;
      if (fileInput && !describeFiles()) ok = false;

      if (!ok) {
        var firstErr = $(".has-error input, .has-error select", form);
        if (firstErr) firstErr.focus();
        return;
      }

      track("generate_lead", { form: "diagnostico", ambiente: ambiente });

      // Sin backend: se envía el resumen por WhatsApp.
      // Para guardar los adjuntos, conectar el atributo action del form a un servicio
      // (Formspree, Getform, PHP propio, etc.) y quitar este bloque.
      var msg = "Hola Inspira 👋, quiero solicitar una evaluación.\n\n" +
        "• Nombre: " + nombre + "\n" +
        "• WhatsApp: " + whatsapp + "\n" +
        "• Ciudad / Distrito: " + distrito + "\n" +
        "• Ambiente: " + ambiente +
        (data.get("mensaje") ? "\n• Detalle: " + data.get("mensaje").trim() : "") +
        (fileInput && fileInput.files.length ? "\n\n(Tengo fotos/planos para compartir por aquí.)" : "");
      window.open(waLink(msg), "_blank", "noopener");

      form.hidden = true;
      $(".form-success").classList.add("is-visible");
    });
  }

  /* ---------- Animaciones de entrada ---------- */
  var reveals = $$(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
      });
    }, { threshold: .12, rootMargin: "0px 0px -40px 0px" });
    reveals.forEach(function (r) { io.observe(r); });
  } else {
    reveals.forEach(function (r) { r.classList.add("is-visible"); });
  }

  /* ---------- Año del footer ---------- */
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
