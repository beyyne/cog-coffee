/* ─── Cognition Coffee Bar ─────────────────────────────── */

// Use clean origin (strips any embedded credentials from tunnel URLs)
const API_BASE = window.location.protocol + '//' + window.location.host;

// ── Constants ──────────────────────────────────────────────
const MILKS = ['Oat', 'Whole', '2%', 'Coconut', 'Pistachio', 'Almond'];
const SYRUPS = ['None', 'Vanilla', 'Mocha'];
const CHAI_STYLES = ['Regular', 'Spicy'];

// Loaded from menu-config.json (editable config file)
let CURRENT_ROASTERS = [];
let CURRENT_POUR_OVER = {};
let VOLITION_TEA = {};

// Categories that get milk + syrup + decaf options
const COFFEE_CATS = ['coffee'];
// Categories that get milk options (no decaf)
const MILK_CATS = ['coffee', 'matcha'];
const TEA_CATS = ['tea'];

// ── State ──────────────────────────────────────────────────
let menuItems = [];
let categories = [];
let activeCategory = 'all';
let cart = [];
let modalItem = null;
let modalQty = 1;
let modalMilk = null;
let modalSyrup = 'None';
let modalChaiStyle = 'Regular';
let modalTemp = 'Hot';
let modalSize = null;
// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadMenu();
});

async function loadMenu() {
  // Load config from API first, fall back to static file, then hardcoded
  try {
    const cfgRes = await fetch(`${API_BASE}/api/menu-config`);
    if (cfgRes.ok) {
      const cfg = await cfgRes.json();
      CURRENT_ROASTERS = cfg.roasters || CURRENT_ROASTERS;
      CURRENT_POUR_OVER = cfg.pour_over || CURRENT_POUR_OVER;
      VOLITION_TEA = cfg.tea_supplier || VOLITION_TEA;
      menuItems = cfg.menu || getFallbackMenu();
      categories = cfg.categories || getFallbackCategories();
    } else {
      throw new Error('api not available');
    }
  } catch {
    // Fallback: try static file, then hardcoded defaults
    try {
      const cfgRes = await fetch('menu-config.json?v=' + Date.now());
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        CURRENT_ROASTERS = cfg.roasters || CURRENT_ROASTERS;
        CURRENT_POUR_OVER = cfg.pour_over || CURRENT_POUR_OVER;
        VOLITION_TEA = cfg.tea_supplier || VOLITION_TEA;
        menuItems = cfg.menu || getFallbackMenu();
        categories = cfg.categories || getFallbackCategories();
      } else {
        throw new Error('config not found');
      }
    } catch {
      menuItems = getFallbackMenu();
      categories = getFallbackCategories();
    }
  }
}

// ── Navigation ─────────────────────────────────────────────
function showSection(name) {
  const sections = ['hero', 'menu', 'cart', 'checkout', 'confirmation', 'about'];
  sections.forEach(s => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.style.display = s === name ? '' : 'none';
  });

  if (name === 'menu') renderMenu();
  if (name === 'cart') renderCart();
  if (name === 'checkout') renderCheckout();

  window.scrollTo(0, 0);
}

function toggleMobileMenu() {
  document.getElementById('mobile-menu').classList.toggle('open');
}

// ── Menu Rendering ─────────────────────────────────────────
function renderMenu() {
  renderCategoryTabs();
  renderMenuGrid();
}

function renderCategoryTabs() {
  const container = document.getElementById('category-tabs');
  let html = `<button class="cat-tab ${activeCategory === 'all' ? 'active' : ''}" onclick="filterCategory('all')">All</button>`;
  categories.forEach(cat => {
    html += `<button class="cat-tab ${activeCategory === cat.id ? 'active' : ''}" onclick="filterCategory('${cat.id}')">${cat.name}</button>`;
  });
  container.innerHTML = html;
}

function getCategoryBanner() {
  if (activeCategory === 'coffee' || activeCategory === 'pour_over') {
    const links = CURRENT_ROASTERS.map(r =>
      `<a href="${r.url}" target="_blank" rel="noopener">${r.name}</a> · ${r.location}`
    ).join(' &nbsp;|&nbsp; ');
    return `<div class="category-banner">This week's roasters: ${links}</div>`;
  }
  if (activeCategory === 'matcha' || activeCategory === 'tea') {
    const v = VOLITION_TEA;
    return `<div class="category-banner"><a href="${v.url}" target="_blank" rel="noopener">${v.name}</a> · ${v.location}<br/><span class="banner-desc">${v.description}</span></div>`;
  }
  return '';
}

