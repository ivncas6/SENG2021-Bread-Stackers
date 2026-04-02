const storageKeys = {
  baseUrl: 'breadstackers.apiBaseUrl',
  apiKey: 'breadstackers.apiKey',
  session: 'breadstackers.session',
};

const elements = {
  apiBaseUrl: document.getElementById('apiBaseUrl'),
  apiKey: document.getElementById('apiKey'),
  saveConfigButton: document.getElementById('saveConfigButton'),
  clearSessionButton: document.getElementById('clearSessionButton'),
  sessionStatus: document.getElementById('sessionStatus'),
  consoleOutput: document.getElementById('consoleOutput'),
  ordersList: document.getElementById('ordersList'),
  orderInfoOutput: document.getElementById('orderInfoOutput'),
  registerForm: document.getElementById('registerForm'),
  loginForm: document.getElementById('loginForm'),
  createOrderForm: document.getElementById('createOrderForm'),
  orderInfoForm: document.getElementById('orderInfoForm'),
  updateOrderForm: document.getElementById('updateOrderForm'),
  cancelOrderForm: document.getElementById('cancelOrderForm'),
  listOrdersButton: document.getElementById('listOrdersButton'),
};

function getConfig() {
  return {
    baseUrl: localStorage.getItem(storageKeys.baseUrl) || '',
    apiKey: localStorage.getItem(storageKeys.apiKey) || '',
    session: localStorage.getItem(storageKeys.session) || '',
  };
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
  const { session } = getConfig();
  if (!session) {
    elements.sessionStatus.textContent = 'No active session';
    return;
  }

  const preview = `${session.slice(0, 18)}...${session.slice(-10)}`;
  elements.sessionStatus.textContent = `Active session: ${preview}`;
}

function initialiseConfig() {
  const { baseUrl, apiKey } = getConfig();
  elements.apiBaseUrl.value = baseUrl;
  elements.apiKey.value = apiKey;
  renderSession();
}

function logResult(title, payload) {
  elements.consoleOutput.textContent = `${title}\n\n${JSON.stringify(payload, null, 2)}`;
}

function ensureConfig() {
  const { baseUrl, apiKey } = getConfig();
  if (!baseUrl || !apiKey) {
    throw new Error('Set API base URL and x-api-key before sending requests.');
  }
  return { baseUrl, apiKey };
}

async function apiRequest(path, options = {}) {
  const { baseUrl, apiKey, session } = { ...ensureConfig(), ...getConfig() };
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    ...(options.useSession === false ? {} : session ? { session } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const rawText = await response.text();
  let payload;

  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = { rawText };
  }

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}`);
  }

  return payload;
}

function toEpochMillis(value) {
  return new Date(value).getTime();
}

function renderOrders(orders) {
  if (!orders || orders.length === 0) {
    elements.ordersList.textContent = 'No orders returned.';
    return;
  }

  const markup = orders.map((order) => `
    <article class="order-card">
      <h3>${order.orderId}</h3>
      <p>Status: ${order.status}</p>
      <p>Issued: ${order.issuedDate}</p>
      <p>Total: ${order.finalPrice} ${order.currency}</p>
    </article>
  `).join('');

  elements.ordersList.innerHTML = markup;
}

elements.saveConfigButton.addEventListener('click', () => {
  localStorage.setItem(storageKeys.baseUrl, elements.apiBaseUrl.value.trim().replace(/\/$/, ''));
  localStorage.setItem(storageKeys.apiKey, elements.apiKey.value.trim());
  logResult('Configuration saved', {
    baseUrl: localStorage.getItem(storageKeys.baseUrl),
    apiKeyPresent: Boolean(localStorage.getItem(storageKeys.apiKey)),
  });
});

elements.clearSessionButton.addEventListener('click', () => {
  setSession('');
  logResult('Session cleared', {});
});

elements.registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);

  try {
    const payload = await apiRequest('/v0/user/register', {
      method: 'POST',
      useSession: false,
      body: {
        firstName: form.get('firstName'),
        lastName: form.get('lastName'),
        email: form.get('email'),
        telephone: form.get('telephone'),
        password: form.get('password'),
      },
    });

    if (payload.session) {
      setSession(payload.session);
    }

    logResult('Register succeeded', payload);
  } catch (error) {
    logResult('Register failed', { error: error.message });
  }
});

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);

  try {
    const payload = await apiRequest('/v0/user/login', {
      method: 'POST',
      useSession: false,
      body: {
        email: form.get('email'),
        password: form.get('password'),
      },
    });

    if (payload.session) {
      setSession(payload.session);
    }

    logResult('Login succeeded', payload);
  } catch (error) {
    logResult('Login failed', { error: error.message });
  }
});

elements.createOrderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);

  try {
    const payload = await apiRequest('/v0/order', {
      method: 'POST',
      body: {
        currency: form.get('currency'),
        deliveryAddress: form.get('deliveryAddress'),
        user: {
          firstName: form.get('userFirstName'),
          lastName: form.get('userLastName'),
          email: form.get('userEmail'),
          telephone: form.get('userTelephone'),
        },
        reqDeliveryPeriod: {
          startDateTime: toEpochMillis(form.get('startDateTime')),
          endDateTime: toEpochMillis(form.get('endDateTime')),
        },
        items: [
          {
            name: form.get('itemName'),
            description: form.get('itemDescription'),
            unitPrice: Number(form.get('itemUnitPrice')),
            quantity: Number(form.get('itemQuantity')),
          },
        ],
      },
    });

    logResult('Create order succeeded', payload);
  } catch (error) {
    logResult('Create order failed', { error: error.message });
  }
});

elements.listOrdersButton.addEventListener('click', async () => {
  try {
    const payload = await apiRequest('/v0/order/list');
    renderOrders(payload.orders);
    logResult('List orders succeeded', payload);
  } catch (error) {
    renderOrders([]);
    logResult('List orders failed', { error: error.message });
  }
});

elements.orderInfoForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const orderId = form.get('orderId');

  try {
    const payload = await apiRequest(`/v0/order/${orderId}`);
    elements.orderInfoOutput.textContent = JSON.stringify(payload, null, 2);
    logResult('Get order succeeded', payload);
  } catch (error) {
    elements.orderInfoOutput.textContent = 'Failed to load order.';
    logResult('Get order failed', { error: error.message });
  }
});

elements.updateOrderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const orderId = form.get('orderId');

  try {
    const payload = await apiRequest(`/v0/order/${orderId}`, {
      method: 'PUT',
      body: {
        deliveryAddress: form.get('deliveryAddress'),
        reqDeliveryPeriod: {
          startDateTime: toEpochMillis(form.get('startDateTime')),
          endDateTime: toEpochMillis(form.get('endDateTime')),
        },
        status: form.get('status'),
      },
    });

    logResult('Update order succeeded', payload);
  } catch (error) {
    logResult('Update order failed', { error: error.message });
  }
});

elements.cancelOrderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const orderId = form.get('orderId');

  try {
    const payload = await apiRequest(`/v0/order/${orderId}`, {
      method: 'DELETE',
      body: {
        reason: form.get('reason'),
      },
    });

    logResult('Cancel order succeeded', payload);
  } catch (error) {
    logResult('Cancel order failed', { error: error.message });
  }
});

initialiseConfig();
