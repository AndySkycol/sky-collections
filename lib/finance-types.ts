export type PaymentAccount = "nequi" | "cash" | "debt";

export type Customer = {
  id: string;
  name: string;
  phone?: string;
  shippingCreditAdjustment?: number;
  createdAt: string;
};

export type SaleItem = {
  productKey?: string;
  name: string;
  category?: string;
  quantity: number;
  unitPrice: number;
};

export type Sale = {
  id: string;
  occurredAt: string;
  customerId?: string;
  items: SaleItem[];
  paymentAccount: PaymentAccount;
  note?: string;
  createdAt: string;
};

export type Expense = {
  id: string;
  occurredAt: string;
  concept: string;
  amount: number;
  paymentAccount: PaymentAccount;
  category: "mercancia" | "tarjetas" | "envio" | "publicidad" | "otro";
  note?: string;
};

export type Shipment = {
  id: string;
  customerId: string;
  occurredAt: string;
  carrier?: string;
  guide?: string;
  cost: number;
  paymentAccount?: PaymentAccount;
  note?: string;
};

export type IncomingOrder = {
  id: string;
  productName: string;
  expectedQuantity: number;
  sourceExpenseId: string;
  expectedAt?: string;
  note?: string;
  status: "pending" | "received";
  createdAt: string;
  receivedAt?: string;
};

export type DebtPayment = {
  id: string;
  occurredAt: string;
  amount: number;
  paymentAccount: PaymentAccount;
  note?: string;
};

export type FinancialBaseline = {
  cutoverDate: string;
  nequi: number;
  cash: number;
  debt: number;
};

export type HistoricalMonth = {
  month: string;
  sales: number;
  expenses: number;
};

export type FinanceData = {
  version?: number;
  baseline: FinancialBaseline;
  historicalMonths: HistoricalMonth[];
  customers: Customer[];
  sales: Sale[];
  expenses: Expense[];
  shipments: Shipment[];
  incomingOrders: IncomingOrder[];
  debtPayments: DebtPayment[];
};
