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
        activeOrgPrefix: "breadstackers.activeOrg",
        aiHistoryPrefix: "breadstackers.aiHistory",
        addressBookPrefix: "breadstackers.addressBook",
        orgsPrefix: "breadstackers.orgs",
        orgRolesPrefix: "breadstackers.orgRoles",
        workspaceModePrefix: "breadstackers.workspaceMode",
        profile: "breadstackers.profile",
        session: "breadstackers.session"
      };
      var feedbackDurationMs = 3200;
      var gstRate = 0.1;
      var defaultCurrency = "AUD";
      var publicViews = ["landing", "login", "register"];
      var organisationViews = ["organisation", "addresses", "members"];
      var buyingViews = [
        "marketplace",
        "dashboard",
        "orderDetail",
        "createOrder",
        "updateOrder"
      ];
      var sellerViews = [
        "sellerDashboard",
        "catalogue",
        "sellerOrders",
        "sellerOrderDetail"
      ];
      var orgRequiredViews = [
        "organisation",
        "addresses",
        "members",
        "marketplace",
        "sellerDashboard",
        "catalogue",
        "sellerOrders",
        "sellerOrderDetail",
        "dashboard",
        "orderDetail",
        "createOrder",
        "updateOrder"
      ];
      var feedbackTimeoutId;
      var nextOrderItemId = 1;
      var createOrderItems = [];
      var aiChatHistory = [];
      var aiChatPending = false;
      var aiStreamingReply = "";
      var aiTypingTimeoutId;
      var currentOrderDetail = null;
      var currentMembers = [];
      var currentOrgRole = null;
      var currentMarketplaceOrgs = [];
      var currentSellerCatalogue = [];
      var marketplaceSelectedSellerId = null;
      var marketplaceCartItems = [];
      var currentSellerOrderDetail = null;
      var currentWorkspaceMode = "buying";
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
      function wait(ms) {
        return new Promise((resolve) => {
          aiTypingTimeoutId = window.setTimeout(() => {
            aiTypingTimeoutId = void 0;
            resolve();
          }, ms);
        });
      }
      function parseNumber(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      function parseInteger(value) {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : Number.NaN;
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
      function getScopedStorageKey(base) {
        const email = getStoredProfile()?.email?.toLowerCase() || "guest";
        return `${base}.${email}`;
      }
      function getAiHistoryStorageKey(orgId) {
        return `${getScopedStorageKey(storageKeys.aiHistoryPrefix)}.${orgId}`;
      }
      function getKnownOrgs() {
        const raw = localStorage.getItem(getScopedStorageKey(storageKeys.orgsPrefix));
        if (!raw) {
          return [];
        }
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed.filter((org) => Number.isInteger(org.orgId)) : [];
        } catch {
          return [];
        }
      }
      function saveKnownOrgs(orgs) {
        localStorage.setItem(
          getScopedStorageKey(storageKeys.orgsPrefix),
          JSON.stringify(orgs)
        );
      }
      function getStoredOrgRoles() {
        const raw = localStorage.getItem(getScopedStorageKey(storageKeys.orgRolesPrefix));
        if (!raw) {
          return {};
        }
        try {
          const parsed = JSON.parse(raw);
          return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
          return {};
        }
      }
      function saveStoredOrgRoles(roles) {
        localStorage.setItem(
          getScopedStorageKey(storageKeys.orgRolesPrefix),
          JSON.stringify(roles)
        );
      }
      function rememberOrgRole(orgId, role) {
        const roles = getStoredOrgRoles();
        roles[String(orgId)] = role;
        saveStoredOrgRoles(roles);
      }
      function getStoredOrgRole(orgId) {
        if (!orgId) {
          return null;
        }
        const role = getStoredOrgRoles()[String(orgId)];
        return role === "OWNER" || role === "ADMIN" || role === "MEMBER" ? role : null;
      }
      function getStoredWorkspaceModes() {
        const raw = localStorage.getItem(getScopedStorageKey(storageKeys.workspaceModePrefix));
        if (!raw) {
          return {};
        }
        try {
          const parsed = JSON.parse(raw);
          return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
          return {};
        }
      }
      function saveStoredWorkspaceModes(modes) {
        localStorage.setItem(
          getScopedStorageKey(storageKeys.workspaceModePrefix),
          JSON.stringify(modes)
        );
      }
      function getStoredWorkspaceMode(orgId) {
        if (!orgId) {
          return "buying";
        }
        const mode = getStoredWorkspaceModes()[String(orgId)];
        return mode === "selling" ? "selling" : "buying";
      }
      function rememberWorkspaceMode(orgId, mode) {
        const modes = getStoredWorkspaceModes();
        modes[String(orgId)] = mode;
        saveStoredWorkspaceModes(modes);
      }
      function syncCurrentWorkspaceMode() {
        const activeOrgId = getActiveOrgId();
        currentWorkspaceMode = getStoredWorkspaceMode(activeOrgId);
        if (activeOrgId) {
          rememberWorkspaceMode(activeOrgId, currentWorkspaceMode);
        }
      }
      function rememberKnownOrg(org) {
        const existing = getKnownOrgs();
        const filtered = existing.filter((entry) => entry.orgId !== org.orgId);
        filtered.push(org);
        filtered.sort((left, right) => left.orgName.localeCompare(right.orgName));
        saveKnownOrgs(filtered);
      }
      function removeKnownOrg(orgId) {
        const next = getKnownOrgs().filter((org) => org.orgId !== orgId);
        saveKnownOrgs(next);
      }
      function getActiveOrgId() {
        const raw = localStorage.getItem(getScopedStorageKey(storageKeys.activeOrgPrefix));
        if (!raw) {
          return null;
        }
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : null;
      }
      function setActiveOrgId(orgId) {
        const key = getScopedStorageKey(storageKeys.activeOrgPrefix);
        if (orgId && Number.isInteger(orgId)) {
          localStorage.setItem(key, String(orgId));
        } else {
          localStorage.removeItem(key);
        }
      }
      function ensureActiveOrgSelection() {
        const activeOrgId = getActiveOrgId();
        const knownOrgs = getKnownOrgs();
        if (activeOrgId) {
          return activeOrgId;
        }
        if (knownOrgs.length > 0) {
          setActiveOrgId(knownOrgs[0].orgId);
          return knownOrgs[0].orgId;
        }
        return null;
      }
      function getActiveOrg() {
        const orgId = ensureActiveOrgSelection();
        if (!orgId) {
          return null;
        }
        const knownOrg = getKnownOrgs().find((org) => org.orgId === orgId);
        if (knownOrg) {
          return knownOrg;
        }
        return {
          orgId,
          orgName: `Organisation #${orgId}`
        };
      }
      function isSellerRole(role) {
        return role === "OWNER" || role === "ADMIN";
      }
      function getCurrentViewName() {
        const entry = Object.entries(viewElements).find(([, element]) => element.classList.contains("is-active"));
        return entry?.[0] || "landing";
      }
      function getKnownAddresses() {
        const raw = localStorage.getItem(getScopedStorageKey(storageKeys.addressBookPrefix));
        if (!raw) {
          return [];
        }
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed.filter((address) => Number.isInteger(address.addressID)) : [];
        } catch {
          return [];
        }
      }
      function saveKnownAddresses(addresses) {
        localStorage.setItem(
          getScopedStorageKey(storageKeys.addressBookPrefix),
          JSON.stringify(addresses)
        );
      }
      function rememberAddress(address) {
        const existing = getKnownAddresses().filter(
          (entry) => entry.addressID !== address.addressID
        );
        existing.push(address);
        existing.sort((left, right) => left.street.localeCompare(right.street));
        saveKnownAddresses(existing);
      }
      function mergeAddresses(addresses) {
        addresses.forEach((address) => rememberAddress(address));
      }
      function removeKnownAddress(addressId) {
        saveKnownAddresses(
          getKnownAddresses().filter((address) => address.addressID !== addressId)
        );
      }
      function normaliseAiChatHistory(value) {
        if (!Array.isArray(value)) {
          return [];
        }
        return value.flatMap((entry) => {
          if (!isJsonRecord(entry)) {
            return [];
          }
          const role = entry.role;
          const content = entry.content;
          if (role !== "assistant" && role !== "user" || typeof content !== "string" || content.trim().length === 0) {
            return [];
          }
          return [{ role, content }];
        });
      }
      function getStoredAiHistory(orgId) {
        const raw = localStorage.getItem(getAiHistoryStorageKey(orgId));
        if (!raw) {
          return [];
        }
        try {
          return normaliseAiChatHistory(JSON.parse(raw));
        } catch {
          return [];
        }
      }
      function saveAiHistory(orgId, messages) {
        localStorage.setItem(getAiHistoryStorageKey(orgId), JSON.stringify(messages));
      }
      function clearAiHistory(orgId) {
        localStorage.removeItem(getAiHistoryStorageKey(orgId));
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
      function setBannerMessage(element, message) {
        if (!message) {
          element.classList.add("hidden");
          element.textContent = "";
          return;
        }
        element.textContent = message;
        element.classList.remove("hidden");
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
      function formatDateTimeInput(epochMillis) {
        if (!epochMillis) {
          return "";
        }
        const date = new Date(epochMillis);
        if (Number.isNaN(date.getTime())) {
          return "";
        }
        const offsetMinutes = date.getTimezoneOffset();
        const localTime = new Date(date.getTime() - offsetMinutes * 6e4);
        return localTime.toISOString().slice(0, 16);
      }
      function buildEpochFromInput(value) {
        const timestamp = new Date(value).getTime();
        if (Number.isNaN(timestamp)) {
          throw new Error("Please provide a valid delivery date and time.");
        }
        return timestamp;
      }
      function normaliseAssistantText(value) {
        return value.replace(/\r\n/g, "\n").replace(/\*\*(.*?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/^(\s*)\d+\)\s+/gm, "$1- ").replace(/\n{3,}/g, "\n\n").trim();
      }
      function getMessageDisplayText(message) {
        return message.role === "assistant" ? normaliseAssistantText(message.content) : message.content;
      }
      function stopAiTypingAnimation() {
        if (aiTypingTimeoutId) {
          window.clearTimeout(aiTypingTimeoutId);
          aiTypingTimeoutId = void 0;
        }
      }
      function resetAiInputHeight() {
        elements.aiChatInput.style.height = "auto";
        elements.aiChatInput.style.overflowY = "hidden";
      }
      function resizeAiChatInput() {
        const maxHeight = 132;
        elements.aiChatInput.style.height = "auto";
        const nextHeight = Math.min(elements.aiChatInput.scrollHeight, maxHeight);
        elements.aiChatInput.style.height = `${nextHeight}px`;
        elements.aiChatInput.style.overflowY = elements.aiChatInput.scrollHeight > maxHeight ? "auto" : "hidden";
      }
      async function animateAssistantReply(fullReply) {
        const cleanedReply = normaliseAssistantText(fullReply);
        if (!cleanedReply) {
          aiStreamingReply = "";
          renderAiChatHistory();
          return;
        }
        stopAiTypingAnimation();
        aiStreamingReply = "";
        renderAiChatHistory();
        const replyChunks = cleanedReply.match(/\S+\s*/g) || [cleanedReply];
        for (const chunk of replyChunks) {
          aiStreamingReply += chunk;
          renderAiChatHistory();
          await wait(Math.min(70, Math.max(28, chunk.length * 3)));
        }
        aiStreamingReply = "";
        renderAiChatHistory();
      }
      function formatAddress(address) {
        const parts = [
          address.street,
          address.city || "",
          address.postcode || "",
          address.country || ""
        ].filter(Boolean);
        return parts.join(", ");
      }
      function getOrgLabel(org) {
        if (!org) {
          return "No organisation selected";
        }
        return `${org.orgName} (#${org.orgId})`;
      }
      function getStatusClass(status) {
        const normalised = status.trim().toLowerCase();
        if (normalised === "rejected") {
          return "status-cancelled";
        }
        if (normalised === "cancelled") {
          return "status-cancelled";
        }
        if (normalised === "accepted") {
          return "status-delivered";
        }
        if (normalised === "delivered" || normalised === "complete") {
          return "status-delivered";
        }
        if (normalised === "processing") {
          return "status-processing";
        }
        if (normalised === "pending") {
          return "status-pending";
        }
        return "status-open";
      }
      function syncCurrentOrgRole() {
        const activeOrgId = getActiveOrgId();
        const email = getStoredProfile()?.email?.toLowerCase();
        if (!activeOrgId || !email) {
          currentOrgRole = getStoredOrgRole(activeOrgId);
          return;
        }
        const matchingMember = currentMembers.find(
          (member) => member.email.toLowerCase() === email
        );
        currentOrgRole = matchingMember?.role || getStoredOrgRole(activeOrgId);
        if (matchingMember?.role) {
          rememberOrgRole(activeOrgId, matchingMember.role);
        }
      }
      function clearOrderDetailPanel() {
        currentOrderDetail = null;
        closeCancelOrderModal();
        elements.detailOrderHeading.textContent = "Order detail";
        elements.detailOrderMeta.textContent = "Review the purchase order, then download its UBL or update the order.";
        elements.orderInfoOutput.innerHTML = "";
        elements.downloadUblButton.disabled = true;
        elements.openUpdateOrderButton.disabled = true;
        elements.cancelOrderButton.disabled = true;
      }
      function clearSellerOrderDetailPanel() {
        currentSellerOrderDetail = null;
        elements.sellerDetailOrderHeading.textContent = "Order request";
        elements.sellerDetailOrderMeta.textContent = "Review the buyer request and decide whether to accept or reject it.";
        elements.sellerOrderInfoOutput.innerHTML = "";
        elements.acceptReceivedOrderButton.disabled = true;
        elements.rejectReceivedOrderButton.disabled = true;
      }
      function updateNavigationState(activeView) {
        document.querySelectorAll("[data-nav-target]").forEach((button) => {
          const target = button.dataset.navTarget;
          const groupedActive = (activeView === "orderDetail" || activeView === "updateOrder") && target === "dashboard" || activeView === "sellerOrderDetail" && target === "sellerOrders";
          button.classList.toggle(
            "is-active",
            (target === activeView || groupedActive) && getSession().length > 0
          );
        });
        elements.manageMenuToggle.classList.toggle(
          "is-active",
          organisationViews.includes(activeView) && getSession().length > 0
        );
      }
      function closeHeaderMenus() {
        document.querySelectorAll(".nav-menu, .account-menu").forEach((element) => {
          element.open = false;
        });
      }
      function openCancelOrderModal() {
        const orderId = currentOrderDetail?.orderId || "this order";
        elements.cancelOrderSubtitle.textContent = `Tell us why you want to cancel ${orderId} before confirming.`;
        elements.cancelOrderModal.classList.remove("hidden");
        elements.cancelOrderReason.focus();
      }
      function closeCancelOrderModal() {
        elements.cancelOrderModal.classList.add("hidden");
        elements.cancelOrderForm.reset();
      }
      function openAiWidget() {
        elements.aiWidgetPanel.classList.remove("hidden");
        elements.aiWidgetLauncher.classList.add("hidden");
      }
      function closeAiWidget() {
        elements.aiWidgetPanel.classList.add("hidden");
        const shouldShowLauncher = Boolean(getSession()) && Boolean(getActiveOrg());
        elements.aiWidgetLauncher.classList.toggle("hidden", !shouldShowLauncher);
      }
      function updateAuthChrome() {
        const authenticated = Boolean(getSession());
        const activeOrg = getActiveOrg();
        const hasActiveOrg = Boolean(activeOrg);
        elements.publicNav.classList.add("hidden");
        elements.privateNav.classList.toggle("hidden", !authenticated);
        elements.welcomeName.textContent = getDisplayName();
        elements.activeOrgBadge.textContent = hasActiveOrg ? getOrgLabel(activeOrg) : "Setup required";
        elements.brandText.classList.toggle("hidden", authenticated && hasActiveOrg);
        elements.dashboardCreateOrderButton.disabled = !hasActiveOrg;
        elements.goToWorkspaceFromOrders.classList.toggle("hidden", hasActiveOrg);
        document.querySelectorAll("[data-requires-org]").forEach((element) => {
          element.classList.toggle("hidden", !authenticated || !hasActiveOrg);
        });
        document.querySelectorAll("[data-workspace]").forEach((element) => {
          const workspace = element.dataset.workspace;
          element.classList.toggle(
            "hidden",
            !authenticated || !hasActiveOrg || !workspace || workspace !== currentWorkspaceMode
          );
        });
        document.querySelectorAll("[data-requires-no-org]").forEach((element) => {
          element.classList.toggle("hidden", !authenticated || hasActiveOrg);
        });
        elements.workspaceSwitcher.classList.toggle("hidden", !authenticated || !hasActiveOrg);
        elements.workspaceBuyingButton.classList.toggle(
          "is-active",
          authenticated && hasActiveOrg && currentWorkspaceMode === "buying"
        );
        elements.workspaceSellingButton.classList.toggle(
          "is-active",
          authenticated && hasActiveOrg && currentWorkspaceMode === "selling"
        );
        const showAiWidget = authenticated && hasActiveOrg;
        elements.aiWidgetLauncher.classList.toggle(
          "hidden",
          !showAiWidget || !elements.aiWidgetPanel.classList.contains("hidden")
        );
        if (!showAiWidget) {
          elements.aiWidgetPanel.classList.add("hidden");
        }
      }
      function populateOrgSelectors() {
        const knownOrgs = getKnownOrgs();
        const activeOrgId = getActiveOrgId();
        const activeOrg = getActiveOrg();
        const orgOptions = knownOrgs.length > 0 ? knownOrgs.map((org) => `
        <option value="${org.orgId}" ${org.orgId === activeOrgId ? "selected" : ""}>
          ${escapeHtml(getOrgLabel(org))}
        </option>
      `).join("") : '<option value="">No organisation selected</option>';
        elements.activeOrgSelect.innerHTML = `<option value="">Choose organisation</option>${orgOptions}`;
        elements.activeOrgSelect.value = activeOrgId ? String(activeOrgId) : "";
        elements.activeOrgLabel.value = activeOrg ? getOrgLabel(activeOrg) : "";
        elements.createOrderOrgName.value = activeOrg ? getOrgLabel(activeOrg) : "No organisation selected";
        elements.updateOrgName.value = activeOrg?.orgName || "";
      }
      function renderAddressOptions(select, options, placeholder, selectedId) {
        const optionMarkup = options.map((address) => `
    <option value="${address.addressID}">
      ${escapeHtml(`${address.addressID} - ${formatAddress(address)}`)}
    </option>
  `).join("");
        select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${optionMarkup}`;
        if (selectedId) {
          select.value = String(selectedId);
        }
      }
      function populateAddressSelectors(selectedOrderAddressId) {
        const addresses = getKnownAddresses();
        const hasAddresses = addresses.length > 0;
        renderAddressOptions(
          elements.createOrgAddressId,
          addresses,
          hasAddresses ? "Select an address" : "Create an address first"
        );
        renderAddressOptions(
          elements.updateOrgAddressId,
          addresses,
          hasAddresses ? "Select an address" : "Create an address first"
        );
        renderAddressOptions(
          elements.createOrderAddressId,
          addresses,
          hasAddresses ? "Select an address" : "Create an address first"
        );
        renderAddressOptions(
          elements.updateOrderAddressId,
          addresses,
          hasAddresses ? "Select an address" : "Create an address first",
          selectedOrderAddressId
        );
        renderAddressOptions(
          elements.marketplaceCheckoutAddressId,
          addresses,
          hasAddresses ? "Select an address" : "Create an address first"
        );
      }
      function renderAddressBook() {
        const addresses = getKnownAddresses();
        if (addresses.length === 0) {
          elements.addressesList.innerHTML = `
      <div class="empty-state">
        <h3>No saved addresses</h3>
        <p>Create an address here to reuse it for organisations and orders.</p>
      </div>
    `;
          return;
        }
        elements.addressesList.innerHTML = addresses.map((address) => `
    <article class="address-card">
      <div>
        <h4>Address #${address.addressID}</h4>
        <p class="address-copy">${escapeHtml(formatAddress(address))}</p>
      </div>
      <div class="button-row">
        <button
          class="secondary-button"
          type="button"
          data-address-edit="${address.addressID}"
        >
          Edit
        </button>
        <button
          class="danger-button"
          type="button"
          data-address-delete="${address.addressID}"
        >
          Delete
        </button>
      </div>
    </article>
  `).join("");
      }
      function renderMembers() {
        if (!getActiveOrgId()) {
          elements.membersList.innerHTML = `
      <div class="empty-state">
        <h3>No active organisation</h3>
        <p>Create or join an organisation before managing team members.</p>
      </div>
    `;
          return;
        }
        if (currentMembers.length === 0) {
          elements.membersList.innerHTML = `
      <div class="empty-state">
        <h3>No team members yet</h3>
        <p>Add members by email and update their roles from this table.</p>
      </div>
    `;
          return;
        }
        elements.membersList.innerHTML = currentMembers.map((member) => `
    <article class="member-row">
      <div class="member-identity">
        <span class="member-avatar" aria-hidden="true">
          ${escapeHtml((member.firstName || member.email).charAt(0).toUpperCase())}
        </span>
        <div>
        <strong>
          ${escapeHtml(`${member.firstName} ${member.lastName}`.trim() || member.email)}
        </strong>
        <span>${escapeHtml(member.email)}</span>
        <span>${escapeHtml(member.telephone || "No phone supplied")}</span>
        </div>
      </div>
      <div class="member-role-field">
        <label for="member-role-${member.contactId}">Role</label>
        <select id="member-role-${member.contactId}" data-member-role="${member.contactId}">
          <option value="OWNER" ${member.role === "OWNER" ? "selected" : ""}>Owner</option>
          <option value="ADMIN" ${member.role === "ADMIN" ? "selected" : ""}>Admin</option>
          <option value="MEMBER" ${member.role === "MEMBER" ? "selected" : ""}>Member</option>
        </select>
      </div>
      <div class="member-actions">
        <button
          class="secondary-button member-save-button"
          type="button"
          data-member-save="${member.contactId}"
        >
          Save Role
        </button>
        <button
          class="danger-button member-remove-button"
          type="button"
          data-member-remove="${member.contactId}"
        >
          Remove
        </button>
      </div>
    </article>
  `).join("");
      }
      function renderOrders(orders) {
        if (!getActiveOrgId()) {
          elements.ordersList.innerHTML = "";
          elements.ordersEmptyState.classList.remove("hidden");
          elements.ordersEmptyState.innerHTML = `
      <h3>No active organisation</h3>
      <p>Finish organisation setup before viewing orders.</p>
    `;
          return;
        }
        if (!orders || orders.length === 0) {
          elements.ordersList.innerHTML = "";
          elements.ordersEmptyState.classList.remove("hidden");
          elements.ordersEmptyState.innerHTML = `
      <h3>No orders yet</h3>
      <p>Your orders will appear here once the active organisation creates one.</p>
    `;
          return;
        }
        elements.ordersEmptyState.classList.add("hidden");
        elements.ordersList.innerHTML = orders.map((order) => `
    <article class="order-row">
      <div class="order-id">${escapeHtml(order.orderId)}</div>
      <div>
        <span class="status-pill ${getStatusClass(order.status)}">
          ${escapeHtml(order.status)}
        </span>
      </div>
      <div>${escapeHtml(formatDisplayDate(order.issuedDate))}</div>
      <div class="price-cell">${escapeHtml(formatCurrency(order.currency, order.finalPrice))}</div>
      <div class="order-actions">
        <button class="inline-action" type="button" data-order-view="${order.orderId}">
          <span class="inline-action-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path
                d="M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6Z"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.9"
              />
              <circle
                cx="12"
                cy="12"
                r="2.8"
                fill="none"
                stroke="currentColor"
                stroke-width="1.9"
              />
            </svg>
          </span>
          View
        </button>
        <button class="inline-action" type="button" data-order-update="${order.orderId}">
          <span class="inline-action-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path
                d="M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5Z"
                fill="none"
                stroke="currentColor"
                stroke-linejoin="round"
                stroke-width="1.9"
              />
              <path
                d="m13.5 7 3.5 3.5"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-width="1.9"
              />
            </svg>
          </span>
          Update
        </button>
      </div>
    </article>
  `).join("");
      }
      function renderOrderDetail(detail) {
        const itemsMarkup = (detail.items || []).map((item) => {
          const unitPriceText = formatCurrency(
            detail.currency || defaultCurrency,
            item.unitPrice || 0
          );
          return `
      <li>
        <strong>${escapeHtml(item.name || "Unnamed item")}</strong>
        ${escapeHtml(item.description || "No description")}
        <br>
        Qty ${item.quantity ?? 0} at ${escapeHtml(unitPriceText)}
      </li>
    `;
        }).join("");
        const buyerName = [
          detail.userDetails?.firstName || "",
          detail.userDetails?.lastName || ""
        ].join(" ").trim();
        elements.detailOrderHeading.textContent = detail.orderId || "Order detail";
        elements.detailOrderMeta.textContent = `${detail.status || "Unknown"} \u2022 ${detail.issuedDate || "No issue date"}`;
        const finalPriceText = formatCurrency(
          detail.currency || defaultCurrency,
          detail.finalPrice || 0
        );
        elements.orderInfoOutput.innerHTML = `
    <div class="detail-grid">
      <section class="detail-block">
        <h4>Summary</h4>
        <p>Order ID: ${escapeHtml(detail.orderId || "N/A")}</p>
        <p>Status: ${escapeHtml(detail.status || "N/A")}</p>
        <p>
          Issued: ${escapeHtml(detail.issuedDate || "N/A")}
          ${escapeHtml(detail.issuedTime || "")}
        </p>
        <p>Final Price: ${escapeHtml(finalPriceText)}</p>
      </section>
      <section class="detail-block">
        <h4>Buyer</h4>
        <p>${escapeHtml(buyerName || "No buyer details")}</p>
        <p>${escapeHtml(detail.userDetails?.email || "No email")}</p>
        <p>${escapeHtml(detail.userDetails?.telephone || "No phone")}</p>
      </section>
      <section class="detail-block">
        <h4>Delivery</h4>
        <p>${escapeHtml(detail.address || "No address")}</p>
        <p>Address ID: ${escapeHtml(String(detail.deliveryAddressId ?? "N/A"))}</p>
        <p>Start: ${escapeHtml(formatDisplayDateTime(detail.deliveryDetails?.startDateTime))}</p>
        <p>End: ${escapeHtml(formatDisplayDateTime(detail.deliveryDetails?.endDateTime))}</p>
      </section>
      <section class="detail-block">
        <h4>Items</h4>
        <ul>${itemsMarkup || "<li>No item lines available.</li>"}</ul>
      </section>
    </div>
  `;
        elements.downloadUblButton.disabled = false;
        elements.openUpdateOrderButton.disabled = false;
        elements.cancelOrderButton.disabled = false;
      }
      function getMarketplaceSelectedSeller() {
        if (!marketplaceSelectedSellerId) {
          return null;
        }
        return currentMarketplaceOrgs.find((org) => org.orgId === marketplaceSelectedSellerId) || null;
      }
      function calculateMarketplaceCartTotals() {
        const subtotal = marketplaceCartItems.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );
        const tax = subtotal * gstRate;
        const total = subtotal + tax;
        return { subtotal, tax, total };
      }
      function renderMarketplaceSellerList() {
        if (currentMarketplaceOrgs.length === 0) {
          elements.marketplaceSellerList.innerHTML = `
      <div class="empty-state">
        <h3>No sellers available</h3>
        <p>Once seller organisations are set up, they will appear here for buyers to browse.</p>
      </div>
    `;
          return;
        }
        elements.marketplaceSellerList.innerHTML = currentMarketplaceOrgs.map((org) => `
    <button
      class="seller-list-item ${org.orgId === marketplaceSelectedSellerId ? "is-selected" : ""}"
      type="button"
      data-marketplace-seller="${org.orgId}"
    >
      <span class="seller-list-mark" aria-hidden="true">
        ${escapeHtml(org.orgName.charAt(0).toUpperCase())}
      </span>
      <span class="seller-list-copy">
        <strong>${escapeHtml(org.orgName)}</strong>
        <span>${escapeHtml(`Organisation #${org.orgId}`)}</span>
      </span>
    </button>
  `).join("");
      }
      function renderMarketplaceCatalogue() {
        const selectedSeller = getMarketplaceSelectedSeller();
        elements.marketplaceSelectedSellerName.textContent = selectedSeller ? selectedSeller.orgName : "Select a seller";
        elements.marketplaceSelectedSellerMeta.textContent = selectedSeller ? [
          `Ordering from organisation #${selectedSeller.orgId}.`,
          "Seller prices are locked in from the catalogue."
        ].join(" ") : "Pick a seller from the left to load their active catalogue items.";
        elements.marketplaceCheckoutSellerName.value = selectedSeller ? getOrgLabel(selectedSeller) : "No seller selected";
        if (!selectedSeller) {
          elements.marketplaceCatalogueList.innerHTML = `
      <div class="empty-state">
        <h3>No seller selected</h3>
        <p>Choose a seller organisation to view their available items.</p>
      </div>
    `;
          return;
        }
        if (currentSellerCatalogue.length === 0) {
          elements.marketplaceCatalogueList.innerHTML = `
      <div class="empty-state">
        <h3>No active catalogue items</h3>
        <p>This seller does not currently have any active items available to order.</p>
      </div>
    `;
          return;
        }
        elements.marketplaceCatalogueList.innerHTML = currentSellerCatalogue.map((item) => `
    <article class="catalogue-card marketplace-catalogue-card">
      <div class="catalogue-card-copy">
        <p class="marketplace-item-kicker">Catalogue Item</p>
        <h4>${escapeHtml(item.name)}</h4>
        <p>${escapeHtml(item.description || "No description provided.")}</p>
      </div>
      <div class="catalogue-card-footer">
        <strong class="marketplace-item-price">
          ${escapeHtml(formatCurrency(defaultCurrency, item.price))}
        </strong>
        <button
          class="secondary-button marketplace-add-item-button"
          type="button"
          data-marketplace-add="${item.catalogueItemId}"
        >
          Add to cart
        </button>
      </div>
    </article>
  `).join("");
      }
      function renderMarketplaceCart() {
        const totals = calculateMarketplaceCartTotals();
        if (marketplaceCartItems.length === 0) {
          elements.marketplaceCartLines.innerHTML = `
      <p class="summary-empty">
        Add catalogue items to build an order request for the selected seller.
      </p>
    `;
        } else {
          elements.marketplaceCartLines.innerHTML = marketplaceCartItems.map((item) => `
      <article class="cart-line-card">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <p>${escapeHtml(item.description || "No description provided.")}</p>
          <span>${escapeHtml(formatCurrency(defaultCurrency, item.price))} each</span>
        </div>
        <div class="cart-line-actions">
          <label for="cart-item-${item.catalogueItemId}">Qty</label>
          <input
            id="cart-item-${item.catalogueItemId}"
            type="number"
            min="1"
            step="1"
            value="${item.quantity}"
            data-marketplace-qty="${item.catalogueItemId}"
          >
          <button
            class="inline-link"
            type="button"
            data-marketplace-remove="${item.catalogueItemId}"
          >
            Remove
          </button>
        </div>
      </article>
    `).join("");
        }
        elements.marketplaceSubtotal.textContent = formatCurrency(defaultCurrency, totals.subtotal);
        elements.marketplaceTax.textContent = formatCurrency(defaultCurrency, totals.tax);
        elements.marketplaceTotal.textContent = formatCurrency(defaultCurrency, totals.total);
        elements.marketplacePlaceOrderButton.disabled = marketplaceCartItems.length === 0 || !getMarketplaceSelectedSeller();
      }
      function validateMarketplaceCheckoutForm(form) {
        const deliveryAddressId = parseInteger(getFormValue(form, "deliveryAddressId"));
        if (!deliveryAddressId) {
          throw new Error("Choose a delivery address before submitting the order.");
        }
        const deliveryStartInput = getFormValue(form, "deliveryStart");
        const deliveryEndInput = getFormValue(form, "deliveryEnd");
        if (!deliveryStartInput || !deliveryEndInput) {
          throw new Error("Choose both a delivery start and end time before submitting.");
        }
        const deliveryStart = buildEpochFromInput(deliveryStartInput);
        const deliveryEnd = buildEpochFromInput(deliveryEndInput);
        if (deliveryEnd <= deliveryStart) {
          throw new Error("Delivery end must be later than the delivery start.");
        }
        return { deliveryAddressId, deliveryEnd, deliveryStart };
      }
      function renderCatalogueManager() {
        const canManageCatalogue = isSellerRole(currentOrgRole);
        elements.catalogueCreateCard.classList.toggle("hidden", !canManageCatalogue);
        if (currentSellerCatalogue.length === 0) {
          elements.catalogueItemsList.innerHTML = `
      <div class="catalogue-empty-state">
        <div class="catalogue-empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path
              d="M4 8.5 12 4l8 4.5-8 4.5-8-4.5Z"
              fill="none"
              stroke="currentColor"
              stroke-linejoin="round"
              stroke-width="1.8"
            />
            <path
              d="M4 8.5V16l8 4 8-4V8.5"
              fill="none"
              stroke="currentColor"
              stroke-linejoin="round"
              stroke-width="1.8"
            />
            <path
              d="M12 13v7"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="1.8"
            />
          </svg>
        </div>
        <p>No items yet</p>
      </div>
    `;
          return;
        }
        elements.catalogueItemsList.innerHTML = currentSellerCatalogue.map((item) => `
    <article class="surface catalogue-manager-card">
      <div class="catalogue-manager-copy">
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.description || "No description provided.")}</p>
      </div>
      <div class="catalogue-manager-actions">
        <strong class="catalogue-manager-price">
          ${escapeHtml(formatCurrency(defaultCurrency, item.price))}
        </strong>
        ${canManageCatalogue ? `
          <div class="catalogue-manager-action-group">
            <button
              class="catalogue-icon-button"
              type="button"
              data-catalogue-edit="${item.catalogueItemId}"
              title="Edit item"
              aria-label="Edit ${escapeHtml(item.name)}"
            >
              <svg viewBox="0 0 24 24" focusable="false">
                <path
                  d="M4 20h4l10-10-4-4L4 16v4Z"
                  fill="none"
                  stroke="currentColor"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
                <path
                  d="m12.5 7.5 4 4"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-width="1.8"
                />
              </svg>
            </button>
            <button
              class="catalogue-icon-button catalogue-icon-button-danger"
              type="button"
              data-catalogue-delete="${item.catalogueItemId}"
              title="Deactivate item"
              aria-label="Deactivate ${escapeHtml(item.name)}"
            >
              <svg viewBox="0 0 24 24" focusable="false">
                <path
                  d="M5 7h14"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-width="1.8"
                />
                <path
                  d="M9 7V5h6v2"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
                <path
                  d="M8 7v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7"
                  fill="none"
                  stroke="currentColor"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
                <path
                  d="M10 11v5M14 11v5"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-width="1.8"
                />
              </svg>
            </button>
          </div>
        ` : `
          <span class="helper-text">View only</span>
        `}
      </div>
    </article>
  `).join("");
      }
      function renderSellerDashboardSummary(_catalogueItems, sellerOrders) {
        const pendingCount = sellerOrders.filter((order) => order.status === "PENDING").length;
        const acceptedCount = sellerOrders.filter((order) => order.status === "ACCEPTED").length;
        const activeOrg = getActiveOrg();
        elements.sellerDashboardOrgLabel.textContent = getOrgLabel(activeOrg);
        elements.sellerPendingCount.textContent = String(pendingCount);
        elements.sellerAcceptedCount.textContent = String(acceptedCount);
        elements.sellerActiveProductCount.textContent = String(_catalogueItems.length);
      }
      function renderSellerOrders(orders) {
        if (!getActiveOrgId()) {
          elements.sellerOrdersEmptyState.classList.remove("hidden");
          elements.sellerOrdersEmptyState.innerHTML = `
      <h3>No active organisation</h3>
      <p>Create or join an organisation before reviewing received orders.</p>
    `;
          elements.sellerOrdersList.innerHTML = "";
          return;
        }
        if (orders.length === 0) {
          elements.sellerOrdersEmptyState.classList.remove("hidden");
          elements.sellerOrdersEmptyState.innerHTML = `
      <h3>No order requests yet</h3>
      <p>Orders placed with your organisation will appear here once buyers start ordering.</p>
    `;
          elements.sellerOrdersList.innerHTML = "";
          return;
        }
        elements.sellerOrdersEmptyState.classList.add("hidden");
        elements.sellerOrdersList.innerHTML = `
    <div class="orders-table-head seller-orders-head">
      <span>Order ID</span>
      <span>Buyer Org</span>
      <span>Status</span>
      <span>Issued</span>
      <span>Total</span>
      <span>Actions</span>
    </div>
    ${orders.map((order) => `
      <article class="order-row seller-order-row">
        <div class="order-id">${escapeHtml(order.orderId)}</div>
        <div>${escapeHtml(String(order.buyerOrgID ?? "N/A"))}</div>
        <div>
          <span class="status-pill ${getStatusClass(order.status)}">
            ${escapeHtml(order.status)}
          </span>
        </div>
        <div>${escapeHtml(formatDisplayDate(order.issuedDate))}</div>
        <div class="price-cell">
          ${escapeHtml(formatCurrency(order.currency, order.finalPrice))}
        </div>
        <div class="order-actions">
          <button
            class="inline-action"
            type="button"
            data-seller-order-view="${order.orderId}"
          >
            View
          </button>
          ${order.status === "PENDING" ? `
            <button
              class="inline-action"
              type="button"
              data-seller-order-accept="${order.orderId}"
            >
              Accept
            </button>
            <button
              class="inline-action danger-inline-action"
              type="button"
              data-seller-order-reject="${order.orderId}"
            >
              Reject
            </button>
          ` : ""}
        </div>
      </article>
    `).join("")}
  `;
      }
      function renderSellerOrderDetail(detail) {
        const orderCurrency = detail.currency || defaultCurrency;
        const itemsMarkup = (detail.items || []).map((item) => `
    <li>
      <strong>${escapeHtml(item.name || "Unnamed item")}</strong>
      ${escapeHtml(item.description || "No description")}
      <br>
      Qty ${item.quantity ?? 0}
      at ${escapeHtml(formatCurrency(orderCurrency, item.unitPrice || 0))}
    </li>
  `).join("");
        const finalPriceText = formatCurrency(orderCurrency, detail.finalPrice || 0);
        const taxExclusiveText = formatCurrency(orderCurrency, detail.taxExclusive || 0);
        const taxInclusiveText = formatCurrency(orderCurrency, detail.taxInclusive || 0);
        elements.sellerDetailOrderHeading.textContent = detail.orderId || "Received order";
        elements.sellerDetailOrderMeta.textContent = `${detail.status || "Unknown"} \u2022 ${detail.issuedDate || "No issue date"}`;
        elements.sellerOrderInfoOutput.innerHTML = `
    <div class="detail-grid">
      <section class="detail-block">
        <h4>Summary</h4>
        <p>Order ID: ${escapeHtml(detail.orderId || "N/A")}</p>
        <p>Status: ${escapeHtml(detail.status || "N/A")}</p>
        <p>Buyer Org: ${escapeHtml(String(detail.buyerOrgId ?? "N/A"))}</p>
        <p>
          Issued: ${escapeHtml(detail.issuedDate || "N/A")}
          ${escapeHtml(detail.issuedTime || "")}
        </p>
        <p>Final Price: ${escapeHtml(finalPriceText)}</p>
      </section>
      <section class="detail-block">
        <h4>Delivery</h4>
        <p>${escapeHtml(detail.address || "No address")}</p>
        <p>Address ID: ${escapeHtml(String(detail.deliveryAddressId ?? "N/A"))}</p>
        <p>
          Start: ${escapeHtml(formatDisplayDateTime(detail.deliveryDetails?.startDateTime))}
        </p>
        <p>
          End: ${escapeHtml(formatDisplayDateTime(detail.deliveryDetails?.endDateTime))}
        </p>
      </section>
      <section class="detail-block">
        <h4>Financials</h4>
        <p>Tax Exclusive: ${escapeHtml(taxExclusiveText)}</p>
        <p>Tax Inclusive: ${escapeHtml(taxInclusiveText)}</p>
        <p>Total: ${escapeHtml(finalPriceText)}</p>
      </section>
      <section class="detail-block">
        <h4>Items</h4>
        <ul>${itemsMarkup || "<li>No item lines available.</li>"}</ul>
      </section>
    </div>
  `;
        const actionsEnabled = isSellerRole(currentOrgRole) && detail.status === "PENDING";
        elements.acceptReceivedOrderButton.disabled = !actionsEnabled;
        elements.rejectReceivedOrderButton.disabled = !actionsEnabled;
      }
      function setAiChatStatus(message) {
        if (!message) {
          elements.aiChatStatus.textContent = "";
          elements.aiChatStatus.classList.add("hidden");
          return;
        }
        elements.aiChatStatus.textContent = message;
        elements.aiChatStatus.classList.remove("hidden");
      }
      function updateAiSuggestionsVisibility() {
        const activeOrg = getActiveOrg();
        const shouldShowSuggestions = Boolean(activeOrg) && aiChatHistory.length === 0 && !aiChatPending && !aiStreamingReply;
        elements.aiChatSuggestions.classList.toggle("hidden", !shouldShowSuggestions);
      }
      function setAiChatPending(isPending) {
        aiChatPending = isPending;
        elements.aiChatResetButton.disabled = isPending;
        elements.aiChatSendButton.disabled = isPending;
        elements.aiChatInput.readOnly = isPending;
        if (isPending) {
          setAiChatStatus("Assistant is thinking...");
        } else if (elements.aiChatStatus.textContent === "Assistant is thinking...") {
          setAiChatStatus("");
        }
        updateAiSuggestionsVisibility();
      }
      function renderAiChatHistory() {
        const activeOrg = getActiveOrg();
        if (!activeOrg) {
          updateAiSuggestionsVisibility();
          elements.aiChatHistory.innerHTML = `
      <div class="ai-chat-empty">
        <h4>Set up an organisation first</h4>
        <p>The assistant becomes available once you have an active organisation.</p>
      </div>
    `;
          return;
        }
        if (aiChatHistory.length === 0) {
          updateAiSuggestionsVisibility();
          elements.aiChatHistory.innerHTML = "";
          return;
        }
        const historyMarkup = aiChatHistory.map((message) => `
    <article class="ai-message ai-message-${message.role}">
      <span class="ai-message-role">${message.role === "user" ? "You" : "Assistant"}</span>
      <p class="ai-message-copy">${escapeHtml(getMessageDisplayText(message))}</p>
    </article>
  `).join("");
        const streamingMarkup = aiStreamingReply ? `
      <article class="ai-message ai-message-assistant ai-message-streaming">
        <span class="ai-message-role">Assistant</span>
        <p class="ai-message-copy">${escapeHtml(aiStreamingReply)}</p>
      </article>
    ` : "";
        elements.aiChatHistory.innerHTML = `${historyMarkup}${streamingMarkup}`;
        elements.aiChatHistory.scrollTop = elements.aiChatHistory.scrollHeight;
        updateAiSuggestionsVisibility();
      }
      function loadAiChatForActiveOrg() {
        const activeOrgId = getActiveOrgId();
        stopAiTypingAnimation();
        aiStreamingReply = "";
        aiChatHistory = activeOrgId ? getStoredAiHistory(activeOrgId) : [];
        renderAiChatHistory();
        setAiChatStatus("");
        updateAiSuggestionsVisibility();
      }
      function formatDisplayDateTime(epochMillis) {
        if (!epochMillis) {
          return "N/A";
        }
        const parsedDate = new Date(epochMillis);
        if (Number.isNaN(parsedDate.getTime())) {
          return String(epochMillis);
        }
        return parsedDate.toLocaleString("en-AU");
      }
      function setOrdersLoadingState(isLoading) {
        elements.ordersLoadingState.classList.toggle("hidden", !isLoading);
        elements.ordersList.classList.toggle("hidden", isLoading);
        elements.ordersEmptyState.classList.add("hidden");
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
          <span>Describe the product line and quantity.</span>
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
            placeholder="Sourdough loaf"
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
        const currency = elements.createOrderCurrency.value || defaultCurrency;
        const meaningfulItems = createOrderItems.filter(
          (item) => item.name || item.description || item.unitPrice > 0 || item.quantity > 0
        );
        const totals = calculateOrderTotals();
        elements.createOrderSummaryLines.innerHTML = meaningfulItems.length > 0 ? meaningfulItems.map((item, index) => {
          const itemLabel = item.name || `Item ${index + 1}`;
          const lineTotal = formatCurrency(currency, item.unitPrice * item.quantity);
          return `
          <div class="summary-line">
            <span>${escapeHtml(itemLabel)} x${item.quantity}</span>
            <strong>${escapeHtml(lineTotal)}</strong>
          </div>
        `;
        }).join("") : '<p class="summary-empty">Add items to see the order breakdown.</p>';
        elements.summarySubtotal.textContent = formatCurrency(currency, totals.subtotal);
        elements.summaryTax.textContent = formatCurrency(currency, totals.tax);
        elements.summaryTotal.textContent = formatCurrency(currency, totals.total);
      }
      function populateReadonlyFields() {
        const profile = getStoredProfile();
        const activeOrg = getActiveOrg();
        elements.createOrderBuyerEmail.value = profile?.email || "";
        elements.createOrderOrgName.value = activeOrg ? getOrgLabel(activeOrg) : "No organisation selected";
      }
      function resetCreateOrderForm() {
        elements.createOrderForm.reset();
        elements.createOrderCurrency.value = defaultCurrency;
        populateReadonlyFields();
        createOrderItems = [getDefaultOrderItem()];
        renderCreateOrderItems();
        populateAddressSelectors();
        updateCreateOrderSummary();
      }
      function prepareCreateOrderView() {
        const activeOrg = getActiveOrg();
        const addresses = getKnownAddresses();
        resetCreateOrderForm();
        if (!activeOrg) {
          setBannerMessage(
            elements.createOrderNotice,
            "Create or join an organisation before creating orders."
          );
          return;
        }
        if (addresses.length === 0) {
          setBannerMessage(
            elements.createOrderNotice,
            "Create an address first, then return here to create the order."
          );
          return;
        }
        setBannerMessage(
          elements.createOrderNotice,
          `Creating order for ${getOrgLabel(activeOrg)}.`
        );
      }
      function prepareUpdateOrderView(detail) {
        currentOrderDetail = detail;
        elements.updateOrderHeading.textContent = `Update Order ${detail.orderId || ""}`;
        elements.updateOrderStatus.value = detail.status || "OPEN";
        populateAddressSelectors(detail.deliveryAddressId);
        elements.updateDeliveryStart.value = formatDateTimeInput(detail.deliveryDetails?.startDateTime);
        elements.updateDeliveryEnd.value = formatDateTimeInput(detail.deliveryDetails?.endDateTime);
        setBannerMessage(
          elements.updateOrderNotice,
          detail.orderId ? `Editing order ${detail.orderId}.` : ""
        );
      }
      async function loadCatalogueForSeller(orgId) {
        const payload = await apiRequest(`/v3/organisation/${orgId}/catalogue`);
        currentSellerCatalogue = payload.items || [];
      }
      async function loadMarketplaceData() {
        const activeOrg = getActiveOrg();
        if (!activeOrg) {
          setBannerMessage(
            elements.marketplaceNotice,
            "Create or join an organisation before browsing the marketplace."
          );
          currentMarketplaceOrgs = [];
          currentSellerCatalogue = [];
          marketplaceSelectedSellerId = null;
          renderMarketplaceSellerList();
          renderMarketplaceCatalogue();
          renderMarketplaceCart();
          return;
        }
        setBannerMessage(
          elements.marketplaceNotice,
          `Browsing seller catalogues as ${getOrgLabel(activeOrg)}.`
        );
        const payload = await apiRequest("/v3/organisations");
        currentMarketplaceOrgs = (payload.organisations || []).filter((org) => org.orgId !== activeOrg.orgId).sort((left, right) => left.orgName.localeCompare(right.orgName));
        if (!currentMarketplaceOrgs.some((org) => org.orgId === marketplaceSelectedSellerId)) {
          marketplaceSelectedSellerId = currentMarketplaceOrgs[0]?.orgId ?? null;
          marketplaceCartItems = [];
        }
        renderMarketplaceSellerList();
        if (!marketplaceSelectedSellerId) {
          currentSellerCatalogue = [];
          renderMarketplaceCatalogue();
          renderMarketplaceCart();
          return;
        }
        await loadCatalogueForSeller(marketplaceSelectedSellerId);
        renderMarketplaceCatalogue();
        renderMarketplaceCart();
      }
      async function loadCatalogueManager() {
        const activeOrgId = getActiveOrgId();
        if (!activeOrgId) {
          currentSellerCatalogue = [];
          setBannerMessage(
            elements.catalogueNotice,
            "Create or join an organisation before managing catalogue items."
          );
          renderCatalogueManager();
          return;
        }
        setBannerMessage(
          elements.catalogueNotice,
          isSellerRole(currentOrgRole) ? `Managing catalogue items for ${getOrgLabel(getActiveOrg())}.` : `Viewing catalogue items for ${getOrgLabel(getActiveOrg())}.`
        );
        await loadCatalogueForSeller(activeOrgId);
        renderCatalogueManager();
      }
      async function loadSellerOrders() {
        const activeOrgId = getActiveOrgId();
        if (!activeOrgId) {
          renderSellerOrders([]);
          return;
        }
        const status = elements.sellerOrdersStatusFilter.value;
        setBannerMessage(
          elements.sellerOrdersNotice,
          `Showing order requests for ${getOrgLabel(getActiveOrg())}.`
        );
        const path = status ? `/v3/organisation/${activeOrgId}/orders/received?status=${encodeURIComponent(status)}` : `/v3/organisation/${activeOrgId}/orders/received`;
        const payload = await apiRequest(path);
        renderSellerOrders(payload.orders || []);
      }
      async function loadSellerDashboardData() {
        const activeOrgId = getActiveOrgId();
        if (!activeOrgId) {
          renderSellerDashboardSummary([], []);
          setBannerMessage(
            elements.sellerDashboardNotice,
            "Create or join an organisation before using the seller dashboard."
          );
          return;
        }
        setBannerMessage(
          elements.sellerDashboardNotice,
          `Selling workspace for ${getOrgLabel(getActiveOrg())}.`
        );
        const results = await Promise.allSettled([
          apiRequest(`/v3/organisation/${activeOrgId}/catalogue`),
          apiRequest(`/v3/organisation/${activeOrgId}/orders/received`)
        ]);
        const catalogueItems = results[0].status === "fulfilled" ? results[0].value.items || [] : [];
        const sellerOrders = results[1].status === "fulfilled" ? results[1].value.orders || [] : [];
        renderSellerDashboardSummary(catalogueItems, sellerOrders);
        if (results[0].status === "rejected") {
          showFeedback(getErrorMessage(results[0].reason));
        }
        if (results[1].status === "rejected") {
          showFeedback(getErrorMessage(results[1].reason));
        }
      }
      async function loadSellerOrderDetail(orderId) {
        const activeOrgId = getActiveOrgId();
        if (!activeOrgId) {
          throw new Error("Choose an organisation before viewing received orders.");
        }
        const payload = await apiRequest(
          `/v3/organisation/${activeOrgId}/orders/received/${orderId}`
        );
        currentSellerOrderDetail = payload;
        renderSellerOrderDetail(payload);
      }
      async function openSellerOrderDetailView(orderId) {
        try {
          await loadSellerOrderDetail(orderId);
          await showView("sellerOrderDetail");
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      }
      async function performSellerOrderAction(orderId, action, reason) {
        const activeOrgId = getActiveOrgId();
        if (!activeOrgId) {
          showFeedback("Choose an organisation before reviewing seller orders.");
          return;
        }
        const path = `/v3/organisation/${activeOrgId}/order/${orderId}/${action}`;
        const options = {
          method: "PUT"
        };
        if (action === "reject") {
          options.body = { reason };
        }
        await apiRequest(path, options);
        await Promise.allSettled([loadSellerOrders(), loadSellerDashboardData()]);
        if (currentSellerOrderDetail?.orderId === orderId) {
          await loadSellerOrderDetail(orderId);
        }
      }
      async function fetchAddressById(addressId) {
        return apiRequest(`/v2/address/${addressId}`);
      }
      async function refreshWorkspaceData() {
        populateOrgSelectors();
        populateAddressSelectors();
        renderAddressBook();
        currentOrgRole = getStoredOrgRole(getActiveOrgId());
        syncCurrentWorkspaceMode();
        const activeOrgId = getActiveOrgId();
        if (!activeOrgId) {
          currentMembers = [];
          currentOrgRole = null;
          renderMembers();
          updateAuthChrome();
          setBannerMessage(
            elements.workspaceNotice,
            "Create or join an organisation to unlock orders, addresses, and team management."
          );
          return;
        }
        setBannerMessage(
          elements.workspaceNotice,
          `Active organisation: ${getOrgLabel(getActiveOrg())}.`
        );
        const loaders = await Promise.allSettled([
          apiRequest(`/v2/organisation/${activeOrgId}/address`),
          apiRequest(`/v2/organisation/${activeOrgId}/members`)
        ]);
        if (loaders[0].status === "fulfilled") {
          mergeAddresses(loaders[0].value.addresses || []);
          renderAddressBook();
          populateAddressSelectors();
        } else {
          showFeedback(getErrorMessage(loaders[0].reason));
        }
        if (loaders[1].status === "fulfilled") {
          currentMembers = loaders[1].value.users || [];
          renderMembers();
        } else {
          currentMembers = [];
          renderMembers();
          showFeedback(getErrorMessage(loaders[1].reason));
        }
        syncCurrentOrgRole();
        updateAuthChrome();
      }
      async function loadOrders() {
        const activeOrgId = getActiveOrgId();
        setOrdersLoadingState(true);
        clearOrderDetailPanel();
        if (!activeOrgId) {
          setBannerMessage(
            elements.ordersNotice,
            "Finish organisation setup before viewing orders."
          );
          setOrdersLoadingState(false);
          renderOrders([]);
          return;
        }
        setBannerMessage(
          elements.ordersNotice,
          `Showing buyer orders for ${getOrgLabel(getActiveOrg())}.`
        );
        try {
          const payload = await apiRequest(
            `/v2/organisation/${activeOrgId}/order/list`
          );
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
          elements.ordersList.classList.remove("hidden");
        }
      }
      async function loadOrderDetail(orderId) {
        const activeOrgId = getActiveOrgId();
        if (!activeOrgId) {
          showFeedback("Select an organisation before viewing order details.");
          return;
        }
        try {
          const payload = await apiRequest(
            `/v2/organisation/${activeOrgId}/order/${orderId}`
          );
          currentOrderDetail = payload;
          renderOrderDetail(payload);
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      }
      async function openOrderDetailView(orderId) {
        await loadOrderDetail(orderId);
        if (!currentOrderDetail) {
          showFeedback("We could not load that order right now.");
          return;
        }
        await showView("orderDetail");
      }
      async function openUpdateOrderView(orderId) {
        if (orderId) {
          await loadOrderDetail(orderId);
        }
        if (!currentOrderDetail) {
          showFeedback("Choose an order first so we can load the update form.");
          return;
        }
        prepareUpdateOrderView(currentOrderDetail);
        await showView("updateOrder");
      }
      function buildCreateOrderPayload(form) {
        const activeOrgId = getActiveOrgId();
        if (!activeOrgId) {
          throw new Error("Create or join an organisation before creating orders.");
        }
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
        const deliveryAddressId = parseInteger(getFormValue(form, "deliveryAddressId"));
        if (!deliveryAddressId) {
          throw new Error("Choose a delivery address before submitting the order.");
        }
        const deliveryStart = buildEpochFromInput(getFormValue(form, "deliveryStart"));
        const deliveryEnd = buildEpochFromInput(getFormValue(form, "deliveryEnd"));
        if (deliveryEnd <= deliveryStart) {
          throw new Error("Delivery end must be later than the delivery start.");
        }
        return {
          currency: getFormValue(form, "currency") || defaultCurrency,
          deliveryAddressId,
          items,
          reqDeliveryPeriod: {
            endDateTime: deliveryEnd,
            startDateTime: deliveryStart
          }
        };
      }
      function buildUpdateOrderPayload(form) {
        const deliveryAddressId = parseInteger(getFormValue(form, "deliveryAddressId"));
        if (!deliveryAddressId) {
          throw new Error("Choose a delivery address before saving changes.");
        }
        const deliveryStart = buildEpochFromInput(getFormValue(form, "deliveryStart"));
        const deliveryEnd = buildEpochFromInput(getFormValue(form, "deliveryEnd"));
        if (deliveryEnd <= deliveryStart) {
          throw new Error("Delivery end must be later than the delivery start.");
        }
        return {
          deliveryAddressId,
          reqDeliveryPeriod: {
            endDateTime: deliveryEnd,
            startDateTime: deliveryStart
          },
          status: getFormValue(form, "status") || "UPDATED"
        };
      }
      async function showView(viewName) {
        const authenticated = Boolean(getSession());
        const requiresAuth = !publicViews.includes(viewName);
        let nextView = !authenticated && requiresAuth ? "login" : viewName;
        syncCurrentWorkspaceMode();
        if (authenticated && getActiveOrg() && currentOrgRole === null) {
          try {
            await refreshWorkspaceData();
          } catch (error) {
            showFeedback(getErrorMessage(error));
          }
        }
        if (authenticated && nextView === "landing") {
          nextView = getAuthenticatedHomeView();
        }
        if (authenticated && orgRequiredViews.includes(nextView) && !getActiveOrg()) {
          nextView = "orgChoice";
        }
        if (authenticated && buyingViews.includes(nextView) && currentWorkspaceMode !== "buying") {
          nextView = getAuthenticatedHomeView();
        }
        if (authenticated && sellerViews.includes(nextView) && currentWorkspaceMode !== "selling") {
          nextView = getAuthenticatedHomeView();
        }
        Object.entries(viewElements).forEach(([name, element]) => {
          element.classList.toggle("hidden", name !== nextView);
          element.classList.toggle("is-active", name === nextView);
        });
        updateAuthChrome();
        updateNavigationState(nextView);
        if (nextView !== "dashboard" && nextView !== "orderDetail" && nextView !== "updateOrder") {
          clearOrderDetailPanel();
        }
        if (nextView !== "sellerOrders" && nextView !== "sellerOrderDetail") {
          clearSellerOrderDetailPanel();
        }
        if (organisationViews.includes(nextView) && authenticated) {
          await refreshWorkspaceData();
        }
        if (nextView === "dashboard" && authenticated) {
          await Promise.allSettled([refreshWorkspaceData(), loadOrders()]);
          loadAiChatForActiveOrg();
        }
        if (nextView === "orderDetail" && authenticated && currentOrderDetail) {
          renderOrderDetail(currentOrderDetail);
        }
        if (nextView === "marketplace" && authenticated) {
          await Promise.allSettled([refreshWorkspaceData(), loadMarketplaceData()]);
          loadAiChatForActiveOrg();
        }
        if (nextView === "sellerDashboard" && authenticated) {
          await Promise.allSettled([refreshWorkspaceData(), loadSellerDashboardData()]);
          loadAiChatForActiveOrg();
        }
        if (nextView === "catalogue" && authenticated) {
          await Promise.allSettled([refreshWorkspaceData(), loadCatalogueManager()]);
        }
        if (nextView === "sellerOrders" && authenticated) {
          await Promise.allSettled([refreshWorkspaceData(), loadSellerOrders()]);
        }
        if (nextView === "sellerOrderDetail" && authenticated && currentSellerOrderDetail) {
          renderSellerOrderDetail(currentSellerOrderDetail);
        }
        if (nextView === "createOrder" && authenticated) {
          prepareCreateOrderView();
        }
        if (nextView === "updateOrder" && authenticated && currentOrderDetail) {
          prepareUpdateOrderView(currentOrderDetail);
        }
      }
      function getAuthenticatedHomeView() {
        if (!getActiveOrg()) {
          return "orgChoice";
        }
        return currentWorkspaceMode === "selling" ? "sellerDashboard" : "marketplace";
      }
      var elements = {
        acceptReceivedOrderButton: getRequiredElement("acceptReceivedOrderButton"),
        activeOrgBadge: getRequiredElement("activeOrgBadge"),
        activeOrgLabel: getRequiredElement("activeOrgLabel"),
        activeOrgSelect: getRequiredElement("activeOrgSelect"),
        addMemberForm: getRequiredElement("addMemberForm"),
        addOrderItemButton: getRequiredElement("addOrderItemButton"),
        aiChatForm: getRequiredElement("aiChatForm"),
        aiChatHistory: getRequiredElement("aiChatHistory"),
        aiChatInput: getRequiredElement("aiChatInput"),
        aiChatResetButton: getRequiredElement("aiChatResetButton"),
        aiChatSendButton: getRequiredElement("aiChatSendButton"),
        aiChatSuggestions: getRequiredElement("aiChatSuggestions"),
        aiChatStatus: getRequiredElement("aiChatStatus"),
        aiWidgetCloseButton: getRequiredElement("aiWidgetCloseButton"),
        aiWidgetLauncher: getRequiredElement("aiWidgetLauncher"),
        aiWidgetPanel: getRequiredElement("aiWidgetPanel"),
        addressesList: getRequiredElement("addressesList"),
        brandText: getRequiredElement("brandText"),
        cancelOrderButton: getRequiredElement("cancelOrderButton"),
        cancelOrderForm: getRequiredElement("cancelOrderForm"),
        cancelOrderModal: getRequiredElement("cancelOrderModal"),
        cancelOrderReason: getRequiredElement("cancelOrderReason"),
        cancelOrderSubtitle: getRequiredElement("cancelOrderSubtitle"),
        connectOrganisationForm: getRequiredElement("connectOrganisationForm"),
        createAddressForm: getRequiredElement("createAddressForm"),
        createOrderAddressId: getRequiredElement("createOrderAddressId"),
        createOrderBuyerEmail: getRequiredElement("createOrderBuyerEmail"),
        createOrderCurrency: getRequiredElement("createOrderCurrency"),
        createOrderForm: getRequiredElement("createOrderForm"),
        createOrderItems: getRequiredElement("createOrderItems"),
        createOrderNotice: getRequiredElement("createOrderNotice"),
        createOrderOrgName: getRequiredElement("createOrderOrgName"),
        createCatalogueItemForm: getRequiredElement("createCatalogueItemForm"),
        createOrgAddressId: getRequiredElement("createOrgAddressId"),
        createOrgSetupForm: getRequiredElement("createOrgSetupForm"),
        createOrganisationForm: getRequiredElement("createOrganisationForm"),
        catalogueCancelComposerButton: getRequiredElement("catalogueCancelComposerButton"),
        catalogueCreateCard: getRequiredElement("catalogueCreateCard"),
        catalogueCreateNotice: getRequiredElement("catalogueCreateNotice"),
        catalogueItemsList: getRequiredElement("catalogueItemsList"),
        catalogueNotice: getRequiredElement("catalogueNotice"),
        dashboardCreateOrderButton: getRequiredElement("dashboardCreateOrderButton"),
        deleteOrganisationButton: getRequiredElement("deleteOrganisationButton"),
        detailOrderHeading: getRequiredElement("detailOrderHeading"),
        detailOrderMeta: getRequiredElement("detailOrderMeta"),
        dismissCancelOrderButton: getRequiredElement("dismissCancelOrderButton"),
        downloadUblButton: getRequiredElement("downloadUblButton"),
        feedbackBanner: getRequiredElement("feedbackBanner"),
        goToWorkspaceFromOrders: getRequiredElement("goToWorkspaceFromOrders"),
        landingLoginButton: getRequiredElement("landingLoginButton"),
        landingRegisterButton: getRequiredElement("landingRegisterButton"),
        loginForm: getRequiredElement("loginForm"),
        loginToRegisterButton: getRequiredElement("loginToRegisterButton"),
        logoutButton: getRequiredElement("logoutButton"),
        manageMenuToggle: getRequiredElement("manageMenuToggle"),
        marketplaceCheckoutAddressId: getRequiredElement("marketplaceCheckoutAddressId"),
        marketplaceCheckoutForm: getRequiredElement("marketplaceCheckoutForm"),
        marketplaceCheckoutNotice: getRequiredElement("marketplaceCheckoutNotice"),
        marketplaceCheckoutSellerName: getRequiredElement("marketplaceCheckoutSellerName"),
        marketplaceCatalogueList: getRequiredElement("marketplaceCatalogueList"),
        marketplaceCartLines: getRequiredElement("marketplaceCartLines"),
        marketplaceDeliveryEnd: getRequiredElement("marketplaceDeliveryEnd"),
        marketplaceDeliveryStart: getRequiredElement("marketplaceDeliveryStart"),
        marketplaceNotice: getRequiredElement("marketplaceNotice"),
        marketplacePlaceOrderButton: getRequiredElement("marketplacePlaceOrderButton"),
        marketplaceSelectedSellerMeta: getRequiredElement("marketplaceSelectedSellerMeta"),
        marketplaceSelectedSellerName: getRequiredElement("marketplaceSelectedSellerName"),
        marketplaceSellerList: getRequiredElement("marketplaceSellerList"),
        marketplaceSubtotal: getRequiredElement("marketplaceSubtotal"),
        marketplaceTax: getRequiredElement("marketplaceTax"),
        marketplaceTotal: getRequiredElement("marketplaceTotal"),
        membersList: getRequiredElement("membersList"),
        openUpdateOrderButton: getRequiredElement("openUpdateOrderButton"),
        orderInfoOutput: getRequiredElement("orderInfoOutput"),
        ordersEmptyState: getRequiredElement("ordersEmptyState"),
        ordersList: getRequiredElement("ordersList"),
        ordersLoadingState: getRequiredElement("ordersLoadingState"),
        ordersNotice: getRequiredElement("ordersNotice"),
        privateNav: getRequiredElement("privateNav"),
        publicNav: getRequiredElement("publicNav"),
        refreshWorkspaceButton: getRequiredElement("refreshWorkspaceButton"),
        registerForm: getRequiredElement("registerForm"),
        registerToLoginButton: getRequiredElement("registerToLoginButton"),
        rejectReceivedOrderButton: getRequiredElement("rejectReceivedOrderButton"),
        sellerAcceptedCount: getRequiredElement("sellerAcceptedCount"),
        sellerActiveProductCount: getRequiredElement("sellerActiveProductCount"),
        sellerDashboardNotice: getRequiredElement("sellerDashboardNotice"),
        sellerDashboardOrgLabel: getRequiredElement("sellerDashboardOrgLabel"),
        sellerDetailOrderHeading: getRequiredElement("sellerDetailOrderHeading"),
        sellerDetailOrderMeta: getRequiredElement("sellerDetailOrderMeta"),
        sellerOrderInfoOutput: getRequiredElement("sellerOrderInfoOutput"),
        sellerOrderNotice: getRequiredElement("sellerOrderNotice"),
        sellerOrdersEmptyState: getRequiredElement("sellerOrdersEmptyState"),
        sellerOrdersList: getRequiredElement("sellerOrdersList"),
        sellerOrdersNotice: getRequiredElement("sellerOrdersNotice"),
        sellerOrdersStatusFilter: getRequiredElement("sellerOrdersStatusFilter"),
        sellerPendingCount: getRequiredElement("sellerPendingCount"),
        summarySubtotal: getRequiredElement("summarySubtotal"),
        summaryTax: getRequiredElement("summaryTax"),
        summaryTotal: getRequiredElement("summaryTotal"),
        createOrderSummaryLines: getRequiredElement("createOrderSummaryLines"),
        updateDeliveryEnd: getRequiredElement("updateDeliveryEnd"),
        updateDeliveryStart: getRequiredElement("updateDeliveryStart"),
        updateOrderAddressId: getRequiredElement("updateOrderAddressId"),
        updateOrderForm: getRequiredElement("updateOrderForm"),
        updateOrderHeading: getRequiredElement("updateOrderHeading"),
        updateOrderNotice: getRequiredElement("updateOrderNotice"),
        updateOrderStatus: getRequiredElement("updateOrderStatus"),
        updateOrgAddressId: getRequiredElement("updateOrgAddressId"),
        updateOrganisationForm: getRequiredElement("updateOrganisationForm"),
        updateOrgName: getRequiredElement("updateOrgName"),
        welcomeName: getRequiredElement("welcomeName"),
        workspaceBuyingButton: getRequiredElement("workspaceBuyingButton"),
        workspaceSellingButton: getRequiredElement("workspaceSellingButton"),
        workspaceSwitcher: getRequiredElement("workspaceSwitcher"),
        workspaceNotice: getRequiredElement("workspaceNotice")
      };
      var viewElements = {
        addresses: getRequiredElement("addressesView"),
        catalogue: getRequiredElement("catalogueView"),
        createOrg: getRequiredElement("createOrgView"),
        createOrder: getRequiredElement("createOrderView"),
        dashboard: getRequiredElement("dashboardView"),
        joinOrg: getRequiredElement("joinOrgView"),
        landing: getRequiredElement("landingView"),
        login: getRequiredElement("loginView"),
        marketplace: getRequiredElement("marketplaceView"),
        members: getRequiredElement("membersView"),
        organisation: getRequiredElement("organisationView"),
        orgChoice: getRequiredElement("orgChoiceView"),
        orderDetail: getRequiredElement("orderDetailView"),
        register: getRequiredElement("registerView"),
        sellerDashboard: getRequiredElement("sellerDashboardView"),
        sellerOrderDetail: getRequiredElement("sellerOrderDetailView"),
        sellerOrders: getRequiredElement("sellerOrdersView"),
        updateOrder: getRequiredElement("updateOrderView")
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
          setActiveOrgId(null);
          showFeedback("Account created. Next, set up your organisation.");
          await showView("orgChoice");
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      });
      elements.landingRegisterButton.addEventListener("click", async () => {
        await showView("register");
      });
      elements.landingLoginButton.addEventListener("click", async () => {
        await showView("login");
      });
      elements.loginToRegisterButton.addEventListener("click", async () => {
        await showView("register");
      });
      elements.registerToLoginButton.addEventListener("click", async () => {
        await showView("login");
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
          await showView(getAuthenticatedHomeView());
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
          aiChatHistory = [];
          currentMembers = [];
          currentOrgRole = null;
          currentWorkspaceMode = "buying";
          currentMarketplaceOrgs = [];
          currentSellerCatalogue = [];
          marketplaceSelectedSellerId = null;
          marketplaceCartItems = [];
          clearSellerOrderDetailPanel();
          clearOrderDetailPanel();
          showFeedback("You have been logged out.");
          await showView("landing");
        }
      });
      elements.refreshWorkspaceButton.addEventListener("click", async () => {
        await refreshWorkspaceData();
        showFeedback("Organisation data refreshed.");
      });
      elements.dashboardCreateOrderButton.addEventListener("click", async () => {
        await showView("marketplace");
      });
      elements.goToWorkspaceFromOrders.addEventListener("click", async () => {
        await showView(getActiveOrg() ? "organisation" : "orgChoice");
      });
      elements.workspaceBuyingButton.addEventListener("click", async () => {
        const activeOrgId = getActiveOrgId();
        if (!activeOrgId) {
          return;
        }
        rememberWorkspaceMode(activeOrgId, "buying");
        currentWorkspaceMode = "buying";
        marketplaceSelectedSellerId = null;
        marketplaceCartItems = [];
        await showView(getAuthenticatedHomeView());
      });
      elements.workspaceSellingButton.addEventListener("click", async () => {
        const activeOrgId = getActiveOrgId();
        if (!activeOrgId) {
          return;
        }
        rememberWorkspaceMode(activeOrgId, "selling");
        currentWorkspaceMode = "selling";
        await showView(getAuthenticatedHomeView());
      });
      elements.catalogueCancelComposerButton.addEventListener("click", () => {
        elements.createCatalogueItemForm.reset();
        setBannerMessage(elements.catalogueCreateNotice, "");
      });
      elements.aiWidgetLauncher.addEventListener("click", () => {
        openAiWidget();
        resizeAiChatInput();
        elements.aiChatInput.focus();
      });
      elements.aiWidgetCloseButton.addEventListener("click", () => {
        closeAiWidget();
      });
      elements.aiChatResetButton.addEventListener("click", () => {
        const activeOrgId = getActiveOrgId();
        if (!activeOrgId) {
          return;
        }
        stopAiTypingAnimation();
        aiStreamingReply = "";
        aiChatHistory = [];
        clearAiHistory(activeOrgId);
        renderAiChatHistory();
        resetAiInputHeight();
        elements.aiChatInput.focus();
      });
      elements.aiChatInput.addEventListener("input", () => {
        resizeAiChatInput();
      });
      elements.aiChatForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const activeOrg = getActiveOrg();
        if (!activeOrg) {
          showFeedback("Choose an organisation before using the assistant.");
          return;
        }
        const message = elements.aiChatInput.value.trim();
        if (!message || aiChatPending) {
          return;
        }
        openAiWidget();
        stopAiTypingAnimation();
        aiStreamingReply = "";
        const previousHistory = [...aiChatHistory];
        aiChatHistory = [...aiChatHistory, { content: message, role: "user" }];
        elements.aiChatInput.value = "";
        resetAiInputHeight();
        renderAiChatHistory();
        setAiChatPending(true);
        try {
          const payload = await apiRequest(
            `/v2/organisation/${activeOrg.orgId}/ai/chat`,
            {
              body: {
                message,
                messages: aiChatHistory
              },
              method: "POST"
            }
          );
          const nextMessages = normaliseAiChatHistory(payload.messages);
          const assistantReply = nextMessages[nextMessages.length - 1]?.role === "assistant" ? nextMessages[nextMessages.length - 1].content : payload.reply || "The assistant did not return a response.";
          await animateAssistantReply(assistantReply);
          aiChatHistory = nextMessages.length > 0 ? nextMessages : [
            ...previousHistory,
            { content: message, role: "user" },
            { content: assistantReply, role: "assistant" }
          ];
          saveAiHistory(activeOrg.orgId, aiChatHistory);
          renderAiChatHistory();
          setAiChatStatus("");
          await Promise.allSettled([loadOrders(), refreshWorkspaceData()]);
        } catch (error) {
          aiChatHistory = previousHistory;
          aiStreamingReply = "";
          renderAiChatHistory();
          const errorMessage = getErrorMessage(error);
          setAiChatStatus(errorMessage);
          showFeedback(errorMessage);
        } finally {
          setAiChatPending(false);
        }
      });
      elements.activeOrgSelect.addEventListener("change", async () => {
        const nextOrgId = parseInteger(elements.activeOrgSelect.value);
        if (nextOrgId) {
          setActiveOrgId(nextOrgId);
        } else {
          setActiveOrgId(null);
        }
        currentOrgRole = getStoredOrgRole(nextOrgId);
        currentWorkspaceMode = getStoredWorkspaceMode(nextOrgId);
        marketplaceSelectedSellerId = null;
        marketplaceCartItems = [];
        populateOrgSelectors();
        populateAddressSelectors();
        populateReadonlyFields();
        const currentView = getCurrentViewName();
        const nextView = sellerViews.includes(currentView) && !isSellerRole(currentOrgRole) ? getAuthenticatedHomeView() : currentView;
        await showView(nextView);
      });
      elements.connectOrganisationForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = getFormData(event.currentTarget);
        const orgId = parseInteger(getFormValue(form, "orgId"));
        if (!orgId) {
          showFeedback("Enter a valid organisation ID to connect it.");
          return;
        }
        const orgName = getFormValue(form, "orgName") || `Organisation #${orgId}`;
        rememberKnownOrg({ orgId, orgName });
        setActiveOrgId(orgId);
        currentOrgRole = getStoredOrgRole(orgId);
        rememberWorkspaceMode(orgId, getStoredWorkspaceMode(orgId));
        currentWorkspaceMode = getStoredWorkspaceMode(orgId);
        elements.connectOrganisationForm.reset();
        populateOrgSelectors();
        await refreshWorkspaceData();
        showFeedback(`Connected ${getOrgLabel({ orgId, orgName })}.`);
        await showView(getAuthenticatedHomeView());
      });
      elements.createOrgSetupForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = getFormData(event.currentTarget);
        const orgName = getFormValue(form, "orgName");
        try {
          const addressPayload = await apiRequest("/v2/address", {
            body: {
              city: getFormValue(form, "city") || void 0,
              country: getFormValue(form, "country") || "AUS",
              postcode: getFormValue(form, "postcode") || void 0,
              street: getFormValue(form, "street")
            },
            method: "POST"
          });
          if (!addressPayload.addressId) {
            throw new Error("Address created, but no address ID was returned.");
          }
          const address = await fetchAddressById(addressPayload.addressId);
          rememberAddress(address);
          const organisationPayload = await apiRequest("/v2/organisation", {
            body: {
              addressId: addressPayload.addressId,
              orgName
            },
            method: "POST"
          });
          if (!organisationPayload.orgId) {
            throw new Error("Organisation created, but no org ID was returned.");
          }
          rememberKnownOrg({ orgId: organisationPayload.orgId, orgName });
          setActiveOrgId(organisationPayload.orgId);
          currentOrgRole = "OWNER";
          rememberOrgRole(organisationPayload.orgId, "OWNER");
          rememberWorkspaceMode(organisationPayload.orgId, "buying");
          currentWorkspaceMode = "buying";
          elements.createOrgSetupForm.reset();
          const countryField = document.getElementById("setupCountry");
          if (countryField) {
            countryField.value = "AUS";
          }
          populateOrgSelectors();
          populateAddressSelectors();
          await refreshWorkspaceData();
          showFeedback(`Organisation ${orgName} created successfully.`);
          await showView(getAuthenticatedHomeView());
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      });
      elements.createAddressForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = getFormData(event.currentTarget);
        try {
          const payload = await apiRequest("/v2/address", {
            body: {
              city: getFormValue(form, "city") || void 0,
              country: getFormValue(form, "country") || "AUS",
              postcode: getFormValue(form, "postcode") || void 0,
              street: getFormValue(form, "street")
            },
            method: "POST"
          });
          if (!payload.addressId) {
            throw new Error("Address created, but no address ID was returned.");
          }
          const address = await fetchAddressById(payload.addressId);
          rememberAddress(address);
          elements.createAddressForm.reset();
          const countryField = document.getElementById("addressCountry");
          if (countryField) {
            countryField.value = "AUS";
          }
          renderAddressBook();
          populateAddressSelectors();
          showFeedback(`Address #${payload.addressId} created successfully.`);
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      });
      elements.createOrganisationForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = getFormData(event.currentTarget);
        const addressId = parseInteger(getFormValue(form, "addressId"));
        const orgName = getFormValue(form, "orgName");
        if (!addressId) {
          showFeedback("Create an address first, then choose it for the organisation.");
          return;
        }
        try {
          const payload = await apiRequest("/v2/organisation", {
            body: {
              addressId,
              orgName
            },
            method: "POST"
          });
          if (!payload.orgId) {
            throw new Error("Organisation created, but no org ID was returned.");
          }
          rememberKnownOrg({ orgId: payload.orgId, orgName });
          setActiveOrgId(payload.orgId);
          currentOrgRole = "OWNER";
          rememberOrgRole(payload.orgId, "OWNER");
          rememberWorkspaceMode(payload.orgId, "buying");
          currentWorkspaceMode = "buying";
          elements.createOrganisationForm.reset();
          populateOrgSelectors();
          await refreshWorkspaceData();
          showFeedback(`Organisation ${orgName} created successfully.`);
          await showView(getAuthenticatedHomeView());
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      });
      elements.updateOrganisationForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const activeOrg = getActiveOrg();
        const form = getFormData(event.currentTarget);
        const addressId = parseInteger(getFormValue(form, "addressId"));
        const orgName = getFormValue(form, "orgName");
        if (!activeOrg) {
          showFeedback("Choose an organisation before updating it.");
          return;
        }
        if (!addressId) {
          showFeedback("Choose a registered address for the organisation.");
          return;
        }
        try {
          await apiRequest(`/v2/organisation/${activeOrg.orgId}`, {
            body: {
              addressId,
              orgName
            },
            method: "PUT"
          });
          rememberKnownOrg({ orgId: activeOrg.orgId, orgName });
          populateOrgSelectors();
          showFeedback("Organisation details updated.");
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      });
      elements.deleteOrganisationButton.addEventListener("click", async () => {
        const activeOrg = getActiveOrg();
        if (!activeOrg) {
          showFeedback("Choose an organisation before deleting it.");
          return;
        }
        const confirmed = window.confirm(
          `Delete ${getOrgLabel(activeOrg)}? This only works when no orders are attached.`
        );
        if (!confirmed) {
          return;
        }
        try {
          await apiRequest(`/v2/organisation/${activeOrg.orgId}`, {
            method: "DELETE"
          });
          removeKnownOrg(activeOrg.orgId);
          const nextOrgs = getKnownOrgs();
          setActiveOrgId(nextOrgs[0]?.orgId ?? null);
          currentMembers = [];
          await refreshWorkspaceData();
          showFeedback(`${activeOrg.orgName} was deleted.`);
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      });
      elements.addMemberForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const activeOrg = getActiveOrg();
        const form = getFormData(event.currentTarget);
        const email = getFormValue(form, "email");
        const makeAdmin = form.get("makeAdmin") === "on";
        if (!activeOrg) {
          showFeedback("Choose an organisation before adding team members.");
          return;
        }
        try {
          await apiRequest(`/v2/organisation/${activeOrg.orgId}/members`, {
            body: { email },
            method: "POST"
          });
          await refreshWorkspaceData();
          if (makeAdmin) {
            const newMember = currentMembers.find(
              (member) => member.email.toLowerCase() === email.toLowerCase()
            );
            if (newMember) {
              await apiRequest(`/v2/organisation/${activeOrg.orgId}/members/${newMember.contactId}`, {
                body: { role: "ADMIN" },
                method: "PUT"
              });
              await refreshWorkspaceData();
            }
          }
          elements.addMemberForm.reset();
          showFeedback(`Added ${email} to ${activeOrg.orgName}.`);
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      });
      elements.createCatalogueItemForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const activeOrgId = getActiveOrgId();
        if (!activeOrgId) {
          showFeedback("Choose an organisation before creating catalogue items.");
          return;
        }
        const submitButton = elements.createCatalogueItemForm.querySelector(
          'button[type="submit"]'
        );
        const previousButtonLabel = submitButton?.textContent || "Add Item";
        try {
          const form = getFormData(event.currentTarget);
          setBannerMessage(elements.catalogueCreateNotice, "Creating catalogue item...");
          if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Creating...";
          }
          await apiRequest(`/v3/organisation/${activeOrgId}/catalogue`, {
            body: {
              description: getFormValue(form, "description") || void 0,
              name: getFormValue(form, "name"),
              price: parseNumber(getFormValue(form, "price"))
            },
            method: "POST"
          });
          elements.createCatalogueItemForm.reset();
          await Promise.allSettled([loadCatalogueManager(), loadSellerDashboardData()]);
          setBannerMessage(elements.catalogueCreateNotice, "Catalogue item created successfully.");
          showFeedback("Catalogue item created successfully.");
        } catch (error) {
          setBannerMessage(elements.catalogueCreateNotice, getErrorMessage(error));
          showFeedback(getErrorMessage(error));
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = previousButtonLabel;
          }
        }
      });
      elements.marketplaceCheckoutForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const activeOrgId = getActiveOrgId();
        const selectedSeller = getMarketplaceSelectedSeller();
        const submitButton = elements.marketplacePlaceOrderButton;
        const previousButtonLabel = submitButton.textContent || "Submit Order Request";
        if (!activeOrgId) {
          showFeedback("Create or join an organisation before placing an order.");
          return;
        }
        if (!selectedSeller) {
          showFeedback("Choose a seller before submitting an order request.");
          return;
        }
        if (marketplaceCartItems.length === 0) {
          showFeedback("Add at least one catalogue item before submitting an order.");
          return;
        }
        try {
          const form = getFormData(event.currentTarget);
          setBannerMessage(elements.marketplaceCheckoutNotice, "Submitting order request...");
          submitButton.disabled = true;
          submitButton.textContent = "Submitting...";
          const { deliveryAddressId, deliveryStart, deliveryEnd } = validateMarketplaceCheckoutForm(form);
          const response = await apiRequest(`/v3/organisation/${activeOrgId}/order`, {
            body: {
              deliveryAddressId,
              items: marketplaceCartItems.map((item) => ({
                catalogueItemId: item.catalogueItemId,
                quantity: item.quantity
              })),
              reqDeliveryPeriod: {
                endDateTime: deliveryEnd,
                startDateTime: deliveryStart
              },
              sellerOrgId: selectedSeller.orgId
            },
            method: "POST"
          });
          marketplaceCartItems = [];
          renderMarketplaceCart();
          elements.marketplaceCheckoutForm.reset();
          populateAddressSelectors();
          setBannerMessage(
            elements.marketplaceCheckoutNotice,
            response.orderId ? `Order ${response.orderId} submitted for seller approval.` : "Order request submitted for seller approval."
          );
          showFeedback(
            response.orderId ? `Order ${response.orderId} submitted for seller approval.` : "Order request submitted for seller approval."
          );
          await showView("dashboard");
        } catch (error) {
          setBannerMessage(elements.marketplaceCheckoutNotice, getErrorMessage(error));
          showFeedback(getErrorMessage(error));
        } finally {
          submitButton.disabled = marketplaceCartItems.length === 0 || !getMarketplaceSelectedSeller();
          submitButton.textContent = previousButtonLabel;
        }
      });
      elements.sellerOrdersStatusFilter.addEventListener("change", async () => {
        try {
          await loadSellerOrders();
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      });
      elements.acceptReceivedOrderButton.addEventListener("click", async () => {
        const orderId = currentSellerOrderDetail?.orderId;
        if (!orderId) {
          showFeedback("Choose a received order before accepting it.");
          return;
        }
        try {
          await performSellerOrderAction(orderId, "accept");
          showFeedback(`Order ${orderId} accepted.`);
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      });
      elements.rejectReceivedOrderButton.addEventListener("click", async () => {
        const orderId = currentSellerOrderDetail?.orderId;
        if (!orderId) {
          showFeedback("Choose a received order before rejecting it.");
          return;
        }
        const reason = window.prompt("Why are you rejecting this order?", "Out of stock");
        if (!reason) {
          return;
        }
        try {
          await performSellerOrderAction(orderId, "reject", reason);
          showFeedback(`Order ${orderId} rejected.`);
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      });
      elements.createOrderCurrency.addEventListener("change", () => {
        updateCreateOrderSummary();
      });
      elements.addOrderItemButton.addEventListener("click", () => {
        syncCreateOrderItemsFromDom();
        createOrderItems = [...createOrderItems, getDefaultOrderItem()];
        renderCreateOrderItems();
        updateCreateOrderSummary();
      });
      elements.createOrderItems.addEventListener("input", () => {
        updateCreateOrderSummary();
      });
      elements.marketplaceCartLines.addEventListener("input", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !target.dataset.marketplaceQty) {
          return;
        }
        const itemId = Number(target.dataset.marketplaceQty);
        const item = marketplaceCartItems.find((entry) => entry.catalogueItemId === itemId);
        if (!item) {
          return;
        }
        item.quantity = Math.max(1, Math.floor(parseNumber(target.value || "1")));
        renderMarketplaceCart();
      });
      elements.createOrderForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const activeOrg = getActiveOrg();
        if (!activeOrg) {
          showFeedback("Create or join an organisation before creating orders.");
          return;
        }
        try {
          const payload = buildCreateOrderPayload(getFormData(event.currentTarget));
          const response = await apiRequest(
            `/v2/organisation/${activeOrg.orgId}/order`,
            {
              body: payload,
              method: "POST"
            }
          );
          if (!response.orderId) {
            throw new Error("Order created, but no order ID was returned.");
          }
          showFeedback(`Order ${response.orderId} created successfully.`);
          await showView("dashboard");
          await loadOrderDetail(response.orderId);
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      });
      elements.updateOrderForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const activeOrg = getActiveOrg();
        if (!activeOrg) {
          showFeedback("Choose an organisation before updating an order.");
          return;
        }
        if (!currentOrderDetail?.orderId) {
          showFeedback("Load an order before opening the update screen.");
          return;
        }
        try {
          const payload = buildUpdateOrderPayload(getFormData(event.currentTarget));
          await apiRequest(`/v2/organisation/${activeOrg.orgId}/order/${currentOrderDetail.orderId}`, {
            body: payload,
            method: "PUT"
          });
          showFeedback(`Order ${currentOrderDetail.orderId} updated successfully.`);
          await showView("dashboard");
          await loadOrders();
          await loadOrderDetail(currentOrderDetail.orderId);
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      });
      elements.downloadUblButton.addEventListener("click", async () => {
        const activeOrg = getActiveOrg();
        const orderId = currentOrderDetail?.orderId;
        if (!activeOrg || !orderId) {
          showFeedback("Choose an order before downloading its UBL document.");
          return;
        }
        try {
          const payload = await apiRequest(
            `/v2/organisation/${activeOrg.orgId}/order/${orderId}/ubl`
          );
          if (!payload.signedUrl) {
            throw new Error("No signed UBL URL was returned.");
          }
          window.open(payload.signedUrl, "_blank", "noopener,noreferrer");
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      });
      elements.cancelOrderButton.addEventListener("click", () => {
        if (!currentOrderDetail?.orderId) {
          showFeedback("Choose an order before cancelling it.");
          return;
        }
        openCancelOrderModal();
      });
      elements.dismissCancelOrderButton.addEventListener("click", () => {
        closeCancelOrderModal();
      });
      elements.cancelOrderForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const activeOrg = getActiveOrg();
        const orderId = currentOrderDetail?.orderId;
        if (!activeOrg || !orderId) {
          showFeedback("Choose an order before cancelling it.");
          return;
        }
        const form = getFormData(event.currentTarget);
        const reason = getFormValue(form, "reason");
        if (!reason) {
          showFeedback("Please explain why you want to cancel this order.");
          return;
        }
        try {
          await apiRequest(`/v2/organisation/${activeOrg.orgId}/order/${orderId}`, {
            body: { reason },
            method: "DELETE"
          });
          closeCancelOrderModal();
          showFeedback(`Order ${orderId} was cancelled.`);
          await showView("dashboard");
          await loadOrders();
        } catch (error) {
          showFeedback(getErrorMessage(error));
        }
      });
      elements.openUpdateOrderButton.addEventListener("click", async () => {
        await openUpdateOrderView();
      });
      document.addEventListener("click", async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const navButton = target.closest("[data-nav-target]");
        if (navButton?.dataset.navTarget) {
          const nextView = navButton.dataset.navTarget;
          closeHeaderMenus();
          if (nextView === "updateOrder" && currentOrderDetail) {
            prepareUpdateOrderView(currentOrderDetail);
          }
          await showView(nextView);
          return;
        }
        const viewButton = target.closest("[data-order-view]");
        if (viewButton?.dataset.orderView) {
          closeHeaderMenus();
          await openOrderDetailView(viewButton.dataset.orderView);
          return;
        }
        const updateButton = target.closest("[data-order-update]");
        if (updateButton?.dataset.orderUpdate) {
          closeHeaderMenus();
          await openUpdateOrderView(updateButton.dataset.orderUpdate);
          return;
        }
        const marketplaceSellerButton = target.closest("[data-marketplace-seller]");
        if (marketplaceSellerButton?.dataset.marketplaceSeller) {
          marketplaceSelectedSellerId = Number(marketplaceSellerButton.dataset.marketplaceSeller);
          marketplaceCartItems = [];
          try {
            await loadCatalogueForSeller(marketplaceSelectedSellerId);
            renderMarketplaceSellerList();
            renderMarketplaceCatalogue();
            renderMarketplaceCart();
          } catch (error) {
            showFeedback(getErrorMessage(error));
          }
          return;
        }
        const marketplaceAddButton = target.closest("[data-marketplace-add]");
        if (marketplaceAddButton?.dataset.marketplaceAdd) {
          const itemId = Number(marketplaceAddButton.dataset.marketplaceAdd);
          const item = currentSellerCatalogue.find((entry) => entry.catalogueItemId === itemId);
          if (!item) {
            showFeedback("That catalogue item is no longer available.");
            return;
          }
          const existing = marketplaceCartItems.find((entry) => entry.catalogueItemId === itemId);
          if (existing) {
            existing.quantity += 1;
          } else {
            marketplaceCartItems = [
              ...marketplaceCartItems,
              {
                catalogueItemId: item.catalogueItemId,
                description: item.description || "",
                name: item.name,
                price: item.price,
                quantity: 1
              }
            ];
          }
          renderMarketplaceCart();
          return;
        }
        const marketplaceRemoveButton = target.closest("[data-marketplace-remove]");
        if (marketplaceRemoveButton?.dataset.marketplaceRemove) {
          const itemId = Number(marketplaceRemoveButton.dataset.marketplaceRemove);
          marketplaceCartItems = marketplaceCartItems.filter((entry) => entry.catalogueItemId !== itemId);
          renderMarketplaceCart();
          return;
        }
        const sellerOrderViewButton = target.closest("[data-seller-order-view]");
        if (sellerOrderViewButton?.dataset.sellerOrderView) {
          await openSellerOrderDetailView(sellerOrderViewButton.dataset.sellerOrderView);
          return;
        }
        const sellerOrderAcceptButton = target.closest("[data-seller-order-accept]");
        if (sellerOrderAcceptButton?.dataset.sellerOrderAccept) {
          const orderId = sellerOrderAcceptButton.dataset.sellerOrderAccept;
          try {
            await performSellerOrderAction(orderId, "accept");
            showFeedback(`Order ${orderId} accepted.`);
          } catch (error) {
            showFeedback(getErrorMessage(error));
          }
          return;
        }
        const sellerOrderRejectButton = target.closest("[data-seller-order-reject]");
        if (sellerOrderRejectButton?.dataset.sellerOrderReject) {
          const orderId = sellerOrderRejectButton.dataset.sellerOrderReject;
          const reason = window.prompt("Why are you rejecting this order?", "Out of stock");
          if (!reason) {
            return;
          }
          try {
            await performSellerOrderAction(orderId, "reject", reason);
            showFeedback(`Order ${orderId} rejected.`);
          } catch (error) {
            showFeedback(getErrorMessage(error));
          }
          return;
        }
        const catalogueEditButton = target.closest("[data-catalogue-edit]");
        if (catalogueEditButton?.dataset.catalogueEdit) {
          const activeOrgId = getActiveOrgId();
          const itemId = Number(catalogueEditButton.dataset.catalogueEdit);
          const item = currentSellerCatalogue.find((entry) => entry.catalogueItemId === itemId);
          if (!activeOrgId || !item) {
            showFeedback("Unable to edit that catalogue item right now.");
            return;
          }
          const name = window.prompt("Item name", item.name);
          if (name === null) {
            return;
          }
          const description = window.prompt("Description", item.description || "") ?? "";
          const priceText = window.prompt("Price", String(item.price));
          if (priceText === null) {
            return;
          }
          try {
            await apiRequest(`/v3/organisation/${activeOrgId}/catalogue/${itemId}`, {
              body: {
                description,
                name,
                price: parseNumber(priceText)
              },
              method: "PUT"
            });
            await Promise.allSettled([loadCatalogueManager(), loadSellerDashboardData()]);
            showFeedback("Catalogue item updated.");
          } catch (error) {
            showFeedback(getErrorMessage(error));
          }
          return;
        }
        const catalogueDeleteButton = target.closest("[data-catalogue-delete]");
        if (catalogueDeleteButton?.dataset.catalogueDelete) {
          const activeOrgId = getActiveOrgId();
          const itemId = Number(catalogueDeleteButton.dataset.catalogueDelete);
          if (!activeOrgId) {
            showFeedback("Choose an organisation before managing catalogue items.");
            return;
          }
          const confirmed = window.confirm(
            "Deactivate this catalogue item? Buyers will stop seeing it immediately."
          );
          if (!confirmed) {
            return;
          }
          try {
            await apiRequest(`/v3/organisation/${activeOrgId}/catalogue/${itemId}`, {
              method: "DELETE"
            });
            await Promise.allSettled([loadCatalogueManager(), loadSellerDashboardData()]);
            showFeedback("Catalogue item deactivated.");
          } catch (error) {
            showFeedback(getErrorMessage(error));
          }
          return;
        }
        const suggestionButton = target.closest("[data-ai-suggestion]");
        if (suggestionButton?.dataset.aiSuggestion) {
          if (aiChatPending) {
            return;
          }
          elements.aiChatInput.value = suggestionButton.dataset.aiSuggestion;
          elements.aiChatForm.requestSubmit();
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
        const memberSaveButton = target.closest("[data-member-save]");
        if (memberSaveButton?.dataset.memberSave) {
          const activeOrgId = getActiveOrgId();
          const userId = Number(memberSaveButton.dataset.memberSave);
          const roleSelect = document.querySelector(
            `[data-member-role="${userId}"]`
          );
          if (!activeOrgId || !roleSelect) {
            showFeedback("Unable to save the member role right now.");
            return;
          }
          try {
            await apiRequest(`/v2/organisation/${activeOrgId}/members/${userId}`, {
              body: { role: roleSelect.value },
              method: "PUT"
            });
            await refreshWorkspaceData();
            showFeedback("Member role updated.");
          } catch (error) {
            showFeedback(getErrorMessage(error));
          }
          return;
        }
        const memberRemoveButton = target.closest("[data-member-remove]");
        if (memberRemoveButton?.dataset.memberRemove) {
          const activeOrg = getActiveOrg();
          const userId = Number(memberRemoveButton.dataset.memberRemove);
          if (!activeOrg) {
            showFeedback("Choose an organisation before removing members.");
            return;
          }
          const confirmed = window.confirm("Remove this member from the organisation?");
          if (!confirmed) {
            return;
          }
          try {
            await apiRequest(`/v2/organisation/${activeOrg.orgId}/members/${userId}`, {
              method: "DELETE"
            });
            await refreshWorkspaceData();
            showFeedback("Member removed.");
          } catch (error) {
            showFeedback(getErrorMessage(error));
          }
          return;
        }
        const addressEditButton = target.closest("[data-address-edit]");
        if (addressEditButton?.dataset.addressEdit) {
          const addressId = Number(addressEditButton.dataset.addressEdit);
          const address = getKnownAddresses().find((entry) => entry.addressID === addressId);
          if (!address) {
            showFeedback("Address not found in local address book.");
            return;
          }
          const street = window.prompt("Street", address.street);
          if (street === null) {
            return;
          }
          const city = window.prompt("City", address.city || "") || "";
          const postcode = window.prompt("Postcode", address.postcode || "") || "";
          const country = window.prompt("Country", address.country || "AUS") || "AUS";
          try {
            await apiRequest(`/v2/address/${addressId}`, {
              body: {
                city: city || void 0,
                country: country || void 0,
                postcode: postcode || void 0,
                street: street || void 0
              },
              method: "PUT"
            });
            const refreshed = await fetchAddressById(addressId);
            rememberAddress(refreshed);
            renderAddressBook();
            populateAddressSelectors(currentOrderDetail?.deliveryAddressId);
            showFeedback(`Address #${addressId} updated.`);
          } catch (error) {
            showFeedback(getErrorMessage(error));
          }
          return;
        }
        const addressDeleteButton = target.closest("[data-address-delete]");
        if (addressDeleteButton?.dataset.addressDelete) {
          const addressId = Number(addressDeleteButton.dataset.addressDelete);
          const confirmed = window.confirm(
            "Delete this address? This only works if it is not linked to an organisation or order."
          );
          if (!confirmed) {
            return;
          }
          try {
            await apiRequest(`/v2/address/${addressId}`, {
              method: "DELETE"
            });
            removeKnownAddress(addressId);
            renderAddressBook();
            populateAddressSelectors(currentOrderDetail?.deliveryAddressId);
            showFeedback(`Address #${addressId} deleted.`);
          } catch (error) {
            showFeedback(getErrorMessage(error));
          }
        }
      });
      document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        if (target === elements.cancelOrderModal) {
          closeCancelOrderModal();
          return;
        }
        if (target.closest(".nav-menu, .account-menu")) {
          return;
        }
        closeHeaderMenus();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !elements.cancelOrderModal.classList.contains("hidden")) {
          closeCancelOrderModal();
        }
      });
      resetAiInputHeight();
      if (getSession()) {
        void showView(getAuthenticatedHomeView());
      } else {
        void showView("landing");
      }
    }
  });
  require_app();
})();
