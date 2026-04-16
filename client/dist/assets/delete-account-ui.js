(function () {
  "use strict";

  var PANEL_ID = "bbt-delete-account-panel";
  var styleText =
    "margin-top:1.5rem;padding:1rem;border-radius:0.75rem;border:1px solid rgba(248,113,113,.45);" +
    "background:rgba(127,29,29,.18);color:#fecaca";

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

  function api(path, options) {
    var opts = options || {};
    return fetch("/api" + path, opts).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (body) {
          if (!res.ok) {
            var err = new Error(body.message || "Request failed");
            err.status = res.status;
            throw err;
          }

          return body;
        });
    });
  }

  function createField(label, input) {
    var wrapper = document.createElement("label");
    wrapper.style.display = "block";
    wrapper.style.fontSize = "0.875rem";
    wrapper.style.marginTop = "0.75rem";

    var text = document.createElement("div");
    text.textContent = label;
    text.style.marginBottom = "0.25rem";

    wrapper.appendChild(text);
    wrapper.appendChild(input);
    return wrapper;
  }

  function createInput(type, placeholder) {
    var input = document.createElement("input");
    input.type = type;
    input.placeholder = placeholder;
    input.style.width = "100%";
    input.style.padding = "0.55rem 0.7rem";
    input.style.borderRadius = "0.6rem";
    input.style.border = "1px solid rgba(255,255,255,0.2)";
    input.style.background = "rgba(15,23,42,0.75)";
    input.style.color = "#fff";
    return input;
  }

  function createButton(text, background) {
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.style.padding = "0.55rem 0.9rem";
    button.style.borderRadius = "0.65rem";
    button.style.border = "none";
    button.style.marginTop = "0.75rem";
    button.style.marginRight = "0.5rem";
    button.style.fontWeight = "600";
    button.style.cursor = "pointer";
    button.style.background = background;
    button.style.color = "#fff";
    return button;
  }

  function logoutAndReset() {
    localStorage.removeItem("bbt_token");
    window.location.href = "/";
  }

  function mountPanel(form) {
    if (!form || document.getElementById(PANEL_ID)) {
      return;
    }

    var panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.style.cssText = styleText;

    var title = document.createElement("h3");
    title.textContent = "Delete Account";
    title.style.margin = "0 0 0.4rem 0";
    title.style.fontSize = "1.05rem";

    var warning = document.createElement("p");
    warning.textContent = "This permanently removes your account, sessions, and settings.";
    warning.style.margin = "0 0 0.25rem 0";
    warning.style.fontSize = "0.875rem";

    var note = document.createElement("p");
    note.textContent = "Security requires password + one-time OTP before deletion.";
    note.style.margin = "0 0 0.6rem 0";
    note.style.fontSize = "0.8rem";

    var password = createInput("password", "Enter current password");
    var otp = createInput("text", "Enter 6-digit OTP");
    otp.maxLength = 6;
    otp.inputMode = "numeric";

    var status = document.createElement("p");
    status.style.marginTop = "0.7rem";
    status.style.fontSize = "0.82rem";
    status.style.color = "#fde68a";

    var requestOtpBtn = createButton("Request OTP", "#2563eb");
    var deleteBtn = createButton("Delete Account", "#dc2626");

    requestOtpBtn.addEventListener("click", function () {
      var pass = password.value.trim();
      if (!pass) {
        status.textContent = "Enter password first.";
        return;
      }

      requestOtpBtn.disabled = true;
      status.textContent = "Generating OTP...";

      api("/auth/delete/request-otp", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ password: pass })
      })
        .then(function (data) {
          status.textContent =
            "OTP: " +
            String(data.otp || "") +
            " (expires in " +
            String(data.expiresInSeconds || 600) +
            " seconds).";
        })
        .catch(function (err) {
          status.textContent = err.message || "Unable to request OTP.";
        })
        .finally(function () {
          requestOtpBtn.disabled = false;
        });
    });

    deleteBtn.addEventListener("click", function () {
      var pass = password.value.trim();
      var otpCode = otp.value.trim();
      if (!pass || !/^\d{6}$/.test(otpCode)) {
        status.textContent = "Enter password and a valid 6-digit OTP.";
        return;
      }

      if (!window.confirm("Are you sure? This action cannot be undone.")) {
        return;
      }

      deleteBtn.disabled = true;
      status.textContent = "Deleting account...";

      api("/auth/me", {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ password: pass, otp: otpCode })
      })
        .then(function () {
          status.textContent = "Account deleted. Redirecting...";
          logoutAndReset();
        })
        .catch(function (err) {
          status.textContent = err.message || "Unable to delete account.";
        })
        .finally(function () {
          deleteBtn.disabled = false;
        });
    });

    panel.appendChild(title);
    panel.appendChild(warning);
    panel.appendChild(note);
    panel.appendChild(createField("Password", password));
    panel.appendChild(createField("OTP", otp));
    panel.appendChild(requestOtpBtn);
    panel.appendChild(deleteBtn);
    panel.appendChild(status);

    form.appendChild(panel);
  }

  function maybeMount() {
    if (!getToken()) {
      return;
    }

    var forms = document.querySelectorAll("form");
    for (var i = 0; i < forms.length; i += 1) {
      var text = (forms[i].textContent || "").toLowerCase();
      if (text.indexOf("yearly target") !== -1 && text.indexOf("withdrawal") !== -1) {
        mountPanel(forms[i]);
        break;
      }
    }
  }

  var observer = new MutationObserver(function () {
    maybeMount();
  });

  document.addEventListener("DOMContentLoaded", function () {
    maybeMount();
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
