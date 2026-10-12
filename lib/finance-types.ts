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
  /** Parte de la venta que el cliente aún no ha pagado. */
  pendingAmount?: number;
  note?: string;
  createdAt: string;
};

export type ReceivableConcept = {
  name: string;
  amount: number;
};

export type ReceivablePayment = {
  id: string;
  amount: number;
  paymentAccount: Exclude<PaymentAccount, "debt">;
  occurredAt: string;
  note?: string;
};

/** Saldo que un cliente debe a Sky Collections. */
export type CustomerReceivable = {
  id: string;
  customerId: string;
  occurredAt: string;
  concepts: ReceivableConcept[];
  payments: ReceivablePayment[];
  sourceSaleId?: string;
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
  sourceExpenseId?: string;
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

export type HistoricalWeek = {
  month: string;
  week: number;
  sales: number;
};

export type FinanceData = {
  version?: number;
  baseline: FinancialBaseline;
  historicalMonths: HistoricalMonth[];
  historicalWeeks?: HistoricalWeek[];
  customers: Customer[];
  sales: Sale[];
  expenses: Expense[];
  shipments: Shipment[];
  incomingOrders: IncomingOrder[];
  debtPayments: DebtPayment[];
  customerReceivables?: CustomerReceivable[];
};
