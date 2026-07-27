import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  IssueMembershipModal,
  ManageVehiclesModal,
  type CustomerResult,
  type CarwashVisit,
  type VehicleDraft,
} from './MembershipsPanel';
import type { Membership } from '../lib/api';

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
