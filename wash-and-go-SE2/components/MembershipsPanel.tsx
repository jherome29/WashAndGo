import React, { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Search, Plus, X, Trash2, Loader2, CheckCircle2, AlertCircle,
  IdCard, Car, RefreshCw, Ban, Gift, ArrowLeft, UserPlus, Droplets,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api, Membership } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const STATUS_STYLE: Record<Membership['status'], { bg: string; text: string; label: string }> = {
  ACTIVE:    { bg: '#dcfce7', text: '#166534', label: 'Active' },
  EXPIRED:   { bg: '#fee2e2', text: '#991b1b', label: 'Expired' },
  CANCELLED: { bg: '#f3f4f6', text: '#6b7280', label: 'Cancelled' },
};

const inputClass = 'font-lovelo w-full px-4 py-2 border-2 border-gray-100 rounded-xl text-xs font-black text-gray-800 outline-none focus:border-orange-400 bg-white';
const primaryBtn = 'font-lovelo flex items-center justify-center gap-2 text-xs font-black tracking-wider text-white rounded-xl px-5 py-2.5 transition-opacity disabled:opacity-40';

interface VehicleDraft {
  plateNumber: string;
  vehicleLabel: string;
}

interface CustomerResult {
  userId: string;
  name: string;
  phone: string;
  email: string | null;
}

interface CarwashVisit {
  id: string;
  serviceName: string;
  date: string;
  timeSlot: string;
  status: string;
  totalPrice: number;
}

interface IssueMembershipModalProps {
  issueStep: 'search' | 'profile';
  setIssueStep: (step: 'search' | 'profile') => void;
  customerQuery: string;
  setCustomerQuery: (q: string) => void;
  searchingCustomers: boolean;
  customerResults: CustomerResult[];
  selectCustomer: (c: CustomerResult) => void;
  selectedCustomer: CustomerResult | null;
  carwashHistory: CarwashVisit[];
  loadingHistory: boolean;
  showVehicleForm: boolean;
  setShowVehicleForm: (show: boolean) => void;
  issueMemberName: string;
  setIssueMemberName: (name: string) => void;
  issueVehicles: VehicleDraft[];
  addVehicleRow: () => void;
  updateVehicleField: (index: number, field: keyof VehicleDraft, value: string) => void;
  removeVehicleRow: (index: number) => void;
  submitIssue: () => void;
  issuing: boolean;
  onClose: () => void;
}

