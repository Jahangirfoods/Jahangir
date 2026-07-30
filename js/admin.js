// admin.js — owner-only: login, category management, add/edit/delete items

const loginPanel = document.getElementById('login-panel');
const adminPanel = document.getElementById('admin-panel');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');

const categoryForm = document.getElementById('category-form');
const categoryNameInput = document.getElementById('category-name');
const categoryParentSelect = document.getElementById('category-parent');
const categoryError = document.getElementById('category-error');
const categoryList = document.getElementById('category-list');

const addForm = document.getElementById('add-form');
const addFormTitle = document.getElementById('add-form-title');
const addFormSubmit = document.getElementById('add-form-submit');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const itemCategorySelect = document.getElementById('item-category');
const photoInput = document.getElementById('item-photo');
const photoNote = document.getElementById('photo-note');
const addError = document.getElementById('add-error');
const addSuccess = document.getElementById('add-success');
const adminList = document.getElementById('admin-list');

let categories = [];
let editingItemId = null; // null = adding a new item, otherwise editing this item's id

// ---------- Auth ----------

async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    showAdminPanel();
  } else {
    showLoginPanel();
  }
}

function showAdminPanel() {
  loginPanel.hidden = true;
  adminPanel.hidden = false;
  loadCategories();
  loadAdminItems();
}

function showLoginPanel() {
  loginPanel.hidden = false;
  adminPanel.hidden = true;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    loginError.textContent = 'Login failed — check your email and password.';
    loginError.hidden = false;
    return;
  }
  showAdminPanel();
});

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  showLoginPanel();
});

// ---------- Categories ----------

async function loadCategories() {
  const { data, error } = await supabaseClient
    .from('categories')
    .select('*')
    .order('name');

  if (error) {
    console.error('Failed to load categories:', error.message);
    return;
  }

  categories = data;
  renderCategoryParentOptions();
  renderCategoryList();
  renderItemCategoryOptions();
}

function renderCategoryParentOptions() {
  const topLevel = categories.filter(c => !c.parent_id);
  categoryParentSelect.innerHTML = '<option value="">None — top-level category</option>' +
    topLevel.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

function renderCategoryList() {
  const topLevel = categories.filter(c => !c.parent_id);
  categoryList.innerHTML = '';

  topLevel.forEach(cat => {
    categoryList.appendChild(categoryListItem(cat));
    categories.filter(c => c.parent_id === cat.id).forEach(sub => {
      const li = categoryListItem(sub);
      li.classList.add('is-subcategory');
      categoryList.appendChild(li);
    });
  });
}

function categoryListItem(cat) {
  const li = document.createElement('li');
  li.innerHTML = `
    <span class="cat-row-main">
      ${cat.icon_url ? `<img class="cat-icon-thumb" src="${cat.icon_url}" alt="">` : '<span class="cat-icon-placeholder">＋</span>'}
      <span>${escapeHtml(cat.name)}</span>
    </span>
    <span class="cat-row-actions">
      <label class="icon-upload-btn">
        ${cat.icon_url ? 'Change icon' : 'Add icon'}
        <input type="file" accept="image/*" class="cat-icon-input" data-id="${cat.id}" hidden>
      </label>
      <button class="delete-cat-btn" data-id="${cat.id}">Remove</button>
    </span>
  `;
  li.querySelector('.delete-cat-btn').addEventListener('click', () => deleteCategory(cat.id));
  li.querySelector('.cat-icon-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) uploadCategoryIcon(cat.id, file);
  });
  return li;
}

async function uploadCategoryIcon(categoryId, file) {
  try {
    const compressedBlob = await compressImage(file, 300, 0.85); // icons stay small
    const filePath = `${Date.now()}-cat-icon.jpg`;
    const { error: uploadError } = await supabaseClient
      .storage.from('item-photos')
      .upload(filePath, compressedBlob, { contentType: 'image/jpeg' });
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabaseClient
      .storage.from('item-photos').getPublicUrl(filePath);

    const { error: updateError } = await supabaseClient
      .from('categories').update({ icon_url: publicUrl }).eq('id', categoryId);
    if (updateError) throw updateError;

    loadCategories();
  } catch (err) {
    alert(`Could not upload icon: ${err.message}`);
  }
}

