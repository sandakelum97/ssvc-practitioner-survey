// app.js — survey behaviour. No libraries, no cookies, no analytics.
// Talks only to this site (scenarios, labels) and the Supabase REST API.
(function () {
  "use strict";

  var C = window.SURVEY_CONFIG;
  var ORDER = window.SurveyOrder;
  var STORE_KEY = "ssvc-survey-" + C.SURVEY_VERSION;
  var scenarios = null;   // by scenario number
  var labels = null;
  var state = null;

  // ---------------------------------------------------------------- utils
  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* private mode: continue without resume */ }
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  function completionCode(id) {
    var h = id.replace(/-/g, "").slice(0, 8).toUpperCase();
    return h.slice(0, 4) + "-" + h.slice(4);
  }

  function show(name) {
    var screens = document.querySelectorAll(".screen");
    for (var i = 0; i < screens.length; i++) screens[i].hidden = screens[i].id !== "screen-" + name;
    $("progress").hidden = name !== "item";
    $("btn-exit").hidden = ["about", "instructions", "item"].indexOf(name) < 0;
    closeDrawer();
    try { window.scrollTo(0, 0); } catch (e) { /* not available in every environment */ }
    $("main").focus({ preventScroll: true });
  }

  function formValues(form) {
    var out = {}, inputs = form.querySelectorAll("input[type=radio]:checked");
    for (var i = 0; i < inputs.length; i++) out[inputs[i].name] = inputs[i].value;
    return out;
  }

  function showError(id, msg) { var e = $(id); e.textContent = msg; e.hidden = !msg; }

  // ----------------------------------------------------------- database
  // Insert-only. "Prefer: return=minimal" because the public role may not
  // read rows back. 201 = saved; 409 = this row was already saved earlier
  // (for example, the page reloaded after saving), which counts as saved.
  function insert(table, row) {
    var headers = {
      "apikey": C.SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    };
    // Legacy anon keys are JWTs and also go in Authorization; the newer
    // publishable keys go in apikey only.
    if (/^eyJ/.test(C.SUPABASE_PUBLISHABLE_KEY)) headers["Authorization"] = "Bearer " + C.SUPABASE_PUBLISHABLE_KEY;
    return fetch(C.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/" + table, {
      method: "POST", headers: headers, body: JSON.stringify(row),
      cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer"
    }).then(function (r) {
      if (r.status === 201 || r.status === 204 || r.status === 409) return;
      var err = new Error("HTTP " + r.status); err.status = r.status; throw err;
    });
  }

  function saveErrorText(err) {
    if (err && err.status && err.status >= 400 && err.status < 500) {
      return "This answer could not be saved (error " + err.status + "). Please email " + C.CONTACT_EMAIL +
        (state && state.sessionId ? " with the code " + completionCode(state.sessionId) : "") + ".";
    }
    return "Your answer was not saved. Check your internet connection, then select the button again. Nothing you entered has been lost.";
  }

  function busy(form, on) {
    var b = form.querySelector("button[type=submit]");
    b.disabled = on;
    b.setAttribute("aria-busy", on ? "true" : "false");
  }

  // -------------------------------------------------------- setup checks
  function missingSettings() {
    var missing = [];
    Object.keys(C).forEach(function (k) {
      if (String(C[k]).indexOf("PASTE") >= 0) missing.push("config.js: " + k);
    });
    if (document.getElementById("definitions").innerHTML.indexOf("[PASTE") >= 0) {
      missing.push("index.html: the SSVC definitions (every [PASTE …] entry)");
    }
    if (/service_role|sb_secret_/.test(C.SUPABASE_PUBLISHABLE_KEY)) {
      missing.push("config.js: SUPABASE_PUBLISHABLE_KEY looks like a SECRET key. Remove it and use the publishable key");
    }
    return missing;
  }

  function fillConfigText() {
    var spans = document.querySelectorAll("[data-config]");
    for (var i = 0; i < spans.length; i++) spans[i].textContent = C[spans[i].getAttribute("data-config")];
    var links = document.querySelectorAll("[data-config-mailto]");
    for (var j = 0; j < links.length; j++) {
      var addr = C[links[j].getAttribute("data-config-mailto")];
      links[j].textContent = addr;
      links[j].href = "mailto:" + addr;
    }
  }

  // Presentation only: the words of every definition are unchanged.
  var SI_LABELS = /(Physical harm:|Operator resiliency:|System resiliency:|Environment:|Financial:|Psychological:)/;

  function formatDefinitions(root) {
    // One block per decision point (System Exposure, Human Impact, Action).
    var defs = root.querySelector(".definitions");
    var kids = Array.prototype.slice.call(defs.children), block = null;
    kids.forEach(function (k) {
      if (k.tagName === "H2") { block = el("div", "def-block"); defs.appendChild(block); }
      if (block) block.appendChild(k);
    });
    // Safety Impact: show each harm type on its own line with its label in bold.
    var dds = root.querySelectorAll(".sub-definitions dd");
    Array.prototype.forEach.call(dds, function (dd) {
      var text = dd.textContent;
      if (text.indexOf("Any one or more of these conditions hold.") !== 0) return;
      var parts = text.split(SI_LABELS);
      dd.textContent = "";
      dd.appendChild(document.createTextNode(parts[0].trim()));
      for (var i = 1; i < parts.length; i += 2) {
        dd.appendChild(document.createTextNode(" "));
        var line = el("span", "si-part");
        line.appendChild(el("strong", null, parts[i]));
        line.appendChild(document.createTextNode(" " + parts[i + 1].trim()));
        dd.appendChild(line);
      }
    });
  }

  function definitionMap(root) {
    // { "System Exposure": { "Small": "...", ... }, "Human Impact": {...}, "Action": {...} }
    var map = {};
    Array.prototype.forEach.call(root.querySelectorAll(".def-block"), function (b) {
      var name = b.querySelector("h2").textContent.trim(), dl = b.querySelector(":scope > dl");
      if (!dl) return;
      map[name] = {};
      Array.prototype.forEach.call(dl.querySelectorAll("dt"), function (dt) {
        var dd = dt.nextElementSibling;
        if (dd) map[name][dt.textContent.trim()] = dd.textContent.replace(/\s+/g, " ").trim();
      });
    });
    return map;
  }

  function placeDefinitions() {
    var t = document.getElementById("definitions");
    [$("definitions-home"), $("definitions-item")].forEach(function (host) {
      host.appendChild(t.content.cloneNode(true));
      formatDefinitions(host);
    });
    var map = definitionMap($("definitions-home"));
    Array.prototype.forEach.call(document.querySelectorAll(".options[data-def]"), function (g) {
      var defs = map[g.getAttribute("data-def")] || {};
      Array.prototype.forEach.call(g.querySelectorAll("label"), function (lab) {
        var d = defs[lab.textContent.trim()];
        if (d) lab.title = d;
      });
    });
  }

  function openDrawer() { $("defs-drawer").hidden = false; $("btn-defs-close").focus(); }
  function closeDrawer() { var d = $("defs-drawer"); if (d) d.hidden = true; }

  // --------------------------------------------------------- the record
  function label(field, value) {
    if (typeof value === "boolean") return labels.values["boolean"][String(value)];
    var map = labels.values[field];
    if (map && Object.prototype.hasOwnProperty.call(map, value)) return map[value];
    var unit = labels.units[field];
    return unit ? value + " " + unit : String(value);
  }

  function icon(id) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ico"); svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#" + id);
    svg.appendChild(use);
    return svg;
  }

  function panel(cls, iconId, title, rows) {
    var sec = el("section", "panel " + cls);
    var h = el("h2"); h.appendChild(icon(iconId)); h.appendChild(el("span", null, title));
    sec.appendChild(h);
    if (rows && rows.length) sec.appendChild(factRows(rows));
    return sec;
  }

  function factRows(rows) {
    var dl = el("dl");
    rows.forEach(function (r) {
      dl.appendChild(el("dt", null, labels.fields[r[0]]));
      dl.appendChild(el("dd", r[2] || null, r[1]));
    });
    return dl;
  }

  function renderRecord(s) {
    var o = s.organisation, a = s.asset, v = s.vulnerability;
    var box = $("record");
    box.textContent = "";
    var colA = el("div", "dash-col"), colB = el("div", "dash-col");
    box.appendChild(colA); box.appendChild(colB);

    colA.appendChild(panel("org", "i-org", "Organisation", [
      ["organisation.sector", label("organisation.sector", o.sector)],
      ["organisation.employee_count", o.employee_count],
      ["organisation.regulatory", label("organisation.regulatory", o.regulatory)],
      ["organisation.security_posture", label("organisation.security_posture", o.security_posture)],
      ["organisation.network_segmentation", label("organisation.network_segmentation", o.network_segmentation)],
      ["organisation.remote_access", label("organisation.remote_access", o.remote_access)],
      ["organisation.unmanaged_endpoint_estimate", o.unmanaged_endpoint_estimate]
    ]));

    colA.appendChild(panel("asset", "i-asset", "Asset", [
      ["asset.asset_class", label("asset.asset_class", a.asset_class)],
      ["asset.operating_system", label("asset.operating_system", a.operating_system)],
      ["asset.business_function", label("asset.business_function", a.business_function)],
      ["asset.user_count", a.user_count],
      ["asset.data_classification", label("asset.data_classification", a.data_classification)],
      ["asset.has_redundancy", label("asset.has_redundancy", a.has_redundancy)],
      ["asset.downtime_tolerance_hours", label("asset.downtime_tolerance_hours", a.downtime_tolerance_hours)],
      ["asset.safety_relevant", label("asset.safety_relevant", a.safety_relevant)],
      ["asset.managed_by_mssp", label("asset.managed_by_mssp", a.managed_by_mssp)]
    ]));

    colB.appendChild(panel("net", "i-net", "Network position", [
      ["asset.network_zone", label("asset.network_zone", a.network_zone)],
      ["asset.has_public_ip", label("asset.has_public_ip", a.has_public_ip)],
      ["asset.listening_ports", a.listening_ports.length ? a.listening_ports.join(", ") : "None"],
      ["asset.bound_all_interfaces", label("asset.bound_all_interfaces", a.bound_all_interfaces)],
      ["asset.seen_in_external_scan", label("asset.seen_in_external_scan", a.seen_in_external_scan)],
      ["asset.requires_auth", label("asset.requires_auth", a.requires_auth)],
      ["asset.behind_vpn_only", label("asset.behind_vpn_only", a.behind_vpn_only)],
      ["asset.behind_sase", label("asset.behind_sase", a.behind_sase)],
      ["asset.reachable_from_user_vlan", label("asset.reachable_from_user_vlan", a.reachable_from_user_vlan)],
      ["asset.reachable_from_guest_vlan", label("asset.reachable_from_guest_vlan", a.reachable_from_guest_vlan)]
    ]));

    s.software.forEach(function (sw) {
      colB.appendChild(panel("soft", "i-soft", "Vulnerable software", [
        ["software.vendor", label("software.vendor", sw.vendor)],
        ["software.product", label("software.product", sw.product)],
        ["software.version", label("software.version", sw.version)],
        ["software.component_role", label("software.component_role", sw.component_role)],
        ["software.support_status", label("software.support_status", sw.support_status)]
      ]));
    });

    var vuln = panel("vuln", "i-vuln", "Vulnerability, as known at the time");
    var score = el("div", "score");
    score.appendChild(el("strong", null, v.cvss_base_score));
    score.appendChild(el("span", null, labels.fields["vulnerability.cvss_base_score"]));
    vuln.appendChild(score);
    vuln.appendChild(factRows([["vulnerability.cvss_vector", v.cvss_vector, "mono"]]));
    var cisa = el("p", "cisa"); cisa.appendChild(icon("i-shield")); cisa.appendChild(el("span", null, "CISA assessment"));
    vuln.appendChild(cisa);
    if (v.cisa_assessment_published) {
      vuln.appendChild(factRows([
        ["vulnerability.exploitation", label("vulnerability.exploitation", v.exploitation)],
        ["vulnerability.automatable", label("vulnerability.automatable", v.automatable)],
        ["vulnerability.technical_impact", label("vulnerability.technical_impact", v.technical_impact)]
      ]));
    } else {
      vuln.appendChild(el("p", "no-cisa", labels.no_cisa_record));
    }
    colB.appendChild(vuln);
  }

  function renderItem() {
    var pos = state.next;
    var s = scenarios[state.order[pos - 1]];
    $("item-title").textContent = "Item " + pos + " of " + ORDER.N_ITEMS;
    $("progress-text").textContent = "Item " + pos + " of " + ORDER.N_ITEMS;
    $("progress-fill").style.width = ((pos - 1) / ORDER.N_ITEMS * 100) + "%";
    renderRecord(s);
    $("form-item").reset();
    showError("item-error", "");
    $("btn-item").textContent = pos === ORDER.N_ITEMS ? "Save and finish" : "Save and continue";
    show("item");
  }

  // ---------------------------------------------------------- the flow
  function route() {
    if (!state || !state.stage) return show("consent");
    if (state.stage === "about") return show("about");
    if (state.stage === "instructions") return show("instructions");
    if (state.stage === "items") return renderItem();
    if (state.stage === "done") {
      $("completion-code").textContent = completionCode(state.sessionId);
      return show("done");
    }
    show("consent");
  }

  $("form-consent").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = ev.target;
    function ticked(n) { var i = f.elements.namedItem(n); return !!(i && i.checked); }
    if (!ticked("read") || !ticked("adult") || !ticked("agree")) {
      return showError("consent-error", "Tick all three boxes to take part.");
    }
    showError("consent-error", "");
    if (!state || !state.sessionId) {
      state = { v: C.SURVEY_VERSION, sessionId: uuid(), order: ORDER.makeOrder(), stage: "consent", next: 1 };
      save();
    }
    busy(f, true);
    insert("sessions", {
      session_id: state.sessionId, survey_version: C.SURVEY_VERSION,
      item_order: state.order, consent_given: true
    }).then(function () {
      state.stage = "about"; save(); route();
    }).catch(function (e) {
      showError("consent-error", saveErrorText(e));
    }).then(function () { busy(f, false); });
  });

  $("form-about").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = ev.target, a = formValues(f);
    if (!a.years_band || !a.role_band || !a.works_at_mssp || !a.used_ssvc_before) {
      return showError("about-error", "Answer all four questions to continue.");
    }
    showError("about-error", "");
    busy(f, true);
    insert("screening", {
      session_id: state.sessionId, years_band: a.years_band, role_band: a.role_band,
      works_at_mssp: a.works_at_mssp === "true", used_ssvc_before: a.used_ssvc_before === "true"
    }).then(function () {
      state.stage = "instructions"; save(); route();
    }).catch(function (e) {
      showError("about-error", saveErrorText(e));
    }).then(function () { busy(f, false); });
  });

  $("btn-exit").addEventListener("click", function () {
    // Nothing is deleted or changed: answers already saved stay saved, and
    // the stored order and position let the rater resume on this device.
    if (state && state.sessionId) $("exit-code").textContent = completionCode(state.sessionId);
    show("exit");
  });
  $("btn-resume").addEventListener("click", function () { route(); });
  $("btn-defs").addEventListener("click", openDrawer);
  $("btn-defs-close").addEventListener("click", closeDrawer);
  $("defs-drawer").addEventListener("click", function (ev) { if (ev.target === ev.currentTarget) closeDrawer(); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") closeDrawer(); });

  $("btn-begin").addEventListener("click", function () {
    state.stage = "items"; save(); route();
  });

  $("form-item").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = ev.target, r = formValues(f);
    if (!r.system_exposure || !r.human_impact || !r.action || !r.confidence) {
      return showError("item-error", "Answer all four questions to continue.");
    }
    showError("item-error", "");
    var pos = state.next;
    busy(f, true);
    insert("responses", {
      session_id: state.sessionId, position: pos,
      scenario: state.order[pos - 1], showing: ORDER.showingAt(state.order, pos),
      system_exposure: r.system_exposure, human_impact: r.human_impact,
      action: r.action, confidence: parseInt(r.confidence, 10)
    }).then(function () {
      state.next = pos + 1;
      if (state.next > ORDER.N_ITEMS) state.stage = "done";
      save(); route();
    }).catch(function (e) {
      showError("item-error", saveErrorText(e));
    }).then(function () { busy(f, false); });
  });

  // ------------------------------------------------------------- start
  function start() {
    fillConfigText();
    var missing = missingSettings();
    if (missing.length) {
      var ul = $("setup-missing");
      missing.forEach(function (m) { ul.appendChild(el("li", null, m)); });
      return show("setup");
    }
    placeDefinitions();
    Promise.all([
      fetch("survey_scenarios.json", { cache: "no-store" }).then(function (r) { return r.json(); }),
      fetch("labels.json", { cache: "no-store" }).then(function (r) { return r.json(); })
    ]).then(function (res) {
      scenarios = {};
      res[0].scenarios.forEach(function (s) { scenarios[s.scenario] = s; });
      labels = res[1];
      state = load();
      if (state && (state.v !== C.SURVEY_VERSION || !ORDER.isValidOrder(state.order))) state = null;
      route();
    }).catch(function () {
      $("screen-loading").textContent = "The survey could not load. Check your connection and reload the page.";
    });
  }

  start();
})();
