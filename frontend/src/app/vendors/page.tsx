"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSelectedLocation } from "@/components/LocationSelector";

type Vendor = { vendor_id: string; vendor_name: string; payment_terms: string | null; active: boolean };
type VendorItem = { vendor_item_id: string; vendor_id: string; ingredient_id: string; vendor_sku: string | null; pack_size: number; pack_unit: string; current_pack_price: number; currency: string; valid_from: string };
type Ingredient = { ingredient_id: string; ingredient_name: string };
type PurchaseOrder = { purchase_order_id: string; vendor_id: string; location_id: string; order_date: string; expected_date: string | null; status: string; currency: string };
type PurchaseOrderLine = { purchase_order_id: string; ingredient_id: string; quantity_ordered: number; quantity_received: number; unit: string; unit_price: number; line_total: number };
type Invoice = { invoice_id: string; vendor_id: string; location_id: string; purchase_order_id: string | null; invoice_number: string; invoice_date: string; due_date: string | null; status: string; currency: string; total_amount: number };

function money(value: number, currency = "GBP") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}
function n(value: unknown) { const x = Number(value); return Number.isFinite(x) ? x : 0; }
function label(value: string) { return value.replaceAll("_", " "); }

export default function VendorsPage() {
  const { locationId, locationReady } = useSelectedLocation();
  const [vendors,setVendors]=useState<Vendor[]>([]), [items,setItems]=useState<VendorItem[]>([]), [ingredients,setIngredients]=useState<Ingredient[]>([]);
  const [orders,setOrders]=useState<PurchaseOrder[]>([]), [lines,setLines]=useState<PurchaseOrderLine[]>([]), [invoices,setInvoices]=useState<Invoice[]>([]);
  const [search,setSearch]=useState(""), [activeOnly,setActiveOnly]=useState(true), [expanded,setExpanded]=useState<string|null>(null);
  const [loading,setLoading]=useState(true), [error,setError]=useState<string|null>(null);

  const load = useCallback(async()=>{
    if(!locationReady)return; setLoading(true); setError(null);
    try{
      const s=createClient();
      const [v,i,g,o,l,inv]=await Promise.all([
        s.from("vendors").select("vendor_id,vendor_name,payment_terms,active").order("vendor_id"),
        s.from("vendor_items").select("vendor_item_id,vendor_id,ingredient_id,vendor_sku,pack_size,pack_unit,current_pack_price,currency,valid_from").order("valid_from",{ascending:false}),
        s.from("ingredients").select("ingredient_id,ingredient_name").order("ingredient_name"),
        (()=>{let q=s.from("purchase_orders").select("purchase_order_id,vendor_id,location_id,order_date,expected_date,status,currency").order("order_date",{ascending:false}); return locationId?q.eq("location_id",locationId):q})(),
        s.from("purchase_order_lines").select("purchase_order_id,ingredient_id,quantity_ordered,quantity_received,unit,unit_price,line_total"),
        (()=>{let q=s.from("invoices").select("invoice_id,vendor_id,location_id,purchase_order_id,invoice_number,invoice_date,due_date,status,currency,total_amount").order("invoice_date",{ascending:false}); return locationId?q.eq("location_id",locationId):q})(),
      ]);
      const e=v.error||i.error||g.error||o.error||l.error||inv.error; if(e)throw e;
      setVendors((v.data||[]) as Vendor[]); setItems((i.data||[]) as VendorItem[]); setIngredients((g.data||[]) as Ingredient[]); setOrders((o.data||[]) as PurchaseOrder[]); setLines((l.data||[]) as PurchaseOrderLine[]); setInvoices((inv.data||[]) as Invoice[]);
    }catch(e){setError(e instanceof Error?e.message:"Unable to load vendor data.")}finally{setLoading(false)}
  },[locationId,locationReady]);
  useEffect(()=>{void load()},[load]);

  const names=useMemo(()=>new Map(ingredients.map(x=>[x.ingredient_id,x.ingredient_name])),[ingredients]);
  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return vendors.filter(v=>(!q||v.vendor_name.toLowerCase().includes(q)||v.vendor_id.toLowerCase().includes(q))&&(!activeOnly||v.active))},[vendors,search,activeOnly]);
  const totalSpend=invoices.reduce((a,x)=>a+n(x.total_amount),0);

  return <main className="mx-auto w-full max-w-7xl space-y-6 p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm font-medium text-muted-foreground">CaféOps Intelligence</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Vendors &amp; Purchasing</h1><p className="mt-2 text-sm text-muted-foreground">Supplier relationships, ingredient pricing, purchase orders, and invoice activity.</p><p className="mt-1 text-xs text-muted-foreground">{locationId?`Purchase activity filtered by ${locationId}`:"Purchase activity across accessible locations"}</p></div>
      <div className="flex flex-wrap items-center gap-3"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vendors…" className="min-w-52 rounded-lg border bg-background px-3 py-2 text-sm"/><label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={activeOnly} onChange={e=>setActiveOnly(e.target.checked)}/>Active only</label><button onClick={()=>void load()} disabled={loading||!locationReady} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">{loading?"Refreshing…":"Refresh"}</button></div>
    </header>
    {error&&<section className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"><p className="font-semibold">Could not load vendors</p><p className="mt-1 break-words">{error}</p></section>}
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[['Active vendors',vendors.filter(v=>v.active).length],['Vendor items',items.length],['Purchase orders',orders.length],['Invoice spend',money(totalSpend)]].map(([k,v])=><div key={String(k)} className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">{k}</p><p className="mt-2 text-2xl font-bold">{loading?'…':v}</p></div>)}
    </section>
    <section className="rounded-xl border bg-card"><div className="border-b p-4"><h2 className="font-semibold">Vendor directory</h2><p className="mt-1 text-sm text-muted-foreground">Expand a supplier to review supplied ingredients, purchase orders, and invoices.</p></div>
      {loading?<div className="p-8 text-center text-sm text-muted-foreground">Loading vendors…</div>:!filtered.length?<div className="p-8 text-center text-sm text-muted-foreground">No vendors match your filters.</div>:<div className="divide-y">{filtered.map(v=>{const open=expanded===v.vendor_id;const vi=items.filter(x=>x.vendor_id===v.vendor_id);const vo=orders.filter(x=>x.vendor_id===v.vendor_id);const inv=invoices.filter(x=>x.vendor_id===v.vendor_id);const spend=inv.reduce((a,x)=>a+n(x.total_amount),0);return <div key={v.vendor_id}>
        <button type="button" onClick={()=>setExpanded(open?null:v.vendor_id)} className="group w-full cursor-pointer px-4 py-4 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="text-lg">{open?'⌄':'›'}</span><div><p className="font-semibold">{v.vendor_name}</p><p className="mt-1 text-xs text-muted-foreground">{v.vendor_id} · {v.payment_terms||'Terms not specified'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${v.active?'bg-emerald-100 text-emerald-800':'bg-muted text-muted-foreground'}`}>{v.active?'Active':'Inactive'}</span></div><div className="flex items-center gap-5 text-sm"><span><strong>{vi.length}</strong> <span className="text-muted-foreground">items</span></span><span><strong>{vo.length}</strong> <span className="text-muted-foreground">POs</span></span><span><strong>{money(spend)}</strong> <span className="text-muted-foreground">invoices</span></span><span className="text-lg opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" title="Open vendor details"></span></div></div></button>
        {open&&<div className="border-t bg-muted/10 p-4"><div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border bg-card"><div className="border-b p-3"><h3 className="font-medium">Supplied ingredients</h3></div><div className="divide-y">{vi.length?vi.map(x=><div key={x.vendor_item_id} className="flex items-center justify-between gap-4 p-3"><div><p className="font-medium">{names.get(x.ingredient_id)||'Unknown ingredient'}</p><p className="text-xs text-muted-foreground">{x.ingredient_id}{x.vendor_sku?` · SKU ${x.vendor_sku}`:''}</p></div><div className="text-right"><p className="font-medium tabular-nums">{money(x.current_pack_price,x.currency)}</p><p className="text-xs text-muted-foreground">{x.pack_size} {x.pack_unit}</p></div></div>):<p className="p-4 text-sm text-muted-foreground">No vendor items recorded.</p>}</div></section>
          <section className="rounded-lg border bg-card"><div className="border-b p-3"><h3 className="font-medium">Purchase orders</h3></div><div className="divide-y">{vo.slice(0,8).map(o=>{const t=lines.filter(l=>l.purchase_order_id===o.purchase_order_id).reduce((a,l)=>a+n(l.line_total),0);return <div key={o.purchase_order_id} className="p-3 flex justify-between gap-4"><div><p className="font-medium">{o.purchase_order_id}</p><p className="text-xs text-muted-foreground">{o.order_date}{o.expected_date?` · expected ${o.expected_date}`:''}</p></div><div className="text-right"><p className="font-medium">{label(o.status)}</p><p className="text-xs text-muted-foreground">{money(t,o.currency)}</p></div></div>})}{!vo.length&&<p className="p-4 text-sm text-muted-foreground">No purchase orders for this location.</p>}</div></section>
        </div><section className="mt-4 rounded-lg border bg-card"><div className="border-b p-3"><h3 className="font-medium">Recent invoices</h3></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Invoice</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Amount</th></tr></thead><tbody className="divide-y">{inv.slice(0,10).map(x=><tr key={x.invoice_id}><td className="px-3 py-2">{x.invoice_number}</td><td className="px-3 py-2">{x.invoice_date}</td><td className="px-3 py-2">{label(x.status)}</td><td className="px-3 py-2 text-right tabular-nums">{money(n(x.total_amount),x.currency)}</td></tr>)}{!inv.length&&<tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No invoices recorded.</td></tr>}</tbody></table></div></section></div>}
      </div>})}</div>}
    </section>
    <p className="text-xs text-muted-foreground">Vendor information is read from vendor, vendor-item, purchase-order, and invoice records. This page does not create or modify purchasing records.</p>
  </main>;
}
