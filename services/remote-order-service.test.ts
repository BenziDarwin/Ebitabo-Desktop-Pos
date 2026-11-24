import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderDraft } from "@/core/entities";
import { sendOrderStatus } from "@/services/remote-order-service";
import { sendRequestModel } from "@/services/repositories/send-request";
import { Storage } from "@/lib/storage";
import { STORAGE_KEYS } from "@/lib/constants";

vi.mock("@/services/repositories/send-request", () => ({
  sendRequestModel: vi.fn(),
}));

describe("remote-order-service: sendOrderStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Storage.setItem(STORAGE_KEYS.clientUrl, "https://test.ebitabo.com");
    Storage.setItem(STORAGE_KEYS.apiKey, "dummy_key");
  });

  it("sends service_id and omits product_id for service items", async () => {
    vi.mocked(sendRequestModel).mockResolvedValueOnce([{ id: 101 }]);

    const order: OrderDraft = {
      id: "draft-1",
      reference: "OrderRCTm-1234",
      items: [
        {
          serviceId: "34",
          name: "Cornrows plain",
          quantity: 1,
          price: 20000,
          subtotal: 20000,
        },
      ],
      subtotal: 20000,
      total: 20000,
      createdAt: new Date("2026-11-24T10:00:00Z"),
      updatedAt: new Date("2026-11-24T10:00:00Z"),
      servedBy: "Jane Doe",
      userId: "1",
    };

    await sendOrderStatus(order, "completed");

    expect(sendRequestModel).toHaveBeenCalledTimes(1);
    const [model, payload] = vi.mocked(sendRequestModel).mock.calls[0];
    expect(model).toBe("eb_pos.order");

    const line = (payload as any).values.line_ids[0];
    expect(line.item_type).toBe("Service");
    expect(line.service_id).toBe(34);
    expect(line.product_id).toBeUndefined();
    expect(line.item_name).toBe("Cornrows plain");
    expect(line.number_sold).toBe(1);
    expect(line.unit_cost).toBe(20000);
    expect(line.total_amount).toBe(20000);
  });

  it("sends product_id and omits service_id for product items", async () => {
    vi.mocked(sendRequestModel).mockResolvedValueOnce([{ id: 102 }]);

    const order: OrderDraft = {
      id: "draft-2",
      reference: "OrderRCTm-5678",
      items: [
        {
          productId: "12",
          name: "ACTIVATED CHARCOAL",
          quantity: 3,
          price: 24000,
          subtotal: 72000,
        },
      ],
      subtotal: 72000,
      total: 72000,
      createdAt: new Date("2026-11-24T10:00:00Z"),
      updatedAt: new Date("2026-11-24T10:00:00Z"),
      servedBy: "Jane Doe",
      userId: "1",
    };

    await sendOrderStatus(order, "completed");

    expect(sendRequestModel).toHaveBeenCalledTimes(1);
    const [model, payload] = vi.mocked(sendRequestModel).mock.calls[0];
    expect(model).toBe("eb_pos.order");

    const line = (payload as any).values.line_ids[0];
    expect(line.item_type).toBe("Product");
    expect(line.product_id).toBe(12);
    expect(line.service_id).toBeUndefined();
    expect(line.item_name).toBe("ACTIVATED CHARCOAL");
    expect(line.number_sold).toBe(3);
    expect(line.unit_cost).toBe(24000);
    expect(line.total_amount).toBe(72000);
  });
});
