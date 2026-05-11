import type {
  CompletedOrder,
  OrderDraft,
  Payment,
  SaleSyncMetadata,
} from "@/core/entities";

export interface CompleteOrderOptions {
  payments?: Payment[];
  change?: number;
  sync?: Partial<SaleSyncMetadata>;
}

export interface OrderRepository {
  completeOrder(
    order: OrderDraft,
    userId: string,
    options?: CompleteOrderOptions,
  ): Promise<CompletedOrder>;
}
