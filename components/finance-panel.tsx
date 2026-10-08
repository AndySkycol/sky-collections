"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Product } from "../lib/catalog-types";
import type { Customer, DebtPayment, Expense, FinanceData, IncomingOrder, PaymentAccount, Sale, Shipment } from "../lib/finance-types";

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const asNumber = (value: string | number) => Math.max(0, Number(value) || 0);
const id = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const today = () => new Date().toISOString().slice(0, 10);
const accountLabel = (account: PaymentAccount) => account === "nequi" ? "Nequi" : account === "cash" ? "Efectivo" : "Deuda";
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });

type Props = {
  data: FinanceData;
  products: Product[];
  onChange: (finance: FinanceData, products?: Product[]) => void;
  onReceiveIncoming: (order: IncomingOrder, existingProductIndex?: number) => void;
};

type FinanceModal = "sale" | "expense" | "shipment" | "payment" | "customer" | "incoming" | "receive" | null;

function saleAmount(sale: Sale) {
  return sale.items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
}

function customerAmount(customer: Customer, sales: Sale[], shipments: Shipment[]) {
  const latestShipment = shipments.filter((item) => item.customerId === customer.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  const fromSales = sales.filter((sale) => sale.customerId === customer.id && (!latestShipment || sale.occurredAt > latestShipment.occurredAt)).reduce((total, sale) => total + saleAmount(sale), 0);
  return Math.max(0, fromSales + (customer.shippingCreditAdjustment ?? 0));
}

export function FinancePanel({ data, products, onChange, onReceiveIncoming }: Props) {
  const [modal, setModal] = useState<FinanceModal>(null);
  const [panelView, setPanelView] = useState<"summary" | "detail">("summary");
  const [detailView, setDetailView] = useState<"sales" | "expenses" | "debt" | "shipments">("sales");
  const [saleFilters, setSaleFilters] = useState({ search: "", category: "all", country: "", team: "" });
  const [saleDraft, setSaleDraft] = useState({ mode: "inventory" as "inventory" | "category", productIndex: "", category: "", quantity: 1, total: 0, customerId: "", newCustomer: "", phone: "", noCustomer: false, account: "nequi" as PaymentAccount, occurredAt: today(), note: "" });
  const [expenseDraft, setExpenseDraft] = useState({ concept: "", amount: 0, account: "nequi" as PaymentAccount, category: "mercancia" as Expense["category"], occurredAt: today(), note: "", createIncoming: true, merchandise: [{ name: "", quantity: 1, expectedAt: "" }] });
  const [shipmentDraft, setShipmentDraft] = useState({ customerId: "", cost: 0, account: "nequi" as PaymentAccount, occurredAt: today(), carrier: "", guide: "", note: "" });
  const [paymentDraft, setPaymentDraft] = useState({ amount: 0, account: "nequi" as PaymentAccount, occurredAt: today(), note: "" });
  const [incomingDraft, setIncomingDraft] = useState({ productName: "", quantity: 1, expectedAt: "", note: "" });
  const [customerDraft, setCustomerDraft] = useState({ id: "", name: "", phone: "", trackedAmount: 0 });
  const [editing, setEditing] = useState<{ type: "sale" | "expense" | "payment" | "shipment"; id: string } | null>(null);
  const [receivingOrder, setReceivingOrder] = useState<IncomingOrder | null>(null);
  const [receiveMode, setReceiveMode] = useState<"existing" | "new">("existing");
  const [receiveProductIndex, setReceiveProductIndex] = useState("");
  const [weekMonth, setWeekMonth] = useState(today().slice(0, 7));
  const [compareMonth, setCompareMonth] = useState("");

  const calculations = useMemo(() => {
    const salesByAccount = { nequi: 0, cash: 0, debt: 0 } as Record<PaymentAccount, number>;
    data.sales.forEach((sale) => { salesByAccount[sale.paymentAccount] += saleAmount(sale); });
    const expensesByAccount = { nequi: 0, cash: 0, debt: 0 } as Record<PaymentAccount, number>;
    data.expenses.forEach((expense) => { expensesByAccount[expense.paymentAccount] += expense.amount; });
    data.shipments.forEach((shipment) => { if (shipment.paymentAccount) expensesByAccount[shipment.paymentAccount] += shipment.cost; });
    data.debtPayments.forEach((payment) => { expensesByAccount[payment.paymentAccount] += payment.amount; });
    const nequi = data.baseline.nequi + salesByAccount.nequi - expensesByAccount.nequi;
    const cash = data.baseline.cash + salesByAccount.cash - expensesByAccount.cash;
    const debt = data.baseline.debt + expensesByAccount.debt - data.debtPayments.reduce((total, payment) => total + payment.amount, 0);
    return { nequi, cash, debt, salesByAccount, expensesByAccount };
  }, [data]);

  const monthly = useMemo(() => {
    const map = new Map(data.historicalMonths.map((item) => [item.month, { ...item }]));
    for (const sale of data.sales) {
      const month = sale.occurredAt.slice(0, 7);
      const current = map.get(month) ?? { month, sales: 0, expenses: 0 };
      current.sales += saleAmount(sale); map.set(month, current);
    }
    for (const expense of data.expenses) {
      const month = expense.occurredAt.slice(0, 7);
      const current = map.get(month) ?? { month, sales: 0, expenses: 0 };
      current.expenses += expense.amount; map.set(month, current);
    }
    for (const payment of data.debtPayments) {
      const month = payment.occurredAt.slice(0, 7);
      const current = map.get(month) ?? { month, sales: 0, expenses: 0 };
      current.expenses += payment.amount; map.set(month, current);
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [data]);

  const bestSellers = useMemo(() => {
    const totals = new Map<string, { name: string; units: number; revenue: number }>();
    data.sales.forEach((sale) => sale.items.forEach((item) => {
      const key = item.category === "Tarjetas" ? "__cards__" : item.name;
      const name = item.category === "Tarjetas" ? "Tarjetas" : item.name;
      const current = totals.get(key) ?? { name, units: 0, revenue: 0 };
      current.units += item.quantity; current.revenue += item.quantity * item.unitPrice; totals.set(key, current);
    }));
    return [...totals.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, 6);
  }, [data.sales]);

  const customerRows = useMemo(() => data.customers.map((customer) => ({ customer, amount: customerAmount(customer, data.sales, data.shipments) })).sort((a, b) => b.amount - a.amount || a.customer.name.localeCompare(b.customer.name)), [data]);
  const availableSaleProducts = useMemo(() => products.filter((product) => {
    if (product.stock < 1 && saleDraft.productIndex !== `${products.indexOf(product)}`) return false;
    if (saleFilters.search && !`${product.name} ${product.detail ?? ""}`.toLowerCase().includes(saleFilters.search.toLowerCase())) return false;
    if (saleFilters.category === "boxes" && product.category !== "Producto sellado") return false;
    if (saleFilters.category === "cards" && product.category !== "Tarjetas") return false;
    if (saleFilters.country && product.country !== saleFilters.country) return false;
    if (saleFilters.team && product.team !== saleFilters.team) return false;
    return true;
  }), [products, saleFilters]);
  const saleCountries = useMemo(() => [...new Set(products.map((product) => product.country).filter(Boolean))].sort() as string[], [products]);
  const saleTeams = useMemo(() => [...new Set(products.map((product) => product.team).filter(Boolean))].sort() as string[], [products]);
  const selectedSaleProduct = saleDraft.productIndex === "" ? undefined : products[Number(saleDraft.productIndex)];
  const boxesInventoryValue = useMemo(() => products.filter((product) => product.category === "Producto sellado" || product.category === "Hobby box").reduce((total, product) => total + Number(product.price || 0) * Number(product.stock || 0), 0), [products]);
  const selectableMonths = useMemo(() => { const months = new Set<string>([today().slice(0, 7)]); data.historicalMonths.forEach((item) => months.add(item.month)); data.historicalWeeks?.forEach((item) => months.add(item.month)); data.sales.forEach((sale) => months.add(sale.occurredAt.slice(0, 7))); return Array.from(months).sort().reverse(); }, [data]);
  const weeklySales = useMemo(() => (month: string) => [1, 2, 3, 4, 5].map((week) => {
    const historic = data.historicalWeeks?.find((item) => item.month === month && item.week === week)?.sales ?? 0;
    const registered = data.sales.filter((sale) => sale.occurredAt.startsWith(month) && Math.floor((Number(sale.occurredAt.slice(8, 10)) - 1) / 7) + 1 === week).reduce((total, sale) => total + saleAmount(sale), 0);
    return historic + registered;
  }), [data.historicalWeeks, data.sales]);
  const currentWeeks = weeklySales(weekMonth);
  const comparisonWeeks = compareMonth ? weeklySales(compareMonth) : [];
  const weeklyMax = Math.max(1, ...currentWeeks, ...comparisonWeeks);
  const chartMax = Math.max(1, ...monthly.flatMap((item) => [item.sales, item.expenses]));

  function patch(next: Partial<FinanceData>) { onChange({ ...data, ...next }); }
  function openSale() { setEditing(null); setSaleFilters({ search: "", category: "all", country: "", team: "" }); setSaleDraft({ mode: "inventory", productIndex: "", category: "", quantity: 1, total: 0, customerId: data.customers[0]?.id ?? "", newCustomer: "", phone: "", noCustomer: false, account: "nequi", occurredAt: today(), note: "" }); setModal("sale"); }
  function openExpense() { setEditing(null); setExpenseDraft({ concept: "", amount: 0, account: "nequi", category: "mercancia", occurredAt: today(), note: "", createIncoming: true, merchandise: [{ name: "", quantity: 1, expectedAt: "" }] }); setModal("expense"); }
  function openShipment() { setEditing(null); setShipmentDraft({ customerId: data.customers[0]?.id ?? "", cost: 0, account: "nequi", occurredAt: today(), carrier: "", guide: "", note: "" }); setModal("shipment"); }
  function openPayment() { setEditing(null); setPaymentDraft({ amount: 0, account: "nequi", occurredAt: today(), note: "" }); setModal("payment"); }
  function openIncoming() { setIncomingDraft({ productName: "", quantity: 1, expectedAt: "", note: "" }); setModal("incoming"); }

  function addSale(event: FormEvent) {
    event.preventDefault();
    const productIndex = Number(saleDraft.productIndex);
    const product = saleDraft.mode === "inventory" ? products[productIndex] : undefined;
    const quantity = asNumber(saleDraft.quantity);
    const previous = editing?.type === "sale" ? data.sales.find((sale) => sale.id === editing.id) : undefined;
    const previousItem = previous?.items[0];
    const available = product ? product.stock + (previousItem?.productKey === (product.id ?? `${productIndex}`) ? previousItem.quantity : 0) : 0;
    if ((saleDraft.mode === "inventory" && (!product || available < quantity)) || quantity < 1) return;
    let customers = data.customers;
    let customerId = saleDraft.customerId;
    if (customerId === "new") {
      const name = saleDraft.newCustomer.trim();
      if (!name) return;
      const customer: Customer = { id: id("customer"), name, phone: saleDraft.phone.trim() || undefined, createdAt: new Date().toISOString() };
      customers = [...customers, customer]; customerId = customer.id;
    }
    if (!customerId && !saleDraft.noCustomer) return;
    const total = asNumber(saleDraft.total);
    const sale: Sale = { id: previous?.id ?? id("sale"), occurredAt: saleDraft.occurredAt, customerId: saleDraft.noCustomer ? undefined : customerId, paymentAccount: saleDraft.account, note: saleDraft.note.trim() || undefined, createdAt: previous?.createdAt ?? new Date().toISOString(), items: [{ productKey: product?.id ?? (product ? `${productIndex}` : undefined), name: (product?.name ?? saleDraft.category) || "Venta general", category: (product?.category ?? saleDraft.category) || undefined, quantity, unitPrice: quantity ? total / quantity : 0 }] };
    const nextProducts = products.map((item) => ({ ...item }));
    if (previousItem) { const oldIndex = nextProducts.findIndex((item, index) => (item.id ?? `${index}`) === previousItem.productKey); if (oldIndex >= 0) nextProducts[oldIndex].stock += previousItem.quantity; }
    if (product) nextProducts[productIndex].stock -= quantity;
    onChange({ ...data, customers, sales: previous ? data.sales.map((item) => item.id === previous.id ? sale : item) : [...data.sales, sale] }, nextProducts);
    setEditing(null); setModal(null);
  }

  function addExpense(event: FormEvent) {
    event.preventDefault();
    if (!expenseDraft.concept.trim() || asNumber(expenseDraft.amount) <= 0) return;
    const previous = editing?.type === "expense" ? data.expenses.find((expense) => expense.id === editing.id) : undefined;
    const expenseId = previous?.id ?? id("expense");
    const expense: Expense = { id: expenseId, concept: expenseDraft.concept.trim(), amount: asNumber(expenseDraft.amount), paymentAccount: expenseDraft.account, category: expenseDraft.category, occurredAt: expenseDraft.occurredAt, note: expenseDraft.note.trim() || undefined };
    const incomingOrders = expenseDraft.createIncoming && (expenseDraft.category === "mercancia" || expenseDraft.category === "tarjetas")
      ? expenseDraft.merchandise.filter((item) => item.name.trim() && asNumber(item.quantity) > 0).map((item) => ({ id: id("incoming"), sourceExpenseId: expenseId, productName: item.name.trim(), expectedQuantity: Math.max(1, asNumber(item.quantity)), expectedAt: item.expectedAt || undefined, status: "pending" as const, createdAt: new Date().toISOString() }))
      : [];
    patch({ expenses: previous ? data.expenses.map((item) => item.id === expenseId ? expense : item) : [...data.expenses, expense], incomingOrders: [...data.incomingOrders.filter((order) => order.sourceExpenseId !== expenseId), ...incomingOrders] }); setEditing(null); setModal(null);
  }

  function addIncoming(event: FormEvent) {
    event.preventDefault();
    if (!incomingDraft.productName.trim() || asNumber(incomingDraft.quantity) < 1) return;
    patch({ incomingOrders: [...data.incomingOrders, { id: id("incoming"), productName: incomingDraft.productName.trim(), expectedQuantity: Math.max(1, asNumber(incomingDraft.quantity)), expectedAt: incomingDraft.expectedAt || undefined, note: incomingDraft.note.trim() || undefined, status: "pending", createdAt: new Date().toISOString() }] });
    setModal(null);
  }

  function addShipment(event: FormEvent) {
    event.preventDefault(); if (!shipmentDraft.customerId) return;
    const shipment: Shipment = { id: id("shipment"), customerId: shipmentDraft.customerId, occurredAt: shipmentDraft.occurredAt, cost: asNumber(shipmentDraft.cost), paymentAccount: shipmentDraft.cost > 0 ? shipmentDraft.account : undefined, carrier: shipmentDraft.carrier.trim() || undefined, guide: shipmentDraft.guide.trim() || undefined, note: shipmentDraft.note.trim() || undefined };
    const previous = editing?.type === "shipment" ? data.shipments.find((item) => item.id === editing.id) : undefined;
    const updated = previous ? { ...shipment, id: previous.id } : shipment;
    patch({ shipments: previous ? data.shipments.map((item) => item.id === previous.id ? updated : item) : [...data.shipments, updated], customers: data.customers.map((customer) => customer.id === updated.customerId ? { ...customer, shippingCreditAdjustment: 0 } : customer) }); setEditing(null); setModal(null);
  }

  function addPayment(event: FormEvent) {
    event.preventDefault(); if (asNumber(paymentDraft.amount) <= 0) return;
    const previous = editing?.type === "payment" ? data.debtPayments.find((item) => item.id === editing.id) : undefined;
    const payment: DebtPayment = { id: previous?.id ?? id("debt-payment"), amount: asNumber(paymentDraft.amount), paymentAccount: paymentDraft.account, occurredAt: paymentDraft.occurredAt, note: paymentDraft.note.trim() || undefined };
    patch({ debtPayments: previous ? data.debtPayments.map((item) => item.id === payment.id ? payment : item) : [...data.debtPayments, payment] }); setEditing(null); setModal(null);
  }

  function saveCustomer(event: FormEvent) {
    event.preventDefault(); if (!customerDraft.name.trim()) return;
    if (!customerDraft.id) {
      patch({ customers: [...data.customers, { id: id("customer"), name: customerDraft.name.trim(), phone: customerDraft.phone.trim() || undefined, shippingCreditAdjustment: customerDraft.trackedAmount, createdAt: new Date().toISOString() }] });
    } else {
      const customer = data.customers.find((item) => item.id === customerDraft.id)!;
      const latestShipment = data.shipments.filter((item) => item.customerId === customer.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
      const fromSales = data.sales.filter((sale) => sale.customerId === customer.id && (!latestShipment || sale.occurredAt > latestShipment.occurredAt)).reduce((total, sale) => total + saleAmount(sale), 0);
      patch({ customers: data.customers.map((item) => item.id === customer.id ? { ...item, name: customerDraft.name.trim(), phone: customerDraft.phone.trim() || undefined, shippingCreditAdjustment: customerDraft.trackedAmount - fromSales } : item) });
    }
    setModal(null);
  }

  function editSale(sale: Sale) { const item = sale.items[0]; const index = products.findIndex((product, productIndex) => (product.id ?? `${productIndex}`) === item.productKey); const mode = index >= 0 && Boolean(item.productKey) ? "inventory" : "category"; setSaleFilters({ search: "", category: "all", country: "", team: "" }); setSaleDraft({ mode, productIndex: index >= 0 ? `${index}` : "", category: item.category ?? "", quantity: item.quantity, total: saleAmount(sale), customerId: sale.customerId ?? "", newCustomer: "", phone: "", noCustomer: !sale.customerId, account: sale.paymentAccount, occurredAt: sale.occurredAt, note: sale.note ?? "" }); setEditing({ type: "sale", id: sale.id }); setModal("sale"); }
  function editExpense(expense: Expense) { const merchandise = data.incomingOrders.filter((order) => order.sourceExpenseId === expense.id).map((order) => ({ name: order.productName, quantity: order.expectedQuantity, expectedAt: order.expectedAt ?? "" })); setExpenseDraft({ concept: expense.concept, amount: expense.amount, account: expense.paymentAccount, category: expense.category, occurredAt: expense.occurredAt, note: expense.note ?? "", createIncoming: merchandise.length > 0, merchandise: merchandise.length ? merchandise : [{ name: "", quantity: 1, expectedAt: "" }] }); setEditing({ type: "expense", id: expense.id }); setModal("expense"); }
  function editPayment(payment: DebtPayment) { setPaymentDraft({ amount: payment.amount, account: payment.paymentAccount, occurredAt: payment.occurredAt, note: payment.note ?? "" }); setEditing({ type: "payment", id: payment.id }); setModal("payment"); }
  function editShipment(shipment: Shipment) { setShipmentDraft({ customerId: shipment.customerId, cost: shipment.cost, account: shipment.paymentAccount ?? "nequi", occurredAt: shipment.occurredAt, carrier: shipment.carrier ?? "", guide: shipment.guide ?? "", note: shipment.note ?? "" }); setEditing({ type: "shipment", id: shipment.id }); setModal("shipment"); }
  function deleteSale(sale: Sale) { if (!confirm("¿Anular esta venta? El inventario se devolverá.")) return; const nextProducts = products.map((product) => ({ ...product })); sale.items.forEach((item) => { const index = nextProducts.findIndex((product, productIndex) => (product.id ?? `${productIndex}`) === item.productKey); if (index >= 0) nextProducts[index].stock += item.quantity; }); onChange({ ...data, sales: data.sales.filter((item) => item.id !== sale.id) }, nextProducts); }
  function deleteExpense(expense: Expense) { if (confirm("¿Eliminar este gasto?")) patch({ expenses: data.expenses.filter((item) => item.id !== expense.id), incomingOrders: data.incomingOrders.filter((order) => order.sourceExpenseId !== expense.id) }); }
  function deletePayment(payment: DebtPayment) { if (confirm("¿Eliminar este abono?")) patch({ debtPayments: data.debtPayments.filter((item) => item.id !== payment.id) }); }
  function deleteShipment(shipment: Shipment) { if (confirm("¿Eliminar este envío?")) patch({ shipments: data.shipments.filter((item) => item.id !== shipment.id) }); }
  function deleteCustomer(customer: Customer) { if (confirm(`¿Eliminar a ${customer.name}? Las ventas previas quedarán sin cliente identificado.`)) patch({ customers: data.customers.filter((item) => item.id !== customer.id), sales: data.sales.map((sale) => sale.customerId === customer.id ? { ...sale, customerId: undefined } : sale) }); }
  function receiveIncoming(order: IncomingOrder) { setReceivingOrder(order); setReceiveMode("existing"); setReceiveProductIndex(""); setModal("receive"); }

  return <section className="finance-section">
    <nav className="admin-tabs finance-tabs" aria-label="Vistas de finanzas"><button className={`admin-button ${panelView === "summary" ? "active" : ""}`} onClick={() => setPanelView("summary")}>Resumen</button><button className={`admin-button ${panelView === "detail" ? "active" : ""}`} onClick={() => setPanelView("detail")}>Detalle de movimientos</button></nav>
    <div hidden={panelView !== "summary"} className="finance-summary-view">
    <div className="admin-panel finance-hero">
      <div className="admin-panel-head"><div><h1>Finanzas</h1><p>Control desde el {dateLabel(data.baseline.cutoverDate)}. Los saldos históricos se conservan como punto de partida.</p></div><div className="admin-actions"><button className="admin-button primary" onClick={openSale}>+ Registrar venta</button><button className="admin-button" onClick={openExpense}>+ Registrar gasto</button><button className="admin-button" onClick={openPayment}>+ Abono a deuda</button></div></div>
      <div className="finance-kpis finance-kpis-five">
        <article><span>Nequi</span><strong>{money.format(calculations.nequi)}</strong><small>Saldo inicial + movimientos</small></article>
        <article><span>Efectivo</span><strong>{money.format(calculations.cash)}</strong><small>Saldo inicial + movimientos</small></article>
        <article><span>Caja total</span><strong>{money.format(calculations.nequi + calculations.cash)}</strong><small>Nequi y efectivo</small></article>
        <article><span>Valor de inventario</span><strong>{money.format(boxesInventoryValue)}</strong><small>Solo cajas y producto sellado</small></article>
        <article className={calculations.debt > 0 ? "debt" : ""}><span>Deuda pendiente</span><strong>{money.format(Math.max(0, calculations.debt))}</strong><small>Se reduce con cada abono</small></article>
      </div>
    </div>

    <div className="finance-grid">
      <section className="admin-panel finance-chart-panel"><div className="finance-title"><div><h2>Ventas y gastos por mes</h2><p>Incluye el resumen histórico y los registros nuevos.</p></div></div><div className="finance-bars">{monthly.map((item) => <div className="finance-bar-group" key={item.month}><div className="finance-bar-track"><span className="finance-bar sales" style={{ height: `${Math.max(4, item.sales / chartMax * 100)}%` }} title={`Ventas ${money.format(item.sales)}`} /><span className="finance-bar expenses" style={{ height: `${Math.max(4, item.expenses / chartMax * 100)}%` }} title={`Gastos ${money.format(item.expenses)}`} /></div><strong>{new Date(`${item.month}-01T12:00:00`).toLocaleDateString("es-CO", { month: "short" })}</strong><small>{money.format(item.sales)}</small></div>)}</div><p className="finance-legend"><span className="legend-sales" />Ventas <span className="legend-expenses" />Gastos</p></section>
      <section className="admin-panel finance-chart-panel"><div className="finance-title"><div><h2>Productos más vendidos</h2><p>Se alimenta con las ventas registradas desde el corte.</p></div></div>{bestSellers.length ? <ol className="finance-ranking">{bestSellers.map((item, index) => <li key={item.name}><span>{index + 1}</span><div><strong>{item.name}</strong><small>{item.units} unidad{item.units === 1 ? "" : "es"} · {money.format(item.revenue)}</small></div></li>)}</ol> : <div className="admin-empty">Aún no hay ventas nuevas. Al registrar una venta aparecerá aquí.</div>}</section>
    </div>

    <section className="admin-panel finance-weekly-panel"><div className="admin-panel-head"><div><h2>Ventas por semana</h2><p>Compara las ventas registradas por semana dentro de cada mes.</p></div><div className="finance-week-selects"><select value={weekMonth} onChange={(event) => setWeekMonth(event.target.value)}>{selectableMonths.map((month) => <option key={month} value={month}>{new Date(`${month}-01T12:00:00`).toLocaleDateString("es-CO", { month: "long", year: "numeric" })}</option>)}</select><select value={compareMonth} onChange={(event) => setCompareMonth(event.target.value)}><option value="">Sin comparación</option>{selectableMonths.filter((month) => month !== weekMonth).map((month) => <option key={month} value={month}>Comparar con {new Date(`${month}-01T12:00:00`).toLocaleDateString("es-CO", { month: "long", year: "numeric" })}</option>)}</select></div></div><div className="finance-week-bars">{currentWeeks.map((value, index) => <div className="finance-week" key={index}><div className="finance-week-track"><span className="finance-week-primary" style={{ height: `${Math.max(3, value / weeklyMax * 100)}%` }} title={money.format(value)} />{compareMonth && <span className="finance-week-compare" style={{ height: `${Math.max(3, (comparisonWeeks[index] ?? 0) / weeklyMax * 100)}%` }} title={money.format(comparisonWeeks[index] ?? 0)} />}</div><strong>Semana {index + 1}</strong><small>{money.format(value)}{compareMonth ? ` · ${money.format(comparisonWeeks[index] ?? 0)}` : ""}</small></div>)}</div><p className="finance-legend"><span className="legend-sales" />{weekMonth}{compareMonth && <><span className="legend-compare" />{compareMonth}</>}</p></section>

    <div className="finance-grid wide">
      <section className="admin-panel"><div className="admin-panel-head"><div><h2>Clientes y envíos</h2><p>El contador muestra compras desde el último envío. Al registrar un envío vuelve a cero.</p></div><div className="admin-actions"><button className="admin-button" onClick={() => { setCustomerDraft({ id: "", name: "", phone: "", trackedAmount: 0 }); setModal("customer"); }}>+ Cliente</button><button className="admin-button primary" onClick={openShipment}>+ Registrar envío</button></div></div><div className="finance-customer-list">{customerRows.map(({ customer, amount }) => <article key={customer.id}><button type="button" className="finance-customer-edit" onClick={() => { setCustomerDraft({ id: customer.id, name: customer.name, phone: customer.phone ?? "", trackedAmount: amount }); setModal("customer"); }}><strong>{customer.name}</strong><small>{customer.phone || "Sin teléfono registrado"} · Editar</small></button><div className="shipping-meter"><div><span style={{ width: `${Math.min(100, amount / 280000 * 100)}%` }} /></div><strong>{money.format(amount)} / $280.000</strong></div><div className="finance-customer-actions"><span className={`finance-status ${amount >= 280000 ? "free" : ""}`}>{amount >= 280000 ? "Envío gratis" : "Acumulando"}</span><button className="admin-link" onClick={() => deleteCustomer(customer)}>Eliminar</button></div></article>)}{!customerRows.length && <div className="admin-empty">Agrega el primer cliente al registrar una venta.</div>}</div></section>
      <section className="admin-panel"><div className="admin-panel-head"><div><h2>Productos por llegar</h2><p>Regístralos desde un gasto o agrégalos por separado.</p></div><button className="admin-button primary" onClick={openIncoming}>+ Agregar producto por llegar</button></div><div className="finance-incoming-list">{data.incomingOrders.filter((order) => order.status === "pending").map((order) => <article key={order.id}><div><strong>{order.productName}</strong><small>{order.expectedQuantity} unidad{order.expectedQuantity === 1 ? "" : "es"}{order.expectedAt ? ` · llega ${dateLabel(order.expectedAt)}` : ""}{order.note ? ` · ${order.note}` : ""}</small></div><div><strong>Pendiente de foto</strong><small>puede sumarse a inventario</small></div><div className="admin-row-actions"><button className="admin-link" onClick={() => receiveIncoming(order)}>Recibir</button><button className="admin-link" onClick={() => { if (confirm("¿Eliminar este producto por llegar?")) patch({ incomingOrders: data.incomingOrders.filter((item) => item.id !== order.id) }); }}>Eliminar</button></div></article>)}{!data.incomingOrders.some((order) => order.status === "pending") && <div className="admin-empty">Agrega un producto por llegar o créalo al registrar un gasto de mercancía o tarjetas.</div>}</div></section>
    </div>
    </div>

    {panelView === "detail" && <section className="admin-panel finance-records"><div className="admin-panel-head"><div><h2>Detalle de movimientos</h2><p>Edita o anula cualquier registro; las ventas anuladas devuelven el inventario.</p></div></div><div className="admin-tabs finance-tabs"><button className={`admin-button ${detailView === "sales" ? "active" : ""}`} onClick={() => setDetailView("sales")}>Ventas</button><button className={`admin-button ${detailView === "expenses" ? "active" : ""}`} onClick={() => setDetailView("expenses")}>Gastos</button><button className={`admin-button ${detailView === "debt" ? "active" : ""}`} onClick={() => setDetailView("debt")}>Abonos a deuda</button><button className={`admin-button ${detailView === "shipments" ? "active" : ""}`} onClick={() => setDetailView("shipments")}>Envíos</button></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr>{detailView === "sales" ? <><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Pago</th><th>Valor</th><th>Acciones</th></> : detailView === "expenses" ? <><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Pago</th><th>Valor</th><th>Acciones</th></> : detailView === "debt" ? <><th>Fecha</th><th>Concepto</th><th>Pago</th><th>Nota</th><th>Valor</th><th>Acciones</th></> : <><th>Fecha</th><th>Cliente</th><th>Transportadora</th><th>Guía</th><th>Costo</th><th>Acciones</th></>}</tr></thead><tbody>{detailView === "sales" && data.sales.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((sale) => <tr key={sale.id}><td>{dateLabel(sale.occurredAt)}</td><td>{data.customers.find((customer) => customer.id === sale.customerId)?.name ?? "Sin identificar"}</td><td>{sale.items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}</td><td>{accountLabel(sale.paymentAccount)}</td><td>{money.format(saleAmount(sale))}</td><td><button className="admin-link" onClick={() => editSale(sale)}>Editar</button> <button className="admin-link" onClick={() => deleteSale(sale)}>Anular</button></td></tr>)}{detailView === "expenses" && data.expenses.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((expense) => <tr key={expense.id}><td>{dateLabel(expense.occurredAt)}</td><td>{expense.concept}</td><td>{expense.category}</td><td>{accountLabel(expense.paymentAccount)}</td><td>{money.format(expense.amount)}</td><td><button className="admin-link" onClick={() => editExpense(expense)}>Editar</button> <button className="admin-link" onClick={() => deleteExpense(expense)}>Eliminar</button></td></tr>)}{detailView === "debt" && data.debtPayments.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((payment) => <tr key={payment.id}><td>{dateLabel(payment.occurredAt)}</td><td>Abono a deuda personal</td><td>{accountLabel(payment.paymentAccount)}</td><td>{payment.note || "—"}</td><td>{money.format(payment.amount)}</td><td><button className="admin-link" onClick={() => editPayment(payment)}>Editar</button> <button className="admin-link" onClick={() => deletePayment(payment)}>Eliminar</button></td></tr>)}{detailView === "shipments" && data.shipments.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((shipment) => <tr key={shipment.id}><td>{dateLabel(shipment.occurredAt)}</td><td>{data.customers.find((customer) => customer.id === shipment.customerId)?.name ?? "Cliente eliminado"}</td><td>{shipment.carrier || "—"}</td><td>{shipment.guide || "—"}</td><td>{money.format(shipment.cost)}</td><td><button className="admin-link" onClick={() => editShipment(shipment)}>Editar</button> <button className="admin-link" onClick={() => deleteShipment(shipment)}>Eliminar</button></td></tr>)}</tbody></table></div></section>}

    {modal && <div className="admin-modal" role="dialog" aria-modal="true"><form className="admin-modal-card finance-modal" onSubmit={modal === "sale" ? addSale : modal === "expense" ? addExpense : modal === "shipment" ? addShipment : modal === "payment" ? addPayment : modal === "incoming" ? addIncoming : modal === "receive" ? (event) => { event.preventDefault(); if (!receivingOrder) return; if (receiveMode === "existing" && receiveProductIndex === "") return; onReceiveIncoming(receivingOrder, receiveMode === "existing" ? Number(receiveProductIndex) : undefined); setReceivingOrder(null); setModal(null); } : saveCustomer}>
      <div className="admin-modal-head"><h2>{modal === "sale" ? (editing ? "Editar venta" : "Registrar venta") : modal === "expense" ? (editing ? "Editar gasto" : "Registrar gasto") : modal === "shipment" ? (editing ? "Editar envío" : "Registrar envío") : modal === "payment" ? (editing ? "Editar abono a deuda" : "Registrar abono a deuda") : modal === "incoming" ? "Agregar producto por llegar" : modal === "receive" ? "Recibir producto" : customerDraft.id ? "Editar cliente" : "Agregar cliente"}</h2><button className="admin-close" type="button" onClick={() => setModal(null)}>×</button></div>
      {modal === "sale" && <div className="admin-form-grid"><div className="admin-field full"><label>Tipo de venta</label><div className="admin-tabs"><button type="button" className={`admin-button ${saleDraft.mode === "inventory" ? "active" : ""}`} onClick={() => setSaleDraft({ ...saleDraft, mode: "inventory" })}>Producto del inventario</button><button type="button" className={`admin-button ${saleDraft.mode === "category" ? "active" : ""}`} onClick={() => setSaleDraft({ ...saleDraft, mode: "category", productIndex: "" })}>Venta general</button></div><small>{saleDraft.mode === "inventory" ? "Esta venta descuenta unidades del inventario." : "Registra el valor sin afectar el inventario."}</small></div>{saleDraft.mode === "inventory" ? <div className="admin-field full"><label>Producto del inventario</label><div className="finance-product-filters"><input value={saleFilters.search} placeholder="Buscar producto o jugador" onChange={(event) => setSaleFilters({ ...saleFilters, search: event.target.value })} /><select value={saleFilters.category} onChange={(event) => setSaleFilters({ ...saleFilters, category: event.target.value, country: "", team: "" })}><option value="all">Todas las categorías</option><option value="boxes">Cajas</option><option value="cards">Tarjetas</option></select><select value={saleFilters.country} onChange={(event) => setSaleFilters({ ...saleFilters, country: event.target.value, team: event.target.value ? "" : saleFilters.team })}><option value="">Todos los países</option>{saleCountries.map((country) => <option key={country} value={country}>{country}</option>)}</select><select value={saleFilters.team} onChange={(event) => setSaleFilters({ ...saleFilters, team: event.target.value, country: event.target.value ? "" : saleFilters.country })}><option value="">Todos los equipos</option>{saleTeams.map((team) => <option key={team} value={team}>{team}</option>)}</select></div><div className="finance-product-picker">{availableSaleProducts.map((product) => { const index = products.indexOf(product); return <button type="button" key={`${product.name}-${index}`} className={saleDraft.productIndex === `${index}` ? "selected" : ""} onClick={() => setSaleDraft({ ...saleDraft, productIndex: `${index}`, total: Number(product.price) * saleDraft.quantity })}>{product.image ? <img src={product.image} alt="" /> : <span className="finance-product-placeholder">Sin foto</span>}<strong>{product.name}</strong><small>{money.format(Number(product.price))} · {product.stock} disponible{product.stock === 1 ? "" : "s"}</small></button>; })}</div>{!availableSaleProducts.length && <p className="finance-no-products">No hay productos disponibles con esos filtros.</p>}{selectedSaleProduct && <p className="finance-selected-product">Seleccionado: <strong>{selectedSaleProduct.name}</strong></p>}</div> : <div className="admin-field full"><label>Categoría <small>(opcional)</small></label><select value={saleDraft.category} onChange={(event) => setSaleDraft({ ...saleDraft, category: event.target.value })}><option value="">Sin categoría</option><option value="Tarjetas">Tarjetas</option><option value="Cajas">Cajas</option><option value="Breaks">Breaks</option><option value="Otro">Otro</option></select></div>}<div className="admin-field"><label>Cantidad</label><input required type="number" min="1" max={saleDraft.mode === "inventory" ? selectedSaleProduct?.stock ?? undefined : undefined} value={saleDraft.quantity} onChange={(event) => { const quantity = asNumber(event.target.value); setSaleDraft({ ...saleDraft, quantity, total: selectedSaleProduct && saleDraft.mode === "inventory" ? Number(selectedSaleProduct.price) * quantity : saleDraft.total }); }} /></div><div className="admin-field"><label>Precio total <small>(editable para descuentos)</small></label><input required type="number" min="0" value={saleDraft.total} onChange={(event) => setSaleDraft({ ...saleDraft, total: asNumber(event.target.value) })} /></div><div className="admin-field full"><label className="finance-checkbox"><input type="checkbox" checked={saleDraft.noCustomer} onChange={(event) => setSaleDraft({ ...saleDraft, noCustomer: event.target.checked, customerId: "" })} /> Cliente sin identificar</label></div>{!saleDraft.noCustomer && <div className="admin-field"><label>Cliente</label><select required value={saleDraft.customerId} onChange={(event) => setSaleDraft({ ...saleDraft, customerId: event.target.value })}><option value="">Selecciona un cliente</option>{data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}<option value="new">+ Nuevo cliente</option></select></div>}<div className="admin-field"><label>Medio de pago</label><select value={saleDraft.account} onChange={(event) => setSaleDraft({ ...saleDraft, account: event.target.value as PaymentAccount })}><option value="nequi">Nequi</option><option value="cash">Efectivo</option></select></div>{!saleDraft.noCustomer && saleDraft.customerId === "new" && <><div className="admin-field"><label>Nombre del nuevo cliente</label><input required value={saleDraft.newCustomer} onChange={(event) => setSaleDraft({ ...saleDraft, newCustomer: event.target.value })} /></div><div className="admin-field"><label>WhatsApp <small>(opcional)</small></label><input value={saleDraft.phone} onChange={(event) => setSaleDraft({ ...saleDraft, phone: event.target.value })} /></div></>}<div className="admin-field"><label>Fecha</label><input required type="date" value={saleDraft.occurredAt} onChange={(event) => setSaleDraft({ ...saleDraft, occurredAt: event.target.value })} /></div><div className="admin-field"><label>Nota <small>(opcional)</small></label><input value={saleDraft.note} onChange={(event) => setSaleDraft({ ...saleDraft, note: event.target.value })} /></div></div>}
      {modal === "expense" && <div className="admin-form-grid"><div className="admin-field full"><label>Concepto</label><input required value={expenseDraft.concept} onChange={(event) => setExpenseDraft({ ...expenseDraft, concept: event.target.value })} placeholder="Ej. Compra de mercancía, envío o publicidad" /></div><div className="admin-field"><label>Valor total</label><input required type="number" min="1" value={expenseDraft.amount} onChange={(event) => setExpenseDraft({ ...expenseDraft, amount: asNumber(event.target.value) })} /></div><div className="admin-field"><label>Pagado desde</label><select value={expenseDraft.account} onChange={(event) => setExpenseDraft({ ...expenseDraft, account: event.target.value as PaymentAccount })}><option value="nequi">Nequi</option><option value="cash">Efectivo</option><option value="debt">Deuda</option></select><small>Deuda aumenta el total pendiente, sin afectar caja.</small></div><div className="admin-field"><label>Categoría</label><select value={expenseDraft.category} onChange={(event) => setExpenseDraft({ ...expenseDraft, category: event.target.value as Expense["category"] })}><option value="mercancia">Mercancía</option><option value="tarjetas">Tarjetas</option><option value="envio">Envío</option><option value="publicidad">Publicidad</option><option value="otro">Otro</option></select></div><div className="admin-field"><label>Fecha</label><input required type="date" value={expenseDraft.occurredAt} onChange={(event) => setExpenseDraft({ ...expenseDraft, occurredAt: event.target.value })} /></div>{(expenseDraft.category === "mercancia" || expenseDraft.category === "tarjetas") && <><div className="admin-field full"><label className="finance-checkbox"><input type="checkbox" checked={expenseDraft.createIncoming} onChange={(event) => setExpenseDraft({ ...expenseDraft, createIncoming: event.target.checked })} /> Pasar estos productos a “productos por llegar”</label></div>{expenseDraft.createIncoming && <div className="admin-field full finance-merchandise"><label>Productos que llegarán <small>(se crearán como pendientes de foto)</small></label>{expenseDraft.merchandise.map((item, index) => <div className="finance-merch-row" key={index}><input required placeholder="Nombre del producto" value={item.name} onChange={(event) => setExpenseDraft({ ...expenseDraft, merchandise: expenseDraft.merchandise.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row) })} /><input required type="number" min="1" value={item.quantity} onChange={(event) => setExpenseDraft({ ...expenseDraft, merchandise: expenseDraft.merchandise.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: asNumber(event.target.value) } : row) })} /><input type="date" value={item.expectedAt} onChange={(event) => setExpenseDraft({ ...expenseDraft, merchandise: expenseDraft.merchandise.map((row, rowIndex) => rowIndex === index ? { ...row, expectedAt: event.target.value } : row) })} /><button className="admin-button" type="button" disabled={expenseDraft.merchandise.length === 1} onClick={() => setExpenseDraft({ ...expenseDraft, merchandise: expenseDraft.merchandise.filter((_, rowIndex) => rowIndex !== index) })}>Quitar</button></div>)}<button className="admin-button" type="button" onClick={() => setExpenseDraft({ ...expenseDraft, merchandise: [...expenseDraft.merchandise, { name: "", quantity: 1, expectedAt: "" }] })}>+ Otro producto</button></div>}</>}<div className="admin-field full"><label>Nota <small>(opcional)</small></label><input value={expenseDraft.note} onChange={(event) => setExpenseDraft({ ...expenseDraft, note: event.target.value })} /></div></div>}
      {modal === "incoming" && <div className="admin-form-grid"><div className="admin-field full"><label>Producto que llegará</label><input required value={incomingDraft.productName} onChange={(event) => setIncomingDraft({ ...incomingDraft, productName: event.target.value })} placeholder="Ej. Caja Topps Chrome 2026" /></div><div className="admin-field"><label>Cantidad</label><input required type="number" min="1" value={incomingDraft.quantity} onChange={(event) => setIncomingDraft({ ...incomingDraft, quantity: asNumber(event.target.value) })} /></div><div className="admin-field"><label>Fecha estimada <small>(opcional)</small></label><input type="date" value={incomingDraft.expectedAt} onChange={(event) => setIncomingDraft({ ...incomingDraft, expectedAt: event.target.value })} /></div><div className="admin-field full"><label>Nota <small>(opcional)</small></label><input value={incomingDraft.note} onChange={(event) => setIncomingDraft({ ...incomingDraft, note: event.target.value })} placeholder="Ej. Pedido personal, sin gasto registrado" /></div></div>}
      {modal === "shipment" && <div className="admin-form-grid"><div className="admin-field full"><label>Cliente</label><select required value={shipmentDraft.customerId} onChange={(event) => setShipmentDraft({ ...shipmentDraft, customerId: event.target.value })}><option value="">Selecciona un cliente</option>{data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {money.format(customerAmount(customer, data.sales, data.shipments))}</option>)}</select></div><div className="admin-field"><label>Costo del envío</label><input type="number" min="0" value={shipmentDraft.cost} onChange={(event) => setShipmentDraft({ ...shipmentDraft, cost: asNumber(event.target.value) })} /></div><div className="admin-field"><label>Pagado desde</label><select value={shipmentDraft.account} onChange={(event) => setShipmentDraft({ ...shipmentDraft, account: event.target.value as PaymentAccount })}><option value="nequi">Nequi</option><option value="cash">Efectivo</option></select></div><div className="admin-field"><label>Transportadora <small>(opcional)</small></label><input value={shipmentDraft.carrier} onChange={(event) => setShipmentDraft({ ...shipmentDraft, carrier: event.target.value })} /></div><div className="admin-field"><label>Guía <small>(opcional)</small></label><input value={shipmentDraft.guide} onChange={(event) => setShipmentDraft({ ...shipmentDraft, guide: event.target.value })} /></div><div className="admin-field"><label>Fecha de envío</label><input required type="date" value={shipmentDraft.occurredAt} onChange={(event) => setShipmentDraft({ ...shipmentDraft, occurredAt: event.target.value })} /></div><div className="admin-field full"><label>Nota <small>(opcional)</small></label><input value={shipmentDraft.note} onChange={(event) => setShipmentDraft({ ...shipmentDraft, note: event.target.value })} /></div></div>}
      {modal === "payment" && <div className="admin-form-grid"><div className="admin-field full"><label>Valor del abono</label><input required type="number" min="1" value={paymentDraft.amount} onChange={(event) => setPaymentDraft({ ...paymentDraft, amount: asNumber(event.target.value) })} /></div><div className="admin-field"><label>Pagado desde</label><select value={paymentDraft.account} onChange={(event) => setPaymentDraft({ ...paymentDraft, account: event.target.value as PaymentAccount })}><option value="nequi">Nequi</option><option value="cash">Efectivo</option></select></div><div className="admin-field"><label>Fecha</label><input required type="date" value={paymentDraft.occurredAt} onChange={(event) => setPaymentDraft({ ...paymentDraft, occurredAt: event.target.value })} /></div><div className="admin-field full"><label>Nota <small>(opcional)</small></label><input value={paymentDraft.note} onChange={(event) => setPaymentDraft({ ...paymentDraft, note: event.target.value })} placeholder="Ej. Abono de deuda personal" /></div></div>}
      {modal === "receive" && receivingOrder && <div className="admin-form-grid"><div className="admin-field full"><p>Recibirás <strong>{receivingOrder.expectedQuantity} unidad{receivingOrder.expectedQuantity === 1 ? "" : "es"}</strong> de <strong>{receivingOrder.productName}</strong>.</p><div className="admin-tabs"><button className={`admin-button ${receiveMode === "existing" ? "active" : ""}`} type="button" onClick={() => setReceiveMode("existing")}>Sumar a producto existente</button><button className={`admin-button ${receiveMode === "new" ? "active" : ""}`} type="button" onClick={() => setReceiveMode("new")}>Crear producto nuevo</button></div></div>{receiveMode === "existing" ? <div className="admin-field full"><label>Selecciona la caja o tarjeta existente</label><div className="finance-product-picker">{products.map((product, index) => <button type="button" key={`${product.name}-${index}`} className={receiveProductIndex === `${index}` ? "selected" : ""} onClick={() => setReceiveProductIndex(`${index}`)}>{product.image ? <img src={product.image} alt="" /> : <span className="finance-product-placeholder">Sin foto</span>}<strong>{product.name}</strong><small>{product.stock} actualmente</small></button>)}</div></div> : <div className="admin-field full"><p>Continuarás al formulario para agregar la foto, precio y demás datos del producto nuevo.</p></div>}</div>}
      {modal === "customer" && <div className="admin-form-grid"><div className="admin-field full"><label>Nombre</label><input required value={customerDraft.name} onChange={(event) => setCustomerDraft({ ...customerDraft, name: event.target.value })} /></div><div className="admin-field"><label>WhatsApp <small>(opcional)</small></label><input value={customerDraft.phone} onChange={(event) => setCustomerDraft({ ...customerDraft, phone: event.target.value })} /></div><div className="admin-field"><label>Acumulado hacia envío gratis</label><input required type="number" min="0" value={customerDraft.trackedAmount} onChange={(event) => setCustomerDraft({ ...customerDraft, trackedAmount: asNumber(event.target.value) })} /><small>Puedes corregirlo manualmente en cualquier momento.</small></div></div>}
      <div className="admin-modal-actions"><button className="admin-button" type="button" onClick={() => { setEditing(null); setReceivingOrder(null); setModal(null); }}>Cancelar</button><button className="admin-button primary" type="submit" disabled={(modal === "sale" && saleDraft.mode === "inventory" && !selectedSaleProduct) || (modal === "receive" && receiveMode === "existing" && receiveProductIndex === "")}>{modal === "receive" ? (receiveMode === "existing" ? "Sumar al inventario" : "Continuar") : modal === "incoming" ? "Agregar producto" : "Guardar"}</button></div>
    </form></div>}
  </section>;
}
