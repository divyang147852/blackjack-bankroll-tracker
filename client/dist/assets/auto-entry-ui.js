(function () {
  "use strict";

  var PANEL_ID = "bbt-auto-entry-panel";

  function getToken() {
    return localStorage.getItem("bbt_token");
  }

  function authHeaders() {
    var token = getToken();
    return {
      "Content-Type": "application/json",
      Authorization: token ? "Bearer " + token : ""
    };
  }

  function requestAutoEntry() {
    return fetch("/api/sessions/auto", {
      method: "POST",
      headers: authHeaders()
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (body) {
          if (!res.ok) {
            var error = new Error(body.message || "Auto entry failed");
            error.status = res.status;
            throw error;
          }

          return body;
        });
    });
  }

  function requestNextDayEntry() {
    return fetch("/api/sessions/auto-next", {
      method: "POST",
      headers: authHeaders()
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (body) {
          if (!res.ok) {
            var error = new Error(body.message || "Next day entry failed");
            error.status = res.status;
            throw error;
          }

          return body;
        });
    });
  }

  function mountAutoEntryPanel(host) {
    if (!host || document.getElementById(PANEL_ID)) {
      return;
    }

    var panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.style.marginTop = "1rem";
    panel.style.padding = "0.9rem";
    panel.style.border = "1px solid rgba(16,185,129,.35)";
    panel.style.borderRadius = "0.75rem";
    panel.style.background = "rgba(16,185,129,.1)";

    var title = document.createElement("p");
    title.textContent = "Quick Auto Entry";
    title.style.margin = "0";
    title.style.fontWeight = "600";
    title.style.color = "#a7f3d0";

    var hint = document.createElement("p");
    hint.textContent = "One click creates today or next day session with zero P/L using your latest balance.";
    hint.style.margin = "0.4rem 0 0.6rem 0";
    hint.style.fontSize = "0.82rem";
    hint.style.color = "#d1fae5";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Create Today's Auto Entry";
    btn.style.padding = "0.55rem 0.9rem";
    btn.style.border = "none";
    btn.style.borderRadius = "0.65rem";
    btn.style.background = "#10b981";
    btn.style.color = "#052e16";
    btn.style.fontWeight = "700";
    btn.style.cursor = "pointer";

    var nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.textContent = "Create Next Day Entry";
    nextBtn.style.padding = "0.55rem 0.9rem";
    nextBtn.style.border = "none";
    nextBtn.style.borderRadius = "0.65rem";
    nextBtn.style.background = "#38bdf8";
    nextBtn.style.color = "#082f49";
    nextBtn.style.fontWeight = "700";
    nextBtn.style.cursor = "pointer";
    nextBtn.style.marginLeft = "0.45rem";

    var status = document.createElement("p");
    status.style.margin = "0.55rem 0 0 0";
    status.style.fontSize = "0.82rem";
    status.style.color = "#d1fae5";

    btn.addEventListener("click", function () {
      btn.disabled = true;
      nextBtn.disabled = true;
      status.textContent = "Creating auto entry...";

      requestAutoEntry()
        .then(function () {
          status.textContent = "Auto entry created for today.";
          window.location.reload();
        })
        .catch(function (err) {
          status.textContent = err.message || "Failed to create auto entry.";
          btn.disabled = false;
          nextBtn.disabled = false;
        });
    });

    nextBtn.addEventListener("click", function () {
      btn.disabled = true;
      nextBtn.disabled = true;
      status.textContent = "Creating next day entry...";

      requestNextDayEntry()
        .then(function () {
          status.textContent = "Next day entry created.";
          window.location.reload();
        })
        .catch(function (err) {
          status.textContent = err.message || "Failed to create next day entry.";
          btn.disabled = false;
          nextBtn.disabled = false;
        });
    });

    panel.appendChild(title);
    panel.appendChild(hint);
    panel.appendChild(btn);
    panel.appendChild(nextBtn);
    panel.appendChild(status);

    host.appendChild(panel);
  }

  function tryMount() {
    if (!getToken()) {
      return;
    }

    var forms = document.querySelectorAll("form");
    for (var i = 0; i < forms.length; i += 1) {
      var text = (forms[i].textContent || "").toLowerCase();
      if (text.indexOf("start balance") !== -1 && text.indexOf("profit/loss") !== -1) {
        mountAutoEntryPanel(forms[i]);
        return;
      }
    }
  }

  var observer = new MutationObserver(function () {
    tryMount();
  });

  document.addEventListener("DOMContentLoaded", function () {
    tryMount();
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
