"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { BreakItem, CatalogSnapshot, Product } from "../lib/catalog-types";
import type { FinanceData } from "../lib/finance-types";
import { FinancePanel } from "./finance-panel";

declare global {
  interface Window {
    SKY_DEFAULT_PRODUCTS?: Product[];
    SKY_DEFAULT_BREAKS?: BreakItem[];
    SKY_CARD_METADATA?: Record<string, Partial<Product>>;
  }
}

type Props = { email: string; displayName: string; signOutPath: string };
type Editor = { kind: "product" | "break"; index?: number } | null;

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const nowLabel = (value?: string | null) => value ? new Date(value).toLocaleString("es-CO") : "Aún no";
function reservationDuration(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min`;
  const days = Math.floor(hours / 24);
  return `${days} día${days === 1 ? "" : "s"} ${hours % 24} h`;
}
const countryOptions = ["Argentina", "Brasil", "Colombia", "España", "Francia", "Inglaterra", "Portugal", "Alemania", "Italia", "Bélgica", "Países Bajos", "Noruega", "Uruguay", "México"];
const teamOptions = ["Real Madrid", "FC Barcelona", "Atlético de Madrid", "Manchester City", "Manchester United", "Liverpool", "Arsenal", "Chelsea", "Bayern Munich", "Borussia Dortmund", "Paris Saint-Germain", "Juventus", "Inter de Milán", "AC Milan", "Napoli", "Tottenham Hotspur"];
const importedCustomerNames = ["Alejandro Palacios", "Alejo Yepes", "Andres Gutierrez", "Arley Alarcon", "Camilo Figueroa", "Camilo Serna", "Cardlab", "Daniela Aldana", "David Moreno", "David Valero", "Edxon Cubillos", "Esteban Pineda", "Fabian Parra", "Fabian Ramirez", "Fabio Body Soccer", "Jhohanny Ruiz", "Jhonathan Sepulveda", "Jose Cortez", "Juan Duran", "Juan Pablo Vaul", "Julian Camilo", "Luis Mercado", "Luis Venezuela", "Miguel Cabrera", "Muhtasim", "Nestor Castillo", "Rodrigo Velez", "Sara Melo", "Sebastain Mustafa", "Sebastian Duarte", "Serigo Celis", "Valdo", "William Hernandez", "Yolfre"];
const historicalWeeks = [
  { month: "2026-08", week: 4, sales: 1338000 }, { month: "2026-08", week: 5, sales: 580000 },
  { month: "2026-09", week: 1, sales: 1495000 }, { month: "2026-09", week: 2, sales: 1190000 }, { month: "2026-09", week: 3, sales: 1803800 }, { month: "2026-09", week: 4, sales: 1035801 },
  { month: "2026-10", week: 1, sales: 2995500 },
];

function defaultFinance(): FinanceData {
  return {
    version: 3,
    baseline: { cutoverDate: "2026-10-05", nequi: 1852213, cash: 156000, debt: 2356037 },
    historicalMonths: [
      { month: "2026-08", sales: 1918000, expenses: 4490487 },
      { month: "2026-09", sales: 5524601, expenses: 5919694 },
      { month: "2026-10", sales: 2995500, expenses: 1262013 },
    ],
    historicalWeeks,
    customers: importedCustomerNames.map((name, index) => ({ id: `imported-customer-${index + 1}`, name, createdAt: "2026-10-05T00:00:00.000Z" })),
    sales: [], expenses: [], shipments: [], incomingOrders: [], debtPayments: [],
  };
}

function hydrateSnapshot(snapshot: CatalogSnapshot): CatalogSnapshot {
  const metadata = window.SKY_CARD_METADATA ?? {};
  const finance = !snapshot.finance ? defaultFinance() : snapshot.finance.version === 3 ? snapshot.finance : {
    ...snapshot.finance,
    version: 3,
    baseline: { ...snapshot.finance.baseline, nequi: snapshot.finance.baseline.nequi === 2797037 ? 1852213 : snapshot.finance.baseline.nequi },
    historicalMonths: snapshot.finance.historicalMonths.map((item) => item.month === "2026-10" && item.expenses === 317189 ? { ...item, expenses: 1262013 } : item),
    historicalWeeks: snapshot.finance.historicalWeeks?.length ? snapshot.finance.historicalWeeks : historicalWeeks,
  };
  return {
    ...snapshot,
    products: snapshot.products.map((product) => ({ ...(metadata[product.image] ?? {}), ...product })),
    finance,
  };
}

function defaultSnapshot(): CatalogSnapshot {
  return hydrateSnapshot({
    products: clone(window.SKY_DEFAULT_PRODUCTS ?? []),
    breaks: clone(window.SKY_DEFAULT_BREAKS ?? []),
    finance: defaultFinance(),
  });
}

function parsePriceOptions(value: string) {
  return value.split(/[\n;]/).map((line) => {
    const [spotsText, ...priceParts] = line.split(/[:=]/);
    return {
      spots: Number((spotsText ?? "").replace(/\D/g, "")),
      price: Number(priceParts.join("").replace(/\D/g, "")),
    };
  }).filter((option) => option.spots > 0 && option.price >= 0);
}

function optionsText(item: BreakItem) {
  return (item.priceOptions ?? []).map((option) => `${option.spots}: ${option.price}`).join("\n");
}

export function AdminClient({ email, displayName, signOutPath }: Props) {
  const [data, setData] = useState<CatalogSnapshot>({ products: [], breaks: [] });
  const [view, setView] = useState<"products" | "reserved" | "breaks" | "finance">("products");
  const [filter, setFilter] = useState<"boxes" | "cards" | "all">("boxes");
  const [inventorySearch, setInventorySearch] = useState("");
  const [editor, setEditor] = useState<Editor>(null);
  const [productDraft, setProductDraft] = useState<Product>({ name: "", detail: "", price: 0, stock: 1, image: "", category: "Producto sellado" });
  const [breakDraft, setBreakDraft] = useState<BreakItem>({ id: "", title: "", description: "", image: "", priceOptions: [], spotsTotal: 32, spotsAvailable: 32, status: "active" });
  const [optionsDraft, setOptionsDraft] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receivingOrderId, setReceivingOrderId] = useState<string | null>(null);
  const [reservationIndex, setReservationIndex] = useState<number | null>(null);
  const [reservationCustomer, setReservationCustomer] = useState("");
  const [reservedSale, setReservedSale] = useState<{ productIndex: number; customerName: string; key: string } | null>(null);
  const [, setReservationClock] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setReservationClock((tick) => tick + 1), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/snapshot", { cache: "no-store" });
        if (!response.ok) throw new Error((await response.json()).error || "No se pudo cargar el panel.");
        const result = await response.json();
        if (result.draft?.data) {
          setData(hydrateSnapshot(result.draft.data));
          setSavedAt(result.draft.updatedAt);
          setPublishedAt(result.published?.updatedAt ?? null);
        } else {
          const initial = defaultSnapshot();
          setData(initial);
          const saved = await saveSnapshot(initial);
          setSavedAt(saved.updatedAt);
          const published = await publishSnapshot();
          setPublishedAt(published.publishedAt);
          setMessage("El catálogo actual quedó conectado al panel.");
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo cargar el panel.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const visibleProducts = useMemo(() => data.products.filter((product) => {
    const categoryMatches = filter === "all" || (filter === "cards" ? product.category === "Tarjetas" : product.category !== "Tarjetas");
    const terms = inventorySearch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().split(/\s+/).filter(Boolean);
    const searchable = [product.name, product.detail, product.category, product.country, product.team].filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!categoryMatches || !terms.every((term) => searchable.includes(term))) return false;
    return true;
  }), [data.products, filter, inventorySearch]);
  const reservedProducts = useMemo(() => data.products.map((product, index) => ({ product, index })).filter(({ product }) => Boolean(product.reservation)), [data.products]);

  async function saveSnapshot(snapshot: CatalogSnapshot) {
    const response = await fetch("/api/admin/snapshot", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudo guardar.");
    return result;
  }

  async function publishSnapshot() {
    const response = await fetch("/api/admin/publish", { method: "POST" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudo publicar.");
    return result;
  }

  function changeData(next: CatalogSnapshot) {
    setData(next);
    setDirty(true);
    setMessage(null);
    setError(null);
  }

  async function handleSave() {
    setWorking(true); setError(null); setMessage(null);
    try {
      const result = await saveSnapshot(data);
      setSavedAt(result.updatedAt);
      setDirty(false);
      setMessage("Borrador guardado. La página pública todavía no cambió.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar.");
    } finally { setWorking(false); }
  }

  async function handlePublish() {
    setWorking(true); setError(null); setMessage(null);
    try {
      const saved = await saveSnapshot(data);
      setSavedAt(saved.updatedAt);
      const published = await publishSnapshot();
      setPublishedAt(published.publishedAt);
      setDirty(false);
      setMessage("Cambios publicados. Ya están visibles en la página.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo publicar.");
    } finally { setWorking(false); }
  }

  function adjustStock(index: number, amount: number) {
    const products = clone(data.products);
    products[index].stock = Math.max(0, Number(products[index].stock || 0) + amount);
    changeData({ ...data, products });
  }

  function openProduct(index?: number, category = "Producto sellado", initial?: Partial<Product>, incomingOrderId?: string) {
    setProductDraft(index === undefined
      ? { name: "", detail: "", price: 0, stock: 1, image: "", category, ...initial }
      : clone(data.products[index]));
    setImageFile(null);
    setReceivingOrderId(incomingOrderId ?? null);
    setEditor({ kind: "product", index });
  }

  function openBreak(index?: number) {
    const item = index === undefined
      ? { id: `break-${Date.now()}`, title: "", description: "", image: "assets/break-merlin.jpeg", priceOptions: [], spotsTotal: 32, spotsAvailable: 32, status: "active" as const, published: Date.now() }
      : clone(data.breaks[index]);
    setBreakDraft(item);
    setOptionsDraft(optionsText(item));
    setImageFile(null);
    setEditor({ kind: "break", index });
  }

  async function uploadImage(file: File | null) {
    if (!file) return null;
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/admin/upload", { method: "POST", body: form });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudo subir la imagen.");
    return result.url as string;
  }

  async function submitEditor(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setWorking(true); setError(null);
    try {
      const uploaded = await uploadImage(imageFile);
      if (editor.kind === "product") {
        const products = clone(data.products);
        const item = { ...productDraft, image: uploaded || productDraft.image || "assets/logo.jpeg", price: Number(productDraft.price), stock: Math.max(0, Number(productDraft.stock)), published: productDraft.published ?? Date.now() };
        if (editor.index === undefined) products.push(item); else products[editor.index] = item;
        const finance = receivingOrderId && data.finance ? {
          ...data.finance,
          incomingOrders: data.finance.incomingOrders.map((order) => order.id === receivingOrderId ? { ...order, status: "received" as const, receivedAt: new Date().toISOString() } : order),
        } : data.finance;
        changeData({ ...data, products, finance });
      } else {
        const breaks = clone(data.breaks);
        const total = Math.max(0, Number(breakDraft.spotsTotal));
        const item = { ...breakDraft, image: uploaded || breakDraft.image || "assets/break-merlin.jpeg", priceOptions: parsePriceOptions(optionsDraft), spotsTotal: total, spotsAvailable: Math.min(total, Math.max(0, Number(breakDraft.spotsAvailable))), published: breakDraft.published ?? Date.now() };
        if (editor.index === undefined) breaks.push(item); else breaks[editor.index] = item;
        changeData({ ...data, breaks });
      }
      setEditor(null); setReceivingOrderId(null);
      setMessage("Cambio preparado. Guarda el borrador o publícalo cuando termines.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el cambio.");
    } finally { setWorking(false); }
  }

  function removeProduct(index: number) {
    if (!confirm("¿Quitar este producto del catálogo?")) return;
    const products = data.products.filter((_, itemIndex) => itemIndex !== index);
    changeData({ ...data, products });
  }

  function openReservation(index: number) {
    setReservationIndex(index);
    setReservationCustomer(data.products[index].reservation?.customerName ?? "");
  }

  function saveReservation(event: FormEvent) {
    event.preventDefault();
    if (reservationIndex === null || !reservationCustomer.trim()) return;
    const products = clone(data.products);
    products[reservationIndex].reservation = {
      customerName: reservationCustomer.trim(),
      reservedAt: products[reservationIndex].reservation?.reservedAt ?? new Date().toISOString(),
    };
    changeData({ ...data, products });
    setReservationIndex(null);
    setMessage("Producto reservado. Publica los cambios cuando quieras ocultarlo del catálogo de clientes.");
  }

  function releaseReservation(index: number) {
    const product = data.products[index];
    if (!confirm(`¿Devolver ${product.name} al catálogo disponible?`)) return;
    const products = clone(data.products);
    delete products[index].reservation;
    changeData({ ...data, products });
    setMessage("Producto devuelto al catálogo. Publica los cambios cuando quieras mostrarlo de nuevo a los clientes.");
  }

  function sellReserved(index: number) {
    const product = data.products[index];
    if (!product.reservation) return;
    setReservedSale({ productIndex: index, customerName: product.reservation.customerName, key: `${Date.now()}-${index}` });
    setView("finance");
  }

  function removeBreak(index: number) {
    if (!confirm("¿Quitar este break?")) return;
    const breaks = data.breaks.filter((_, itemIndex) => itemIndex !== index);
    changeData({ ...data, breaks });
  }

  if (loading) return <main className="admin-page"><div className="admin-wrap admin-panel">Cargando panel…</div></main>;

  return (
    <main className="admin-page">
      <div className="admin-wrap">
        <header className="admin-top">
          <div className="admin-brand"><img src="/assets/logo.jpeg" alt="" /><div><strong>Sky Collections</strong><span>Administración del catálogo y finanzas</span></div></div>
          <div className="admin-user"><strong>{displayName}</strong><br />{email}<br /><a href={signOutPath}>Cerrar sesión</a></div>
        </header>

        <div className="admin-toolbar">
          <div className="admin-status"><strong>{dirty ? "Hay cambios sin guardar" : "Borrador al día"}</strong><br />Guardado: {nowLabel(savedAt)} · Publicado: {nowLabel(publishedAt)}</div>
          <div className="admin-actions">
            <button className="admin-button" onClick={handleSave} disabled={working}>Guardar borrador</button>
            <button className="admin-button primary" onClick={handlePublish} disabled={working}>Publicar cambios</button>
            <a className="admin-button blue" href="/" target="_blank" rel="noreferrer" style={{display:"inline-grid",placeItems:"center"}}>Ver página</a>
          </div>
        </div>

        {message && <p className="admin-alert">{message}</p>}
        {error && <p className="admin-alert error">{error}</p>}

        <nav className="admin-tabs" aria-label="Secciones">
          <button className={`admin-button ${view === "products" ? "active" : ""}`} onClick={() => setView("products")}>Cajas y tarjetas</button>
          <button className={`admin-button ${view === "reserved" ? "active" : ""}`} onClick={() => setView("reserved")}>Reservados{reservedProducts.length ? ` (${reservedProducts.length})` : ""}</button>
          <button className={`admin-button ${view === "breaks" ? "active" : ""}`} onClick={() => setView("breaks")}>Breaks</button>
          <button className={`admin-button ${view === "finance" ? "active" : ""}`} onClick={() => setView("finance")}>Finanzas</button>
        </nav>

        {view === "products" ? (
          <section className="admin-panel">
            <div className="admin-panel-head"><div><h1>Inventario</h1><p>Agrega, edita, quita productos y actualiza las unidades disponibles.</p></div><div className="admin-actions"><button className="admin-button" onClick={() => openProduct()}>+ Agregar caja</button><button className="admin-button primary" onClick={() => openProduct(undefined, "Tarjetas")}>+ Agregar tarjeta</button></div></div>
            <div className="admin-filter">
              {(["boxes", "cards", "all"] as const).map((value) => <button key={value} className={`admin-button ${filter === value ? "active" : ""}`} onClick={() => setFilter(value)}>{value === "boxes" ? "Cajas" : value === "cards" ? "Tarjetas" : "Todos"}</button>)}
              <input className="admin-search" type="search" value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} placeholder="Buscar producto, jugador, equipo o país" aria-label="Buscar en inventario" />
            </div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Foto</th><th>Producto</th><th>Tipo</th><th>Precio</th><th>Inventario</th><th>Acciones</th></tr></thead><tbody>
              {visibleProducts.map((product) => {
                const index = data.products.indexOf(product);
                return <tr key={`${product.name}-${index}`}><td><img className="admin-thumb" src={product.image} alt="" /></td><td><strong>{product.name}</strong><br /><small>{product.detail || product.category}{product.reservation ? ` · Reservado para ${product.reservation.customerName}` : ""}</small></td><td>{product.category}</td><td>{money.format(Number(product.price) || 0)}</td><td><div className="admin-stock"><button onClick={() => adjustStock(index, -1)}>−</button><strong className={product.stock === 0 ? "admin-stock-zero" : ""}>{product.stock}</strong><button onClick={() => adjustStock(index, 1)}>+</button></div></td><td><div className="admin-row-actions"><button className="admin-link" onClick={() => openProduct(index)}>Editar</button>{product.reservation ? <button className="admin-link" onClick={() => openReservation(index)}>Editar reserva</button> : <button className="admin-link" disabled={product.stock < 1} onClick={() => openReservation(index)}>Reservar</button>}<button className="admin-link" onClick={() => removeProduct(index)}>Quitar</button></div></td></tr>;
              })}
              {!visibleProducts.length && <tr><td colSpan={6}><div className="admin-empty">No encontramos productos con esa búsqueda.</div></td></tr>}
            </tbody></table></div>
          </section>
        ) : view === "reserved" ? (
          <section className="admin-panel">
            <div className="admin-panel-head"><div><h1>Productos reservados</h1><p>Estos productos no se muestran en el catálogo de clientes.</p></div></div>
            <div className="admin-reserved-list">
              {reservedProducts.map(({ product, index }) => <article key={`${product.name}-${index}`}><img className="admin-thumb" src={product.image} alt="" /><div><strong>{product.name}</strong><small>{product.detail || product.category} · {money.format(Number(product.price) || 0)}</small><p>Reservado por <strong>{product.reservation!.customerName}</strong> · hace {reservationDuration(product.reservation!.reservedAt)}</p></div><div className="admin-row-actions"><button className="admin-button primary" onClick={() => sellReserved(index)}>Registrar venta</button><button className="admin-button" onClick={() => releaseReservation(index)}>Volver al catálogo</button></div></article>)}
              {!reservedProducts.length && <div className="admin-empty">No hay productos reservados.</div>}
            </div>
          </section>
        ) : view === "breaks" ? (
          <section className="admin-panel">
            <div className="admin-panel-head"><div><h1>Breaks</h1><p>Muestra varios breaks vigentes y pasa los finalizados al historial.</p></div><button className="admin-button primary" onClick={() => openBreak()}>+ Crear break</button></div>
            <div className="admin-break-list">
              {data.breaks.map((item, index) => <article className="admin-break-row" key={item.id}><img src={item.image} alt="" /><div><h3>{item.title}</h3><p>{item.status === "past" ? `Terminado · ${item.spotsTotal} cupos` : `${item.spotsAvailable} cupos libres de ${item.spotsTotal}`} · {(item.priceOptions ?? []).map((option) => `${option.spots} spot${option.spots === 1 ? "" : "s"} ${money.format(option.price)}`).join(" · ")}</p><span className={`admin-pill ${item.status === "past" ? "past" : ""}`}>{item.status === "past" ? "Terminado" : "Vigente"}</span></div><div className="admin-row-actions"><button className="admin-link" onClick={() => openBreak(index)}>Editar</button><button className="admin-link" onClick={() => removeBreak(index)}>Quitar</button></div></article>)}
              {!data.breaks.length && <div className="admin-empty">Aún no hay breaks.</div>}
            </div>
          </section>
        ) : data.finance && <FinancePanel
          data={data.finance}
          products={data.products}
          reservedSale={reservedSale}
          onReservedSaleHandled={() => setReservedSale(null)}
          onChange={(finance, products = data.products) => changeData({ ...data, finance, products })}
          onReceiveIncoming={(order, existingProductIndex) => {
            if (existingProductIndex !== undefined) {
              const products = clone(data.products);
              products[existingProductIndex].stock = Number(products[existingProductIndex].stock || 0) + order.expectedQuantity;
              changeData({ ...data, products, finance: { ...data.finance, incomingOrders: data.finance.incomingOrders.map((item) => item.id === order.id ? { ...item, status: "received" as const, receivedAt: new Date().toISOString() } : item) } });
            } else {
              openProduct(undefined, "Producto sellado", { name: order.productName, detail: "Mercancía recibida", stock: order.expectedQuantity, price: 0, image: "" }, order.id);
            }
          }}
        />}
      </div>

      {editor && <div className="admin-modal" role="dialog" aria-modal="true"><form className="admin-modal-card" onSubmit={submitEditor}>
        <div className="admin-modal-head"><h2>{editor.kind === "product" ? (receivingOrderId ? "Recibir producto e ingresarlo al inventario" : editor.index === undefined ? "Agregar producto" : "Editar producto") : (editor.index === undefined ? "Crear break" : "Editar break")}</h2><button className="admin-close" type="button" onClick={() => { setEditor(null); setReceivingOrderId(null); }}>×</button></div>
        {editor.kind === "product" ? <div className="admin-form-grid">
          <div className="admin-field"><label>Tipo</label><select value={productDraft.category} onChange={(event) => setProductDraft({...productDraft, category:event.target.value})}><option value="Producto sellado">Caja / producto sellado</option><option value="Tarjetas">Tarjeta</option><option value="Hobby box">Hobby box</option><option value="Sobres">Sobre</option></select></div>
          <div className="admin-field"><label>Inventario</label><input type="number" min="0" required value={productDraft.stock} onChange={(event) => setProductDraft({...productDraft, stock:Number(event.target.value)})} /></div>
          <div className="admin-field full"><label>Nombre del jugador o producto</label><input required value={productDraft.name} onChange={(event) => setProductDraft({...productDraft, name:event.target.value})} /></div>
          <div className="admin-field full"><label>Colección, tipo o variante</label><input value={productDraft.detail ?? ""} onChange={(event) => setProductDraft({...productDraft, detail:event.target.value})} placeholder="Ej. Panini Select · Patch /25" /></div>
          {productDraft.category === "Tarjetas" && <>
            <div className="admin-field"><label>País <small>(opcional)</small></label><select value={productDraft.country ?? ""} onChange={(event) => setProductDraft({...productDraft, country:event.target.value})}><option value="">Sin seleccionar</option>{countryOptions.map((country) => <option key={country} value={country}>{country}</option>)}</select></div>
            <div className="admin-field"><label>Equipo <small>(opcional)</small></label><select value={productDraft.team ?? ""} onChange={(event) => setProductDraft({...productDraft, team:event.target.value})}><option value="">Sin seleccionar</option>{teamOptions.map((team) => <option key={team} value={team}>{team}</option>)}</select></div>
            <div className="admin-field full"><label>Atributos de la tarjeta <small>(opcionales)</small></label><div className="admin-checks"><label><input type="checkbox" checked={Boolean(productDraft.numbered)} onChange={(event) => setProductDraft({...productDraft, numbered:event.target.checked})} /> Numerada</label><label><input type="checkbox" checked={Boolean(productDraft.patch)} onChange={(event) => setProductDraft({...productDraft, patch:event.target.checked})} /> Patch</label><label><input type="checkbox" checked={Boolean(productDraft.signature)} onChange={(event) => setProductDraft({...productDraft, signature:event.target.checked})} /> Firma</label></div></div>
          </>}
          <div className="admin-field"><label>Precio (COP)</label><input type="number" min="0" required value={productDraft.price} onChange={(event) => setProductDraft({...productDraft, price:Number(event.target.value)})} /></div>
          <div className="admin-field"><label>Imagen actual</label><input value={productDraft.image} onChange={(event) => setProductDraft({...productDraft, image:event.target.value})} placeholder="URL o ruta" /></div>
          <div className="admin-field full"><label>Subir una foto nueva</label><input type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} /><small>JPG, PNG o WEBP, máximo 10 MB.</small></div>
          {productDraft.image && <div className="admin-field full"><img className="admin-preview" src={productDraft.image} alt="Vista previa" /></div>}
        </div> : <div className="admin-form-grid">
          <div className="admin-field full"><label>Nombre del break</label><input required value={breakDraft.title} onChange={(event) => setBreakDraft({...breakDraft, title:event.target.value})} /></div>
          <div className="admin-field full"><label>Descripción</label><textarea required value={breakDraft.description} onChange={(event) => setBreakDraft({...breakDraft, description:event.target.value})} /></div>
          <div className="admin-field"><label>Estado</label><select value={breakDraft.status} onChange={(event) => setBreakDraft({...breakDraft, status:event.target.value as "active" | "past"})}><option value="active">Vigente</option><option value="past">Terminado</option></select></div>
          <div className="admin-field"><label>Imagen actual</label><input value={breakDraft.image} onChange={(event) => setBreakDraft({...breakDraft, image:event.target.value})} /></div>
          <div className="admin-field full"><label>Subir una foto nueva</label><input type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} /></div>
          <div className="admin-field full"><label>Opciones de reserva y precio (COP)</label><textarea value={optionsDraft} onChange={(event) => setOptionsDraft(event.target.value)} placeholder={"1: 50000\n2: 90000\n5: 200000"} /><small>Una opción por línea: cantidad de spots: precio. Puedes poner una sola opción o todas las que necesites.</small></div>
          <div className="admin-field"><label>Cupos totales</label><input type="number" min="0" required value={breakDraft.spotsTotal} onChange={(event) => setBreakDraft({...breakDraft, spotsTotal:Number(event.target.value)})} /></div>
          <div className="admin-field"><label>Cupos libres</label><input type="number" min="0" required value={breakDraft.spotsAvailable} onChange={(event) => setBreakDraft({...breakDraft, spotsAvailable:Number(event.target.value)})} /></div>
          {breakDraft.image && <div className="admin-field full"><img className="admin-preview" src={breakDraft.image} alt="Vista previa" /></div>}
        </div>}
        <div className="admin-modal-actions"><button className="admin-button" type="button" onClick={() => { setEditor(null); setReceivingOrderId(null); }}>Cancelar</button><button className="admin-button primary" type="submit" disabled={working}>Aplicar al borrador</button></div>
      </form></div>}

      {reservationIndex !== null && <div className="admin-modal" role="dialog" aria-modal="true"><form className="admin-modal-card reservation-modal" onSubmit={saveReservation}>
        <div className="admin-modal-head"><h2>Reservar producto</h2><button className="admin-close" type="button" onClick={() => setReservationIndex(null)}>×</button></div>
        <div className="admin-form-grid"><div className="admin-field full"><p><strong>{data.products[reservationIndex].name}</strong> dejará de aparecer en el catálogo de clientes cuando publiques los cambios.</p></div><div className="admin-field full"><label>Nombre de quien reserva</label><input required list="reservation-customers" value={reservationCustomer} onChange={(event) => setReservationCustomer(event.target.value)} placeholder="Escribe o selecciona un cliente" /><datalist id="reservation-customers">{data.finance?.customers.map((customer) => <option key={customer.id} value={customer.name} />)}</datalist></div></div>
        <div className="admin-modal-actions"><button className="admin-button" type="button" onClick={() => setReservationIndex(null)}>Cancelar</button><button className="admin-button primary" type="submit">Reservar producto</button></div>
      </form></div>}
    </main>
  );
}
