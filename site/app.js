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
    var inItems = name === "item";
    $("progress").hidden = !inItems;
    window.scrollTo(0, 0);
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

  function placeDefinitions() {
    var t = document.getElementById("definitions");
    $("definitions-home").appendChild(t.content.cloneNode(true));
    $("definitions-item").appendChild(t.content.cloneNode(true));
  }

  // --------------------------------------------------------- the record
  function label(field, value) {
    if (typeof value === "boolean") return labels.values["boolean"][String(value)];
    var map = labels.values[field];
    if (map && Object.prototype.hasOwnProperty.call(map, value)) return map[value];
    var unit = labels.units[field];
    return unit ? value + " " + unit : String(value);
  }

  function factList(title, rows) {
    var sec = el("section", "record-part");
    sec.appendChild(el("h2", null, title));
    var dl = el("dl");
    rows.forEach(function (r) {
      dl.appendChild(el("dt", null, labels.fields[r[0]]));
      var dd = el("dd", r[2] || null, r[1]);
      dl.appendChild(dd);
    });
    sec.appendChild(dl);
    return sec;
  }

  function renderRecord(s) {
    var o = s.organisation, a = s.asset, v = s.vulnerability;
    var box = $("record");
    box.textContent = "";

    box.appendChild(factList("The organisation", [
      ["organisation.sector", label("organisation.sector", o.sector)],
      ["organisation.employee_count", o.employee_count],
      ["organisation.regulatory", label("organisation.regulatory", o.regulatory)],
      ["organisation.security_posture", label("organisation.security_posture", o.security_posture)],
      ["organisation.network_segmentation", label("organisation.network_segmentation", o.network_segmentation)],
      ["organisation.remote_access", label("organisation.remote_access", o.remote_access)],
      ["organisation.unmanaged_endpoint_estimate", o.unmanaged_endpoint_estimate]
    ]));

    box.appendChild(factList("The asset", [
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

    box.appendChild(factList("Network position", [
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
      box.appendChild(factList("The vulnerable software", [
        ["software.vendor", label("software.vendor", sw.vendor)],
        ["software.product", label("software.product", sw.product)],
        ["software.version", label("software.version", sw.version)],
        ["software.component_role", label("software.component_role", sw.component_role)],
        ["software.support_status", label("software.support_status", sw.support_status)]
      ]));
    });

    var vrows = [
      ["vulnerability.cvss_base_score", v.cvss_base_score],
      ["vulnerability.cvss_vector", v.cvss_vector, "mono"]
    ];
    var vuln = factList("The vulnerability, as known at the time", vrows);
    if (v.cisa_assessment_published) {
      var dl = vuln.querySelector("dl");
      [["vulnerability.exploitation", v.exploitation],
       ["vulnerability.automatable", v.automatable],
       ["vulnerability.technical_impact", v.technical_impact]].forEach(function (r) {
        dl.appendChild(el("dt", null, "CISA: " + labels.fields[r[0]]));
        dl.appendChild(el("dd", null, label(r[0], r[1])));
      });
    } else {
      vuln.appendChild(el("p", "no-cisa", labels.no_cisa_record));
    }
    box.appendChild(vuln);
  }

  function renderItem() {
    var pos = state.next;
    var s = scenarios[state.order[pos - 1]];
    $("item-title").textContent = "Item " + pos + " of " + ORDER.N_ITEMS;
    $("progress-text").textContent = (pos - 1) + " of " + ORDER.N_ITEMS + " saved";
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
