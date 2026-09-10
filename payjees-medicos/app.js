(() => {
  'use strict';

  const DB_NAME = 'payjeesMedicosDB';
  const DB_VERSION = 1;
  const STORE = 'medicines';
  const $ = (id) => document.getElementById(id);
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const prettyDate = (dateStr) => new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-PK', { day:'2-digit', month:'long', year:'numeric' });

  let db;
  let installPrompt = null;
  let currentHistoryDate = todayKey();

  const openDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('name', 'name', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const txStore = (mode='readonly') => db.transaction(STORE, mode).objectStore(STORE);
  const putItem = (item) => new Promise((resolve, reject) => { const req = txStore('readwrite').put(item); req.onsuccess = () => resolve(item); req.onerror = () => reject(req.error); });
  const deleteItem = (id) => new Promise((resolve, reject) => { const req = txStore('readwrite').delete(id); req.onsuccess = () => resolve(); req.onerror = () => reject(req.error); });
  const getAll = () => new Promise((resolve, reject) => { const req = txStore().getAll(); req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error); });
  const getByDate = (date) => new Promise((resolve, reject) => { const req = txStore().index('date').getAll(date); req.onsuccess = () => resolve((req.result || []).sort((a,b) => a.createdAt - b.createdAt)); req.onerror = () => reject(req.error); });

  function normalizeName(value){ return value.trim().replace(/\s+/g,' ').replace(/\b\w/g, c => c.toUpperCase()); }
  function safeQty(){ const q = Math.max(1, Math.min(999, parseInt($('qtyInput').value || '1', 10))); $('qtyInput').value = q; return q; }
  function escapeHtml(s){ return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }

  async function addMedicine(){
    const name = normalizeName($('medicineInput').value);
    if (!name) return toast('Please enter a medicine name');
    const qty = safeQty();
    const date = todayKey();
    const current = await getByDate(date);
    const existing = current.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (existing){ existing.qty += qty; existing.updatedAt = Date.now(); await putItem(existing); }
    else await putItem({ id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, name, qty, date, status:'pending', createdAt:Date.now(), updatedAt:Date.now() });
    $('medicineInput').value = ''; $('qtyInput').value = 1; hideSuggestions(); $('medicineInput').focus();
    toast(`${name} added`); await renderToday();
  }

  async function changeQty(id, delta){ const all = await getAll(); const item = all.find(x => x.id === id); if (!item) return; item.qty = Math.max(1, Math.min(999, item.qty + delta)); item.updatedAt = Date.now(); await putItem(item); await renderActiveList(item.date); }
  async function toggleOrdered(id){ const all = await getAll(); const item = all.find(x => x.id === id); if (!item) return; item.status = item.status === 'ordered' ? 'pending' : 'ordered'; item.updatedAt = Date.now(); await putItem(item); await renderActiveList(item.date); }
  async function removeMedicine(id){ if (!confirm('Remove this medicine from the list?')) return; const all = await getAll(); const item = all.find(x => x.id === id); await deleteItem(id); toast('Medicine removed'); await renderActiveList(item?.date || todayKey()); }

  function itemHtml(item){
    return `<article class="medicine-item"><div class="medicine-main"><div class="medicine-name">${escapeHtml(item.name)}</div><div class="medicine-meta"><span class="badge ${item.status === 'ordered' ? 'ordered' : 'pending'}">${item.status === 'ordered' ? 'ORDERED' : 'PENDING'}</span><span>Qty ${item.qty}</span></div></div><div class="item-controls"><button class="mini-btn" data-action="minus" data-id="${item.id}" aria-label="Decrease quantity">−</button><span class="qty-badge">${item.qty}</span><button class="mini-btn" data-action="plus" data-id="${item.id}" aria-label="Increase quantity">+</button><button class="order-toggle" data-action="toggle" data-id="${item.id}">${item.status === 'ordered' ? '↩ Pending' : '✓ Ordered'}</button><button class="delete-btn" data-action="delete" data-id="${item.id}" aria-label="Delete">✕</button></div></article>`;
  }

  async function renderToday(){ const items = await getByDate(todayKey()); $('todayList').innerHTML = items.map(itemHtml).join(''); $('emptyToday').classList.toggle('hidden', items.length > 0); $('itemCount').textContent = items.length; $('qtyCount').textContent = items.reduce((sum,x) => sum + x.qty, 0); $('todayLabel').textContent = prettyDate(todayKey()); }
  async function renderHistory(){ const items = await getByDate(currentHistoryDate); $('historyList').innerHTML = items.map(itemHtml).join(''); $('emptyHistory').classList.toggle('hidden', items.length > 0); }
  async function renderActiveList(date){ if (date === todayKey()) await renderToday(); if (date === currentHistoryDate) await renderHistory(); }

  async function renderSuggestions(){
    const term = $('medicineInput').value.trim().toLowerCase(); if (!term) return hideSuggestions();
    const all = await getAll(); const counts = new Map(); all.forEach(x => counts.set(x.name, (counts.get(x.name)||0)+1));
    const matches = [...counts.keys()].filter(n => n.toLowerCase().includes(term)).sort((a,b) => (counts.get(b)-counts.get(a)) || a.localeCompare(b)).slice(0,6);
    if (!matches.length) return hideSuggestions();
    $('suggestions').innerHTML = matches.map(n => `<button type="button" class="suggestion" data-name="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join(''); $('suggestions').classList.remove('hidden');
  }
  function hideSuggestions(){ $('suggestions').classList.add('hidden'); }

  function setupVoice(){
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition){ $('voiceStatus').textContent = 'Voice button is not supported in this browser. You can use your keyboard microphone instead.'; $('voiceBtn').disabled = true; return; }
    const recognition = new Recognition(); recognition.lang = 'en-PK'; recognition.interimResults = false; recognition.maxAlternatives = 3;
    $('voiceBtn').addEventListener('click', () => { try{ recognition.start(); }catch(e){} });
    recognition.onstart = () => { $('voiceBtn').classList.add('listening'); $('voiceStatus').textContent = 'Listening… say the medicine name.'; };
    recognition.onend = () => { $('voiceBtn').classList.remove('listening'); if ($('voiceStatus').textContent.startsWith('Listening')) $('voiceStatus').textContent=''; };
    recognition.onerror = (e) => { $('voiceStatus').textContent = e.error === 'not-allowed' ? 'Microphone permission was not allowed.' : 'Could not hear clearly. Please try again.'; };
    recognition.onresult = (event) => { const text = event.results[0][0].transcript; $('medicineInput').value = normalizeName(text); $('voiceStatus').textContent = `Heard: ${text}`; renderSuggestions(); $('medicineInput').focus(); };
  }

  function orderText(items, date){ const lines = ['PAYJEES MEDICOS', `Medicine Order - ${prettyDate(date)}`, '']; items.forEach((x,i) => lines.push(`${i+1}. ${x.name} - Qty ${x.qty}${x.status === 'ordered' ? ' (Ordered)' : ''}`)); lines.push('', `Total Items: ${items.length}`, `Total Quantity: ${items.reduce((s,x)=>s+x.qty,0)}`); return lines.join('\n'); }
  async function copyOrder(date=todayKey()){ const items = await getByDate(date); if (!items.length) return toast('No medicines to copy'); try{ await navigator.clipboard.writeText(orderText(items,date)); toast('Order copied'); } catch{ toast('Clipboard is not available'); } }
  async function whatsappOrder(){ const items = await getByDate(todayKey()); if (!items.length) return toast('No medicines to send'); window.open(`https://wa.me/?text=${encodeURIComponent(orderText(items,todayKey()))}`, '_blank', 'noopener'); }

  async function generatePdf(date=todayKey()){
    const items = await getByDate(date); if (!items.length) return toast('No medicines for this date');
    if (!window.jspdf?.jsPDF){ toast('PDF library is loading. Try again in a moment.'); return; }
    const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit:'mm', format:'a4' }); const margin=15, pageW=210, pageH=297;
    const drawHeader = () => { doc.setFillColor(15,118,110); doc.roundedRect(margin,12,pageW-margin*2,25,3,3,'F'); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.text('PAYJEES MEDICOS', margin+6,23); doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text('Medicine Order List', margin+6,30); doc.setTextColor(23,33,31); doc.setFontSize(10); doc.text(`Order Date: ${prettyDate(date)}`, margin,46); doc.text(`Generated: ${new Date().toLocaleString('en-PK')}`, margin,52); doc.setDrawColor(210,220,217); doc.line(margin,57,pageW-margin,57); };
    drawHeader(); let y=66; doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.text('#',margin,y); doc.text('Medicine',margin+9,y); doc.text('Qty',158,y,{align:'right'}); doc.text('Status',pageW-margin,y,{align:'right'}); y+=4; doc.setDrawColor(210,220,217); doc.line(margin,y,pageW-margin,y); y+=7; doc.setFont('helvetica','normal'); doc.setFontSize(10);
    items.forEach((item,idx) => { if (y > pageH-22){ doc.addPage(); drawHeader(); y=66; } const nameLines = doc.splitTextToSize(item.name,120); const rowH=Math.max(8,nameLines.length*5); doc.text(String(idx+1),margin,y); doc.text(nameLines,margin+9,y); doc.text(String(item.qty),158,y,{align:'right'}); doc.text(item.status === 'ordered' ? 'Ordered':'Pending',pageW-margin,y,{align:'right'}); y += rowH; doc.setDrawColor(238,242,241); doc.line(margin,y-2,pageW-margin,y-2); });
    y += 5; if (y>pageH-25){doc.addPage();y=25;} doc.setFont('helvetica','bold'); doc.text(`Total Items: ${items.length}`,margin,y); doc.text(`Total Quantity: ${items.reduce((s,x)=>s+x.qty,0)}`,pageW-margin,y,{align:'right'}); doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(110,120,117); doc.text('Generated by Payjees Medicos Medicine Demand Book',pageW/2,pageH-10,{align:'center'}); doc.save(`Payjees-Medicos-Order-${date}.pdf`); toast('PDF downloaded');
  }

  async function exportBackup(){ const data = await getAll(); const blob = new Blob([JSON.stringify({app:'Payjees Medicos',version:1,exportedAt:new Date().toISOString(),medicines:data},null,2)], {type:'application/json'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Payjees-Medicos-Backup-${todayKey()}.json`;a.click();URL.revokeObjectURL(a.href);toast('Backup exported'); }
  async function importBackup(file){ if (!file) return; try{ const parsed=JSON.parse(await file.text()); if (!Array.isArray(parsed.medicines)) throw new Error('Invalid backup'); for (const item of parsed.medicines) await putItem(item); toast('Backup imported'); await renderToday(); await renderHistory(); }catch(e){ toast('Invalid backup file'); } }
  function toast(message){ const el=$('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2200); }
  function bindListActions(container){ container.addEventListener('click', e => { const btn=e.target.closest('button[data-action]'); if(!btn) return; const {action,id}=btn.dataset; if(action==='plus')changeQty(id,1); if(action==='minus')changeQty(id,-1); if(action==='toggle')toggleOrdered(id); if(action==='delete')removeMedicine(id); }); }
  function switchView(view){ document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.view===view)); document.querySelectorAll('.view').forEach(x=>x.classList.remove('active-view')); $(`${view}View`).classList.add('active-view'); if(view==='history')renderHistory(); }

  async function init(){
    db = await openDb(); currentHistoryDate = todayKey(); $('historyDate').value=currentHistoryDate; await renderToday(); await renderHistory(); setupVoice();
    $('addBtn').addEventListener('click',addMedicine); $('medicineInput').addEventListener('keydown',e=>{if(e.key==='Enter')addMedicine();}); $('medicineInput').addEventListener('input',renderSuggestions);
    $('suggestions').addEventListener('click',e=>{const b=e.target.closest('[data-name]');if(!b)return;$('medicineInput').value=b.dataset.name;hideSuggestions();$('medicineInput').focus();}); document.addEventListener('click',e=>{if(!e.target.closest('.input-wrap'))hideSuggestions();});
    $('minusQty').addEventListener('click',()=>{$('qtyInput').value=Math.max(1,safeQty()-1)}); $('plusQty').addEventListener('click',()=>{$('qtyInput').value=Math.min(999,safeQty()+1)}); bindListActions($('todayList')); bindListActions($('historyList'));
    document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>switchView(tab.dataset.view))); $('historyDate').addEventListener('change',()=>{currentHistoryDate=$('historyDate').value||todayKey();renderHistory();});
    $('pdfBtn').addEventListener('click',()=>generatePdf()); $('historyPdfBtn').addEventListener('click',()=>generatePdf(currentHistoryDate)); $('whatsappBtn').addEventListener('click',whatsappOrder); $('copyBtn').addEventListener('click',()=>copyOrder()); $('exportBtn').addEventListener('click',exportBackup); $('importFile').addEventListener('change',e=>importBackup(e.target.files[0]));
    $('clearTodayBtn').addEventListener('click',async()=>{const items=await getByDate(todayKey());if(!items.length)return;if(!confirm('Clear all medicines from today?'))return;for(const x of items)await deleteItem(x.id);await renderToday();toast('Today cleared');});
    window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('installBtn').classList.remove('hidden');}); $('installBtn').addEventListener('click',async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('installBtn').classList.add('hidden');});
    if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
  }
  init().catch(err => { console.error(err); toast('Could not open local storage'); });
})();