function IssueMembershipModal(props: Readonly<IssueMembershipModalProps>) {
  const {
    issueStep, setIssueStep, customerQuery, setCustomerQuery, searchingCustomers, customerResults,
    selectCustomer, selectedCustomer, carwashHistory, loadingHistory, showVehicleForm, setShowVehicleForm,
    issueMemberName, setIssueMemberName, issueVehicles, addVehicleRow, updateVehicleField, removeVehicleRow,
    submitIssue, issuing, onClose,
  } = props;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white rounded-t-3xl border-b border-gray-100 px-6 py-4 flex items-start justify-between z-10">
          <div>
            <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-0.5">
              {issueStep === 'search' ? 'Find an Existing Account' : 'Customer Profile'}
            </p>
            <h2 className="font-lovelo font-display font-black text-base" style={{ color: '#383838' }}>
              {issueStep === 'search' ? 'Make a Member' : selectedCustomer?.name}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {issueStep === 'search' && (
            <>
              <p className="font-lovelo text-xs text-gray-400" style={{ fontWeight: 300 }}>
                A membership can only be issued to an existing Wash &amp; Go account. Search by name, phone, or email to find the customer.
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input type="text" value={customerQuery} onChange={e => setCustomerQuery(e.target.value)}
                  placeholder="Name, phone, or email…" autoFocus
                  className="font-lovelo w-full pl-9 pr-4 py-2.5 border-2 border-gray-100 rounded-xl text-xs font-black text-gray-800 outline-none focus:border-orange-400 bg-white" />
              </div>

              {searchingCustomers && (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
              )}

              {!searchingCustomers && customerQuery.trim() && customerResults.length === 0 && (
                <p className="font-lovelo text-xs text-gray-400 text-center py-4" style={{ fontWeight: 300 }}>
                  No account found for "{customerQuery}". They'll need to book at least once while logged in first.
                </p>
              )}

              <div className="space-y-2">
                {customerResults.map(c => (
                  <button type="button" key={c.userId} onClick={() => selectCustomer(c)}
                    className="w-full flex items-center justify-between text-left rounded-xl border-2 border-gray-100 hover:border-orange-300 transition-colors px-4 py-3">
                    <div>
                      <p className="font-lovelo text-xs font-black" style={{ color: '#383838' }}>{c.name}</p>
                      <p className="font-lovelo text-[10px] text-gray-400" style={{ fontWeight: 300 }}>{c.phone}{c.email ? ` · ${c.email}` : ''}</p>
                    </div>
                    <UserPlus className="w-4 h-4 text-orange-400 shrink-0" />
                  </button>
                ))}
              </div>
            </>
          )}

          {issueStep === 'profile' && selectedCustomer && (
            <>
              <button type="button" onClick={() => setIssueStep('search')} className="font-lovelo text-[10px] font-black flex items-center gap-1 text-gray-400 hover:text-gray-600">
                <ArrowLeft className="w-3 h-3" /> Back to search
              </button>

              <div className="rounded-xl border-2 border-gray-100 px-4 py-3">
                <p className="font-lovelo text-[9px] font-black tracking-[0.15em] uppercase text-gray-400 mb-1">Contact</p>
                <p className="font-lovelo text-xs" style={{ color: '#383838' }}>{selectedCustomer.phone}{selectedCustomer.email ? ` · ${selectedCustomer.email}` : ''}</p>
              </div>

              <div>
                <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-2 flex items-center gap-1.5">
                  <Droplets className="w-3 h-3" /> Car Wash History
                </p>
                {loadingHistory ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></div>
                ) : carwashHistory.length === 0 ? (
                  <p className="font-lovelo text-xs text-gray-400" style={{ fontWeight: 300 }}>No car wash bookings on record yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {carwashHistory.map(v => (
                      <div key={v.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                        <div>
                          <p className="font-lovelo text-[11px] font-black" style={{ color: '#383838' }}>{v.serviceName}</p>
                          <p className="font-lovelo text-[10px] text-gray-400" style={{ fontWeight: 300 }}>{format(parseISO(v.date), 'MMM d, yyyy')} · {v.timeSlot}</p>
                        </div>
                        <span className="font-lovelo text-[9px] font-black text-gray-400 uppercase">{v.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!showVehicleForm ? (
                <button type="button" onClick={() => setShowVehicleForm(true)} className={primaryBtn}
                  style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)', width: '100%' }}>
                  <UserPlus className="w-3.5 h-3.5" /> Make {selectedCustomer.name} a Member
                </button>
              ) : (
                <div className="space-y-4 pt-2 border-t border-gray-100">
                  <div>
                    <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-2">Member Name</p>
                    <input type="text" value={issueMemberName} onChange={e => setIssueMemberName(e.target.value)} className={inputClass} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400">Vehicles (up to 3)</p>
                      {issueVehicles.length < 3 && (
                        <button type="button"
                          onClick={addVehicleRow}
                          className="font-lovelo text-[10px] font-black flex items-center gap-1 text-orange-500 hover:text-orange-600"
                        >
                          <Plus className="w-3 h-3" /> Add vehicle
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {issueVehicles.map((v, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input type="text" value={v.plateNumber}
                            onChange={e => updateVehicleField(i, 'plateNumber', e.target.value.toUpperCase())}
                            placeholder="Plate no." className={inputClass} />
                          <input type="text" value={v.vehicleLabel}
                            onChange={e => updateVehicleField(i, 'vehicleLabel', e.target.value)}
                            placeholder="Label (optional)" className={inputClass} />
                          {issueVehicles.length > 1 && (
                            <button type="button" onClick={() => removeVehicleRow(i)}
                              className="w-8 h-8 flex items-center justify-center rounded-xl border-2 border-gray-100 hover:border-red-300 transition-colors bg-white flex-shrink-0">
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button type="button"
                    onClick={submitIssue}
                    disabled={issuing || !issueMemberName.trim()}
                    className={primaryBtn}
                    style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)', width: '100%' }}
                  >
                    {issuing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Issue Membership
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface ManageVehiclesModalProps {
  membership: Membership;
  onClose: () => void;
  removeVehicle: (vehicleId: string) => void;
  removingVehicleId: string | null;
  newPlate: string;
  setNewPlate: (v: string) => void;
  newLabel: string;
  setNewLabel: (v: string) => void;
  addVehicle: () => void;
  addingVehicle: boolean;
}

function ManageVehiclesModal(props: Readonly<ManageVehiclesModalProps>) {
  const { membership, onClose, removeVehicle, removingVehicleId, newPlate, setNewPlate, newLabel, setNewLabel, addVehicle, addingVehicle } = props;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-0.5">{membership.membershipNo}</p>
            <h2 className="font-lovelo font-display font-black text-base" style={{ color: '#383838' }}>{membership.memberName}'s Vehicles</h2>
          </div>
          <button type="button" onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {membership.vehicles.length === 0 && (
            <p className="font-lovelo text-xs text-gray-400" style={{ fontWeight: 300 }}>No vehicles on this membership yet.</p>
          )}
          {membership.vehicles.map(v => (
            <div key={v.id} className="flex items-center justify-between rounded-xl border-2 border-gray-100 px-4 py-2.5">
              <div>
                <p className="font-lovelo text-xs font-black" style={{ color: '#383838' }}>{v.plateNumber}</p>
                {v.vehicleLabel && <p className="font-lovelo text-[10px] text-gray-400" style={{ fontWeight: 300 }}>{v.vehicleLabel}</p>}
              </div>
              <button type="button" onClick={() => removeVehicle(v.id)} disabled={removingVehicleId === v.id}
                className="w-8 h-8 flex items-center justify-center rounded-xl border-2 border-gray-100 hover:border-red-300 transition-colors bg-white disabled:opacity-40">
                {removingVehicleId === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" /> : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
              </button>
            </div>
          ))}
        </div>

        {membership.vehicles.length < 3 ? (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400">Add Vehicle</p>
            <div className="flex items-center gap-2">
              <input type="text" value={newPlate} onChange={e => setNewPlate(e.target.value.toUpperCase())}
                placeholder="Plate no." className={inputClass} />
              <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                placeholder="Label (optional)" className={inputClass} />
            </div>
            <button type="button" onClick={addVehicle} disabled={addingVehicle || !newPlate.trim()} className={primaryBtn}
              style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)', width: '100%' }}>
              {addingVehicle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add Vehicle
            </button>
          </div>
        ) : (
          <p className="font-lovelo text-[10px] text-gray-400 pt-2 border-t border-gray-100" style={{ fontWeight: 300 }}>
            This membership already has the maximum of 3 vehicles.
          </p>
        )}
      </div>
    </div>
  );
}

export default function MembershipsPanel() {
  const { token } = useAuth();

  const [loading, setLoading]         = useState(true);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [search, setSearch]           = useState('');
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);

  // "Make a Member" flow: search an existing account -> view its profile + car-wash
  // history -> confirm vehicles. A membership can only be issued to an existing account.
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueStep, setIssueStep] = useState<'search' | 'profile'>('search');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);
  const [carwashHistory, setCarwashHistory] = useState<CarwashVisit[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [issueMemberName, setIssueMemberName] = useState('');
  const [issueVehicles, setIssueVehicles] = useState<VehicleDraft[]>([{ plateNumber: '', vehicleLabel: '' }]);
  const [issuing, setIssuing] = useState(false);

  const [manageMembership, setManageMembership] = useState<Membership | null>(null);
  const [newPlate, setNewPlate] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [removingVehicleId, setRemovingVehicleId] = useState<string | null>(null);

  const [actioningId, setActioningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getMemberships(search.trim() || undefined, token);
      setMemberships(data);
    } catch (err: any) {
      setToast({ msg: err?.message || 'Failed to load memberships.', ok: false });
    } finally {
      setLoading(false);
    }
  }, [token, search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const resetIssueForm = () => {
    setIssueStep('search');
    setCustomerQuery('');
    setCustomerResults([]);
    setSelectedCustomer(null);
    setCarwashHistory([]);
    setShowVehicleForm(false);
    setIssueMemberName('');
    setIssueVehicles([{ plateNumber: '', vehicleLabel: '' }]);
  };

  useEffect(() => {
    if (!token || !customerQuery.trim() || issueStep !== 'search') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomerResults([]);
      return;
    }
    setSearchingCustomers(true);
    const t = setTimeout(() => {
      api.searchMembershipCustomers(customerQuery.trim(), token)
        .then(setCustomerResults)
        .catch(() => setCustomerResults([]))
        .finally(() => setSearchingCustomers(false));
    }, 300);
    return () => clearTimeout(t);
  }, [customerQuery, token, issueStep]);

  const selectCustomer = async (customer: CustomerResult) => {
    if (!token) return;
    setSelectedCustomer(customer);
    setIssueMemberName(customer.name);
    setIssueStep('profile');
    setLoadingHistory(true);
    try {
      const history = await api.getCustomerCarwashHistory(customer.userId, token);
      setCarwashHistory(history);
    } catch {
      setCarwashHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const addVehicleRow = () => setIssueVehicles(v => [...v, { plateNumber: '', vehicleLabel: '' }]);

  const updateVehicleField = (index: number, field: keyof VehicleDraft, value: string) => {
    setIssueVehicles(rows => rows.map((r, ri) => ri === index ? { ...r, [field]: value } : r));
  };

  const removeVehicleRow = (index: number) => {
    setIssueVehicles(rows => rows.filter((_, ri) => ri !== index));
  };

  const submitIssue = async () => {
    if (!token || !selectedCustomer || !issueMemberName.trim()) return;
    const vehicles = issueVehicles
      .map(v => ({ plateNumber: v.plateNumber.trim(), vehicleLabel: v.vehicleLabel.trim() || undefined }))
      .filter(v => v.plateNumber);
    if (vehicles.length === 0) {
      setToast({ msg: 'At least one vehicle plate number is required.', ok: false });
      return;
    }
    setIssuing(true);
    try {
      const created = await api.issueMembership({ memberName: issueMemberName.trim(), userId: selectedCustomer.userId, vehicles }, token);
      setToast({ msg: `Membership ${created.membershipNo} issued to ${created.memberName}.`, ok: true });
      setShowIssueModal(false);
      resetIssueForm();
      await load();
    } catch (err: any) {
      setToast({ msg: err?.message || 'Failed to issue membership.', ok: false });
    } finally {
      setIssuing(false);
    }
  };

  const renew = async (m: Membership) => {
    if (!token) return;
    setActioningId(m.id);
    try {
      await api.renewMembership(m.id, token);
      setToast({ msg: `${m.membershipNo} renewed for another year.`, ok: true });
      await load();
    } catch (err: any) {
      setToast({ msg: err?.message || 'Failed to renew membership.', ok: false });
    } finally {
      setActioningId(null);
    }
  };

  const cancel = async (m: Membership) => {
    if (!token) return;
    setActioningId(m.id);
    try {
      await api.cancelMembership(m.id, token);
      setToast({ msg: `${m.membershipNo} cancelled.`, ok: true });
      await load();
    } catch (err: any) {
      setToast({ msg: err?.message || 'Failed to cancel membership.', ok: false });
    } finally {
      setActioningId(null);
    }
  };

  const openManage = (m: Membership) => {
    setManageMembership(m);
    setNewPlate('');
    setNewLabel('');
  };

  const addVehicle = async () => {
    if (!token || !manageMembership || !newPlate.trim()) return;
    setAddingVehicle(true);
    try {
      await api.addMembershipVehicle(manageMembership.id, { plateNumber: newPlate.trim(), vehicleLabel: newLabel.trim() || undefined }, token);
      setToast({ msg: 'Vehicle added.', ok: true });
      setNewPlate('');
      setNewLabel('');
      const refreshed = await api.getMembership(manageMembership.id, token);
      setManageMembership(refreshed);
      await load();
    } catch (err: any) {
      setToast({ msg: err?.message || 'Failed to add vehicle.', ok: false });
    } finally {
      setAddingVehicle(false);
    }
  };

  const removeVehicle = async (vehicleId: string) => {
    if (!token || !manageMembership) return;
    setRemovingVehicleId(vehicleId);
    try {
      await api.removeMembershipVehicle(manageMembership.id, vehicleId, token);
      setToast({ msg: 'Vehicle removed.', ok: true });
      const refreshed = await api.getMembership(manageMembership.id, token);
      setManageMembership(refreshed);
      await load();
    } catch (err: any) {
      setToast({ msg: err?.message || 'Failed to remove vehicle.', ok: false });
    } finally {
      setRemovingVehicleId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-4"
          style={{ background: 'linear-gradient(135deg, #383838 0%, #1a1a1a 100%)' }}>
          <div className="flex items-center gap-2 shrink-0">
            <IdCard className="w-4 h-4" style={{ color: '#ee4923' }} />
            <h2 className="font-lovelo font-display font-black text-sm text-white tracking-wider uppercase">Club Wash &amp; Go Members</h2>
            <span className="font-lovelo text-[10px] font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(238,73,35,0.2)', color: '#F4921F' }}>
              {memberships.length}
            </span>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by member name or membership no…"
              className="font-lovelo w-full pl-9 pr-4 py-2 text-xs bg-white/10 text-white placeholder-gray-400 border border-white/20 rounded-xl outline-none focus:bg-white/20 transition-colors"
            />
          </div>
          <button type="button"
            onClick={() => { resetIssueForm(); setShowIssueModal(true); }}
            className="font-lovelo flex items-center justify-center gap-2 text-xs font-black tracking-wider text-white rounded-xl px-5 py-2.5 whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}
          >
            <UserPlus className="w-3.5 h-3.5" /> Make a Member
          </button>
        </div>

        <div className="overflow-x-auto">
          {memberships.length === 0 ? (
            <div className="text-center py-12">
              <IdCard className="w-8 h-8 mx-auto mb-2 text-gray-200" />
              <p className="font-lovelo text-sm text-gray-400" style={{ fontWeight: 300 }}>No memberships found.</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Membership', 'Member', 'Vehicles', 'Status', 'Next Free Wash', 'Expires', 'Actions'].map(h => (
                    <th key={h} className="font-lovelo text-[9px] font-black tracking-[0.15em] uppercase text-gray-400 px-6 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {memberships.map(m => {
                  const style = STATUS_STYLE[m.status];
                  const visitsIntoCycle = m.visitCount % 10;
                  return (
                    <tr key={m.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-6 py-4 font-lovelo text-xs font-black whitespace-nowrap" style={{ color: '#383838' }}>{m.membershipNo}</td>
                      <td className="px-6 py-4 font-lovelo text-xs text-gray-600" style={{ fontWeight: 300 }}>{m.memberName}</td>
                      <td className="px-6 py-4 font-lovelo text-xs text-gray-500" style={{ fontWeight: 300 }}>
                        {m.vehicles.length === 0 ? '—' : m.vehicles.map(v => v.plateNumber).join(', ')}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-lovelo text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{ backgroundColor: style.bg, color: style.text }}>
                          {style.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          {m.freeWashCredits > 0 ? (
                            <span className="font-lovelo text-[10px] font-black flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                              <Gift className="w-3 h-3" /> {m.freeWashCredits} free wash{m.freeWashCredits !== 1 ? 'es' : ''} ready
                            </span>
                          ) : (
                            <span className="font-lovelo text-[10px] text-gray-400" style={{ fontWeight: 300 }}>{visitsIntoCycle}/10 visits</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-lovelo text-xs text-gray-500 whitespace-nowrap" style={{ fontWeight: 300 }}>
                        {format(parseISO(m.expiresAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <button type="button" onClick={() => openManage(m)} title="Manage vehicles"
                            className="w-8 h-8 flex items-center justify-center rounded-xl border-2 border-gray-100 hover:border-orange-300 transition-colors bg-white">
                            <Car className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                          {m.status !== 'CANCELLED' && (
                            <button type="button" onClick={() => renew(m)} disabled={actioningId === m.id} title="Renew"
                              className="w-8 h-8 flex items-center justify-center rounded-xl border-2 border-gray-100 hover:border-orange-300 transition-colors bg-white disabled:opacity-40">
                              {actioningId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" /> : <RefreshCw className="w-3.5 h-3.5 text-gray-500" />}
                            </button>
                          )}
                          {m.status === 'ACTIVE' && (
                            <button type="button" onClick={() => cancel(m)} disabled={actioningId === m.id} title="Cancel membership"
                              className="w-8 h-8 flex items-center justify-center rounded-xl border-2 border-gray-100 hover:border-red-300 transition-colors bg-white disabled:opacity-40">
                              {actioningId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" /> : <Ban className="w-3.5 h-3.5 text-red-400" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showIssueModal && (
        <IssueMembershipModal
          issueStep={issueStep}
          setIssueStep={setIssueStep}
          customerQuery={customerQuery}
          setCustomerQuery={setCustomerQuery}
          searchingCustomers={searchingCustomers}
          customerResults={customerResults}
          selectCustomer={selectCustomer}
          selectedCustomer={selectedCustomer}
          carwashHistory={carwashHistory}
          loadingHistory={loadingHistory}
          showVehicleForm={showVehicleForm}
          setShowVehicleForm={setShowVehicleForm}
          issueMemberName={issueMemberName}
          setIssueMemberName={setIssueMemberName}
          issueVehicles={issueVehicles}
          addVehicleRow={addVehicleRow}
          updateVehicleField={updateVehicleField}
          removeVehicleRow={removeVehicleRow}
          submitIssue={submitIssue}
          issuing={issuing}
          onClose={() => { setShowIssueModal(false); resetIssueForm(); }}
        />
      )}

      {manageMembership && (
        <ManageVehiclesModal
          membership={manageMembership}
          onClose={() => setManageMembership(null)}
          removeVehicle={removeVehicle}
          removingVehicleId={removingVehicleId}
          newPlate={newPlate}
          setNewPlate={setNewPlate}
          newLabel={newLabel}
          setNewLabel={setNewLabel}
          addVehicle={addVehicle}
          addingVehicle={addingVehicle}
        />
      )}

      {/* Toast */}
      <div
        className={cn(
          'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl font-lovelo text-xs font-black tracking-wide transition-all duration-300',
          toast ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-3 pointer-events-none',
          toast?.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white',
        )}
      >
        {toast?.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
        {toast?.msg}
      </div>
    </div>
  );
}
