import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import MembershipsPanel, {
  IssueMembershipModal,
  ManageVehiclesModal,
  type CustomerResult,
  type CarwashVisit,
  type VehicleDraft,
} from './MembershipsPanel';
import { AuthProvider } from '../context/AuthContext';
import { api } from '../lib/api';
import type { Membership } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    getMemberships: vi.fn().mockResolvedValue([]),
    searchMembershipCustomers: vi.fn().mockResolvedValue([]),
    getCustomerCarwashHistory: vi.fn().mockResolvedValue([]),
    issueMembership: vi.fn(),
    renewMembership: vi.fn().mockResolvedValue({}),
    cancelMembership: vi.fn().mockResolvedValue({}),
    addMembershipVehicle: vi.fn().mockResolvedValue({}),
    removeMembershipVehicle: vi.fn().mockResolvedValue({}),
    getMembership: vi.fn(),
  },
}));

const baseIssueProps = {
  issueStep: 'search' as const,
  setIssueStep: vi.fn(),
  customerQuery: '',
  setCustomerQuery: vi.fn(),
  searchingCustomers: false,
  customerResults: [] as CustomerResult[],
  selectCustomer: vi.fn(),
  selectedCustomer: null,
  carwashHistory: [] as CarwashVisit[],
  loadingHistory: false,
  showVehicleForm: false,
  setShowVehicleForm: vi.fn(),
  issueMemberName: '',
  setIssueMemberName: vi.fn(),
  issueVehicles: [{ plateNumber: '', vehicleLabel: '' }] as VehicleDraft[],
  addVehicleRow: vi.fn(),
  updateVehicleField: vi.fn(),
  removeVehicleRow: vi.fn(),
  submitIssue: vi.fn(),
  issuing: false,
  onClose: vi.fn(),
};

describe('IssueMembershipModal', () => {
  it('shows the search step with an input and no results yet', () => {
    render(<IssueMembershipModal {...baseIssueProps} />);
    expect(screen.getByText('Make a Member')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Name, phone, or email…')).toBeInTheDocument();
  });

  it('shows a no-account-found message when a query has no results', () => {
    render(<IssueMembershipModal {...baseIssueProps} customerQuery="nobody" />);
    expect(screen.getByText(/No account found for "nobody"/)).toBeInTheDocument();
  });

  it('lists customer search results and calls selectCustomer on click', () => {
    const selectCustomer = vi.fn();
    const results: CustomerResult[] = [{ userId: 'u1', name: 'Maria Santos', phone: '09123456789', email: null }];
    render(<IssueMembershipModal {...baseIssueProps} customerResults={results} selectCustomer={selectCustomer} />);
    fireEvent.click(screen.getByText('Maria Santos'));
    expect(selectCustomer).toHaveBeenCalledWith(results[0]);
  });

  it('shows the selected customer profile and car wash history on the profile step', () => {
    const selectedCustomer: CustomerResult = { userId: 'u1', name: 'Maria Santos', phone: '09123456789', email: 'maria@example.com' };
    const history: CarwashVisit[] = [{ id: 'v1', serviceName: 'Premium Wash', date: '2026-01-01', timeSlot: '10:00 AM', status: 'COMPLETED', totalPrice: 500 }];
    render(
      <IssueMembershipModal
        {...baseIssueProps}
        issueStep="profile"
        selectedCustomer={selectedCustomer}
        carwashHistory={history}
      />,
    );
    expect(screen.getByText('Premium Wash')).toBeInTheDocument();
    expect(screen.getByText(/Make Maria Santos a Member/)).toBeInTheDocument();
  });

  it('shows "no bookings on record" when history is empty', () => {
    const selectedCustomer: CustomerResult = { userId: 'u1', name: 'Maria Santos', phone: '09123456789', email: null };
    render(<IssueMembershipModal {...baseIssueProps} issueStep="profile" selectedCustomer={selectedCustomer} />);
    expect(screen.getByText('No car wash bookings on record yet.')).toBeInTheDocument();
  });

  it('shows the vehicle form and calls submitIssue when the button is clicked', () => {
    const submitIssue = vi.fn();
    const selectedCustomer: CustomerResult = { userId: 'u1', name: 'Maria Santos', phone: '09123456789', email: null };
    render(
      <IssueMembershipModal
        {...baseIssueProps}
        issueStep="profile"
        selectedCustomer={selectedCustomer}
        showVehicleForm
        issueMemberName="Maria Santos"
        submitIssue={submitIssue}
      />,
    );
    fireEvent.click(screen.getByText('Issue Membership'));
    expect(submitIssue).toHaveBeenCalled();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<IssueMembershipModal {...baseIssueProps} onClose={onClose} />);
    fireEvent.click(document.querySelector('button')!);
    expect(onClose).toHaveBeenCalled();
  });
});