function renderMenuGrid() {
  const container = document.getElementById('menu-grid');
  const filtered = activeCategory === 'all'
    ? menuItems
    : menuItems.filter(item => item.category === activeCategory);

  const banner = activeCategory !== 'all' ? getCategoryBanner() : '';

  container.innerHTML = banner + filtered.map(item => `
    <div class="menu-card fade-in" onclick="openItemModal('${item.id}')">
      <div class="menu-card-header">
        <div class="menu-card-name">${item.name}</div>
      </div>
      <div class="menu-card-desc">${item.description}</div>
    </div>
  `).join('');
}

function filterCategory(catId) {
  activeCategory = catId;
  renderMenu();
}

// ── Item Modal ─────────────────────────────────────────────
function openItemModal(itemId) {
  modalItem = menuItems.find(i => i.id === itemId);
  if (!modalItem) return;

  modalQty = 1;
  modalMilk = null;
  modalSyrup = 'None';
  modalChaiStyle = 'Regular';
  modalTemp = 'Hot';
  modalSize = null;

  document.getElementById('modal-title').textContent = modalItem.name;
  document.getElementById('modal-desc').textContent = modalItem.description;
  document.getElementById('modal-qty-val').textContent = '1';
  document.getElementById('special-instructions').value = '';
  document.getElementById('decaf-toggle').checked = false;

  const cat = modalItem.category;
  const isCoffee = COFFEE_CATS.includes(cat);
  const hasMilk = MILK_CATS.includes(cat);
  const isChai = modalItem.id === 'tea-001';
  const isTea = TEA_CATS.includes(cat);
  const isAmericano = modalItem.id === 'coffee-006';
  const isDrip = modalItem.id === 'coffee-007';
  const isCoconutMatcha = false;
  const isPourOver = cat === 'pour_over';

  // Pour over — show current coffee on bar
  const pourOverEl = document.getElementById('modal-pour-over-details');
  pourOverEl.style.display = isPourOver ? '' : 'none';
  if (isPourOver) {
    const c = CURRENT_POUR_OVER;
    pourOverEl.innerHTML = `
      <div class="pour-over-card">
        <div class="pour-over-header">Currently on Bar</div>
        <div class="pour-over-name">${c.name}</div>
        <div class="pour-over-meta">
          <span><strong>Producer</strong> ${c.producer}</span>
          <span><strong>Origin</strong> ${c.origin}</span>
          <span><strong>Elevation</strong> ${c.elevation}</span>
          <span><strong>Process</strong> ${c.process}</span>
          <span><strong>Variety</strong> ${c.variety}</span>
        </div>
        <div class="pour-over-tasting">${c.tasting}</div>
        <div class="pour-over-roaster">Roasted by <a href="${c.roasterUrl}" target="_blank" rel="noopener">${c.roaster}</a> · ${c.roasterLocation}</div>
        <div class="pour-over-note">Please allow a minimum of 5 minutes for preparation.</div>
      </div>`;
  }

  // Decaf toggle — only for coffee
  document.getElementById('modal-decaf').style.display = isCoffee ? '' : 'none';

  // Chai style
  document.getElementById('modal-chai-style').style.display = isChai ? '' : 'none';
  if (isChai) renderChaiPills();

  // Temperature — hot or iced for tea items, americano, drip
  const showTemp = isTea || isAmericano;
  document.getElementById('modal-temp').style.display = showTemp ? '' : 'none';
  if (showTemp) renderTempPills();

  // Size — 8oz or 12oz for americano and drip
  const showSize = isAmericano || isDrip;
  document.getElementById('modal-size').style.display = showSize ? '' : 'none';
  if (showSize) { modalSize = '8oz'; renderSizePills(); }

  // Milk — for coffee, matcha (not tea, not espresso)
  const isEspresso = modalItem.id === 'coffee-001';
  const isCortado = modalItem.id === 'coffee-002';
  const showMilk = hasMilk && !isCoconutMatcha && !isEspresso;
  document.getElementById('modal-milk').style.display = showMilk ? '' : 'none';
  if (showMilk) renderMilkPills();

  // Syrup — for drinks that take milk (not cortado, espresso, drip)
  const showSyrup = (isCoffee || cat === 'matcha' || isChai) && !isCoconutMatcha && !isCortado && !isDrip && !isEspresso;
  document.getElementById('modal-syrup').style.display = showSyrup ? '' : 'none';
  if (showSyrup) renderSyrupPills();

  updateModalButton();

  document.getElementById('item-modal').style.display = '';
  document.body.style.overflow = 'hidden';
}

