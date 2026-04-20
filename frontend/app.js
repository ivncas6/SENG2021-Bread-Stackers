"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // frontend/app.ts
  var require_app = __commonJS({
    "frontend/app.ts"() {
      var storageKeys = {
        session: "breadstackers.session"
      };
      function getRequiredElement(id) {
        const element = document.getElementById(id);
        if (!element) {
          throw new Error(`Missing required element: ${id}`);
        }
        return element;
      }
      function getFormData(target) {
        if (!(target instanceof HTMLFormElement)) {
          throw new Error("Expected form submission from an HTMLFormElement.");
        }
        return new FormData(target);
      }
      function getErrorMessage(error) {
        if (error instanceof Error) {
          return error.message;
        }
        return "An unexpected error occurred.";
      }
      function isJsonRecord(value) {
        return typeof value === "object" && value !== null;
      }
      function getFormValue(form, key) {
        return String(form.get(key) ?? "");
      }
      var elements = {
        cancelOrderForm: getRequiredElement("cancelOrderForm"),
        clearSessionButton: getRequiredElement("clearSessionButton"),
        consoleOutput: getRequiredElement("consoleOutput"),
        createOrderForm: getRequiredElement("createOrderForm"),
        listOrdersButton: getRequiredElement("listOrdersButton"),
        loginForm: getRequiredElement("loginForm"),
        orderInfoForm: getRequiredElement("orderInfoForm"),
        orderInfoOutput: getRequiredElement("orderInfoOutput"),
        ordersList: getRequiredElement("ordersList"),
        registerForm: getRequiredElement("registerForm"),
        sessionStatus: getRequiredElement("sessionStatus"),
        updateOrderForm: getRequiredElement("updateOrderForm")
      };
      function getSession() {
        return localStorage.getItem(storageKeys.session) || "";
      }
      function setSession(session) {
        if (session) {
          localStorage.setItem(storageKeys.session, session);
        } else {
          localStorage.removeItem(storageKeys.session);
        }
        renderSession();
      }
      function renderSession() {
        const session = getSession();
        if (!session) {
          elements.sessionStatus.textContent = "No active session";
          return;
        }
        const preview = `${session.slice(0, 18)}...${session.slice(-10)}`;
        elements.sessionStatus.textContent = `Active session: ${preview}`;
      }
      function logResult(title, payload) {
        elements.consoleOutput.textContent = `${title}

${JSON.stringify(payload, null, 2)}`;
      }
      function buildProxyUrl(path) {
        const proxyUrl = new URL("/api/proxy", window.location.origin);
        proxyUrl.searchParams.set("path", path);
        return proxyUrl.toString();
      }
      async function apiRequest(path, options = {}) {
        const session = getSession();
        const headers = {
          "Content-Type": "application/json",
          ...options.useSession === false ? {} : session ? { session } : {},
          ...options.headers || {}
        };
        const response = await fetch(buildProxyUrl(path), {
          body: options.body ? JSON.stringify(options.body) : void 0,
          headers,
          method: options.method || "GET"
        });
        const rawText = await response.text();
        let payload;
        try {
          payload = rawText ? JSON.parse(rawText) : {};
        } catch {
          payload = { rawText };
        }
        if (!response.ok) {
          if (isJsonRecord(payload) && typeof payload.error === "string") {
            throw new Error(payload.error);
          }
          throw new Error(`Request failed with status ${response.status}`);
        }
        if (!isJsonRecord(payload)) {
          return { rawText: rawText || String(payload) };
        }
        return payload;
      }
      function toEpochMillis(value) {
        return new Date(value).getTime();
      }
      function renderOrders(orders) {
        if (!orders || orders.length === 0) {
          elements.ordersList.textContent = "No orders returned.";
          return;
        }
        const markup = orders.map((order) => `
    <article class="order-card">
      <h3>${order.orderId}</h3>
      <p>Status: ${order.status}</p>
      <p>Issued: ${order.issuedDate}</p>
      <p>Total: ${order.finalPrice} ${order.currency}</p>
    </article>
  `).join("");
        elements.ordersList.innerHTML = markup;
      }
      elements.clearSessionButton.addEventListener("click", () => {
        setSession("");
        logResult("Session cleared", {});
      });
      elements.registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = getFormData(event.currentTarget);
        try {
          const payload = await apiRequest("/v0/user/register", {
            body: {
              email: getFormValue(form, "email"),
              firstName: getFormValue(form, "firstName"),
              lastName: getFormValue(form, "lastName"),
              password: getFormValue(form, "password"),
              telephone: getFormValue(form, "telephone")
            },
            method: "POST",
            useSession: false
          });
          if (payload.session) {
            setSession(payload.session);
          }
          logResult("Register succeeded", payload);
        } catch (error) {
          logResult("Register failed", { error: getErrorMessage(error) });
        }
      });
      elements.loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = getFormData(event.currentTarget);
        try {
          const payload = await apiRequest("/v0/user/login", {
            body: {
              email: getFormValue(form, "email"),
              password: getFormValue(form, "password")
            },
            method: "POST",
            useSession: false
          });
          if (payload.session) {
            setSession(payload.session);
          }
          logResult("Login succeeded", payload);
        } catch (error) {
          logResult("Login failed", { error: getErrorMessage(error) });
        }
      });
      elements.createOrderForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = getFormData(event.currentTarget);
        try {
          const payload = await apiRequest("/v0/order", {
            body: {
              currency: getFormValue(form, "currency"),
              deliveryAddress: getFormValue(form, "deliveryAddress"),
              items: [
                {
                  description: getFormValue(form, "itemDescription"),
                  name: getFormValue(form, "itemName"),
                  quantity: Number(getFormValue(form, "itemQuantity")),
                  unitPrice: Number(getFormValue(form, "itemUnitPrice"))
                }
              ],
              reqDeliveryPeriod: {
                endDateTime: toEpochMillis(getFormValue(form, "endDateTime")),
                startDateTime: toEpochMillis(getFormValue(form, "startDateTime"))
              },
              user: {
                email: getFormValue(form, "userEmail"),
                firstName: getFormValue(form, "userFirstName"),
                lastName: getFormValue(form, "userLastName"),
                telephone: getFormValue(form, "userTelephone")
              }
            },
            method: "POST"
          });
          logResult("Create order succeeded", payload);
        } catch (error) {
          logResult("Create order failed", { error: getErrorMessage(error) });
        }
      });
      elements.listOrdersButton.addEventListener("click", async () => {
        try {
          const payload = await apiRequest("/v0/order/list");
          renderOrders(payload.orders);
          logResult("List orders succeeded", payload);
        } catch (error) {
          renderOrders([]);
          logResult("List orders failed", { error: getErrorMessage(error) });
        }
      });
      elements.orderInfoForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = getFormData(event.currentTarget);
        const orderId = getFormValue(form, "orderId");
        try {
          const payload = await apiRequest(`/v0/order/${orderId}`);
          elements.orderInfoOutput.textContent = JSON.stringify(payload, null, 2);
          logResult("Get order succeeded", payload);
        } catch (error) {
          elements.orderInfoOutput.textContent = "Failed to load order.";
          logResult("Get order failed", { error: getErrorMessage(error) });
        }
      });
      elements.updateOrderForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = getFormData(event.currentTarget);
        const orderId = getFormValue(form, "orderId");
        try {
          const payload = await apiRequest(`/v0/order/${orderId}`, {
            body: {
              deliveryAddress: getFormValue(form, "deliveryAddress"),
              reqDeliveryPeriod: {
                endDateTime: toEpochMillis(getFormValue(form, "endDateTime")),
                startDateTime: toEpochMillis(getFormValue(form, "startDateTime"))
              },
              status: getFormValue(form, "status")
            },
            method: "PUT"
          });
          logResult("Update order succeeded", payload);
        } catch (error) {
          logResult("Update order failed", { error: getErrorMessage(error) });
        }
      });
      elements.cancelOrderForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = getFormData(event.currentTarget);
        const orderId = getFormValue(form, "orderId");
        try {
          const payload = await apiRequest(`/v0/order/${orderId}`, {
            body: {
              reason: getFormValue(form, "reason")
            },
            method: "DELETE"
          });
          logResult("Cancel order succeeded", payload);
        } catch (error) {
          logResult("Cancel order failed", { error: getErrorMessage(error) });
        }
      });
      renderSession();
    }
  });
  require_app();
})();