async function deleteCategory(id) {
  if (!confirm('Remove this category? Subcategories under it will also be removed, and items in it will become uncategorized.')) return;

  const { error } = await supabaseClient.from('categories').delete().eq('id', id);
  if (error) {
    alert(`Could not remove category: ${error.message}`);
    return;
  }
  loadCategories();
  loadAdminItems();
}

categoryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  categoryError.hidden = true;

  const name = categoryNameInput.value.trim();
  const parentId = categoryParentSelect.value || null;
  const iconFile = document.getElementById('category-icon').files[0];

  const record = { name, parent_id: parentId };

  try {
    if (iconFile) {
      const compressedBlob = await compressImage(iconFile, 300, 0.85);
      const filePath = `${Date.now()}-cat-icon.jpg`;
      const { error: uploadError } = await supabaseClient
        .storage.from('item-photos')
        .upload(filePath, compressedBlob, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabaseClient
        .storage.from('item-photos').getPublicUrl(filePath);
      record.icon_url = publicUrl;
    }

    const { error } = await supabaseClient.from('categories').insert(record);
    if (error) throw error;

    categoryForm.reset();
    loadCategories();
  } catch (err) {
    categoryError.textContent = `Could not add category: ${err.message}`;
    categoryError.hidden = false;
  }
});

function renderItemCategoryOptions() {
  const topLevel = categories.filter(c => !c.parent_id);
  let html = '<option value="" disabled selected>Select a category…</option>';

  topLevel.forEach(cat => {
    html += `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`;
    categories.filter(c => c.parent_id === cat.id).forEach(sub => {
      html += `<option value="${sub.id}">&nbsp;&nbsp;↳ ${escapeHtml(sub.name)}</option>`;
    });
  });

  itemCategorySelect.innerHTML = html;
}

// ---------- Image compression ----------
// Resizes to a reasonable max dimension and re-encodes as JPEG before upload.
// Keeps 400-500 product photos from bloating storage and slowing the public page.

function compressImage(file, maxDimension = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the photo file.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not process the photo.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round(height * (maxDimension / width));
            width = maxDimension;
          } else {
            width = Math.round(width * (maxDimension / height));
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('Photo compression failed.')),
          'image/jpeg',
          quality
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------- Additional photos ----------