const membership: Membership = {
  id: 'm1',
  membershipNo: 'WNG-000123',
  memberName: 'Maria Santos',
  userId: 'u1',
  issuedBy: 'admin1',
  purchaseDate: '2026-01-01',
  expiresAt: '2027-01-01',
  status: 'ACTIVE',
  visitCount: 3,
  firstWashUsed: true,
  freeWashCredits: 0,
  createdAt: '2026-01-01',
  vehicles: [{ id: 'v1', plateNumber: 'ABC1234', vehicleLabel: 'Family Car' }],
};

describe('ManageVehiclesModal', () => {
  it('lists the membership\'s vehicles', () => {
    render(
      <ManageVehiclesModal
        membership={membership}
        onClose={() => {}}
        removeVehicle={() => {}}
        removingVehicleId={null}
        newPlate=""
        setNewPlate={() => {}}
        newLabel=""
        setNewLabel={() => {}}
        addVehicle={() => {}}
        addingVehicle={false}
      />,
    );
    expect(screen.getByText('ABC1234')).toBeInTheDocument();
    expect(screen.getByText('Family Car')).toBeInTheDocument();
  });

  it('shows a no-vehicles message when there are none', () => {
    render(
      <ManageVehiclesModal
        membership={{ ...membership, vehicles: [] }}
        onClose={() => {}}
        removeVehicle={() => {}}
        removingVehicleId={null}
        newPlate=""
        setNewPlate={() => {}}
        newLabel=""
        setNewLabel={() => {}}
        addVehicle={() => {}}
        addingVehicle={false}
      />,
    );
    expect(screen.getByText('No vehicles on this membership yet.')).toBeInTheDocument();
  });

  it('shows the max-vehicles notice once at 3 vehicles', () => {
    const fullMembership = {
      ...membership,
      vehicles: [
        { id: 'v1', plateNumber: 'AAA1111', vehicleLabel: null },
        { id: 'v2', plateNumber: 'BBB2222', vehicleLabel: null },
        { id: 'v3', plateNumber: 'CCC3333', vehicleLabel: null },
      ],
    };
    render(
      <ManageVehiclesModal
        membership={fullMembership}
        onClose={() => {}}
        removeVehicle={() => {}}
        removingVehicleId={null}
        newPlate=""
        setNewPlate={() => {}}
        newLabel=""
        setNewLabel={() => {}}
        addVehicle={() => {}}
        addingVehicle={false}
      />,
    );
    expect(screen.getByText('This membership already has the maximum of 3 vehicles.')).toBeInTheDocument();
  });

  it('calls addVehicle when Add Vehicle is clicked', () => {
    const addVehicle = vi.fn();
    render(
      <ManageVehiclesModal
        membership={membership}
        onClose={() => {}}
        removeVehicle={() => {}}
        removingVehicleId={null}
        newPlate="XYZ9999"
        setNewPlate={() => {}}
        newLabel=""
        setNewLabel={() => {}}
        addVehicle={addVehicle}
        addingVehicle={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Vehicle' }));
    expect(addVehicle).toHaveBeenCalled();
  });

  it('calls removeVehicle with the vehicle id when its remove button is clicked', () => {
    const removeVehicle = vi.fn();
    render(
      <ManageVehiclesModal
        membership={membership}
        onClose={() => {}}
        removeVehicle={removeVehicle}
        removingVehicleId={null}
        newPlate=""
        setNewPlate={() => {}}
        newLabel=""
        setNewLabel={() => {}}
        addVehicle={() => {}}
        addingVehicle={false}
      />,
    );
    // Buttons in order: close (X), remove-vehicle (trash icon), Add Vehicle
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]);
    expect(removeVehicle).toHaveBeenCalledWith('v1');
  });
});

// ─── Container: MembershipsPanel (default export) ────────────────────────────
// The list load and the customer search are both debounced (~300ms setTimeout)
// in the real component -- using real timers with waitFor rather than fake
// timers, since 300ms is comfortably inside RTL's default 1000ms poll window.

function renderPanel() {
  return render(
    <AuthProvider user={{ name: 'Admin', email: 'admin@example.com', isStaff: true }} token="test-token" forceRecoveryMode={false}>
      <MembershipsPanel />
    </AuthProvider>,
  );
}

