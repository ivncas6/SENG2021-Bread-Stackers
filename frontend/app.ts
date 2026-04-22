type ViewName = 'landing' | 'login' | 'register' | 'dashboard' | 'createOrder';

type ApiRequestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
  useSession?: boolean;
};

type JsonRecord = Record<string, unknown>;

type SessionResponse = JsonRecord & {
  session?: string;
};

type OrderCreateResponse = JsonRecord & {
  orderId?: string;
};

type StoredProfile = {
  email: string;
  firstName: string;
  lastName: string;
  telephone?: string;
};

type OrderSummary = {
  currency: string;
  finalPrice: number | string;
  issuedDate: string;
  orderId: string;
  status: string;
};

type OrderDetail = JsonRecord & {
  address?: string;
  currency?: string;
  deliveryDetails?: {
    endDateTime?: number;
    startDateTime?: number;
  };
  finalPrice?: number | string;
  issuedDate?: string;
  items?: Array<{
    description?: string;
    name?: string;
    quantity?: number;
    unitPrice?: number;
  }>;
  orderId?: string;
  status?: string;
};

type CreateOrderItemDraft = {
  description: string;
  id: number;
  name: string;
  quantity: number;
  unitPrice: number;
};

const storageKeys = {
  profile: 'breadstackers.profile',
  session: 'breadstackers.session',
} as const;

const feedbackDurationMs = 3200;
const gstRate = 0.1;

let feedbackTimeoutId: number | undefined;
let nextOrderItemId = 1;
let createOrderItems: CreateOrderItemDraft[] = [];

function getRequiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element as T;
}

function getFormData(target: EventTarget | null): FormData {
  if (!(target instanceof HTMLFormElement)) {
    throw new Error('Expected form submission from an HTMLFormElement.');
  }

  return new FormData(target);
}

function getFormValue(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function titleCase(value: string): string {
  if (!value) {
    return 'there';
  }

  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getSession(): string {
  return localStorage.getItem(storageKeys.session) || '';
}

function setSession(session: string): void {
  if (session) {
    localStorage.setItem(storageKeys.session, session);
  } else {
    localStorage.removeItem(storageKeys.session);
  }
}

function getStoredProfile(): StoredProfile | null {
  const rawProfile = localStorage.getItem(storageKeys.profile);

  if (!rawProfile) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawProfile) as StoredProfile;

    if (!parsed.email) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function setStoredProfile(profile: StoredProfile): void {
  localStorage.setItem(storageKeys.profile, JSON.stringify(profile));
}

function clearAuthState(): void {
  localStorage.removeItem(storageKeys.session);
  localStorage.removeItem(storageKeys.profile);
}

function getDisplayName(): string {
  const profile = getStoredProfile();

  if (profile?.firstName) {
    return titleCase(profile.firstName);
  }

  if (profile?.email) {
    return titleCase(profile.email.split('@')[0] || 'there');
  }

  return 'there';
}

function buildProxyUrl(path: string): string {
  const proxyUrl = new URL('/api/proxy', window.location.origin);
  proxyUrl.searchParams.set('path', path);
  return proxyUrl.toString();
}

async function apiRequest<T extends JsonRecord = JsonRecord>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const session = getSession();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.useSession === false ? {} : session ? { session } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(buildProxyUrl(path), {
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers,
    method: options.method || 'GET',
  });

  const rawText = await response.text();
  let payload: unknown;

  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = { rawText };
  }

  if (!response.ok) {
    if (isJsonRecord(payload) && typeof payload.error === 'string') {
      throw new Error(payload.error);
    }

    throw new Error(`Request failed with status ${response.status}`);
  }

  if (!isJsonRecord(payload)) {
    return { rawText: rawText || String(payload) } as unknown as T;
  }

  return payload as T;
}

function showFeedback(message: string): void {
  elements.feedbackBanner.textContent = message;
  elements.feedbackBanner.classList.remove('hidden');

  if (feedbackTimeoutId) {
    window.clearTimeout(feedbackTimeoutId);
  }

  feedbackTimeoutId = window.setTimeout(() => {
    elements.feedbackBanner.classList.add('hidden');
  }, feedbackDurationMs);
}