async function uploadExtraPhotos(itemId, files) {
  for (const file of files) {
    try {
      const compressedBlob = await compressImage(file);
      const filePath = `${Date.now()}-${file.name.replace(/\.[^.]+$/, '')}.jpg`;
      const { error: uploadError } = await supabaseClient
        .storage.from('item-photos')
        .upload(filePath, compressedBlob, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabaseClient
        .storage.from('item-photos').getPublicUrl(filePath);

      await supabaseClient.from('item_photos').insert({ item_id: itemId, photo_url: publicUrl });
    } catch (err) {
      console.error('Failed to upload an additional photo:', err.message);
    }
  }
}

async function loadExtraPhotos(itemId) {
  const { data, error } = await supabaseClient
    .from('item_photos')
    .select('*')
    .eq('item_id', itemId)
    .order('sort_order');

  if (error) {
    console.error('Failed to load additional photos:', error.message);
    return;
  }

  renderExtraPhotosList(data);
}

function renderExtraPhotosList(photos) {
  const list = document.getElementById('extra-photos-list');
  list.innerHTML = '';
  photos.forEach(photo => {
    const div = document.createElement('div');
    div.className = 'extra-photo-thumb';
    div.innerHTML = `
      <img src="${photo.photo_url}" alt="">
      <button type="button" class="remove-photo-btn" data-id="${photo.id}" title="Remove">✕</button>
    `;
    div.querySelector('.remove-photo-btn').addEventListener('click', () => removeExtraPhoto(photo.id));
    list.appendChild(div);
  });
}

async function removeExtraPhoto(photoId) {
  const { error } = await supabaseClient.from('item_photos').delete().eq('id', photoId);
  if (error) {
    alert(`Could not remove photo: ${error.message}`);
    return;
  }
  if (editingItemId) loadExtraPhotos(editingItemId);
}

// ---------- Add / edit item ----------

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  addError.hidden = true;
  addSuccess.hidden = true;

  const name = document.getElementById('item-name').value.trim();
  const categoryId = itemCategorySelect.value;
  const weightValue = document.getElementById('item-weight-value').value;
  const weightUnit = document.getElementById('item-weight-unit').value;
  const description = document.getElementById('item-description').value.trim();
  const photoFiles = [...photoInput.files];
  const coverFile = photoFiles[0];
  const remainingFiles = photoFiles.slice(1);

  if (!coverFile && !editingItemId) {
    addError.textContent = 'Please choose at least one photo.';
    addError.hidden = false;
    return;
  }

  const originalButtonText = addFormSubmit.textContent;

  try {
    let photoUrl = null;

    if (coverFile) {
      addFormSubmit.textContent = 'Optimizing photo…';
      addFormSubmit.disabled = true;
      const compressedBlob = await compressImage(coverFile);

      addFormSubmit.textContent = 'Uploading…';
      const baseName = coverFile.name.replace(/\.[^.]+$/, '');
      const filePath = `${Date.now()}-${baseName}.jpg`;
      const { error: uploadError } = await supabaseClient
        .storage.from('item-photos')
        .upload(filePath, compressedBlob, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabaseClient
        .storage.from('item-photos').getPublicUrl(filePath);
      photoUrl = publicUrl;
    }

    const record = {
      name,
      category_id: categoryId,
      weight_value: weightValue ? Number(weightValue) : null,
      weight_unit: weightValue ? weightUnit : null,
      in_stock: document.getElementById('item-in-stock').checked,
      is_featured: document.getElementById('item-featured').checked,
      is_bestseller: document.getElementById('item-bestseller').checked,
      is_frozen: document.getElementById('item-frozen').checked,
      description,
    };
    if (photoUrl) record.photo_url = photoUrl;

    let itemId = editingItemId;

    if (editingItemId) {
      const { error: updateError } = await supabaseClient
        .from('items').update(record).eq('id', editingItemId);
      if (updateError) throw updateError;
      addSuccess.textContent = 'Item updated.';
    } else {
      const { data: inserted, error: insertError } = await supabaseClient
        .from('items').insert(record).select().single();
      if (insertError) throw insertError;
      itemId = inserted.id;
      addSuccess.textContent = 'Item added.';
    }

    if (remainingFiles.length) {
      addFormSubmit.textContent = 'Uploading additional photos…';
      await uploadExtraPhotos(itemId, remainingFiles);
    }

    addSuccess.hidden = false;
    exitEditMode();
    loadAdminItems();
  } catch (err) {
    addError.textContent = `Could not save item: ${err.message}`;
    addError.hidden = false;
    addFormSubmit.textContent = originalButtonText;
  } finally {
    addFormSubmit.disabled = false;
  }
});

cancelEditBtn.addEventListener('click', exitEditMode);

function enterEditMode(item) {
  editingItemId = item.id;
  addFormTitle.textContent = 'Edit item';
  addFormSubmit.textContent = 'Save changes';
  cancelEditBtn.hidden = false;
  photoNote.textContent = '(leave empty to keep the current cover; if you pick new ones, the first replaces the cover and the rest are added as extra photos)';
  photoInput.required = false;

  document.getElementById('item-name').value = item.name;
  itemCategorySelect.value = item.category_id || '';
  document.getElementById('item-weight-value').value = item.weight_value || '';
  document.getElementById('item-weight-unit').value = item.weight_unit || 'g';
  document.getElementById('item-in-stock').checked = item.in_stock !== false;
  document.getElementById('item-featured').checked = !!item.is_featured;
  document.getElementById('item-bestseller').checked = !!item.is_bestseller;
  document.getElementById('item-frozen').checked = !!item.is_frozen;
  document.getElementById('item-description').value = item.description;

  loadExtraPhotos(item.id);
  addForm.scrollIntoView({ behavior: 'smooth' });
}

function exitEditMode() {
  editingItemId = null;
  addForm.reset();
  addFormTitle.textContent = 'Add item';
  addFormSubmit.textContent = 'Add to catalog';
  cancelEditBtn.hidden = true;
  photoNote.textContent = '';
  document.getElementById('extra-photos-list').innerHTML = '';
}

// ---------- List + delete ----------

const adminSearchInput = document.getElementById('admin-search');
let allAdminItems = [];
let adminSearchQuery = '';