const activeMembership: Membership = {
  id: 'm1', membershipNo: 'WNG-000123', memberName: 'Maria Santos', userId: 'u1',
  issuedBy: 'admin1', purchaseDate: '2026-01-01', expiresAt: '2027-01-01', status: 'ACTIVE',
  visitCount: 3, firstWashUsed: true, freeWashCredits: 0, createdAt: '2026-01-01',
  vehicles: [{ id: 'v1', plateNumber: 'ABC1234', vehicleLabel: 'Family Car' }],
};

describe('MembershipsPanel (container)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getMemberships).mockResolvedValue([]);
  });

  it('loads and shows the memberships list', async () => {
    vi.mocked(api.getMemberships).mockResolvedValue([activeMembership]);
    renderPanel();
    expect(await screen.findByText('WNG-000123', {}, { timeout: 1000 })).toBeInTheDocument();
    expect(screen.getByText('Maria Santos')).toBeInTheDocument();
  });

  it('re-queries the list when the search box changes', async () => {
    renderPanel();
    await waitFor(() => expect(api.getMemberships).toHaveBeenCalledWith(undefined, 'test-token'), { timeout: 1000 });

    fireEvent.change(screen.getByPlaceholderText(/Search by member name or membership/i), { target: { value: 'maria' } });
    await waitFor(() => expect(api.getMemberships).toHaveBeenCalledWith('maria', 'test-token'), { timeout: 1000 });
  });

  it('completes the full make-a-member flow', async () => {
    const customer: CustomerResult = { userId: 'u2', name: 'Ana Reyes', phone: '09123456789', email: null };
    vi.mocked(api.searchMembershipCustomers).mockResolvedValue([customer]);
    vi.mocked(api.getCustomerCarwashHistory).mockResolvedValue([]);
    vi.mocked(api.issueMembership).mockResolvedValue({ ...activeMembership, id: 'm2', membershipNo: 'WNG-000456', memberName: 'Ana Reyes' });

    renderPanel();
    await waitFor(() => expect(api.getMemberships).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Make a Member'));
    fireEvent.change(screen.getByPlaceholderText('Name, phone, or email…'), { target: { value: 'ana' } });

    const result = await screen.findByText('Ana Reyes', {}, { timeout: 1000 });
    fireEvent.click(result);

    await screen.findByText(/Make Ana Reyes a Member/);
    fireEvent.click(screen.getByText(/Make Ana Reyes a Member/));

    fireEvent.change(screen.getByPlaceholderText('Plate no.'), { target: { value: 'xyz9999' } });
    fireEvent.click(screen.getByText('Issue Membership'));

    await waitFor(() =>
      expect(api.issueMembership).toHaveBeenCalledWith(
        { memberName: 'Ana Reyes', userId: 'u2', vehicles: [{ plateNumber: 'XYZ9999', vehicleLabel: undefined }] },
        'test-token',
      ),
    );
    expect(screen.queryByText('Find an Existing Account')).not.toBeInTheDocument();
  });

  it('renews an active membership', async () => {
    vi.mocked(api.getMemberships).mockResolvedValue([activeMembership]);
    renderPanel();
    await screen.findByText('WNG-000123', {}, { timeout: 1000 });

    fireEvent.click(screen.getByTitle('Renew'));
    await waitFor(() => expect(api.renewMembership).toHaveBeenCalledWith('m1', 'test-token'));
  });

  it('cancels an active membership', async () => {
    vi.mocked(api.getMemberships).mockResolvedValue([activeMembership]);
    renderPanel();
    await screen.findByText('WNG-000123', {}, { timeout: 1000 });

    fireEvent.click(screen.getByTitle('Cancel membership'));
    await waitFor(() => expect(api.cancelMembership).toHaveBeenCalledWith('m1', 'test-token'));
  });

  it('adds a vehicle through the manage-vehicles modal', async () => {
    vi.mocked(api.getMemberships).mockResolvedValue([activeMembership]);
    vi.mocked(api.getMembership).mockResolvedValue({
      ...activeMembership,
      vehicles: [...activeMembership.vehicles, { id: 'v2', plateNumber: 'NEW1234', vehicleLabel: null }],
    });
    renderPanel();
    await screen.findByText('WNG-000123', {}, { timeout: 1000 });

    fireEvent.click(screen.getByTitle('Manage vehicles'));
    const modal = (await screen.findByText("Maria Santos's Vehicles")).closest('div')!.parentElement!.parentElement!;

    fireEvent.change(within(modal).getByPlaceholderText('Plate no.'), { target: { value: 'new1234' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Add Vehicle' }));

    await waitFor(() =>
      expect(api.addMembershipVehicle).toHaveBeenCalledWith('m1', { plateNumber: 'NEW1234', vehicleLabel: undefined }, 'test-token'),
    );
    expect(await within(modal).findByText('NEW1234')).toBeInTheDocument();
  });
});
