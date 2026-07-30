// catalog.js — public, read-only view

const grid = document.getElementById('item-grid');
const emptyState = document.getElementById('empty-state');
const filterRow = document.getElementById('filter-row');
const preloader = document.getElementById('preloader');

// ---------- Time-of-day greeting ----------

(function setHeroGreeting() {
  const el = document.getElementById('hero-greeting');
  if (!el) return;
  const hour = new Date().getHours();
  let text;
  if (hour < 5) text = "Burning the midnight oil? So are we.";
  else if (hour < 12) text = "Good morning — here's what's fresh today.";
  else if (hour < 17) text = "Good afternoon — see what just came in.";
  else if (hour < 21) text = "Good evening — the warehouse is still open.";
  else text = "Late-night browsing? We don't mind.";
  el.textContent = text;
})();

const MIN_PRELOAD_MS = 2000; // gives the name/rule/tagline sequence room to finish
const loadStart = performance.now();

// Belt-and-suspenders guard: some hosting/preview environments can replay or
// misroute the tap that opened the page itself once content settles, which
// can look like the modal "opening on its own". This flag makes card clicks
// a no-op until safely after the intro is gone, regardless of what triggered
// the click event or when.
let catalogInteractive = false;

function hidePreloader() {
  const elapsed = performance.now() - loadStart;
  const wait = Math.max(0, MIN_PRELOAD_MS - elapsed);
  setTimeout(() => {
    preloader.classList.add('is-hidden');
    setTimeout(() => { catalogInteractive = true; }, 700); // 700ms > the 600ms fade
  }, wait);
}

let allItems = [];
let categories = [];
let activeCategoryId = 'all';
let searchQuery = '';
let currentModalItemId = null;

// ---------- Scroll-in reveal ----------
// Cards start hidden (via CSS) and fade/rise in as they enter the viewport,
// rather than all animating at once on page load.

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-revealed');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

const PAGE_SIZE = 24;
let visibleCount = PAGE_SIZE;
const loadMoreBtn = document.getElementById('load-more-btn');
loadMoreBtn.addEventListener('click', () => {
  visibleCount += PAGE_SIZE;
  renderItems();
});

const searchInput = document.getElementById('search-input');
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  visibleCount = PAGE_SIZE;
  renderItems();
});

const surpriseBtn = document.getElementById('surprise-btn');
surpriseBtn.addEventListener('click', () => {
  if (!catalogInteractive || allItems.length === 0) return;
  const inStockItems = allItems.filter(i => i.in_stock !== false);
  const pool = inStockItems.length ? inStockItems : allItems;
  const pick = pool[Math.floor(Math.random() * pool.length)];

  surpriseBtn.classList.add('is-spinning');
  setTimeout(() => {
    surpriseBtn.classList.remove('is-spinning');
    openItemModal(pick);
  }, 420);
});

// ---------- Seal Easter egg ----------
// Tap the rotating seal a few times in a row for a small reward.

const heroSeal = document.querySelector('.hero-seal');
let sealTapCount = 0;
let sealTapTimer = null;

heroSeal.style.cursor = 'pointer';
heroSeal.addEventListener('click', () => {
  sealTapCount++;
  clearTimeout(sealTapTimer);
  sealTapTimer = setTimeout(() => { sealTapCount = 0; }, 1500); // resets if taps aren't quick enough

  if (sealTapCount >= 3) {
    sealTapCount = 0;
    showSealMessage();
  }
});

const SEAL_MESSAGES = [
  'Long live the King. 👑',
  'The seal approves of your curiosity.',
  'You\u2019ve found the royal wink.',
  'Taste is a kingdom. Welcome to it.',
];

function showSealMessage() {
  const existing = document.getElementById('seal-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'seal-toast';
  toast.className = 'seal-toast';
  toast.textContent = SEAL_MESSAGES[Math.floor(Math.random() * SEAL_MESSAGES.length)];
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('is-visible'));
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 400);
  }, 2600);
}