function renderSizePills() {
  document.getElementById('size-pills').innerHTML = ['8oz', '12oz'].map(s =>
    `<button class="option-pill ${s === modalSize ? 'active' : ''}" onclick="selectSize('${s}')">${s}</button>`
  ).join('');
}

function selectSize(size) {
  modalSize = size;
  renderSizePills();
}

function renderTempPills() {
  document.getElementById('temp-pills').innerHTML = ['Hot', 'Iced'].map(t =>
    `<button class="option-pill ${t === modalTemp ? 'active' : ''}" onclick="selectTemp('${t}')">${t}</button>`
  ).join('');
}

function selectTemp(temp) {
  modalTemp = temp;
  renderTempPills();
}

function renderMilkPills() {
  document.getElementById('milk-pills').innerHTML = MILKS.map(m =>
    `<button class="option-pill ${m === modalMilk ? 'active' : ''}" onclick="selectMilk('${m}')">${m}</button>`
  ).join('');
}

function selectMilk(milk) {
  modalMilk = modalMilk === milk ? null : milk;
  renderMilkPills();
}

function renderSyrupPills() {
  document.getElementById('syrup-pills').innerHTML = SYRUPS.map(s =>
    `<button class="option-pill ${s === modalSyrup ? 'active' : ''}" onclick="selectSyrup('${s}')">${s === 'Mocha' ? 'Mocha (Dandelion Choc.)' : s}</button>`
  ).join('');
}

function selectSyrup(syrup) {
  modalSyrup = syrup;
  renderSyrupPills();
}

function renderChaiPills() {
  document.getElementById('chai-style-pills').innerHTML = CHAI_STYLES.map(s =>
    `<button class="option-pill ${s === modalChaiStyle ? 'active' : ''}" onclick="selectChaiStyle('${s}')">${s}</button>`
  ).join('');
}

function selectChaiStyle(style) {
  modalChaiStyle = style;
  renderChaiPills();
}

function changeQty(delta) {
  modalQty = Math.max(1, modalQty + delta);
  document.getElementById('modal-qty-val').textContent = modalQty;
  updateModalButton();
}

function updateModalButton() {
  const label = modalQty > 1 ? `Add ${modalQty} to Order` : 'Add to Order';
  document.getElementById('modal-add-btn').textContent = label;
}

function closeModal() {
  document.getElementById('item-modal').style.display = 'none';
  document.body.style.overflow = '';
}

function addToCart() {
  const instructions = document.getElementById('special-instructions').value.trim();
  const isDecaf = document.getElementById('decaf-toggle').checked;
  const isChai = modalItem.id === 'tea-001';

  // Build details string
  const details = [];
  const isTea = TEA_CATS.includes(modalItem.category);
  const isAmericano = modalItem.id === 'coffee-006';
  if (isDecaf) details.push('Decaf');
  if (isTea || isAmericano) details.push(modalTemp);
  if (modalSize) details.push(modalSize);
  if (isChai) details.push(modalChaiStyle);
  if (modalMilk) details.push(modalMilk + ' milk');
  if (modalSyrup && modalSyrup !== 'None') {
    details.push(modalSyrup === 'Mocha' ? 'Mocha syrup (Dandelion)' : modalSyrup + ' syrup');
  }
  if (instructions) details.push(instructions);

  cart.push({
    menu_item_id: modalItem.id,
    name: modalItem.name,
    quantity: modalQty,
    special_instructions: details.join(', '),
  });
  updateCartBadge();
  closeModal();
  showToast(`${modalItem.name} added to order`);
}

// ── Cart ───────────────────────────────────────────────────
function updateCartBadge() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.getElementById('cart-badge').textContent = count;
  const mobileBadge = document.getElementById('cart-badge-mobile');
  if (mobileBadge) mobileBadge.textContent = count;
}

