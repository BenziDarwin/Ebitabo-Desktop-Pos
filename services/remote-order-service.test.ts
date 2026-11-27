import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderDraft } from "@/core/entities";
import {
  fetchServerOrders,
  resolveNumericUserId,
  sendOrderStatus,
} from "@/services/remote-order-service";
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

  it("succeeds when server returns boolean Result true on write/cancellation", async () => {
    vi.mocked(sendRequestModel).mockResolvedValueOnce([{ Result: true }]);

    const order: OrderDraft = {
      id: "draft-3",
      reference: "OrderRCTm-9999",
      items: [
        {
          productId: "12",
          name: "Item",
          quantity: 1,
          price: 5000,
          subtotal: 5000,
        },
      ],
      subtotal: 5000,
      total: 5000,
      createdAt: new Date("2026-11-24T10:00:00Z"),
      updatedAt: new Date("2026-11-24T10:00:00Z"),
      servedBy: "Jane Doe",
      userId: "1",
    };

    const res = await sendOrderStatus(order, "cancelled");
    expect(res).toEqual([{ Result: true }]);
  });

  it("fetchServerOrders retrieves and joins orders with their lines", async () => {
    vi.mocked(sendRequestModel)
      .mockResolvedValueOnce([
        {
          id: 55,
          order_ref: "OrderRCTm-5555",
          order_type: "sale",
          order_date: "2026-11-24 10:00:00",
          served_by: "Jane Doe",
          subtotal: 24000,
          total_amount: 24000,
          state: "created",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 101,
          order_id: [55, "OrderRCTm-5555"],
          product_id: [12, "Product A"],
          item_type: "Product",
          item_name: "Product A",
          number_sold: 2,
          unit_cost: 12000,
          total_amount: 24000,
        },
      ]);

    const orders = await fetchServerOrders(1);
    expect(orders).toHaveLength(1);
    expect(orders[0].reference).toBe("OrderRCTm-5555");
    expect(orders[0].items).toHaveLength(1);
    expect(orders[0].items[0].name).toBe("Product A");
    expect(orders[0].items[0].quantity).toBe(2);
    expect(orders[0].items[0].productId).toBe("12");
  });

  it("fetchServerOrders does not misclassify product lines with Odoo service_id: false", async () => {
    vi.mocked(sendRequestModel)
      .mockResolvedValueOnce([
        {
          id: 56,
          order_ref: "OrderRCTm-5656",
          order_type: "sale",
          order_date: "2026-11-27 10:00:00",
          served_by: "Cashier",
          subtotal: 15000,
          total_amount: 15000,
          state: "created",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 102,
          order_id: [56, "OrderRCTm-5656"],
          product_id: [24, "Product B"],
          service_id: false,
          item_type: "Product",
          item_name: "Product B",
          number_sold: 3,
          unit_cost: 5000,
          total_amount: 15000,
        },
      ]);

    const orders = await fetchServerOrders(1);
    expect(orders).toHaveLength(1);
    expect(orders[0].items[0].productId).toBe("24");
    expect(orders[0].items[0].serviceId).toBeUndefined();
  });

  it("resolveNumericUserId skips non-numeric userId and falls back to businessUserId", () => {
    expect(resolveNumericUserId("admin", "42")).toBe(42);
    expect(resolveNumericUserId("7", "42")).toBe(7);
    expect(resolveNumericUserId("", "")).toBe(0);
  });
});
