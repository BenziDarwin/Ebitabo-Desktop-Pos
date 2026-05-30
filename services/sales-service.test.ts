import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@/core/entities";
import { fetchBusinessClients } from "@/services/sales-service";
import { sendRequestModel } from "@/services/repositories/send-request";
import {
  readLocalProductClients,
  readLocalServiceClients,
  readLocalProducts,
  writeLocalProductClients,
  writeLocalServiceClients,
} from "@/services/repositories/local-catalog-storage";

vi.mock("@/services/repositories/send-request", () => ({
  sendRequestModel: vi.fn(),
}));

vi.mock("@/services/repositories/local-catalog-storage", () => ({
  readLocalProducts: vi.fn(() => []),
  readLocalProductClients: vi.fn(() => []),
  readLocalServiceClients: vi.fn(() => []),
  writeLocalProductClients: vi.fn(),
  writeLocalServiceClients: vi.fn(),
}));

function buildClientRecords(
  startId: number,
  count: number,
): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => {
    const id = startId + index;
    return {
      id,
      name: `Client ${id}`,
      advancedAmount: id,
    };
  });
}

describe("fetchBusinessClients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readLocalProducts).mockReturnValue([]);
    vi.mocked(readLocalProductClients).mockReturnValue([]);
    vi.mocked(readLocalServiceClients).mockReturnValue([]);
  });

  it("fetches all client pages for large sales-business accounts", async () => {
    const firstPage = buildClientRecords(1, 100);
    const secondPage = buildClientRecords(101, 30);

    vi.mocked(sendRequestModel)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);

    const clients = await fetchBusinessClients("Sales Business");

    expect(sendRequestModel).toHaveBeenCalledTimes(2);
    expect(sendRequestModel).toHaveBeenNthCalledWith(
      1,
      "the_sales.business_clients",
      {
        fields: ["id", "name", "advancedAmount"],
        search_filter: "",
        page_no: 1,
        limit: 100,
      },
    );
    expect(sendRequestModel).toHaveBeenNthCalledWith(
      2,
      "the_sales.business_clients",
      {
        fields: ["id", "name", "advancedAmount"],
        search_filter: "",
        page_no: 2,
        limit: 100,
      },
    );
    expect(clients).toHaveLength(130);
    expect(writeLocalProductClients).toHaveBeenCalledTimes(1);
    expect(writeLocalProductClients).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "1", name: "Client 1" }),
        expect.objectContaining({ id: "130", name: "Client 130" }),
      ]),
    );
  });

  it("falls back to cached clients when the remote request fails", async () => {
    const cachedClients: Client[] = [
      {
        id: "777",
        name: "Cached Client",
        advancedAmount: 15,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    ];
    vi.mocked(readLocalProductClients).mockReturnValue(cachedClients);
    vi.mocked(sendRequestModel).mockRejectedValueOnce(
      new Error("Request failed"),
    );

    const clients = await fetchBusinessClients("Sales Business");

    expect(clients).toEqual(cachedClients);
    expect(writeLocalProductClients).not.toHaveBeenCalled();
  });

  it("stops pagination when a full page repeats with no new clients", async () => {
    const repeatedPage = buildClientRecords(1, 100);

    vi.mocked(sendRequestModel)
      .mockResolvedValueOnce(repeatedPage)
      .mockResolvedValueOnce(repeatedPage);

    const clients = await fetchBusinessClients("Sales Business");

    expect(sendRequestModel).toHaveBeenCalledTimes(2);
    expect(clients).toHaveLength(100);
    expect(writeLocalProductClients).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "100" })]),
    );
  });

  it("writes to service-client storage for non-sales accounts", async () => {
    vi.mocked(sendRequestModel).mockResolvedValueOnce(buildClientRecords(1, 2));

    const clients = await fetchBusinessClients("Service Business");

    expect(clients).toHaveLength(2);
    expect(writeLocalServiceClients).toHaveBeenCalledTimes(1);
    expect(writeLocalProductClients).not.toHaveBeenCalled();
  });
});