function formatCurrency(currency: string, amount: number | string): string {
  const numericAmount = typeof amount === 'number' ? amount : Number(amount);

  if (Number.isNaN(numericAmount)) {
    return `${currency} ${amount}`;
  }

  return new Intl.NumberFormat('en-AU', {
    currency,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(numericAmount);
}

function formatDisplayDate(value: string): string {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

function formatDetailDate(epochMillis: number | undefined): string {
  if (!epochMillis) {
    return 'N/A';
  }

  const parsedDate = new Date(epochMillis);

  if (Number.isNaN(parsedDate.getTime())) {
    return String(epochMillis);
  }

  return parsedDate.toLocaleString('en-AU');
}

function getStatusClass(status: string): string {
  const normalised = status.trim().toLowerCase();

  if (normalised === 'cancelled') {
    return 'status-cancelled';
  }

  if (normalised === 'delivered' || normalised === 'complete') {
    return 'status-delivered';
  }

  if (normalised === 'pending') {
    return 'status-pending';
  }

  if (normalised === 'processing') {
    return 'status-processing';
  }

  return 'status-open';
}

function setOrdersLoadingState(isLoading: boolean): void {
  elements.ordersLoadingState.classList.toggle('hidden', !isLoading);
  elements.ordersList.classList.toggle('hidden', isLoading);
  elements.ordersEmptyState.classList.add('hidden');
}

function updateNavigationState(activeView: ViewName): void {
  document.querySelectorAll<HTMLElement>('[data-nav-target]').forEach((button) => {
    const target = button.dataset.navTarget as ViewName | undefined;
    button.classList.toggle('is-active', target === activeView && getSession().length > 0);
  });
}

function updateAuthChrome(): void {
  const authenticated = Boolean(getSession());
  elements.publicNav.classList.toggle('hidden', authenticated);
  elements.privateNav.classList.toggle('hidden', !authenticated);
  elements.welcomeName.textContent = getDisplayName();
}

function renderOrders(orders: OrderSummary[] | undefined): void {
  if (!orders || orders.length === 0) {
    elements.ordersList.innerHTML = '';
    elements.ordersEmptyState.classList.remove('hidden');
    elements.ordersList.classList.add('hidden');
    return;
  }

  elements.ordersEmptyState.classList.add('hidden');
  elements.ordersList.classList.remove('hidden');
  elements.ordersList.innerHTML = orders.map((order) => `
    <article class="order-row">
      <div class="order-id">${escapeHtml(order.orderId)}</div>
      <div>
        <span class="status-pill ${getStatusClass(order.status)}">${escapeHtml(order.status)}</span>
      </div>
      <div>${escapeHtml(formatDisplayDate(order.issuedDate))}</div>
      <div class="price-cell">${escapeHtml(formatCurrency(order.currency, order.finalPrice))}</div>
      <button class="view-order-button" type="button" data-order-id="${escapeHtml(order.orderId)}">
        <span aria-hidden="true">◉</span>
        View
      </button>
    </article>
  `).join('');
}

function formatOrderDetail(detail: OrderDetail): string {
  const items = detail.items?.map((item, index) => {
    const quantity = item.quantity ?? 0;
    const unitPrice = item.unitPrice ?? 0;
    const lineTotal = quantity * unitPrice;

    return [
      `Item ${index + 1}`,
      `  Name: ${item.name || 'Unnamed item'}`,
      `  Description: ${item.description || 'No description'}`,
      `  Quantity: ${quantity}`,
      `  Unit Price: ${formatCurrency(detail.currency || 'AUD', unitPrice)}`,
      `  Line Total: ${formatCurrency(detail.currency || 'AUD', lineTotal)}`,
    ].join('\n');
  }).join('\n\n');

  return [
    `Order ID: ${detail.orderId || 'N/A'}`,
    `Status: ${detail.status || 'N/A'}`,
    `Issued Date: ${detail.issuedDate || 'N/A'}`,
    `Final Price: ${formatCurrency(detail.currency || 'AUD', detail.finalPrice || 0)}`,
    '',
    'Delivery',
    `  Address: ${detail.address || 'N/A'}`,
    `  Start: ${formatDetailDate(detail.deliveryDetails?.startDateTime)}`,
    `  End: ${formatDetailDate(detail.deliveryDetails?.endDateTime)}`,
    '',
    'Items',
    items || '  No item lines available.',
  ].join('\n');
}

async function loadOrderDetail(orderId: string): Promise<void> {
  try {
    const payload = await apiRequest<OrderDetail>(`/v0/order/${orderId}`);
    elements.detailOrderHeading.textContent = orderId;
    elements.orderInfoOutput.textContent = formatOrderDetail(payload);
    elements.orderDetailPanel.classList.remove('hidden');
  } catch (error) {
    showFeedback(getErrorMessage(error));
  }
}

async function loadOrders(): Promise<void> {
  setOrdersLoadingState(true);

  try {
    const payload = await apiRequest<{ orders?: OrderSummary[] }>('/v0/order/list');
    renderOrders(payload.orders);
  } catch (error) {
    elements.ordersList.innerHTML = '';
    elements.ordersEmptyState.classList.remove('hidden');
    elements.ordersEmptyState.innerHTML = `
      <h3>Unable to load orders</h3>
      <p>${escapeHtml(getErrorMessage(error))}</p>
    `;
  } finally {
    elements.ordersLoadingState.classList.add('hidden');
  }
}

function buildProfileFromForm(form: FormData): StoredProfile {
  return {
    email: getFormValue(form, 'email'),
    firstName: getFormValue(form, 'firstName'),
    lastName: getFormValue(form, 'lastName'),
    telephone: getFormValue(form, 'telephone'),
  };
}

function buildProfileFromEmail(email: string): StoredProfile {
  const inferredName = titleCase(email.split('@')[0] || 'Customer');

  return {
    email,
    firstName: inferredName,
    lastName: '',
    telephone: '',
  };
}

function getDefaultOrderItem(): CreateOrderItemDraft {
  const item: CreateOrderItemDraft = {
    description: '',
    id: nextOrderItemId,
    name: '',
    quantity: 1,
    unitPrice: 0,
  };

  nextOrderItemId += 1;
  return item;
}

function ensureOrderItems(): void {
  if (createOrderItems.length === 0) {
    createOrderItems = [getDefaultOrderItem()];
  }
}

function syncCreateOrderItemsFromDom(): void {
  const itemNodes = elements.createOrderItems.querySelectorAll<HTMLElement>('.order-item-card');

  if (itemNodes.length === 0) {
    ensureOrderItems();
    return;
  }

  createOrderItems = Array.from(itemNodes).map((node) => {
    const itemId = Number(node.dataset.itemId);
    const nameInput = node.querySelector<HTMLInputElement>('[data-field="name"]');
    const descriptionInput = node.querySelector<HTMLInputElement>('[data-field="description"]');
    const unitPriceInput = node.querySelector<HTMLInputElement>('[data-field="unitPrice"]');
    const quantityInput = node.querySelector<HTMLInputElement>('[data-field="quantity"]');

    return {
      description: descriptionInput?.value.trim() || '',
      id: itemId,
      name: nameInput?.value.trim() || '',
      quantity: Math.max(1, Math.floor(parseNumber(quantityInput?.value || '1'))),
      unitPrice: Math.max(0, parseNumber(unitPriceInput?.value || '0')),
    };
  });
}

function calculateOrderTotals(): { subtotal: number; tax: number; total: number } {
  const subtotal = createOrderItems.reduce(
    (sum, item) => sum + (item.unitPrice * item.quantity),
    0,
  );
  const tax = subtotal * gstRate;
  const total = subtotal + tax;

  return { subtotal, tax, total };
}

function renderCreateOrderItems(): void {
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
          ${createOrderItems.length === 1 ? 'disabled' : ''}
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
  `).join('');
}

function updateCreateOrderSummary(): void {
  syncCreateOrderItemsFromDom();
  const currency = elements.createOrderCurrency.value || 'AUD';
  const meaningfulItems = createOrderItems.filter(
    (item) => item.name || item.description || item.unitPrice > 0 || item.quantity > 0,
  );
  const totals = calculateOrderTotals();

  elements.createOrderSummaryLines.innerHTML = meaningfulItems.length > 0
    ? meaningfulItems.map((item, index) => `
        <div class="summary-line">
          <span>${escapeHtml(item.name || `Item ${index + 1}`)} x${item.quantity}</span>
          <strong>${escapeHtml(formatCurrency(currency, item.unitPrice * item.quantity))}</strong>
        </div>
      `).join('')
    : '<p class="summary-empty">Add your first item to see the order breakdown.</p>';

  elements.summarySubtotal.textContent = formatCurrency(currency, totals.subtotal);
  elements.summaryTax.textContent = formatCurrency(currency, totals.tax);
  elements.summaryTotal.textContent = formatCurrency(currency, totals.total);
}

function populateBuyerFields(): void {
  const profile = getStoredProfile();

  elements.buyerFirstName.value = profile?.firstName || '';
  elements.buyerLastName.value = profile?.lastName || '';
  elements.buyerEmail.value = profile?.email || '';
  elements.buyerTelephone.value = profile?.telephone || '';
}

function resetCreateOrderForm(): void {
  elements.createOrderForm.reset();
  populateBuyerFields();
  elements.createOrderCurrency.value = 'AUD';
  createOrderItems = [getDefaultOrderItem()];
  renderCreateOrderItems();
  updateCreateOrderSummary();
}

function buildDeliveryTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    throw new Error('Please provide a valid delivery date and time.');
  }

  return timestamp;
}

function buildCreateOrderPayload(form: FormData): JsonRecord {
  syncCreateOrderItemsFromDom();

  const items = createOrderItems.map((item) => ({
    description: item.description.trim(),
    name: item.name.trim(),
    quantity: Math.max(1, Math.floor(item.quantity)),
    unitPrice: Math.max(0, item.unitPrice),
  }));

  if (items.length === 0) {
    throw new Error('Add at least one item before creating the order.');
  }

  if (items.some((item) => !item.name || !item.description)) {
    throw new Error('Each item needs both a name and a description.');
  }

  if (items.some((item) => item.unitPrice <= 0 || item.quantity <= 0)) {
    throw new Error('Each item must have a positive price and quantity.');
  }

  const deliveryStart = buildDeliveryTimestamp(getFormValue(form, 'deliveryStart'));
  const deliveryEnd = buildDeliveryTimestamp(getFormValue(form, 'deliveryEnd'));

  if (deliveryEnd <= deliveryStart) {
    throw new Error('Delivery end must be later than the delivery start.');
  }

  return {
    currency: getFormValue(form, 'currency') || 'AUD',
    deliveryAddress: getFormValue(form, 'deliveryAddress'),
    items,
    reqDeliveryPeriod: {
      endDateTime: deliveryEnd,
      startDateTime: deliveryStart,
    },
    user: {
      email: getFormValue(form, 'buyerEmail'),
      firstName: getFormValue(form, 'buyerFirstName'),
      lastName: getFormValue(form, 'buyerLastName'),
      telephone: getFormValue(form, 'buyerTelephone'),
    },
  };
}

async function showView(viewName: ViewName): Promise<void> {
  const authenticated = Boolean(getSession());
  const requiresAuth = viewName === 'dashboard' || viewName === 'createOrder';
  const nextView = !authenticated && requiresAuth ? 'login' : viewName;

  Object.entries(viewElements).forEach(([name, element]) => {
    element.classList.toggle('hidden', name !== nextView);
    element.classList.toggle('is-active', name === nextView);
  });

  updateAuthChrome();
  updateNavigationState(nextView);

  if (nextView !== 'dashboard') {
    elements.orderDetailPanel.classList.add('hidden');
  }

  if (nextView === 'dashboard' && authenticated) {
    await loadOrders();
  }

  if (nextView === 'createOrder' && authenticated) {
    resetCreateOrderForm();
  }
}

const elements = {
  addOrderItemButton: getRequiredElement<HTMLButtonElement>('addOrderItemButton'),
  buyerEmail: getRequiredElement<HTMLInputElement>('buyerEmail'),
  buyerFirstName: getRequiredElement<HTMLInputElement>('buyerFirstName'),
  buyerLastName: getRequiredElement<HTMLInputElement>('buyerLastName'),
  buyerTelephone: getRequiredElement<HTMLInputElement>('buyerTelephone'),
  closeOrderDetailButton: getRequiredElement<HTMLButtonElement>('closeOrderDetailButton'),
  createOrderBackButton: getRequiredElement<HTMLButtonElement>('createOrderBackButton'),
  createOrderCancelButton: getRequiredElement<HTMLButtonElement>('createOrderCancelButton'),
  createOrderCurrency: getRequiredElement<HTMLSelectElement>('createOrderCurrency'),
  createOrderForm: getRequiredElement<HTMLFormElement>('createOrderForm'),
  createOrderItems: getRequiredElement<HTMLElement>('createOrderItems'),
  createOrderNavButton: getRequiredElement<HTMLButtonElement>('createOrderNavButton'),
  dashboardCreateOrderButton: getRequiredElement<HTMLButtonElement>('dashboardCreateOrderButton'),
  detailOrderHeading: getRequiredElement<HTMLElement>('detailOrderHeading'),
  feedbackBanner: getRequiredElement<HTMLElement>('feedbackBanner'),
  loginForm: getRequiredElement<HTMLFormElement>('loginForm'),
  logoutButton: getRequiredElement<HTMLButtonElement>('logoutButton'),
  orderDetailPanel: getRequiredElement<HTMLElement>('orderDetailPanel'),
  orderInfoOutput: getRequiredElement<HTMLElement>('orderInfoOutput'),
  ordersEmptyState: getRequiredElement<HTMLElement>('ordersEmptyState'),
  ordersList: getRequiredElement<HTMLElement>('ordersList'),
  ordersLoadingState: getRequiredElement<HTMLElement>('ordersLoadingState'),
  privateNav: getRequiredElement<HTMLElement>('privateNav'),
  publicNav: getRequiredElement<HTMLElement>('publicNav'),
  registerForm: getRequiredElement<HTMLFormElement>('registerForm'),
  summarySubtotal: getRequiredElement<HTMLElement>('summarySubtotal'),
  summaryTax: getRequiredElement<HTMLElement>('summaryTax'),
  summaryTotal: getRequiredElement<HTMLElement>('summaryTotal'),
  createOrderSummaryLines: getRequiredElement<HTMLElement>('createOrderSummaryLines'),
  welcomeName: getRequiredElement<HTMLElement>('welcomeName'),
} as const;

const viewElements: Record<ViewName, HTMLElement> = {
  createOrder: getRequiredElement<HTMLElement>('createOrderView'),
  dashboard: getRequiredElement<HTMLElement>('dashboardView'),
  landing: getRequiredElement<HTMLElement>('landingView'),
  login: getRequiredElement<HTMLElement>('loginView'),
  register: getRequiredElement<HTMLElement>('registerView'),
};

elements.registerForm.addEventListener('submit', async (event: SubmitEvent) => {
  event.preventDefault();
  const form = getFormData(event.currentTarget);
  const profile = buildProfileFromForm(form);

  try {
    const payload = await apiRequest<SessionResponse>('/v0/user/register', {
      body: {
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        password: getFormValue(form, 'password'),
        telephone: profile.telephone || '',
      },
      method: 'POST',
      useSession: false,
    });

    if (!payload.session) {
      throw new Error('Registration succeeded, but no session was returned.');
    }

    setSession(payload.session);
    setStoredProfile(profile);
    showFeedback('Account created successfully.');
    await showView('dashboard');
  } catch (error) {
    showFeedback(getErrorMessage(error));
  }
});

elements.loginForm.addEventListener('submit', async (event: SubmitEvent) => {
  event.preventDefault();
  const form = getFormData(event.currentTarget);
  const email = getFormValue(form, 'email');

  try {
    const payload = await apiRequest<SessionResponse>('/v0/user/login', {
      body: {
        email,
        password: getFormValue(form, 'password'),
      },
      method: 'POST',
      useSession: false,
    });

    if (!payload.session) {
      throw new Error('Login succeeded, but no session was returned.');
    }

    setSession(payload.session);
    setStoredProfile(getStoredProfile() ?? buildProfileFromEmail(email));
    showFeedback('Signed in successfully.');
    await showView('dashboard');
  } catch (error) {
    showFeedback(getErrorMessage(error));
  }
});

elements.createOrderForm.addEventListener('submit', async (event: SubmitEvent) => {
  event.preventDefault();
  const form = getFormData(event.currentTarget);

  try {
    const payload = buildCreateOrderPayload(form);
    const response = await apiRequest<OrderCreateResponse>('/v0/order', {
      body: payload,
      method: 'POST',
    });

    if (!response.orderId) {
      throw new Error('Order created, but no order ID was returned.');
    }

    setStoredProfile({
      email: getFormValue(form, 'buyerEmail'),
      firstName: getFormValue(form, 'buyerFirstName'),
      lastName: getFormValue(form, 'buyerLastName'),
      telephone: getFormValue(form, 'buyerTelephone'),
    });

    showFeedback(`Order ${response.orderId} created successfully.`);
    await showView('dashboard');
    await loadOrderDetail(response.orderId);
  } catch (error) {
    showFeedback(getErrorMessage(error));
  }
});

elements.logoutButton.addEventListener('click', async () => {
  try {
    await apiRequest('/v0/user/logout', {
      method: 'POST',
    });
  } catch {
    // If backend logout fails, still clear local state to avoid trapping the user.
  } finally {
    clearAuthState();
    elements.ordersList.innerHTML = '';
    elements.orderDetailPanel.classList.add('hidden');
    showFeedback('You have been logged out.');
    await showView('landing');
  }
});

elements.addOrderItemButton.addEventListener('click', () => {
  syncCreateOrderItemsFromDom();
  createOrderItems = [...createOrderItems, getDefaultOrderItem()];
  renderCreateOrderItems();
  updateCreateOrderSummary();
});

elements.createOrderCurrency.addEventListener('change', () => {
  updateCreateOrderSummary();
});

elements.createOrderItems.addEventListener('input', () => {
  updateCreateOrderSummary();
});

elements.closeOrderDetailButton.addEventListener('click', () => {
  elements.orderDetailPanel.classList.add('hidden');
});

document.addEventListener('click', async (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const removeItemButton = target.closest<HTMLElement>('[data-remove-item-id]');

  if (removeItemButton?.dataset.removeItemId) {
    const itemId = Number(removeItemButton.dataset.removeItemId);
    syncCreateOrderItemsFromDom();
    createOrderItems = createOrderItems.filter((item) => item.id !== itemId);
    ensureOrderItems();
    renderCreateOrderItems();
    updateCreateOrderSummary();
    return;
  }

  const navButton = target.closest<HTMLElement>('[data-nav-target]');

  if (navButton?.dataset.navTarget) {
    const nextView = navButton.dataset.navTarget as ViewName;
    await showView(nextView);
    return;
  }

  const orderButton = target.closest<HTMLElement>('[data-order-id]');

  if (orderButton?.dataset.orderId) {
    await loadOrderDetail(orderButton.dataset.orderId);
  }
});

if (getSession()) {
  void showView('dashboard');
} else {
  void showView('landing');
}
