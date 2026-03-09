import { useState, useEffect } from "react";

// ✅ Points to your Node.js server.js backend
const API_URL = "http://localhost:3000";

const inputStyle = {
  width: "100%", background: "#5a1a00", border: "1px solid #8b3500",
  borderRadius: 4, color: "#fff", padding: "6px 8px", fontSize: 12,
  boxSizing: "border-box", outline: "none",
};
const readonlyStyle = { ...inputStyle, background: "#3a0e00", color: "#ffd080" };
const labelStyle = { color: "#e0a080", fontSize: 11, marginBottom: 2 };

export default function OrderTaking() {
  // ── State ──────────────────────────────────────────────
  const [categories, setCategories]           = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [products, setProducts]               = useState([]);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState("");

  // Current order tracked by server-issued order_id
  const [orderId, setOrderId]                 = useState(null);
  const [orderItems, setOrderItems]           = useState([]);
  const [grandTotal, setGrandTotal]           = useState("0.00");

  // Form fields (manual entry / auto-filled on product click)
  const [form, setForm] = useState({ productId: "", productName: "", price: "", quantity: "1" });
  const [selectedItem, setSelectedItem]       = useState(null); // item selected in right panel
  const [cashTendered, setCashTendered]       = useState("");

  const change =
    cashTendered && grandTotal
      ? (parseFloat(cashTendered) - parseFloat(grandTotal)).toFixed(2)
      : "";

  // ── 1. Load categories on mount  →  GET /categories ───
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res  = await fetch(`${API_URL}/categories`);
        const data = await res.json();
        if (data.success) {
          setCategories(data.data);
          setSelectedCategory(data.data[0]);   // default first category
        } else {
          setError("Failed to load categories.");
        }
      } catch {
        setError("Cannot connect to server. Make sure Node.js is running.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── 2. Load products when category changes  →  GET /products/:categoryId ──
  useEffect(() => {
    if (!selectedCategory) return;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res  = await fetch(`${API_URL}/products/${selectedCategory.id}`);
        const data = await res.json();
        if (data.success) {
          setProducts(data.data);
        } else {
          setError("Failed to load products.");
        }
      } catch {
        setError("Cannot reach server.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedCategory]);

  // ── 3. Click product → auto-fill form ─────────────────
  const handleSelectProduct = (product) => {
    setForm({
      productId:   String(product.id),
      productName: product.name,
      price:       String(product.price),
      quantity:    "1",
    });
  };

  // ── 4. ADD  →  POST /order/add ─────────────────────────
  const handleAdd = async () => {
    if (!form.productId || !form.quantity) {
      alert("Please select a product and set a quantity.");
      return;
    }
    setError("");
    try {
      const res  = await fetch(`${API_URL}/order/add`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          product_id: parseInt(form.productId),
          quantity:   parseInt(form.quantity),
          order_id:   orderId,           // null on first add → server creates new order
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOrderId(data.order_id);       // remember the server-assigned order ID
        setOrderItems(data.items);
        setGrandTotal(data.grand_total);
        setForm({ productId: "", productName: "", price: "", quantity: "1" });
        setSelectedItem(null);
      } else {
        setError(data.error || "Failed to add item.");
      }
    } catch {
      setError("Network error while adding item.");
    }
  };

  // ── 5. DELETE item  →  DELETE /order/:orderId/item/:itemId ──
  const handleDelete = async () => {
    if (!selectedItem || !orderId) {
      alert("Select an item from the order list first.");
      return;
    }
    try {
      const res  = await fetch(`${API_URL}/order/${orderId}/item/${selectedItem.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setOrderItems(data.items);
        setGrandTotal(data.grand_total);
        setForm({ productId: "", productName: "", price: "", quantity: "1" });
        setSelectedItem(null);
      } else {
        setError(data.error || "Failed to delete item.");
      }
    } catch {
      setError("Network error while deleting item.");
    }
  };

  // ── 6. PAY  →  POST /order/pay ─────────────────────────
  const handlePay = async () => {
    if (!orderId || orderItems.length === 0) {
      alert("No items in the current order.");
      return;
    }
    if (!cashTendered || parseFloat(cashTendered) < parseFloat(grandTotal)) {
      alert("Insufficient cash tendered.");
      return;
    }
    try {
      const res  = await fetch(`${API_URL}/order/pay`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          order_id:      orderId,
          cash_tendered: parseFloat(cashTendered),
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(
          `✅ Payment Successful!\n` +
          `Grand Total : ₱${data.grand_total}\n` +
          `Cash        : ₱${data.cash_tendered}\n` +
          `Change      : ₱${data.change}`
        );
        handleNewOrder();
      } else {
        setError(data.error || "Payment failed.");
      }
    } catch {
      setError("Network error during payment.");
    }
  };

  // ── 7. New Order — reset everything ───────────────────
  const handleNewOrder = () => {
    setOrderId(null);
    setOrderItems([]);
    setGrandTotal("0.00");
    setForm({ productId: "", productName: "", price: "", quantity: "1" });
    setCashTendered("");
    setSelectedItem(null);
    setError("");
  };

  // ── 8. Update — re-add with new quantity (simplest approach) ─
  const handleUpdate = async () => {
    if (!selectedItem || !orderId) {
      alert("Select an item from the right panel first.");
      return;
    }
    // Delete old, re-add with new quantity from form
    try {
      await fetch(`${API_URL}/order/${orderId}/item/${selectedItem.id}`, { method: "DELETE" });
      const res  = await fetch(`${API_URL}/order/add`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          product_id: parseInt(selectedItem.product_id),
          quantity:   parseInt(form.quantity) || 1,
          order_id:   orderId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOrderItems(data.items);
        setGrandTotal(data.grand_total);
        setForm({ productId: "", productName: "", price: "", quantity: "1" });
        setSelectedItem(null);
      }
    } catch {
      setError("Network error while updating item.");
    }
  };

  // ── Click item in right panel → fill form ─────────────
  const handleSelectOrderItem = (item) => {
    setSelectedItem(item);
    setForm({
      productId:   String(item.product_id),
      productName: item.product_name,
      price:       String(item.price),
      quantity:    String(item.quantity),
    });
  };

  // ── Render ─────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", background: "#1a0a00", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ background: "#3a1a08", padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontSize: 14 }}>Main Menu</span>
        {orderId && <span style={{ color: "#ff8c5a", fontSize: 12 }}>Order #{orderId}</span>}
        <span style={{ color: "#fff" }}>⋮</span>
      </div>

      {/* Title */}
      <div style={{ background: "#b03010", padding: "10px", textAlign: "center" }}>
        <h1 style={{ color: "#ff8c5a", fontSize: 22, margin: 0, fontStyle: "italic", letterSpacing: 2 }}>Order Taking</h1>
      </div>

      {/* Status Bar */}
      {(loading || error) && (
        <div style={{ background: loading ? "#1a4a00" : "#4a0000", color: "#fff", padding: "5px 14px", fontSize: 12, textAlign: "center" }}>
          {loading ? "⏳ Loading from database..." : `⚠️ ${error}`}
        </div>
      )}

      {/* Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* LEFT: Categories + Products */}
        <div style={{ width: 190, background: "#3a1a08", borderRight: "2px solid #6b2800", display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#ff8c5a", fontWeight: "bold", fontSize: 13, padding: "10px 10px 4px" }}>Categories</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "0 8px 8px" }}>
            {categories.map((cat) => (
              <button key={cat.id} onClick={() => setSelectedCategory(cat)}
                style={{
                  background: selectedCategory?.id === cat.id ? "#e05520" : "#8b2500",
                  color: "#fff",
                  border: selectedCategory?.id === cat.id ? "2px solid #ff8c5a" : "2px solid transparent",
                  borderRadius: 6, padding: "10px 0", fontSize: 13, fontWeight: "bold", cursor: "pointer",
                }}>
                {cat.name}
              </button>
            ))}
          </div>

          <div style={{ color: "#e0a080", fontSize: 11, padding: "4px 10px", borderTop: "1px solid #6b2800" }}>
            🗄️ Products ({products.length})
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {products.map((p) => (
              <div key={p.id} onClick={() => handleSelectProduct(p)}
                style={{
                  padding: "7px 10px", borderBottom: "1px solid #5a1a00", cursor: "pointer",
                  background: form.productId === String(p.id) ? "#6b2800" : "transparent",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#5a1a00"}
                onMouseLeave={(e) => e.currentTarget.style.background = form.productId === String(p.id) ? "#6b2800" : "transparent"}
              >
                <div style={{ color: "#fff", fontSize: 12, fontWeight: "bold" }}>{p.name}</div>
                <div style={{ color: "#ff8c5a", fontSize: 11 }}>₱{parseFloat(p.price).toFixed(2)}</div>
                <div style={{ color: "#999", fontSize: 10 }}>{p.description}</div>
              </div>
            ))}
          </div>
        </div>

        {/* MIDDLE: Form */}
        <div style={{ width: 255, background: "#2a0e00", borderRight: "2px solid #6b2800", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>

          {[
            { label: "Product ID:",    key: "productId",   placeholder: "Auto-filled" },
            { label: "Product Name:",  key: "productName", placeholder: "Auto-filled" },
            { label: "Price:",         key: "price",       placeholder: "0.00", type: "number" },
            { label: "Order Quantity:", key: "quantity",   placeholder: "1",    type: "number" },
          ].map(({ label, key, placeholder, type }) => (
            <div key={key}>
              <div style={labelStyle}>{label}</div>
              <input type={type || "text"} value={form[key]} placeholder={placeholder}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                style={inputStyle} />
            </div>
          ))}

          <div>
            <div style={labelStyle}>Total Amount:</div>
            <input readOnly
              value={form.price && form.quantity ? `₱${(parseFloat(form.price) * parseInt(form.quantity || 1)).toFixed(2)}` : ""}
              placeholder="Auto-calculated" style={readonlyStyle} />
          </div>
          <div>
            <div style={labelStyle}>Cash Tendered:</div>
            <input type="number" value={cashTendered} placeholder="0.00"
              onChange={(e) => setCashTendered(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Change:</div>
            <input readOnly value={change ? `₱${change}` : ""} placeholder="Auto-calculated" style={readonlyStyle} />
          </div>

          <button onClick={handlePay}
            style={{ marginTop: 8, background: "linear-gradient(180deg,#e05520,#b03010)", color: "#fff", border: "none", borderRadius: 6, padding: "13px 0", fontSize: 17, fontWeight: "bold", letterSpacing: 3, cursor: "pointer" }}>
            PAY
          </button>
        </div>

        {/* RIGHT: Live Order List */}
        <div style={{ flex: 1, background: "#f0ece8", padding: 12, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
          <div style={{ color: "#8b3500", fontWeight: "bold", fontSize: 13, borderBottom: "2px solid #c08060", paddingBottom: 4 }}>
            Order List {orderId ? `#${orderId}` : ""} &nbsp;|&nbsp; Grand Total:&nbsp;
            <span style={{ color: "#c03000" }}>₱{grandTotal}</span>
          </div>

          {orderItems.length === 0 && (
            <div style={{ color: "#bbb", fontSize: 13, textAlign: "center", marginTop: 40 }}>
              Click a product then press <b>Add</b>.
            </div>
          )}

          {orderItems.map((item) => (
            <div key={item.id} onClick={() => handleSelectOrderItem(item)}
              style={{
                background: selectedItem?.id === item.id ? "#ffd5b0" : "#fff",
                border: selectedItem?.id === item.id ? "2px solid #e05520" : "1px solid #ddd",
                borderRadius: 8, padding: "10px 14px", cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 42, height: 42, background: "#e05520", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🍽️</div>
                <div>
                  <div style={{ fontWeight: "bold", color: "#3a1a08", fontSize: 14 }}>{item.product_name}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>ID: {item.product_id}</div>
                  <div style={{ fontSize: 11, color: "#b05020" }}>₱{parseFloat(item.price).toFixed(2)} × {item.quantity}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: "bold", color: "#c03000", fontSize: 15 }}>₱{parseFloat(item.total_amount).toFixed(2)}</div>
                <div style={{ fontSize: 11, color: "#aaa" }}>qty: {item.quantity}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div style={{ display: "flex", background: "#1a0800", borderTop: "2px solid #5a2800" }}>
        {[
          { label: "New Order", action: handleNewOrder },
          { label: "Add",       action: handleAdd },
          { label: "Update",    action: handleUpdate },
          { label: "Delete",    action: handleDelete },
        ].map(({ label, action }) => (
          <button key={label} onClick={action}
            style={{ flex: 1, background: "transparent", color: "#ff8c5a", border: "none", borderRight: "1px solid #5a2800", padding: "13px 0", fontSize: 13, fontWeight: "bold", cursor: "pointer" }}
            onMouseEnter={(e) => e.target.style.background = "#3a1000"}
            onMouseLeave={(e) => e.target.style.background = "transparent"}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}