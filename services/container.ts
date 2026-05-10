import {
  AuthenticateUserUseCase,
  CompleteOrderUseCase,
  GetCompletedOrdersUseCase,
  GetOrderHistoryUseCase,
  GetProductsUseCase,
  GetServicesUseCase,
  GetTodaySalesUseCase,
  GetTopProductsUseCase,
  SearchProductsUseCase,
} from "@/core/use-cases";
import { LocalHistoryRepository } from "@/services/repositories/local-history-repository";
import { LocalOrderRepository } from "@/services/repositories/local-order-repository";
import { RemoteAuthRepository } from "@/services/repositories/remote-auth-repository";
import { RemoteCatalogRepository } from "@/services/repositories/remote-catalog-repository";

const authRepository = new RemoteAuthRepository();
const catalogRepository = new RemoteCatalogRepository();
const historyRepository = new LocalHistoryRepository();
const orderRepository = new LocalOrderRepository();

export const authenticateUserUseCase = new AuthenticateUserUseCase(
  authRepository,
);

export const getProductsUseCase = new GetProductsUseCase(catalogRepository);
export const searchProductsUseCase = new SearchProductsUseCase(
  catalogRepository,
);
export const getServicesUseCase = new GetServicesUseCase(catalogRepository);

export const getOrderHistoryUseCase = new GetOrderHistoryUseCase(
  historyRepository,
);
export const getCompletedOrdersUseCase = new GetCompletedOrdersUseCase(
  historyRepository,
);
export const getTodaySalesUseCase = new GetTodaySalesUseCase(historyRepository);
export const getTopProductsUseCase = new GetTopProductsUseCase(
  historyRepository,
);

export const completeOrderUseCase = new CompleteOrderUseCase(orderRepository);
