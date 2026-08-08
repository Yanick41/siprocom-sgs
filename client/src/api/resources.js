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
