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
        profile: "breadstackers.profile",
        session: "breadstackers.session"
      };
      var feedbackDurationMs = 3200;
      var gstRate = 0.1;
      var feedbackTimeoutId;
      var nextOrderItemId = 1;
      var createOrderItems = [];
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
      function getFormValue(form, key) {
        return String(form.get(key) ?? "").trim();
      }
      function getErrorMessage(error) {
        if (error instanceof Error) {
          return error.message;
        }
        return "Something went wrong. Please try again.";
      }
      function isJsonRecord(value) {
        return typeof value === "object" && value !== null;
      }
      function titleCase(value) {
        if (!value) {
          return "there";
        }
        return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
      }
      function escapeHtml(value) {
        return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      }
      function parseNumber(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      function getSession() {
        return localStorage.getItem(storageKeys.session) || "";
      }
      function setSession(session) {
        if (session) {
          localStorage.setItem(storageKeys.session, session);
        } else {
          localStorage.removeItem(storageKeys.session);
        }
      }
      function getStoredProfile() {
        const rawProfile = localStorage.getItem(storageKeys.profile);
        if (!rawProfile) {
          return null;
        }
        try {
          const parsed = JSON.parse(rawProfile);
          if (!parsed.email) {
            return null;
          }
          return parsed;
        } catch {
          return null;
        }
      }
      function setStoredProfile(profile) {
        localStorage.setItem(storageKeys.profile, JSON.stringify(profile));
      }
      function clearAuthState() {
        localStorage.removeItem(storageKeys.session);
        localStorage.removeItem(storageKeys.profile);
      }
      function getDisplayName() {
        const profile = getStoredProfile();
        if (profile?.firstName) {
          return titleCase(profile.firstName);
        }
        if (profile?.email) {
          return titleCase(profile.email.split("@")[0] || "there");
        }
        return "there";
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
      function showFeedback(message) {
        elements.feedbackBanner.textContent = message;
        elements.feedbackBanner.classList.remove("hidden");
        if (feedbackTimeoutId) {
          window.clearTimeout(feedbackTimeoutId);
        }
        feedbackTimeoutId = window.setTimeout(() => {
          elements.feedbackBanner.classList.add("hidden");
        }, feedbackDurationMs);
      }
      function formatCurrency(currency, amount) {
        const numericAmount = typeof amount === "number" ? amount : Number(amount);
        if (Number.isNaN(numericAmount)) {
          return `${currency} ${amount}`;
        }
        return new Intl.NumberFormat("en-AU", {
          currency,
          minimumFractionDigits: 2,
          style: "currency"
        }).format(numericAmount);
      }
      function formatDisplayDate(value) {
        const parsedDate = new Date(value);
        if (Number.isNaN(parsedDate.getTime())) {
          return value;
        }
        return parsedDate.toLocaleDateString("en-AU", {
          day: "numeric",
          month: "numeric",
          year: "numeric"
        });
      }
      function formatDetailDate(epochMillis) {
        if (!epochMillis) {
          return "N/A";
        }
        const parsedDate = new Date(epochMillis);
        if (Number.isNaN(parsedDate.getTime())) {
          return String(epochMillis);
        }
        return parsedDate.toLocaleString("en-AU");
      }
      function getStatusClass(status) {
        const normalised = status.trim().toLowerCase();
        if (normalised === "cancelled") {
          return "status-cancelled";
        }
        if (normalised === "delivered" || normalised === "complete") {
          return "status-delivered";
        }
        if (normalised === "pending") {
          return "status-pending";
        }
        if (normalised === "processing") {
          return "status-processing";
        }
        return "status-open";
      }
      function setOrdersLoadingState(isLoading) {
        elements.ordersLoadingState.classList.toggle("hidden", !isLoading);
        elements.ordersList.classList.toggle("hidden", isLoading);
        elements.ordersEmptyState.classList.add("hidden");
      }
      function updateNavigationState(activeView) {
        document.querySelectorAll("[data-nav-target]").forEach((button) => {
          const target = button.dataset.navTarget;
          button.classList.toggle("is-active", target === activeView && getSession().length > 0);
        });
      }
      function updateAuthChrome() {
        const authenticated = Boolean(getSession());
        elements.publicNav.classList.toggle("hidden", authenticated);
        elements.privateNav.classList.toggle("hidden", !authenticated);
        elements.welcomeName.textContent = getDisplayName();
      }
      function renderOrders(orders) {
        if (!orders || orders.length === 0) {
          elements.ordersList.innerHTML = "";
          elements.ordersEmptyState.classList.remove("hidden");
          elements.ordersList.classList.add("hidden");
          return;
        }
        elements.ordersEmptyState.classList.add("hidden");
        elements.ordersList.classList.remove("hidden");
        elements.ordersList.innerHTML = orders.map((order) => `
    <article class="order-row">
      <div class="order-id">${escapeHtml(order.orderId)}</div>
      <div>
        <span class="status-pill ${getStatusClass(order.status)}">${escapeHtml(order.status)}</span>
      </div>
      <div>${escapeHtml(formatDisplayDate(order.issuedDate))}</div>
      <div class="price-cell">${escapeHtml(formatCurrency(order.currency, order.finalPrice))}</div>
      <button class="view-order-button" type="button" data-order-id="${escapeHtml(order.orderId)}">
        <span aria-hidden="true">\u25C9</span>
        View
      </button>
    </article>
  `).join("");
      }
      function formatOrderDetail(detail) {
        const items = detail.items?.map((item, index) => {
          const quantity = item.quantity ?? 0;
          const unitPrice = item.unitPrice ?? 0;
          const lineTotal = quantity * unitPrice;
          return [
            `Item ${index + 1}`,
            `  Name: ${item.name || "Unnamed item"}`,
            `  Description: ${item.description || "No description"}`,
            `  Quantity: ${quantity}`,
            `  Unit Price: ${formatCurrency(detail.currency || "AUD", unitPrice)}`,
            `  Line Total: ${formatCurrency(detail.currency || "AUD", lineTotal)}`
          ].join("\n");
        }).join("\n\n");
        return [
          `Order ID: ${detail.orderId || "N/A"}`,
          `Status: ${detail.status || "N/A"}`,
          `Issued Date: ${detail.issuedDate || "N/A"}`,
          `Final Price: ${formatCurrency(detail.currency || "AUD", detail.finalPrice || 0)}`,
          "",
          "Delivery",
          `  Address: ${detail.address || "N/A"}`,
          `  Start: ${formatDetailDate(detail.deliveryDetails?.startDateTime)}`,
          `  End: ${formatDetailDate(detail.deliveryDetails?.endDateTime)}`,
          "",
          "Items",
          items || "  No item lines available."
        ].join("\n");
      }
      async function loadOrderDetail(orderId) {
        try {
          const payload = await apiRequest(`/v0/order/${orderId}`);
          elements.detailOrderHeading.textContent = orderId;
          elements.orderInfoOutput.textContent = formatOrderDetail(payload);
          elements.orderDetailPanel.classList.remove("hidden");
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      }
      async function loadOrders() {
        setOrdersLoadingState(true);
        try {
          const payload = await apiRequest("/v0/order/list");
          renderOrders(payload.orders);
        } catch (error) {
          elements.ordersList.innerHTML = "";
          elements.ordersEmptyState.classList.remove("hidden");
          elements.ordersEmptyState.innerHTML = `
      <h3>Unable to load orders</h3>
      <p>${escapeHtml(getErrorMessage(error))}</p>
    `;
        } finally {
          elements.ordersLoadingState.classList.add("hidden");
        }
      }
      function buildProfileFromForm(form) {
        return {
          email: getFormValue(form, "email"),
          firstName: getFormValue(form, "firstName"),
          lastName: getFormValue(form, "lastName"),
          telephone: getFormValue(form, "telephone")
        };
      }
      function buildProfileFromEmail(email) {
        const inferredName = titleCase(email.split("@")[0] || "Customer");
        return {
          email,
          firstName: inferredName,
          lastName: "",
          telephone: ""
        };
      }
      function getDefaultOrderItem() {
        const item = {
          description: "",
          id: nextOrderItemId,
          name: "",
          quantity: 1,
          unitPrice: 0
        };
        nextOrderItemId += 1;
        return item;
      }
      function ensureOrderItems() {
        if (createOrderItems.length === 0) {
          createOrderItems = [getDefaultOrderItem()];
        }
      }
      function syncCreateOrderItemsFromDom() {
        const itemNodes = elements.createOrderItems.querySelectorAll(".order-item-card");
        if (itemNodes.length === 0) {
          ensureOrderItems();
          return;
        }
        createOrderItems = Array.from(itemNodes).map((node) => {
          const itemId = Number(node.dataset.itemId);
          const nameInput = node.querySelector('[data-field="name"]');
          const descriptionInput = node.querySelector('[data-field="description"]');
          const unitPriceInput = node.querySelector('[data-field="unitPrice"]');
          const quantityInput = node.querySelector('[data-field="quantity"]');
          return {
            description: descriptionInput?.value.trim() || "",
            id: itemId,
            name: nameInput?.value.trim() || "",
            quantity: Math.max(1, Math.floor(parseNumber(quantityInput?.value || "1"))),
            unitPrice: Math.max(0, parseNumber(unitPriceInput?.value || "0"))
          };
        });
      }
      function calculateOrderTotals() {
        const subtotal = createOrderItems.reduce(
          (sum, item) => sum + item.unitPrice * item.quantity,
          0
        );
        const tax = subtotal * gstRate;
        const total = subtotal + tax;
        return { subtotal, tax, total };
      }
      function renderCreateOrderItems() {
        ensureOrderItems();
        elements.createOrderItems.innerHTML = createOrderItems.map((item, index) => `
    <article class="order-item-card" data-item-id="${item.id}">
      <div class="order-item-header">
        <div class="order-item-title">
          <strong>Item ${index + 1}</strong>
          <span>Describe the product and pricing for this line.</span>
        </div>
        <button
          class="remove-item-button"
          type="button"
          data-remove-item-id="${item.id}"
          ${createOrderItems.length === 1 ? "disabled" : ""}
        >
          Remove
        </button>
      </div>

      <div class="form-row">
        <div>
          <label>Item Name</label>
          <input
            type="text"
            data-field="name"
            value="${escapeHtml(item.name)}"
            placeholder="Sourdough Loaf"
            required
          >
        </div>
        <div>
          <label>Description</label>
          <input
            type="text"
            data-field="description"
            value="${escapeHtml(item.description)}"
            placeholder="Large loaf, sliced"
            required
          >
        </div>
      </div>

      <div class="form-row">
        <div>
          <label>Unit Price</label>
          <input
            type="number"
            data-field="unitPrice"
            value="${item.unitPrice || 0}"
            min="0"
            step="0.01"
            required
          >
        </div>
        <div>
          <label>Quantity</label>
          <input
            type="number"
            data-field="quantity"
            value="${item.quantity}"
            min="1"
            step="1"
            required
          >
        </div>
      </div>
    </article>
  `).join("");
      }
      function updateCreateOrderSummary() {
        syncCreateOrderItemsFromDom();
        const currency = elements.createOrderCurrency.value || "AUD";
        const meaningfulItems = createOrderItems.filter(
          (item) => item.name || item.description || item.unitPrice > 0 || item.quantity > 0
        );
        const totals = calculateOrderTotals();
        elements.createOrderSummaryLines.innerHTML = meaningfulItems.length > 0 ? meaningfulItems.map((item, index) => `
        <div class="summary-line">
          <span>${escapeHtml(item.name || `Item ${index + 1}`)} x${item.quantity}</span>
          <strong>${escapeHtml(formatCurrency(currency, item.unitPrice * item.quantity))}</strong>
        </div>
      `).join("") : '<p class="summary-empty">Add your first item to see the order breakdown.</p>';
        elements.summarySubtotal.textContent = formatCurrency(currency, totals.subtotal);
        elements.summaryTax.textContent = formatCurrency(currency, totals.tax);
        elements.summaryTotal.textContent = formatCurrency(currency, totals.total);
      }
      function populateBuyerFields() {
        const profile = getStoredProfile();
        elements.buyerFirstName.value = profile?.firstName || "";
        elements.buyerLastName.value = profile?.lastName || "";
        elements.buyerEmail.value = profile?.email || "";
        elements.buyerTelephone.value = profile?.telephone || "";
      }
      function resetCreateOrderForm() {
        elements.createOrderForm.reset();
        populateBuyerFields();
        elements.createOrderCurrency.value = "AUD";
        createOrderItems = [getDefaultOrderItem()];
        renderCreateOrderItems();
        updateCreateOrderSummary();
      }
      function buildDeliveryTimestamp(value) {
        const timestamp = new Date(value).getTime();
        if (Number.isNaN(timestamp)) {
          throw new Error("Please provide a valid delivery date and time.");
        }
        return timestamp;
      }
      function buildCreateOrderPayload(form) {
        syncCreateOrderItemsFromDom();
        const items = createOrderItems.map((item) => ({
          description: item.description.trim(),
          name: item.name.trim(),
          quantity: Math.max(1, Math.floor(item.quantity)),
          unitPrice: Math.max(0, item.unitPrice)
        }));
        if (items.length === 0) {
          throw new Error("Add at least one item before creating the order.");
        }
        if (items.some((item) => !item.name || !item.description)) {
          throw new Error("Each item needs both a name and a description.");
        }
        if (items.some((item) => item.unitPrice <= 0 || item.quantity <= 0)) {
          throw new Error("Each item must have a positive price and quantity.");
        }
        const deliveryStart = buildDeliveryTimestamp(getFormValue(form, "deliveryStart"));
        const deliveryEnd = buildDeliveryTimestamp(getFormValue(form, "deliveryEnd"));
        if (deliveryEnd <= deliveryStart) {
          throw new Error("Delivery end must be later than the delivery start.");
        }
        return {
          currency: getFormValue(form, "currency") || "AUD",
          deliveryAddress: getFormValue(form, "deliveryAddress"),
          items,
          reqDeliveryPeriod: {
            endDateTime: deliveryEnd,
            startDateTime: deliveryStart
          },
          user: {
            email: getFormValue(form, "buyerEmail"),
            firstName: getFormValue(form, "buyerFirstName"),
            lastName: getFormValue(form, "buyerLastName"),
            telephone: getFormValue(form, "buyerTelephone")
          }
        };
      }
      async function showView(viewName) {
        const authenticated = Boolean(getSession());
        const requiresAuth = viewName === "dashboard" || viewName === "createOrder";
        const nextView = !authenticated && requiresAuth ? "login" : viewName;
        Object.entries(viewElements).forEach(([name, element]) => {
          element.classList.toggle("hidden", name !== nextView);
          element.classList.toggle("is-active", name === nextView);
        });
        updateAuthChrome();
        updateNavigationState(nextView);
        if (nextView !== "dashboard") {
          elements.orderDetailPanel.classList.add("hidden");
        }
        if (nextView === "dashboard" && authenticated) {
          await loadOrders();
        }
        if (nextView === "createOrder" && authenticated) {
          resetCreateOrderForm();
        }
      }
      var elements = {
        addOrderItemButton: getRequiredElement("addOrderItemButton"),
        buyerEmail: getRequiredElement("buyerEmail"),
        buyerFirstName: getRequiredElement("buyerFirstName"),
        buyerLastName: getRequiredElement("buyerLastName"),
        buyerTelephone: getRequiredElement("buyerTelephone"),
        closeOrderDetailButton: getRequiredElement("closeOrderDetailButton"),
        createOrderBackButton: getRequiredElement("createOrderBackButton"),
        createOrderCancelButton: getRequiredElement("createOrderCancelButton"),
        createOrderCurrency: getRequiredElement("createOrderCurrency"),
        createOrderForm: getRequiredElement("createOrderForm"),
        createOrderItems: getRequiredElement("createOrderItems"),
        createOrderNavButton: getRequiredElement("createOrderNavButton"),
        dashboardCreateOrderButton: getRequiredElement("dashboardCreateOrderButton"),
        detailOrderHeading: getRequiredElement("detailOrderHeading"),
        feedbackBanner: getRequiredElement("feedbackBanner"),
        loginForm: getRequiredElement("loginForm"),
        logoutButton: getRequiredElement("logoutButton"),
        orderDetailPanel: getRequiredElement("orderDetailPanel"),
        orderInfoOutput: getRequiredElement("orderInfoOutput"),
        ordersEmptyState: getRequiredElement("ordersEmptyState"),
        ordersList: getRequiredElement("ordersList"),
        ordersLoadingState: getRequiredElement("ordersLoadingState"),
        privateNav: getRequiredElement("privateNav"),
        publicNav: getRequiredElement("publicNav"),
        registerForm: getRequiredElement("registerForm"),
        summarySubtotal: getRequiredElement("summarySubtotal"),
        summaryTax: getRequiredElement("summaryTax"),
        summaryTotal: getRequiredElement("summaryTotal"),
        createOrderSummaryLines: getRequiredElement("createOrderSummaryLines"),
        welcomeName: getRequiredElement("welcomeName")
      };
      var viewElements = {
        createOrder: getRequiredElement("createOrderView"),
        dashboard: getRequiredElement("dashboardView"),
        landing: getRequiredElement("landingView"),
        login: getRequiredElement("loginView"),
        register: getRequiredElement("registerView")
      };
      elements.registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = getFormData(event.currentTarget);
        const profile = buildProfileFromForm(form);
        try {
          const payload = await apiRequest("/v0/user/register", {
            body: {
              email: profile.email,
              firstName: profile.firstName,
              lastName: profile.lastName,
              password: getFormValue(form, "password"),
              telephone: profile.telephone || ""
            },
            method: "POST",
            useSession: false
          });
          if (!payload.session) {
            throw new Error("Registration succeeded, but no session was returned.");
          }
          setSession(payload.session);
          setStoredProfile(profile);
          showFeedback("Account created successfully.");
          await showView("dashboard");
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      });
      elements.loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = getFormData(event.currentTarget);
        const email = getFormValue(form, "email");
        try {
          const payload = await apiRequest("/v0/user/login", {
            body: {
              email,
              password: getFormValue(form, "password")
            },
            method: "POST",
            useSession: false
          });
          if (!payload.session) {
            throw new Error("Login succeeded, but no session was returned.");
          }
          setSession(payload.session);
          setStoredProfile(getStoredProfile() ?? buildProfileFromEmail(email));
          showFeedback("Signed in successfully.");
          await showView("dashboard");
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      });
      elements.createOrderForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = getFormData(event.currentTarget);
        try {
          const payload = buildCreateOrderPayload(form);
          const response = await apiRequest("/v0/order", {
            body: payload,
            method: "POST"
          });
          if (!response.orderId) {
            throw new Error("Order created, but no order ID was returned.");
          }
          setStoredProfile({
            email: getFormValue(form, "buyerEmail"),
            firstName: getFormValue(form, "buyerFirstName"),
            lastName: getFormValue(form, "buyerLastName"),
            telephone: getFormValue(form, "buyerTelephone")
          });
          showFeedback(`Order ${response.orderId} created successfully.`);
          await showView("dashboard");
          await loadOrderDetail(response.orderId);
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      });
      elements.logoutButton.addEventListener("click", async () => {
        try {
          await apiRequest("/v0/user/logout", {
            method: "POST"
          });
        } catch {
        } finally {
          clearAuthState();
          elements.ordersList.innerHTML = "";
          elements.orderDetailPanel.classList.add("hidden");
          showFeedback("You have been logged out.");
          await showView("landing");
        }
      });
      elements.addOrderItemButton.addEventListener("click", () => {
        syncCreateOrderItemsFromDom();
        createOrderItems = [...createOrderItems, getDefaultOrderItem()];
        renderCreateOrderItems();
        updateCreateOrderSummary();
      });
      elements.createOrderCurrency.addEventListener("change", () => {
        updateCreateOrderSummary();
      });
      elements.createOrderItems.addEventListener("input", () => {
        updateCreateOrderSummary();
      });
      elements.closeOrderDetailButton.addEventListener("click", () => {
        elements.orderDetailPanel.classList.add("hidden");
      });
      document.addEventListener("click", async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const removeItemButton = target.closest("[data-remove-item-id]");
        if (removeItemButton?.dataset.removeItemId) {
          const itemId = Number(removeItemButton.dataset.removeItemId);
          syncCreateOrderItemsFromDom();
          createOrderItems = createOrderItems.filter((item) => item.id !== itemId);
          ensureOrderItems();
          renderCreateOrderItems();
          updateCreateOrderSummary();
          return;
        }
        const navButton = target.closest("[data-nav-target]");
        if (navButton?.dataset.navTarget) {
          const nextView = navButton.dataset.navTarget;
          await showView(nextView);
          return;
        }
        const orderButton = target.closest("[data-order-id]");
        if (orderButton?.dataset.orderId) {
          await loadOrderDetail(orderButton.dataset.orderId);
        }
      });
      if (getSession()) {
        void showView("dashboard");
      } else {
        void showView("landing");
      }
    }
  });
  require_app();
})();
