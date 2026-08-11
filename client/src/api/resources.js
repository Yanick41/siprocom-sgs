import api from './client';

/** Drops empty/undefined params so URLs stay clean and cache keys stable. */
const qs = (params = {}) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.append(key, value);
  }
  const str = search.toString();
  return str ? `?${str}` : '';
};

export const authApi = {
  setupStatus: () => api.get('/auth/setup-status'),
  setup: (data) => api.post('/auth/setup', data),
  login: (credentials) => api.post('/auth/login', credentials),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  setLocale: (locale) => api.patch('/auth/me/locale', { locale }),
};

export const productsApi = {
  list: (params) => api.get(`/products${qs(params)}`),
  get: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: ({ id, ...data }) => api.patch(`/products/${id}`, data),
  deactivate: (id) => api.patch(`/products/${id}/deactivate`),
  activate: (id) => api.patch(`/products/${id}/activate`),
};

export const categoriesApi = {
  list: (params) => api.get(`/categories${qs(params)}`),
  tree: () => api.get('/categories?tree=1'),
  create: (data) => api.post('/categories', data),
  update: ({ id, ...data }) => api.patch(`/categories/${id}`, data),
  remove: (id) => api.delete(`/categories/${id}`),
};

export const suppliersApi = {
  list: (params) => api.get(`/suppliers${qs(params)}`),
  get: (id) => api.get(`/suppliers/${id}`),
  create: (data) => api.post('/suppliers', data),
  update: ({ id, ...data }) => api.patch(`/suppliers/${id}`, data),
  deactivate: (id) => api.patch(`/suppliers/${id}/deactivate`),
};

export const warehousesApi = {
  list: (params) => api.get(`/warehouses${qs(params)}`),
  get: (id) => api.get(`/warehouses/${id}`),
  create: (data) => api.post('/warehouses', data),
  update: ({ id, ...data }) => api.patch(`/warehouses/${id}`, data),
};

export const stockApi = {
  levels: (params) => api.get(`/stock${qs(params)}`),
  byProduct: (id) => api.get(`/stock/product/${id}`),
  movements: (params) => api.get(`/stock/movements${qs(params)}`),
  adjust: (data) => api.post('/stock/adjust', data),
  reconcile: () => api.get('/stock/reconcile'),
};

export const receiptsApi = {
  list: (params) => api.get(`/receipts${qs(params)}`),
  get: (id) => api.get(`/receipts/${id}`),
  create: (data) => api.post('/receipts', data),
  update: ({ id, ...data }) => api.patch(`/receipts/${id}`, data),
  validate: (id) => api.post(`/receipts/${id}/validate`),
  cancel: ({ id, reason }) => api.post(`/receipts/${id}/cancel`, { reason }),
};

export const issuesApi = {
  list: (params) => api.get(`/issues${qs(params)}`),
  get: (id) => api.get(`/issues/${id}`),
  create: (data) => api.post('/issues', data),
  update: ({ id, ...data }) => api.patch(`/issues/${id}`, data),
  validate: ({ id, allowNegative = false }) =>
    api.post(`/issues/${id}/validate`, { allowNegative }),
  cancel: ({ id, reason }) => api.post(`/issues/${id}/cancel`, { reason }),
};

export const alertsApi = {
  list: (params) => api.get(`/alerts${qs(params)}`),
  count: () => api.get('/alerts/count'),
  acknowledge: (id) => api.post(`/alerts/${id}/acknowledge`),
};

export const reportsApi = {
  dashboard: (params) => api.get(`/reports/dashboard${qs(params)}`),
  trending: (params) => api.get(`/reports/trending${qs(params)}`),
  dormant: (params) => api.get(`/reports/dormant${qs(params)}`),
  movementsSummary: (params) => api.get(`/reports/movements-summary${qs(params)}`),
  valuation: (params) => api.get(`/reports/valuation${qs(params)}`),
};

export const usersApi = {
  list: (params) => api.get(`/users${qs(params)}`),
  create: (data) => api.post('/users', data),
  update: ({ id, ...data }) => api.patch(`/users/${id}`, data),
};

export const auditApi = {
  list: (params) => api.get(`/audit-logs${qs(params)}`),
  actions: () => api.get('/audit-logs/actions'),
};