adminSearchInput.addEventListener('input', () => {
  adminSearchQuery = adminSearchInput.value.trim().toLowerCase();
  renderAdminList();
});

async function loadAdminItems() {
  const { data, error } = await supabaseClient
    .from('items')
    .select('*, categories(name)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load items:', error.message);
    return;
  }

  allAdminItems = data;
  const countEl = document.getElementById('item-count');
  if (countEl) countEl.textContent = `(${data.length})`;
  renderAdminList();
}

function renderAdminList() {
  let items = allAdminItems;

  if (adminSearchQuery) {
    items = items
      .map(item => ({ item, score: adminSearchScore(item, adminSearchQuery) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
  }

  adminList.innerHTML = '';

  if (items.length === 0) {
    adminList.innerHTML = `<p class="row-cat">No items match "${escapeHtml(adminSearchInput.value.trim())}".</p>`;
    return;
  }

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    const weightText = item.weight_value ? `${item.weight_value}${item.weight_unit}` : '';
    row.innerHTML = `
      <img class="thumb" src="${item.photo_url}" alt="">
      <div class="row-meta">
        <div class="row-name">${escapeHtml(item.name)}${item.in_stock === false ? ' <span class="stock-badge">Out of stock</span>' : ''}${item.is_featured ? ' <span class="flag-badge flag-featured">👑</span>' : ''}${item.is_bestseller ? ' <span class="flag-badge flag-bestseller">🔥</span>' : ''}${item.is_frozen ? ' <span class="flag-badge flag-frozen">❄️</span>' : ''}</div>
        <div class="row-cat">${escapeHtml(item.categories?.name || 'Uncategorized')}</div>
        ${weightText ? `<div class="row-weight">${escapeHtml(weightText)}</div>` : ''}
      </div>
      <button class="edit-btn" data-id="${item.id}">Edit</button>
      <button class="delete-btn" data-id="${item.id}">Delete</button>
    `;
    row.querySelector('.edit-btn').addEventListener('click', () => enterEditMode(item));
    row.querySelector('.delete-btn').addEventListener('click', () => deleteItem(item.id));
    adminList.appendChild(row);
  });
}

async function deleteItem(id) {
  if (!confirm('Delete this item? This cannot be undone.')) return;

  const { error } = await supabaseClient.from('items').delete().eq('id', id);
  if (error) {
    alert(`Could not delete: ${error.message}`);
    return;
  }
  if (editingItemId === id) exitEditMode();
  loadAdminItems();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Fuzzy search (admin) ----------
// Same forgiving matching as the public search: tokenized, typo-tolerant,
// matches name (weighted highest) and category.

function adminSearchScore(item, query) {
  const queryWords = query.split(/\s+/).filter(Boolean);
  const fields = [
    { text: item.name || '', weight: 3 },
    { text: item.categories?.name || '', weight: 2 },
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
          const maxDist = word.length <= 4 ? 1 : 2;
          if (levenshtein(word, fieldWord) <= maxDist) score = 1;
        }
        bestWordScore = Math.max(bestWordScore, score * field.weight);
      }
    }
    if (bestWordScore === 0) return 0;
    total += bestWordScore;
  }
  return total;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99;
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

// ---------- CSV export ----------

document.getElementById('export-csv-btn').addEventListener('click', exportCatalogCsv);

async function exportCatalogCsv() {
  const btn = document.getElementById('export-csv-btn');
  const originalText = btn.textContent;
  btn.textContent = 'Preparing…';
  btn.disabled = true;

  try {
    // Always export the FULL catalog, not just whatever the admin search is currently filtered to.
    const { data, error } = await supabaseClient
      .from('items')
      .select('*, categories(name), item_photos(photo_url)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const headers = ['name', 'category', 'weight_value', 'weight_unit', 'in_stock', 'description', 'cover_photo_url', 'additional_photo_urls', 'created_at'];
    const rows = data.map(item => [
      item.name,
      item.categories?.name || '',
      item.weight_value ?? '',
      item.weight_unit || '',
      item.in_stock === false ? 'no' : 'yes',
      item.description || '',
      item.photo_url || '',
      (item.item_photos || []).map(p => p.photo_url).join(' | '),
      item.created_at || '',
    ]);

    const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `jahangir-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`Could not export catalog: ${err.message}`);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

checkSession();
