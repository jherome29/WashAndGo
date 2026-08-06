import { Booking } from '../types';
import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const timeoutMs = 20000;
  const controller = options?.signal ? null : new AbortController();
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: options?.signal || controller?.signal,
    });
  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId);
    if (err?.name === 'AbortError') throw new Error('Request timed out. Please try again.', { cause: err });
    throw new Error('Request failed', { cause: err });
  }

  if (res.status === 401) {
    await supabase.auth.signOut();
    window.location.reload();
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg);
  }
  return res.json();
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export const api = {
  signup: (dto: { fullName: string; email: string; password: string; phone?: string; redirectTo?: string }) =>
    request<{ message: string }>('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    }),

  requestPasswordReset: (dto: { email: string; redirectTo?: string }) =>
    request<{ message: string }>('/auth/request-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    }),

  checkEmailExists: async (email: string): Promise<boolean> => {
    try {
      const data = await request<{ exists: boolean }>('/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      return data.exists === true;
    } catch {
      return false;
    }
  },

  getServices: () => request<any[]>('/services'),

  createBooking: (dto: object, token?: string) =>
    request<Booking & { statusToken?: string }>('/bookings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(dto),
    }),

  getBookingById: (id: string, token: string) =>
    request<Booking>(`/bookings/${id.toUpperCase()}`, { headers: authHeaders(token) }),

  getBookingByToken: (id: string) =>
    request<Booking>(`/bookings/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id.toUpperCase() }),
    }),

  getBookedSlots: (date: string, category?: string) => {
    const query = category ? `?date=${date}&category=${category}` : `?date=${date}`;
    return request<string[]>(`/bookings/booked-slots${query}`);
  },

  getAvailability: (date: string, serviceId?: string) => {
    const params = new URLSearchParams({ date });
    if (serviceId) params.set('serviceId', serviceId);
    return request<{ date: string; closed: boolean; label?: string | null; slots: { time: string; available: boolean }[] }>(
      `/bookings/availability?${params}`,
    );
  },

  getScheduleInfo: () =>
    request<{
      openTime: string;
      closeTime: string;
      closedDays: number[];
      overrides: {
        date: string;
        isClosed: boolean;
        customOpen: string | null;
        customClose: string | null;
        label: string | null;
      }[];
    }>('/bookings/schedule-info'),

  getAllBookings: (token: string) =>
    request<Booking[]>('/bookings', { headers: authHeaders(token) }),

  getMyBookings: (token: string) =>
    request<Booking[]>('/bookings/my-bookings', { headers: authHeaders(token) }),

  updateStatus: (id: string, status: string, token: string) =>
    request<Booking>(`/bookings/${id}/status`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ status }),
    }),

  confirmPayment: (id: string, token: string) =>
    request<Booking>(`/bookings/${id}/payment/confirm`, {
      method: 'POST',
      headers: authHeaders(token),
    }),

  declinePayment: (id: string, declineReason: string, token: string) =>
    request<Booking>(`/bookings/${id}/payment/decline`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ declineReason }),
    }),

  reuploadProof: (id: string, paymentProofPath: string, authToken?: string) =>
    request<Booking>(`/bookings/${id}/payment-proof`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ paymentProofPath }),
    }),

  updateService: (id: string, dto: object, token: string) =>
    request<any>(`/services/${id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(dto),
    }),

  addBookingUpdate: (id: string, message: string, imageUrls: string[], token: string) =>
    request<any>(`/bookings/${id}/updates`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ message, imageUrls }),
    }),

  requestEmailChange: (newEmail: string, token: string) =>
    request<{ message: string }>('/auth/request-email-change', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ newEmail }),
    }),

  getPaymentMethods: () =>
    request<{ payment_method: string; account_name: string; account_number: string; qr_image_path?: string; qr_signed_url?: string | null }[]>(
      '/admin/payment-methods',
    ),

  getAdminPaymentSettings: (token: string) =>
    request<any[]>('/admin/payment-settings', { headers: authHeaders(token) }),

  updateAdminPaymentSettings: (dto: object, token: string) =>
    request<any>('/admin/payment-settings', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(dto),
    }),

  getScheduleSettings: (token: string) =>
    request<any>('/admin/schedule-settings', { headers: authHeaders(token) }),

  updateScheduleSettings: (dto: object, token: string) =>
    request<any>('/admin/schedule-settings', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(dto),
    }),

  upsertScheduleOverride: (dto: object, token: string) =>
    request<any>('/admin/schedule-overrides', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(dto),
    }),

  deleteScheduleOverride: (date: string, token: string) =>
    request<any>(`/admin/schedule-overrides/${date}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    }),

  getSignedUploadUrl: (fileName: string, bookingId?: string, statusToken?: string, authToken?: string, fileSize?: number, mimeType?: string) => {
    const params = new URLSearchParams({ fileName });
    if (bookingId) params.set('bookingId', bookingId);
    if (statusToken) params.set('statusToken', statusToken);
    if (fileSize !== undefined) params.set('fileSize', String(fileSize));
    if (mimeType) params.set('mimeType', mimeType);
    return request<{ signedUrl: string; path: string }>(`/storage/upload-url?${params}`, {
      method: 'POST',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
  },

  getSignedViewUrl: (path: string, bookingId?: string, statusToken?: string, authToken?: string) => {
    const params = new URLSearchParams({ path });
    if (bookingId) params.set('bookingId', bookingId);
    if (statusToken) params.set('statusToken', statusToken);
    return request<{ signedUrl: string }>(`/storage/view-url?${params}`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
  },

  // --- Club Wash & Go memberships ---

  issueMembership: (dto: { memberName: string; purchaseDate?: string; userId: string; vehicles: { plateNumber: string; vehicleLabel?: string }[] }, token: string) =>
    request<Membership>('/memberships', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(dto),
    }),

  getMemberships: (search: string | undefined, token: string) => {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    return request<Membership[]>(`/memberships${params}`, { headers: authHeaders(token) });
  },

  searchMembershipCustomers: (query: string, token: string) =>
    request<{ userId: string; name: string; phone: string; email: string | null }[]>(
      `/memberships/customer-search?query=${encodeURIComponent(query)}`,
      { headers: authHeaders(token) },
    ),

  getCustomerCarwashHistory: (userId: string, token: string) =>
    request<{ id: string; serviceName: string; date: string; timeSlot: string; status: string; totalPrice: number }[]>(
      `/memberships/customers/${userId}/carwash-history`,
      { headers: authHeaders(token) },
    ),

  getMembership: (id: string, token: string) =>
    request<Membership>(`/memberships/${id}`, { headers: authHeaders(token) }),

  renewMembership: (id: string, token: string) =>
    request<Membership>(`/memberships/${id}/renew`, { method: 'POST', headers: authHeaders(token) }),

  cancelMembership: (id: string, reason: string, token: string) =>
    request<Membership>(`/memberships/${id}/cancel`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ reason }),
    }),

  addMembershipVisit: (id: string, token: string) =>
    request<Membership>(`/memberships/${id}/visits/increment`, { method: 'POST', headers: authHeaders(token) }),

  removeMembershipVisit: (id: string, token: string) =>
    request<Membership>(`/memberships/${id}/visits/decrement`, { method: 'POST', headers: authHeaders(token) }),

  addMembershipVehicle: (id: string, dto: { plateNumber: string; vehicleLabel?: string }, token: string) =>
    request<MembershipVehicle>(`/memberships/${id}/vehicles`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(dto),
    }),

  removeMembershipVehicle: (id: string, vehicleId: string, token: string) =>
    request<{ removed: boolean }>(`/memberships/${id}/vehicles/${vehicleId}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    }),

  lookupMembership: (membershipNo: string) =>
    request<PublicMembership>('/memberships/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ membershipNo }),
    }),

  getMyMembership: (token: string) =>
    request<PublicMembership | null>('/memberships/me', { headers: authHeaders(token) }),

  getVehicleMembershipStatus: (plateNumber: string) =>
    request<{ membershipNo: string; visitCount: number; freeWashCredits: number; firstWashUsed: boolean } | null>(
      `/memberships/vehicle-status?plateNumber=${encodeURIComponent(plateNumber)}`,
    ),
};

export interface MembershipVehicle {
  id: string;
  plateNumber: string;
  vehicleLabel: string | null;
}

export interface Membership {
  id: string;
  membershipNo: string;
  memberName: string;
  userId: string | null;
  issuedBy: string;
  purchaseDate: string;
  expiresAt: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  visitCount: number;
  firstWashUsed: boolean;
  freeWashCredits: number;
  createdAt: string;
  vehicles: MembershipVehicle[];
}

export interface PublicMembership {
  membershipNo: string;
  memberName: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string;
  visitCount: number;
  freeWashCredits: number;
  firstWashUsed: boolean;
  visitsUntilNextFreeWash: number;
  vehicles: { plateNumber: string; vehicleLabel: string | null }[];
}
