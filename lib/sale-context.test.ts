import { describe, expect, it, vi } from "vitest";
import { resolveBusinessForSale } from "@/lib/sale-context";

describe("resolveBusinessForSale", () => {
  it("returns refreshed business details when online refresh succeeds", async () => {
    const currentBusiness = {
      id: 1,
      name: "Local",
      account_type: "Sales Business",
      currency_id: 1,
      business_logo: null,
      dateExpiry: null,
      phone_numbers: [],
      contact_details: null,
      company_name: null,
      company_address: null,
      company_phone: null,
      company_email: null,
      apiUrl: "https://local.example.com",
      userId: "10",
    };
    const refreshedBusiness = {
      ...currentBusiness,
      name: "Remote",
    };

    const refreshBusinessDetails = vi.fn(async () => refreshedBusiness);

    const resolved = await resolveBusinessForSale({
      currentBusiness,
      refreshBusinessDetails,
      isOnline: true,
    });

    expect(refreshBusinessDetails).toHaveBeenCalledTimes(1);
    expect(resolved).toEqual(refreshedBusiness);
  });

  it("falls back to current business if online refresh returns null", async () => {
    const currentBusiness = {
      id: 2,
      name: "Current",
      account_type: "Services Business",
      currency_id: 2,
      business_logo: null,
      dateExpiry: null,
      phone_numbers: [],
      contact_details: null,
      company_name: null,
      company_address: null,
      company_phone: null,
      company_email: null,
      apiUrl: "https://local.example.com",
      userId: "11",
    };

    const resolved = await resolveBusinessForSale({
      currentBusiness,
      refreshBusinessDetails: vi.fn(async () => null),
      isOnline: true,
    });

    expect(resolved).toEqual(currentBusiness);
  });

  it("returns cached business without online call when offline", async () => {
    const currentBusiness = {
      id: 3,
      name: "Offline",
      account_type: "Sales Business",
      currency_id: 3,
      business_logo: null,
      dateExpiry: null,
      phone_numbers: [],
      contact_details: null,
      company_name: null,
      company_address: null,
      company_phone: null,
      company_email: null,
      apiUrl: "https://local.example.com",
      userId: "12",
    };
    const refreshBusinessDetails = vi.fn(async () => currentBusiness);

    const resolved = await resolveBusinessForSale({
      currentBusiness,
      refreshBusinessDetails,
      isOnline: false,
    });

    expect(refreshBusinessDetails).not.toHaveBeenCalled();
    expect(resolved).toEqual(currentBusiness);
  });
});