function renderCart() {
  const emptyEl = document.getElementById('cart-empty');
  const contentEl = document.getElementById('cart-content');

  if (cart.length === 0) {
    emptyEl.style.display = '';
    contentEl.style.display = 'none';
    return;
  }
  emptyEl.style.display = 'none';
  contentEl.style.display = '';

  const itemsHtml = cart.map((item, idx) => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        ${item.special_instructions ? `<div class="cart-item-details">${item.special_instructions}</div>` : ''}
        <button class="cart-item-remove" onclick="removeCartItem(${idx})">Remove</button>
      </div>
      <div class="cart-item-qty">
        <button onclick="updateCartQty(${idx}, -1)">−</button>
        <span>${item.quantity}</span>
        <button onclick="updateCartQty(${idx}, 1)">+</button>
      </div>
    </div>
  `).join('');

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.getElementById('cart-items').innerHTML = itemsHtml;
  document.getElementById('cart-item-count').textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''}`;
}

function updateCartQty(idx, delta) {
  cart[idx].quantity = Math.max(1, cart[idx].quantity + delta);
  updateCartBadge();
  renderCart();
}

function removeCartItem(idx) {
  cart.splice(idx, 1);
  updateCartBadge();
  renderCart();
}

// ── Checkout ───────────────────────────────────────────────
function renderCheckout() {
  const itemsHtml = cart.map(item => {
    const label = item.quantity > 1
      ? `${item.name} x${item.quantity}`
      : item.name;
    const details = item.special_instructions
      ? `<div style="font-size:0.8rem;color:#6b6b6b">${item.special_instructions}</div>`
      : '';
    return `<div class="checkout-line"><span>${label}</span></div>${details}`;
  }).join('');

  document.getElementById('checkout-items').innerHTML = itemsHtml;
  setPickupMode('asap');
}

function setPickupMode(mode) {
  const asapBtn = document.getElementById('pickup-asap');
  const laterBtn = document.getElementById('pickup-later');
  const timeInput = document.getElementById('pickup-time-input');
  const hiddenInput = document.getElementById('pickup-time');

  if (mode === 'asap') {
    asapBtn.classList.add('active');
    laterBtn.classList.remove('active');
    timeInput.style.display = 'none';
    timeInput.required = false;
    hiddenInput.value = 'ASAP';
  } else {
    asapBtn.classList.remove('active');
    laterBtn.classList.add('active');
    timeInput.style.display = '';
    timeInput.required = true;
    timeInput.focus();
    hiddenInput.value = '';
    timeInput.addEventListener('change', function handler() {
      hiddenInput.value = formatTime(timeInput.value);
    });
  }
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

async function submitOrder(e) {
  e.preventDefault();

  const pickupTime = document.getElementById('pickup-time').value;
  if (!pickupTime) {
    showToast('Please choose a pickup time');
    return;
  }

  const btn = document.getElementById('place-order-btn');
  btn.disabled = true;
  btn.textContent = 'Placing Order...';

  const payload = {
    items: cart.map(item => ({
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      special_instructions: item.special_instructions,
    })),
    customer_name: document.getElementById('cust-name').value,
    pickup_time: pickupTime,
    notes: document.getElementById('order-notes').value,
  };

  try {
    const res = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('Order failed');
    const order = await res.json();
    showConfirmation(order);
  } catch (err) {
    console.error('API order failed, using localStorage fallback:', err);
    const order = {
      id: Math.random().toString(36).slice(2, 10),
      status: 'confirmed',
      customer_name: payload.customer_name,
      pickup_time: payload.pickup_time,
      notes: payload.notes,
      items: payload.items,
      created_at: new Date().toISOString(),
    };
    try {
      const localOrders = JSON.parse(localStorage.getItem('cognition_orders') || '[]');
      localOrders.push(order);
      localStorage.setItem('cognition_orders', JSON.stringify(localOrders));
    } catch {}
    showConfirmation(order);
  }

  btn.disabled = false;
  btn.textContent = 'Place Order';
}

function showConfirmation(order) {
  document.getElementById('conf-order-id').textContent = order.id.toUpperCase();
  document.getElementById('conf-name').textContent = document.getElementById('cust-name').value;

  const pickupTime = document.getElementById('pickup-time').value;
  const pickupEl = document.getElementById('conf-pickup');
  if (pickupTime && pickupEl) {
    pickupEl.textContent = `Pickup time: ${pickupTime}`;
    pickupEl.style.display = '';
  }

  const detailsHtml = cart.map(item => {
    const label = item.quantity > 1
      ? `${item.name} x${item.quantity}`
      : item.name;
    const details = item.special_instructions
      ? `<div style="font-size:0.8rem;color:#6b6b6b;margin-bottom:4px">${item.special_instructions}</div>`
      : '';
    return `<div class="conf-line"><span>${label}</span></div>${details}`;
  }).join('');

  document.getElementById('conf-details').innerHTML = detailsHtml;

  cart = [];
  updateCartBadge();
  document.getElementById('checkout-form').reset();

  showSection('confirmation');
}

function startNewOrder() {
  showSection('menu');
}

// ── Toast ──────────────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// ── Fallback Data ──────────────────────────────────────────
function getFallbackCategories() {
  return [
    { id: 'coffee', name: 'Coffee' },
    { id: 'matcha', name: 'Matcha' },
    { id: 'tea', name: 'Tea' },
    { id: 'pour_over', name: 'Pour Over' },
  ];
}

function getFallbackMenu() {
  return [
    { id: 'coffee-006', name: 'Americano', description: 'Espresso with hot water.', category: 'coffee' },
    { id: 'coffee-007', name: 'Drip Coffee', description: 'Freshly brewed drip coffee.', category: 'coffee' },
    { id: 'coffee-001', name: 'Espresso', description: 'Rotating coffees, modern espresso.', category: 'coffee' },
    { id: 'coffee-002', name: 'Cortado', description: '4oz. Equal parts espresso and steamed milk.', category: 'coffee' },
    { id: 'coffee-003', name: 'Cappuccino', description: '6oz. Steamed milk and foam over a double espresso.', category: 'coffee' },
    { id: 'coffee-004', name: 'Latte', description: '12oz. Smooth steamed milk with a double shot of espresso.', category: 'coffee' },
    { id: 'coffee-008', name: 'Cherry Cola Tonic', description: 'Espresso with cherry cola tonic. Refreshing and effervescent.', category: 'coffee' },
    { id: 'coffee-005', name: 'Mocha', description: 'Espresso with steamed milk and house-made chocolate.', category: 'coffee' },
    { id: 'coffee-009', name: 'Honey Lavender', description: 'Espresso with steamed milk, honey, and lavender.', category: 'coffee' },
    { id: 'coffee-010', name: 'Vanilla', description: 'Espresso with steamed milk and vanilla.', category: 'coffee' },
    { id: 'tea-001', name: 'Chai Latte', description: 'House-spiced chai with steamed milk. Available regular or spicy.', category: 'tea' },
    { id: 'matcha-001', name: 'Matcha Latte', description: 'Japanese matcha from Spirit Tea, Chicago. Whisked with steamed milk.', category: 'matcha' },
    { id: 'tea-002', name: 'Hojicha Latte', description: 'Roasted Japanese green tea latte. Smooth and toasty.', category: 'tea' },
    { id: 'tea-003', name: 'Chamomile', description: 'Chamomile Blossom from Volition Tea. Applegate Valley, OR. Wild flowers, honey, mint.', category: 'tea' },
    { id: 'tea-004', name: 'Malabar', description: 'Herbal tonic from Spirit Tea. Chinese ginger, lemongrass, turmeric, Malabar black peppercorn, licorice root.', category: 'tea' },
    { id: 'tea-005', name: 'White Tea', description: 'Snow Phoenix from Spirit Tea. Da Ye variety, Dehong, Yunnan. Soft, aromatic, handpicked unopened buds.', category: 'tea' },
    { id: 'tea-006', name: 'Green Tea', description: 'High Mountain Dragon Well from Volition Tea. Pan\'an, Zhejiang, China. Sugarcane, chestnut, savory.', category: 'tea' },
    { id: 'tea-007', name: 'Oolong', description: 'Muzha Iron Goddess of Mercy from Spirit Tea. Sugar plum, puffed rice, nectarine.', category: 'tea' },
    { id: 'pour_over-001', name: 'Pour Over', description: 'Rotating single-origin, hand-poured. We rotate an international, local, and domestic roaster each month. Please allow 5 minutes.', category: 'pour_over' },
  ];
}