const homeLink = document.getElementById('home-link');
homeLink.addEventListener('click', (e) => {
  e.preventDefault();
  searchQuery = '';
  searchInput.value = '';
  setActiveCategory('all'); // also resets visibleCount and re-renders
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

async function loadData() {
  renderSkeletons();
  const [itemsRes, categoriesRes] = await Promise.all([
    supabaseClient.from('items').select('*, categories(id, name, parent_id), item_photos(photo_url, sort_order)').order('in_stock', { ascending: false }).order('created_at', { ascending: false }),
    supabaseClient.from('categories').select('*').order('name'),
  ]);

  stopSkeletonMessages();

  if (itemsRes.error) {
    console.error('Failed to load items:', itemsRes.error.message);
    emptyState.hidden = false;
    emptyState.textContent = 'Could not load the catalog right now.';
    hidePreloader();
    return;
  }

  allItems = itemsRes.data;
  categories = categoriesRes.data || [];
  renderBestsellersShowcase();
  renderCategoryChips();
  renderItems();
  hidePreloader();
  openDeepLinkedItem();
}

function openDeepLinkedItem() {
  const params = new URLSearchParams(window.location.search);
  const itemId = params.get('item');
  if (!itemId) return;

  const item = allItems.find(i => i.id === itemId);
  if (item) {
    openItemModal(item, true); // true = URL already has the id, don't push a duplicate history entry
  }
}

// ---------- Best Sellers showcase ----------
// Shown at the top of the page regardless of category, pulling together
// everything marked as a Best Seller across the whole catalog.

function renderBestsellersShowcase() {
  const section = document.getElementById('bestsellers-section');
  const row = document.getElementById('bestsellers-row');

  const bestsellers = allItems
    .filter(i => i.is_bestseller)
    .sort((a, b) => (b.in_stock !== false) - (a.in_stock !== false)); // in-stock first

  if (bestsellers.length === 0) {
    section.hidden = true;
    return;
  }

  row.innerHTML = '';
  bestsellers.forEach(item => {
    const card = buildItemCard(item);
    row.appendChild(card);
  });

  section.hidden = false;
}

// ---------- Skeleton loading state ----------
// Only visible if the fetch is slow enough to outlast the intro animation.

const SKELETON_MESSAGES = [
  'Weighing the spices…',
  'Counting sacks of rice…',
  'Dusting off the ledger…',
  'Sealing today\'s crates…',
  'Airing out the warehouse…',
];

let skeletonMessageTimer = null;

function renderSkeletons() {
  grid.innerHTML = '';
  grid.classList.add('is-loading');

  for (let i = 0; i < 8; i++) {
    const card = document.createElement('div');
    card.className = 'skeleton-card';
    card.innerHTML = `
      <div class="skeleton-thumb"></div>
      <div class="skeleton-body">
        <div class="skeleton-line skeleton-line-tag"></div>
        <div class="skeleton-line skeleton-line-title"></div>
        <div class="skeleton-line skeleton-line-desc"></div>
      </div>
    `;
    grid.appendChild(card);
  }

  const msg = document.createElement('p');
  msg.className = 'skeleton-message';
  msg.id = 'skeleton-message';
  msg.textContent = SKELETON_MESSAGES[0];
  grid.after(msg);

  let i = 0;
  skeletonMessageTimer = setInterval(() => {
    i = (i + 1) % SKELETON_MESSAGES.length;
    const el = document.getElementById('skeleton-message');
    if (el) el.textContent = SKELETON_MESSAGES[i];
  }, 1400);
}

function stopSkeletonMessages() {
  clearInterval(skeletonMessageTimer);
  grid.classList.remove('is-loading');
  document.getElementById('skeleton-message')?.remove();
}

function renderCategoryChips() {
  const topLevel = categories.filter(c => !c.parent_id);

  const allChip = filterRow.querySelector('[data-category="all"]');
  allChip.textContent = `All items (${allItems.length})`;

  topLevel.forEach(cat => {
    const subIds = categories.filter(c => c.parent_id === cat.id).map(c => c.id);
    const matchIds = new Set([cat.id, ...subIds]);
    const count = allItems.filter(i => matchIds.has(i.category_id)).length;
    if (count === 0) return;

    const chip = document.createElement('button');
    chip.className = 'filter-chip';
    const label = `${escapeHtml(cat.name)} <span class="chip-count">(${count})</span>`;
    chip.innerHTML = cat.icon_url
      ? `<img class="chip-icon" src="${cat.icon_url}" alt="">${label}`
      : label;
    chip.dataset.categoryId = cat.id;
    chip.addEventListener('click', () => setActiveCategory(cat.id));
    filterRow.appendChild(chip);
  });

  filterRow.querySelector('[data-category="all"]')
    .addEventListener('click', () => setActiveCategory('all'));
}

function setActiveCategory(categoryId) {
  activeCategoryId = categoryId;
  visibleCount = PAGE_SIZE;
  filterRow.querySelectorAll('.filter-chip').forEach(chip => {
    const chipId = chip.dataset.categoryId || 'all';
    chip.classList.toggle('is-active', chipId === categoryId);
  });
  renderItems();
}

function renderItems() {
  let items = allItems;

  if (activeCategoryId !== 'all') {
    // Match items directly in this category, or in any of its subcategories
    const subIds = categories.filter(c => c.parent_id === activeCategoryId).map(c => c.id);
    const matchIds = new Set([activeCategoryId, ...subIds]);
    items = items.filter(i => matchIds.has(i.category_id));
  }

  if (searchQuery) {
    items = items
      .map(item => ({ item, score: searchScore(item, searchQuery) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
  }

  grid.innerHTML = '';
  emptyState.hidden = items.length > 0;
  if (items.length === 0) {
    emptyState.textContent = searchQuery
      ? `Even the King's warehouse doesn't have "${searchInput.value.trim()}" — try another search.`
      : 'Nothing here yet — check back soon.';
  }

  const itemsToShow = items.slice(0, visibleCount);
  loadMoreBtn.hidden = items.length <= visibleCount;
  loadMoreBtn.textContent = `Load more (${items.length - visibleCount} remaining)`;

  itemsToShow.forEach(item => {
    const card = buildItemCard(item);
    grid.appendChild(card);
    revealObserver.observe(card);
  });
}

function buildItemCard(item) {
  const card = document.createElement('article');
  card.className = 'item-card' + (item.in_stock === false ? ' is-out-of-stock' : '');
  const categoryName = item.categories?.name || '';
  const weightText = item.weight_value ? `${item.weight_value}${item.weight_unit}` : '';
  const isNew = item.created_at &&
    (Date.now() - new Date(item.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000;

  card.innerHTML = `
    <div class="thumb-wrap">
      <img class="thumb" src="${item.photo_url}" alt="${escapeHtml(item.name)}" loading="lazy">
      ${item.in_stock === false ? '<span class="stock-badge">Out of stock</span>' : ''}
      ${isNew && item.in_stock !== false ? '<span class="new-badge">New</span>' : ''}
    </div>
    <div class="card-body">
      <div class="tag-row">
        <span class="item-tag">${escapeHtml(categoryName)}</span>
        ${item.is_featured ? `<span class="flag-badge flag-featured">👑 King's Pick</span>` : ''}
        ${item.is_bestseller ? '<span class="flag-badge flag-bestseller">🔥 Best Seller</span>' : ''}
        ${item.is_frozen ? '<span class="flag-badge flag-frozen">❄️ Frozen</span>' : ''}
      </div>
      <h3 class="item-name">${escapeHtml(item.name)}</h3>
      <p class="item-desc">${escapeHtml(item.description)}</p>
      ${weightText ? `<p class="item-weight">${escapeHtml(weightText)}</p>` : ''}
    </div>
  `;
  card.addEventListener('click', () => { if (catalogInteractive) openItemModal(item); });
  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Item detail modal ----------

const itemModal = document.getElementById('item-modal');
const modalMainPhoto = document.getElementById('modal-main-photo');
const modalThumbRow = document.getElementById('modal-thumb-row');
const modalTag = document.getElementById('modal-tag');
const modalName = document.getElementById('modal-name');
const modalWeight = document.getElementById('modal-weight');
const modalDesc = document.getElementById('modal-desc');
const modalCloseBtn = document.getElementById('modal-close');

function openItemModal(item, skipUrlUpdate) {
  const extraPhotos = (item.item_photos || [])
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(p => p.photo_url);
  const photos = [item.photo_url, ...extraPhotos];

  modalTag.textContent = item.categories?.name || '';
  modalName.textContent = item.name;
  modalDesc.textContent = item.description;

  const weightText = item.weight_value ? `${item.weight_value}${item.weight_unit}` : '';
  modalWeight.textContent = weightText + (item.is_frozen ? (weightText ? ' · ❄️ Keep frozen' : '❄️ Keep frozen') : '');
  modalWeight.hidden = !weightText && !item.is_frozen;

  renderModalGallery(photos, 0);
  renderRelatedItems(item);

  itemModal.hidden = false;
  document.body.style.overflow = 'hidden';
  currentModalItemId = item.id;

  if (!skipUrlUpdate) {
    const url = new URL(window.location.href);
    url.searchParams.set('item', item.id);
    history.pushState({ itemId: item.id }, '', url);
  }
}

function renderRelatedItems(currentItem) {
  const relatedSection = document.getElementById('modal-related');
  const relatedRow = document.getElementById('modal-related-row');

  // Prefer items in the same category, excluding the current item itself
  const sameCategory = allItems.filter(i =>
    i.id !== currentItem.id && i.category_id === currentItem.category_id
  );
  const others = allItems.filter(i =>
    i.id !== currentItem.id && i.category_id !== currentItem.category_id
  );

  const pool = sameCategory.length >= 3 ? sameCategory : [...sameCategory, ...others];
  const picks = shuffleSample(pool, 3);

  if (picks.length === 0) {
    relatedSection.hidden = true;
    return;
  }

  relatedRow.innerHTML = '';
  picks.forEach(relatedItem => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'related-card';
    card.innerHTML = `
      <img src="${relatedItem.photo_url}" alt="${escapeHtml(relatedItem.name)}">
      <span>${escapeHtml(relatedItem.name)}</span>
    `;
    card.addEventListener('click', () => openItemModal(relatedItem));
    relatedRow.appendChild(card);
  });

  relatedSection.hidden = false;
}

function shuffleSample(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function renderModalGallery(photos, activeIndex) {
  modalMainPhoto.src = photos[activeIndex];
  modalMainPhoto.alt = modalName.textContent;
  modalMainPhoto.onerror = () => { modalMainPhoto.style.visibility = 'hidden'; };
  modalMainPhoto.onload = () => { modalMainPhoto.style.visibility = 'visible'; };

  modalThumbRow.innerHTML = '';
  if (photos.length <= 1) return; // no thumbnail row needed for a single photo

  photos.forEach((url, i) => {
    const thumb = document.createElement('img');
    thumb.src = url;
    thumb.className = i === activeIndex ? 'is-active' : '';
    thumb.onerror = () => { thumb.style.visibility = 'hidden'; };
    thumb.addEventListener('click', () => renderModalGallery(photos, i));
    modalThumbRow.appendChild(thumb);
  });
}

function closeItemModal(skipUrlUpdate) {
  itemModal.hidden = true;
  document.body.style.overflow = '';
  currentModalItemId = null;

  if (!skipUrlUpdate) {
    const url = new URL(window.location.href);
    url.searchParams.delete('item');
    history.pushState({}, '', url);
  }
}

modalCloseBtn.addEventListener('click', () => closeItemModal());
itemModal.addEventListener('click', (e) => {
  if (e.target === itemModal) closeItemModal(); // click on the dark overlay, not the card itself
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !itemModal.hidden) closeItemModal();
});

// Browser back/forward buttons should open/close the modal in sync with the URL
window.addEventListener('popstate', () => {
  const params = new URLSearchParams(window.location.search);
  const itemId = params.get('item');

  if (itemId) {
    const item = allItems.find(i => i.id === itemId);
    if (item) openItemModal(item, true); // true = don't push another history entry
  } else if (!itemModal.hidden) {
    closeItemModal(true);
  }
});

// ---------- Copy link ----------

const copyLinkBtn = document.getElementById('modal-copy-link');
copyLinkBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    const original = copyLinkBtn.textContent;
    copyLinkBtn.textContent = '✓ Link copied';
    setTimeout(() => { copyLinkBtn.textContent = original; }, 1800);
  } catch (err) {
    console.error('Could not copy link:', err.message);
  }
});

// ---------- Fuzzy search ----------
// Scores an item against a query: exact/substring word matches score highest,
// close typos (via edit distance) still count but score lower. Matches across
// name (weighted highest), category, and description.

function searchScore(item, query) {
  const queryWords = query.split(/\s+/).filter(Boolean);
  const fields = [
    { text: item.name || '', weight: 3 },
    { text: item.categories?.name || '', weight: 2 },
    { text: item.description || '', weight: 1 },
  ];

  let total = 0;
  for (const word of queryWords) {
    let bestWordScore = 0;
    for (const field of fields) {
      const fieldWords = field.text.toLowerCase().split(/\s+/).filter(Boolean);
      for (const fieldWord of fieldWords) {
        let score = 0;
        if (fieldWord === word) {
          score = 3;
        } else if (fieldWord.includes(word) || word.includes(fieldWord)) {
          score = 2;
        } else {
          const maxDist = word.length <= 4 ? 1 : 2; // allow more typos on longer words
          if (levenshtein(word, fieldWord) <= maxDist) score = 1;
        }
        bestWordScore = Math.max(bestWordScore, score * field.weight);
      }
    }
    if (bestWordScore === 0) return 0; // every query word must match something
    total += bestWordScore;
  }
  return total;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99; // quick reject, keeps this cheap at scale
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

loadData();
